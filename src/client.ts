import * as Backoff from 'backo2';
import {EventEmitter, ListenerFn} from 'eventemitter3';

import {MiddlewareInterface} from './middleware';

declare let window: any;
const _global = typeof global !== 'undefined' ? global : (typeof window !== 'undefined' ? window : {});
const NativeWebSocket = _global.WebSocket || _global.MozWebSocket;

import {
  SUBSCRIPTION_FAIL,
  SUBSCRIPTION_DATA,
  SUBSCRIPTION_START,
  SUBSCRIPTION_SUCCESS,
  SUBSCRIPTION_END,
  KEEPALIVE,
  INIT,
  INIT_FAIL,
  INIT_SUCCESS,
} from './messageTypes';
import { GRAPHQL_SUBSCRIPTIONS } from './protocols';

import isString = require('lodash.isstring');
import isObject = require('lodash.isobject');

export * from './helpers';

export interface SubscriptionOptions {
  query: string;
  variables?: Object;
  operationName?: string;
  context?: any;
}

export interface Subscription {
  options: SubscriptionOptions;
  handler: (error: Error[], result?: any) => void;
}

export interface Subscriptions {
  [id: string]: Subscription;
}

export type ConnectionParams = {[paramName: string]: any};

export interface ClientOptions {
  connectionParams?: ConnectionParams;
  timeout?: number;
  reconnect?: boolean;
  reconnectionAttempts?: number;
  connectionCallback?: (error: Error[], result?: any) => void;
}

const DEFAULT_SUBSCRIPTION_TIMEOUT = 5000;

export class SubscriptionClient {
  public client: any;
  public subscriptions: Subscriptions;
  private url: string;
  private maxId: number;
  private connectionParams: ConnectionParams;
  private subscriptionTimeout: number;
  private waitingSubscriptions: {[id: string]: boolean}; // subscriptions waiting for SUBSCRIPTION_SUCCESS
  private waitingUnsubscribes: {[id: string]: boolean};
  private unsentMessagesQueue: Array<any>; // queued messages while websocket is opening.
  private reconnect: boolean;
  private reconnecting: boolean;
  private reconnectionAttempts: number;
  private reconnectSubscriptions: Subscriptions;
  private backoff: any;
  private connectionCallback: any;
  private eventEmitter: EventEmitter;
  private wsImpl: any;
  private middlewares: MiddlewareInterface[];

