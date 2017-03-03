import * as Backoff from 'backo2';
import {EventEmitter, ListenerFn} from 'eventemitter3';

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
  private unsentMessagesQueue: Array<any>; // queued messages while websocket is opening.
  private reconnect: boolean;
  private reconnecting: boolean;
  private reconnectionAttempts: number;
  private reconnectSubscriptions: Subscriptions;
  private backoff: any;
  private connectionCallback: any;
  private eventEmitter: EventEmitter;
  private wsImpl: any;

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
    this.unsentMessagesQueue = [];
    this.reconnect = reconnect;
    this.reconnectSubscriptions = {};
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

  public subscribe(options: SubscriptionOptions, handler: (error: Error[], result?: any) => void) {
    const { query, variables, operationName, context } = options;

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
    let message = Object.assign(options, {type: SUBSCRIPTION_START, id: subId});
    this.sendMessage(message);
    this.subscriptions[subId] = {options, handler};
    this.waitingSubscriptions[subId] = true;
    setTimeout( () => {
      if (this.waitingSubscriptions[subId]) {
        handler([new Error('Subscription timed out - no response from server')]);
        this.unsubscribe(subId);
      }
    }, this.subscriptionTimeout);
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

  public unsubscribe(id: number) {
    delete this.subscriptions[id];
    delete this.waitingSubscriptions[id];
    let message = { id: id, type: SUBSCRIPTION_END};
    this.sendMessage(message);
  }

  public unsubscribeAll() {
    Object.keys(this.subscriptions).forEach( subId => {
      this.unsubscribe(parseInt(subId));
    });
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
      Object.keys(this.reconnectSubscriptions).forEach((key) => {
        const { options, handler } = this.reconnectSubscriptions[key];
        this.subscribe(options, handler);
      });
      this.unsentMessagesQueue.forEach((message) => {
        this.client.send(JSON.stringify(message));
      });
      this.unsentMessagesQueue = [];

      // Send INIT message, no need to wait for connection to success (reduce roundtrips)
      this.sendMessage({type: INIT, payload: this.connectionParams});
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
        return;
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
