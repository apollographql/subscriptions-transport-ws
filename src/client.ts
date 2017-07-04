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

import { GRAPHQL_WS } from './protocol';
import { WS_TIMEOUT } from './defaults';
import MessageTypes from './message-types';

export * from './helpers';

export interface OperationOptions {
  query: string;
  variables?: Object;
  operationName?: string;
  [key: string]: any;
}

export type FormatedError = Error & {
  originalError?: any;
};

export interface Operation {
  options: OperationOptions;
  handler: (error: Error[], result?: any) => void;
}

export interface Operations {
  [id: string]: Operation;
}

export interface Middleware {
  applyMiddleware(options: OperationOptions, next: Function): void;
}

export type ConnectionParams = {
  [paramName: string]: any,
};

export type ConnectionParamsOptions = ConnectionParams | Function;

export interface ClientOptions {
  connectionParams?: ConnectionParamsOptions;
  timeout?: number;
  reconnect?: boolean;
  reconnectionAttempts?: number;
  connectionCallback?: (error: Error[], result?: any) => void;
  lazy?: boolean;
}

export class SubscriptionClient {
  public client: any;
  public operations: Operations;
  private url: string;
  private nextOperationId: number;
  private connectionParams: ConnectionParamsOptions;
  private wsTimeout: number;
  private unsentMessagesQueue: Array<any>; // queued messages while websocket is opening.
  private reconnect: boolean;
  private reconnecting: boolean;
  private reconnectionAttempts: number;
  private backoff: any;
  private connectionCallback: any;
  private eventEmitter: EventEmitter;
  private lazy: boolean;
  private closedByUser: boolean;
  private wsImpl: any;
  private wasKeepAliveReceived: boolean;
  private tryReconnectTimeoutId: any;
  private checkConnectionIntervalId: any;
  private maxConnectTimeoutId: any;
  private middlewares: Middleware[];