  constructor(url: string, options?: ClientOptions, webSocketImpl?: any) {
    const {
      connectionCallback = undefined,
      connectionParams = {},
      timeout = DEFAULT_SUBSCRIPTION_TIMEOUT,
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
    this.subscriptions = {};
    this.maxId = 0;
    this.subscriptionTimeout = timeout;
    this.waitingSubscriptions = {};
    this.waitingUnsubscribes = {};
    this.unsentMessagesQueue = [];
    this.reconnect = reconnect;
    this.reconnectSubscriptions = {};
    this.reconnecting = false;
    this.reconnectionAttempts = reconnectionAttempts;
    this.backoff = new Backoff({ jitter: 0.5 });
    this.eventEmitter = new EventEmitter();
    this.middlewares = [];

    this.connect();
  }

  public get status() {
    return this.client.readyState;
  }

  public close() {
    this.client.close();
  }

  public subscribe(opts: SubscriptionOptions, handler: (error: Error[], result?: any) => void) {
    // this.eventEmitter.emit('subscribe', options);
    const { query, variables, operationName, context } = opts;

    if (!query) {
      throw new Error('Must provide `query` to subscribe.');
    }

    if (!handler) {
      throw new Error('Must provide `handler` to subscribe.');
    }

    if (
      !isString(query) ||
      ( operationName && !isString(operationName)) ||
      ( variables && !isObject(variables))
    ) {
      throw new Error('Incorrect option types to subscribe. `subscription` must be a string,' +
      '`operationName` must be a string, and `variables` must be an object.');
    }
    
    const subId = this.generateSubscriptionId();

    this.applyMiddlewares(opts).then(options => {
      const { query, variables, operationName, context } = options;

      if (!query) {
        handler([new Error('Must provide `query` to subscribe.')]);
        this.unsubscribe(subId);
      }

      if (
        !isString(query) ||
        ( operationName && !isString(operationName)) ||
        ( variables && !isObject(variables))
      ) {
        handler([new Error('Incorrect option types to subscribe. `subscription` must be a string,' +
        '`operationName` must be a string, and `variables` must be an object.')]);
        this.unsubscribe(subId);
      }
      
      let message = Object.assign(options, {type: SUBSCRIPTION_START, id: subId});
      this.sendMessage(message);
      this.subscriptions[subId] = {options, handler};
      this.waitingSubscriptions[subId] = true;

      if(this.waitingUnsubscribes[subId]) {
        delete this.waitingUnsubscribes[subId];
        this.unsubscribe(subId);
      }

      setTimeout( () => {
        if (this.waitingSubscriptions[subId]) {
          handler([new Error('Subscription timed out - no response from server')]);
          this.unsubscribe(subId);
        }
      }, this.subscriptionTimeout);
    });

    return subId;
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

  public onSubscribe(callback: ListenerFn, context?: any): Function {
    return this.on('subscribe', callback, context);
  }

  public unsubscribe(id: number) {
    if(!this.subscriptions[id] && !this.waitingSubscriptions[id] && this.maxId >= id) {
      this.waitingUnsubscribes[id] = true;
      return;
    }

    delete this.subscriptions[id];
    delete this.waitingSubscriptions[id];
    let message = { id, type: SUBSCRIPTION_END};
    this.sendMessage(message);
  }

  public unsubscribeAll() {
    Object.keys(this.subscriptions).forEach( subId => {
      this.unsubscribe(parseInt(subId));
    });
  }

  // public applyMiddlewares(options: SubscriptionOptions): void {
  //   const funcs = [...this.middlewares];
  //   funcs.map(f => f.applyMiddleware.apply(this, [options, ()=> {}]));
  // }

  public applyMiddlewares(options: SubscriptionOptions): Promise<SubscriptionOptions> {
    return new Promise((resolve, reject) => {
      const queue = (funcs: MiddlewareInterface[], scope: any) => {
        const next = () => {
          if (funcs.length > 0) {
            const f = funcs.shift();
            if (f) {
              f.applyMiddleware.apply(scope, [options, next]);
            }
          } else {
            resolve(options);
          }
        };
        next();
      };

      queue([...this.middlewares], this);
    });
  }

  public use(middlewares: MiddlewareInterface[]): SubscriptionClient {
    middlewares.map((middleware) => {
      if (typeof middleware.applyMiddleware === 'function') {
        this.middlewares.push(middleware);
      } else {
        throw new Error('Middleware must implement the applyMiddleware function');
      }
    });

    return this;
  }

  // send message, or queue it if connection is not open
  private sendMessage(message: Object) {
    switch (this.client.readyState) {

      case this.client.OPEN:
        // TODO: throw error if message isn't json serializable?
        this.client.send(JSON.stringify(message));

        break;
      case this.client.CONNECTING:
        this.unsentMessagesQueue.push(message);

        break;
      case this.client.CLOSING:
      case this.client.CLOSED:
      default:
        if (!this.reconnecting) {
          throw new Error('Client is not connected to a websocket.');
        }
    }
  }

  private generateSubscriptionId() {
    const id = this.maxId;
    this.maxId += 1;
    return id;
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

  private tryReconnect() {
    if (!this.reconnect) {
      return;
    }
    if (this.backoff.attempts > this.reconnectionAttempts) {
      return;
    }

    if (!this.reconnecting) {
      this.reconnectSubscriptions = this.subscriptions;
      this.subscriptions = {};
      this.waitingSubscriptions = {};
      this.reconnecting = true;
    }
    const delay = this.backoff.duration();
    setTimeout(() => {
      this.connect(true);
    }, delay);
  }

  private connect(isReconnect: boolean = false) {
    this.client = new this.wsImpl(this.url, GRAPHQL_SUBSCRIPTIONS);

    this.client.onopen = () => {
      this.eventEmitter.emit(isReconnect ? 'reconnect' : 'connect');
      this.reconnecting = false;
      this.backoff.reset();
      // Send INIT message, no need to wait for connection to success (reduce roundtrips)
      this.sendMessage({type: INIT, payload: this.connectionParams});

      Object.keys(this.reconnectSubscriptions).forEach((key) => {
        const { options, handler } = this.reconnectSubscriptions[key];
        this.subscribe(options, handler);
      });
      this.unsentMessagesQueue.forEach((message) => {
        this.client.send(JSON.stringify(message));
      });
      this.unsentMessagesQueue = [];
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
      let parsedMessage: any;
      try {
        parsedMessage = JSON.parse(data);
      } catch (e) {
        throw new Error(`Message must be JSON-parseable. Got: ${data}`);
      }
      const subId = parsedMessage.id;
      if ([KEEPALIVE, INIT_SUCCESS, INIT_FAIL].indexOf(parsedMessage.type) === -1 && !this.subscriptions[subId]) {
        this.unsubscribe(subId);

        if (parsedMessage.type === KEEPALIVE) {
          return;
        }
      }

      // console.log('MSG', JSON.stringify(parsedMessage, null, 2));
      switch (parsedMessage.type) {
        case INIT_FAIL:
          if (this.connectionCallback) {
            this.connectionCallback(parsedMessage.payload.error);
          }
          break;
        case INIT_SUCCESS:
          if (this.connectionCallback) {
            this.connectionCallback();
          }
          break;
        case SUBSCRIPTION_SUCCESS:
          delete this.waitingSubscriptions[subId];

          break;
        case SUBSCRIPTION_FAIL:
          this.subscriptions[subId].handler(this.formatErrors(parsedMessage.payload.errors), null);
          delete this.subscriptions[subId];
          delete this.waitingSubscriptions[subId];

          break;
        case SUBSCRIPTION_DATA:
          const payloadData = parsedMessage.payload.data || null;
          const payloadErrors = parsedMessage.payload.errors ? this.formatErrors(parsedMessage.payload.errors) : null;
          this.subscriptions[subId].handler(payloadErrors, payloadData);
          break;
        case KEEPALIVE:
          break;

        default:
          throw new Error('Invalid message type!');
      }
    };
  }
}
