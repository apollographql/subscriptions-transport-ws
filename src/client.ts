declare let window: any;
const _global = typeof global !== 'undefined' ? global : (typeof window !== 'undefined' ? window : {});
const NativeWebSocket = _global.WebSocket || _global.MozWebSocket;

import * as Backoff from 'backo2';
import { EventEmitter, ListenerFn } from 'eventemitter3';
import isString = require('lodash.isstring');
import isObject = require('lodash.isobject');
import { ExecutionResult, print } from 'graphql';

import MessageTypes from './message-types';
import { GRAPHQL_WS } from './protocol';
import { WS_TIMEOUT } from './defaults';

export interface RequestOptions {
  query: string;
  variables?: Object;
  operationName?: string;
  context?: any;
}

export interface Request {
  options: RequestOptions;
  handler: (error: Error[], result?: any) => void;
}

export interface Requests {
  [id: string]: Request;
}

export type ConnectionParams = {[paramName: string]: any};

export interface ClientOptions {
  connectionParams?: ConnectionParams;
  timeout?: number;
  reconnect?: boolean;
  reconnectionAttempts?: number;
  connectionCallback?: (error: Error[], result?: any) => void;
}

export class GraphQLTransportWSClient {
  public client: any;
  public requests: Requests;
  private url: string;
  private nextRequestId: number;
  private connectionParams: ConnectionParams;
  private wsTimeout: number;
  private unsentMessagesQueue: Array<any>; // queued messages while websocket is opening.
  private reconnect: boolean;
  private reconnecting: boolean;
  private reconnectionAttempts: number;
  private backoff: any;
  private connectionCallback: any;
  private eventEmitter: EventEmitter;
  private wsImpl: any;
  private wasKeepAliveReceived: boolean;
  private checkConnectionTimeoutId: any;

  constructor(url: string, options?: ClientOptions, webSocketImpl?: any) {
    const {
      connectionCallback = undefined,
      connectionParams = {},
      timeout = WS_TIMEOUT,
      reconnect = false,
      reconnectionAttempts = Infinity,
    } = (options || {});

    this.wsImpl = webSocketImpl || NativeWebSocket;

    if (!this.wsImpl) {
      throw new Error('Unable to find native implementation, or alternative implementation for WebSocket!');
    }

    this.connectionParams = connectionParams;
    this.connectionCallback = connectionCallback;
    this.url = url;
    this.requests = {};
    this.nextRequestId = 0;
    this.wsTimeout = timeout;
    this.unsentMessagesQueue = [];
    this.reconnect = reconnect;
    this.reconnecting = false;
    this.reconnectionAttempts = reconnectionAttempts;
    this.backoff = new Backoff({ jitter: 0.5 });
    this.eventEmitter = new EventEmitter();

    this.connect();
  }

  public get status() {
    return this.client.readyState;
  }

  public close() {
    this.client.close();
  }

  public query(options: RequestOptions): Promise<ExecutionResult> {
    return new Promise((resolve, reject) => {
      const handler = (error: Error[], result?: any) => {
        if (result) {
          resolve(result);
        } else {
          reject(error);
        }
      };

      // NOTE: as soon as we move into observables, we don't need to wait GQL_COMPLETE for queries and mutations
      this.executeRequest(options, handler);
    });
  }

  public subscribe(options: RequestOptions, handler: (error: Error[], result?: any) => void) {
    return this.executeRequest(options, handler);
  }

  public on(eventName: string, callback: ListenerFn, context?: any): Function {
    const handler = this.eventEmitter.on(eventName, callback, context);

    return () => {
      handler.off(eventName, callback, context);
    };
  }

  public onConnect(callback: ListenerFn, context?: any): Function {
    return this.on('connect', callback, context);
  }

  public onDisconnect(callback: ListenerFn, context?: any): Function {
    return this.on('disconnect', callback, context);
  }

  public onReconnect(callback: ListenerFn, context?: any): Function {
    return this.on('reconnect', callback, context);
  }

  public unsubscribe(id: number) {
    if (this.requests[id]) {
      delete this.requests[id];
    }
    this.sendMessage(id, MessageTypes.GQL_END, undefined);
  }

  public unsubscribeAll() {
    Object.keys(this.requests).forEach( subId => {
      this.unsubscribe(parseInt(subId, 10));
    });
  }

  private executeRequest(options: RequestOptions, handler: (error: Error[], result?: any) => void): number {
    const { query, variables, operationName } = options;

    if (!query) {
      throw new Error('Must provide a `query`.');
    }

    if (!handler) {
      throw new Error('Must provide an `handler`.');
    }

    if (
      !isString(query) ||
      ( operationName && !isString(operationName)) ||
      ( variables && !isObject(variables))
    ) {
      throw new Error('Incorrect option types. `query` must be a string,' +
        '`operationName` must be a string, and `variables` must be an object.');
    }

    const reqId = this.generateRequestId();
    this.requests[reqId] = { options, handler };
    this.sendMessage(reqId, MessageTypes.GQL_START, options);

    return reqId;
  }

  private buildMessage(id: number, type: string, payload: any) {
    const payloadToReturn = payload && payload.query ? { ...payload, query: print(payload.query) } : payload;

    return {
      id,
      type,
      payload: payloadToReturn,
    };
  }