  constructor(url: string, options?: ClientOptions, webSocketImpl?: any) {
    const {
      connectionCallback = undefined,
      connectionParams = {},
      timeout = WS_TIMEOUT,
      reconnect = false,
      reconnectionAttempts = Infinity,
      lazy = false,
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
    this.lazy = !!lazy;
    this.closedByUser = false;
    this.backoff = new Backoff({ jitter: 0.5 });
    this.eventEmitter = new EventEmitter();
    this.middlewares = [];
    this.client = null;

    if (!this.lazy) {
      this.connect();
    }
  }

  public get status() {
    if (this.client === null) {
      return this.wsImpl.CLOSED;
    }

    return this.client.readyState;
  }

  public close(isForced = true, closedByUser = true) {
    if (this.client !== null) {
      this.closedByUser = closedByUser;

      if (isForced) {
        if (this.checkConnectionIntervalId) {
          clearInterval(this.checkConnectionIntervalId);
        }

        if (this.maxConnectTimeoutId) {
          clearTimeout(this.maxConnectTimeoutId);
          this.maxConnectTimeoutId = null;
        }

        if (this.tryReconnectTimeoutId) {
          clearTimeout(this.tryReconnectTimeoutId);
          this.tryReconnectTimeoutId = null;
        }

        this.sendMessage(undefined, MessageTypes.GQL_CONNECTION_TERMINATE, null);
      }

      if (closedByUser) {
        this.client.close();
      }
      this.client = null;
      this.eventEmitter.emit('disconnected');

      if (!isForced) {
        this.tryReconnect();
      }
    }
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

    if (this.client === null) {
      this.connect();
    }

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

  /**
   * @deprecated This method will become deprecated in the next release.
   * You can use onConnecting and onConnected instead.
   */
  public onConnect(callback: ListenerFn, context?: any): Function {
    this.logWarningOnNonProductionEnv('This method will become deprecated in the next release. ' +
      'You can use onConnecting and onConnected instead.');
    return this.onConnecting(callback, context);
  }

  /**
   * @deprecated This method will become deprecated in the next release.
   * You can use onDisconnected instead.
   */
  public onDisconnect(callback: ListenerFn, context?: any): Function {
    this.logWarningOnNonProductionEnv('This method will become deprecated in the next release. ' +
      'You can use onDisconnected instead.');
    return this.onDisconnected(callback, context);
  }

  /**
   * @deprecated This method will become deprecated in the next release.
   * You can use onReconnecting and onReconnected instead.
   */
  public onReconnect(callback: ListenerFn, context?: any): Function {
    this.logWarningOnNonProductionEnv('This method will become deprecated in the next release. ' +
      'You can use onReconnecting and onReconnected instead.');
    return this.onReconnecting(callback, context);
  }

  public onConnected(callback: ListenerFn, context?: any): Function {
    return this.on('connected', callback, context);
  }

  public onConnecting(callback: ListenerFn, context?: any): Function {
    return this.on('connecting', callback, context);
  }

  public onDisconnected(callback: ListenerFn, context?: any): Function {
    return this.on('disconnected', callback, context);
  }

  public onReconnected(callback: ListenerFn, context?: any): Function {
    return this.on('reconnected', callback, context);
  }

  public onReconnecting(callback: ListenerFn, context?: any): Function {
    return this.on('reconnecting', callback, context);
  }

  public unsubscribe(opId: string) {
    if (this.operations[opId]) {
      delete this.operations[opId];
      this.sendMessage(opId, MessageTypes.GQL_STOP, undefined);
    }
  }

  public unsubscribeAll() {
    Object.keys(this.operations).forEach( subId => {
      this.unsubscribe(subId);
    });
  }

  public applyMiddlewares(options: OperationOptions): Promise<OperationOptions> {
    return new Promise((resolve, reject) => {
      const queue = (funcs: Middleware[], scope: any) => {
        const next = (error?: any) => {
          if (error) {
            reject(error);
          } else {
            if (funcs.length > 0) {
              const f = funcs.shift();
              if (f) {
                f.applyMiddleware.apply(scope, [options, next]);
              }
            } else {
              resolve(options);
            }
          }
        };
        next();
      };

      queue([...this.middlewares], this);
    });
  }

  public use(middlewares: Middleware[]): SubscriptionClient {
    middlewares.map((middleware) => {
      if (typeof middleware.applyMiddleware === 'function') {
        this.middlewares.push(middleware);
      } else {
        throw new Error('Middleware must implement the applyMiddleware function.');
      }
    });

    return this;
  }

  private logWarningOnNonProductionEnv(warning: string) {
    if (process && process.env && process.env.NODE_ENV !== 'production') {
      console.warn(warning);
    }
  }

  private checkOperationOptions(options: OperationOptions, handler: (error: Error[], result?: any) => void) {
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
  }

  private executeOperation(options: OperationOptions, handler: (error: Error[], result?: any) => void): string {
    const opId = this.generateOperationId();
    this.operations[opId] = { options: options, handler };

    this.applyMiddlewares(options)
      .then(processedOptions => {
        this.checkOperationOptions(processedOptions, handler);
          if (this.operations[opId]) {
            this.operations[opId] = { options: processedOptions, handler };
            this.sendMessage(opId, MessageTypes.GQL_START, processedOptions);
          }
      })
      .catch(error => {
        this.unsubscribe(opId);
        handler(this.formatErrors(error));
      });

    return opId;
  }

  private buildMessage(id: string, type: string, payload: any) {
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

    // TODO  we should not pass ValidationError to callback in the future.
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
      originalError: errors,
    }];
  }

  private sendMessage(id: string, type: string, payload: any) {
    this.sendMessageRaw(this.buildMessage(id, type, payload));
  }

