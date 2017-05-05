declare let window: any;
const _global = typeof global !== 'undefined' ? global : (typeof window !== 'undefined' ? window : {});
const NativeWebSocket = _global.WebSocket || _global.MozWebSocket;

import * as Backoff from 'backo2';
import { EventEmitter, ListenerFn } from 'eventemitter3';
import isString = require('lodash.isstring');
import isObject = require('lodash.isobject');
import { ExecutionResult } from 'graphql/execution/execute';
import { print } from 'graphql/language/printer';
import { getOperationAST } from 'graphql/utilities/getOperationAST';

import MessageTypes from './message-types';
import { GRAPHQL_WS } from './protocol';
import { WS_TIMEOUT } from './defaults';

export * from './helpers';

export interface OperationOptions {
  query: string;
  variables?: Object;
  operationName?: string;
  context?: any;
}

export type FormatedError = Error & {
  originalError?: any;
}

export interface Operation {
  options: OperationOptions;
  handler: (error: Error[], result?: any) => void;
}

export interface Operations {
  [id: string]: Operation;
}

export type ConnectionParams = {[paramName: string]: any};

export interface ClientOptions {
  connectionParams?: ConnectionParams;
  timeout?: number;
  reconnect?: boolean;
  reconnectionAttempts?: number;
  connectionCallback?: (error: Error[], result?: any) => void;
}

export class SubscriptionClient {
  public client: any;
  public operations: Operations;
  private url: string;
  private nextOperationId: number;
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
    this.operations = {};
    this.nextOperationId = 0;
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

  public query(options: OperationOptions): Promise<ExecutionResult> {
    return new Promise((resolve, reject) => {
      const handler = (error: Error[], result?: any) => {
        if (result) {
          resolve(result);
        } else {
          reject(error);
        }
      };

      // NOTE: as soon as we move into observables, we don't need to wait GQL_COMPLETE for queries and mutations
      this.executeOperation(options, handler);
    });
  }

  public subscribe(options: OperationOptions, handler: (error: Error[], result?: any) => void) {
    const legacyHandler = (error: Error[], result?: any) => {
      let operationPayloadData = result && result.data || null;
      let operationPayloadErrors = result && result.errors  || null;

      if (error) {
        operationPayloadErrors = error;
        operationPayloadData = null;
      }

      handler(operationPayloadErrors, operationPayloadData);
    };

    if (!handler) {
      throw new Error('Must provide an handler.');
    }

    return this.executeOperation(options, legacyHandler);
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
    if (this.operations[id]) {
      delete this.operations[id];
    }
    this.sendMessage(id, MessageTypes.GQL_STOP, undefined);
  }

  public unsubscribeAll() {
    Object.keys(this.operations).forEach( subId => {
      this.unsubscribe(parseInt(subId, 10));
    });
  }

  private executeOperation(options: OperationOptions, handler: (error: Error[], result?: any) => void): number {
    const { query, variables, operationName } = options;

    if (!query) {
      throw new Error('Must provide a query.');
    }

    if (!handler) {
      throw new Error('Must provide an handler.');
    }

    if (
      ( !isString(query) && !getOperationAST(query, operationName)) ||
      ( operationName && !isString(operationName)) ||
      ( variables && !isObject(variables))
    ) {
      throw new Error('Incorrect option types. query must be a string or a document,' +
        '`operationName` must be a string, and `variables` must be an object.');
    }

    const opId = this.generateOperationId();
    this.operations[opId] = { options, handler };
    this.sendMessage(opId, MessageTypes.GQL_START, options);

    return opId;
  }

  private buildMessage(id: number, type: string, payload: any) {
    const payloadToReturn = payload && payload.query ?
      {
        ...payload,
        query: typeof payload.query === 'string' ? payload.query : print(payload.query),
      } :
      payload;

    return {
      id,
      type,
      payload: payloadToReturn,
    };
  }

  // ensure we have an array of errors
  private formatErrors(errors: any): FormatedError[] {
    if (Array.isArray(errors)) {
      return errors;
    }

    // ValidationError
    if (errors && errors.errors) {
      return this.formatErrors(errors.errors);
    }

    if (errors && errors.message) {
      return [errors];
    }

    return [{
      name: 'FormatedError',
      message: 'Unknown error',
      originalError: errors
    }];
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

  private generateOperationId() {
    const id = this.nextOperationId;
    this.nextOperationId += 1;
    return id;
  }

  private tryReconnect() {
    if (!this.reconnect || this.backoff.attempts > this.reconnectionAttempts) {
      this.sendMessage(undefined, MessageTypes.GQL_CONNECTION_TERMINATE, null);
      return;
    }

    if (!this.reconnecting) {
      Object.keys(this.operations).forEach((key) => {
        this.unsentMessagesQueue.push(
          this.buildMessage(parseInt(key, 10), MessageTypes.GQL_START, this.operations[key].options)
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
      this.sendMessageRaw(message);
    });
    this.unsentMessagesQueue = [];
  }

  private checkConnection() {
    this.wasKeepAliveReceived ? this.wasKeepAliveReceived = false : this.close();
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
    let opId: number;

    try {
      parsedMessage = JSON.parse(receivedData);
      opId = parsedMessage.id;
    } catch (e) {
      throw new Error(`Message must be JSON-parseable. Got: ${receivedData}`);
    }

    if (
      [ MessageTypes.GQL_DATA,
        MessageTypes.GQL_COMPLETE,
        MessageTypes.GQL_ERROR,
      ].indexOf(parsedMessage.type) !== -1 && !this.operations[opId]
    ) {
      this.unsubscribe(opId);
      return;
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
        delete this.operations[opId];
        break;

      case MessageTypes.GQL_ERROR:
        this.operations[opId].handler(this.formatErrors(parsedMessage.payload), null);
        delete this.operations[opId];
        break;

      case MessageTypes.GQL_DATA:
        const parsedPayload = !parsedMessage.payload.errors ?
          parsedMessage.payload : {...parsedMessage.payload, errors: this.formatErrors(parsedMessage.payload.errors)};
        this.operations[opId].handler(null, parsedPayload);
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