  // ensure we have an array of errors
  private formatErrors(errors: any) {
    if (Array.isArray(errors)) {
      return errors;
    }
    if (errors && errors.message) {
      return [errors];
    }
    return [{ message: 'Unknown error' }];
  }

  private sendMessage(id: number, type: string, payload: any) {
    this.sendMessageRaw(this.buildMessage(id, type, payload));
  }

  // send message, or queue it if connection is not open
  private sendMessageRaw(message: Object) {
    switch (this.status) {
      case this.client.OPEN:
        let serializedMessage: string = JSON.stringify(message);
        let parsedMessage: any;
        try {
          parsedMessage = JSON.parse(serializedMessage);
        } catch (e) {
          throw new Error(`Message must be JSON-serializable. Got: ${message}`);
        }

        this.client.send(serializedMessage);
        break;
      case this.client.CONNECTING:
        this.unsentMessagesQueue.push(message);

        break;
      case this.client.CLOSING:
      case this.client.CLOSED:
        break;
      default:
        if (!this.reconnecting) {
          throw new Error('Client is not connected to a websocket.');
        }
    }
  }

  private generateRequestId() {
    const id = this.nextRequestId;
    this.nextRequestId += 1;
    return id;
  }

  private tryReconnect() {
    if (!this.reconnect || this.backoff.attempts > this.reconnectionAttempts) {
      this.sendMessage(undefined, MessageTypes.GQL_CONNECTION_TERMINATE, null);
      return;
    }

    if (!this.reconnecting) {
      Object.keys(this.requests).forEach((key) => {
        this.unsentMessagesQueue.push(
          this.buildMessage(parseInt(key, 10), MessageTypes.GQL_START, this.requests[key].options)
        );
      });
      this.reconnecting = true;
    }

    const delay = this.backoff.duration();
    setTimeout(() => {
      this.connect(true);
    }, delay);
  }

  private flushUnsentMessagesQueue() {
    this.unsentMessagesQueue.forEach((message) => {
      this.client.send(JSON.stringify(message));
    });
    this.unsentMessagesQueue = [];
  }

  private checkConnection() {
    !this.wasKeepAliveReceived ? this.close() : this.wasKeepAliveReceived = false;
  }

  private connect(isReconnect: boolean = false) {
    this.client = new this.wsImpl(this.url, GRAPHQL_WS);

    this.client.onopen = () => {
      this.eventEmitter.emit(isReconnect ? 'reconnect' : 'connect');
      this.reconnecting = false;
      this.backoff.reset();
      // Send CONNECTION_INIT message, no need to wait for connection to success (reduce roundtrips)
      this.sendMessage(undefined, MessageTypes.GQL_CONNECTION_INIT, this.connectionParams);
      this.flushUnsentMessagesQueue();
    };

    this.client.onclose = () => {
      this.eventEmitter.emit('disconnect');

      this.tryReconnect();
    };

    this.client.onerror = () => {
      // Capture and ignore errors to prevent unhandled exceptions, wait for
      // onclose to fire before attempting a reconnect.
    };

    this.client.onmessage = ({ data }: {data: any}) => {
      this.processReceivedData(data);
    };
  }

  private processReceivedData(receivedData: any) {
    let parsedMessage: any;
    let reqId: number;

    try {
      parsedMessage = JSON.parse(receivedData);
      reqId = parsedMessage.id;
    } catch (e) {
      throw new Error(`Message must be JSON-parseable. Got: ${receivedData}`);
    }

    // Complete every request that are not registered on the client but are being sent by the server and are not
    // in the allowed list
    if (
      [ MessageTypes.GQL_DATA,
        MessageTypes.GQL_COMPLETE,
        MessageTypes.GQL_ERROR,
      ].indexOf(parsedMessage.type) !== -1 && !this.requests[reqId]
    ) {

      this.unsubscribe(reqId);
    }

    switch (parsedMessage.type) {
      case MessageTypes.GQL_CONNECTION_ERROR:
        if (this.connectionCallback) {
          this.connectionCallback(parsedMessage.payload);
        }
        break;

      case MessageTypes.GQL_CONNECTION_ACK:
        if (this.connectionCallback) {
          this.connectionCallback();
        }
        break;

      case MessageTypes.GQL_COMPLETE:
        delete this.requests[reqId];
        break;

      case MessageTypes.GQL_ERROR:
        this.requests[reqId].handler(this.formatErrors(parsedMessage.payload), null);
        delete this.requests[reqId];
        break;

      case MessageTypes.GQL_DATA:
        const requestPayloadData = parsedMessage.payload.data || null;
        const requestPayloadErrors = parsedMessage.payload.errors ?
          this.formatErrors(parsedMessage.payload.errors) : null;

        this.requests[reqId].handler(requestPayloadErrors, requestPayloadData);
        break;

      case MessageTypes.GQL_CONNECTION_KEEP_ALIVE:
        this.wasKeepAliveReceived = true;
        if (this.checkConnectionTimeoutId) {
          clearTimeout(this.checkConnectionTimeoutId);
        }
        this.checkConnectionTimeoutId = setTimeout(this.checkConnection, this.wsTimeout);
        break;

      default:
        throw new Error('Invalid message type!');
    }
  }
}