  // send message, or queue it if connection is not open
  private sendMessageRaw(message: Object) {
    switch (this.status) {
      case this.wsImpl.OPEN:
        let serializedMessage: string = JSON.stringify(message);
        let parsedMessage: any;
        try {
          parsedMessage = JSON.parse(serializedMessage);
        } catch (e) {
          throw new Error(`Message must be JSON-serializable. Got: ${message}`);
        }

        this.client.send(serializedMessage);
        break;
      case this.wsImpl.CONNECTING:
        this.unsentMessagesQueue.push(message);

        break;
      default:
        if (!this.reconnecting) {
          throw new Error('A message was not sent because socket is not connected, is closing or ' +
            'is already closed. Message was: ${JSON.parse(serializedMessage)}.');
        }
    }
  }

  private generateOperationId(): string {
    return String(++this.nextOperationId);
  }

  private tryReconnect() {
    if (!this.reconnect || this.backoff.attempts >= this.reconnectionAttempts) {
      return;
    }

    if (!this.reconnecting) {
      Object.keys(this.operations).forEach((key) => {
        this.unsentMessagesQueue.push(
          this.buildMessage(key, MessageTypes.GQL_START, this.operations[key].options),
        );
      });
      this.reconnecting = true;
    }

    if (this.tryReconnectTimeoutId) {
      clearTimeout(this.tryReconnectTimeoutId);
      this.tryReconnectTimeoutId = null;
    }

    const delay = this.backoff.duration();
    this.tryReconnectTimeoutId = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private flushUnsentMessagesQueue() {
    this.unsentMessagesQueue.forEach((message) => {
      this.sendMessageRaw(message);
    });
    this.unsentMessagesQueue = [];
  }

  private checkConnection() {
    this.wasKeepAliveReceived ? this.wasKeepAliveReceived = false : this.close(false, true);
  }

  private checkMaxConnectTimeout() {
    if (this.maxConnectTimeoutId) {
      clearTimeout(this.maxConnectTimeoutId);
      this.maxConnectTimeoutId = null;
    }

    // Max timeout trying to connect
    this.maxConnectTimeoutId = setTimeout(() => {
      if (this.status !== this.wsImpl.OPEN) {
        this.close(false, true);
      }
    }, this.wsTimeout);
  }

  private connect() {
    this.client = new this.wsImpl(this.url, GRAPHQL_WS);

    this.checkMaxConnectTimeout();

    this.client.onopen = () => {
      this.closedByUser = false;
      this.eventEmitter.emit(this.reconnecting ? 'reconnecting' : 'connecting');

      if (this.tryReconnectTimeoutId) {
        clearTimeout(this.tryReconnectTimeoutId);
        this.tryReconnectTimeoutId = null;
      }

      const payload: ConnectionParams = typeof this.connectionParams === 'function' ? this.connectionParams() : this.connectionParams;

      // Send CONNECTION_INIT message, no need to wait for connection to success (reduce roundtrips)
      this.sendMessage(undefined, MessageTypes.GQL_CONNECTION_INIT, payload);
      this.flushUnsentMessagesQueue();
    };

    this.client.onclose = () => {
      if ( !this.closedByUser ) {
        this.close(false, false);
      }
    };

    this.client.onerror = () => {
      // Capture and ignore errors to prevent unhandled exceptions, wait for
      // onclose to fire before attempting a reconnect.
      this.close(false, true);
    };

    this.client.onmessage = ({ data }: {data: any}) => {
      this.processReceivedData(data);
    };
  }

  private processReceivedData(receivedData: any) {
    let parsedMessage: any;
    let opId: string;

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
        this.eventEmitter.emit(this.reconnecting ? 'reconnected' : 'connected');
        this.reconnecting = false;
        this.backoff.reset();

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
        const firstKA = typeof this.wasKeepAliveReceived === 'undefined';
        this.wasKeepAliveReceived = true;

        if (firstKA) {
          this.checkConnection();
        }

        if (this.checkConnectionIntervalId) {
          clearInterval(this.checkConnectionIntervalId);
          this.checkConnection();
        }
        this.checkConnectionIntervalId = setInterval(this.checkConnection.bind(this), this.wsTimeout);
        break;

      default:
        throw new Error('Invalid message type!');
    }
  }
}
