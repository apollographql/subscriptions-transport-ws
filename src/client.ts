import * as websocket from 'websocket';
const W3CWebSocket = (websocket as { [key: string]: any })['w3cwebsocket'];
import * as Backoff from 'backo2';

import {
  SUBSCRIPTION_FAIL,
  SUBSCRIPTION_DATA,
  SUBSCRIPTION_START,
  SUBSCRIPTION_SUCCESS,
  SUBSCRIPTION_END,
  SUBSCRIPTION_KEEPALIVE,
} from './messageTypes';
import { GRAPHQL_SUBSCRIPTIONS } from './protocols';

import isString = require('lodash.isstring');
import isObject = require('lodash.isobject');

export interface SubscriptionOptions {
  query: string;
  variables?: Object;
  operationName?: string;
  context?: any;
}

export interface Subscription {
  options: SubscriptionOptions,
  handler: (error: Error[], result?: any) => void,
}

export interface Subscriptions {
  [id: string]: Subscription;
}

export interface HeadersObject {
  [headerName: string]: string
}
export interface ClientOptions {
  timeout?: number;
  reconnect?: boolean;
  reconnectionAttempts?: number;
  connectRequestHeaders?: HeadersObject
}

const DEFAULT_SUBSCRIPTION_TIMEOUT = 5000;

export default class Client {

  public client: any;
  public subscriptions: Subscriptions;
  private url: string;
  private maxId: number;
  private subscriptionTimeout: number;
  private waitingSubscriptions: {[id: string]: boolean}; // subscriptions waiting for SUBSCRIPTION_SUCCESS
  private unsentMessagesQueue: Array<any>; // queued messages while websocket is opening.
  private reconnect: boolean;
  private reconnecting: boolean;
  private reconnectionAttempts: number;
  private reconnectSubscriptions: Subscriptions;
  private backoff: any;
  private connectRequestHeaders: HeadersObject;

  constructor(url: string, options?: ClientOptions) {
    const {
      timeout = DEFAULT_SUBSCRIPTION_TIMEOUT,
      reconnect = false,
      reconnectionAttempts = Infinity,
      connectRequestHeaders = undefined,
    } = (options || {});

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
    this.connectRequestHeaders = connectRequestHeaders;
    this.connect();
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
      if (this.waitingSubscriptions[subId]){
        handler([new Error('Subscription timed out - no response from server')]);
        this.unsubscribe(subId);
      }
    }, this.subscriptionTimeout);
    return subId;
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
      this.connect();
    }, delay);
  }

  private connect() {
    let headersObject: HeadersObject;

    if (this.connectRequestHeaders && isObject(this.connectRequestHeaders)) {
      headersObject = this.connectRequestHeaders;
    }

    this.client = new W3CWebSocket(this.url, GRAPHQL_SUBSCRIPTIONS, undefined, headersObject);

    this.client.onopen = () => {
      this.reconnecting = false;
      this.backoff.reset();
      Object.keys(this.reconnectSubscriptions).forEach((key) => {
        const { options, handler } = this.reconnectSubscriptions[key];
        this.subscribe(options, handler);
      })
      this.unsentMessagesQueue.forEach((message) => {
        this.client.send(JSON.stringify(message));
      });
      this.unsentMessagesQueue = [];
    };

    this.client.onclose = () => {
      this.tryReconnect();
    };

    this.client.onmessage = (message: { data: string }) => {
      let parsedMessage: any;
      try {
        parsedMessage = JSON.parse(message.data);
      } catch (e) {
        throw new Error('Message must be JSON-parseable.');
      }
      const subId = parsedMessage.id;
      if (parsedMessage.type !== SUBSCRIPTION_KEEPALIVE && !this.subscriptions[subId]) {
        this.unsubscribe(subId);
        return;
      }

      // console.log('MSG', JSON.stringify(parsedMessage, null, 2));
      switch (parsedMessage.type) {

        case SUBSCRIPTION_SUCCESS:
          delete this.waitingSubscriptions[subId];

          break;
        case SUBSCRIPTION_FAIL:
          this.subscriptions[subId].handler(this.formatErrors(parsedMessage.payload.errors), null);
          delete this.subscriptions[subId];
          delete this.waitingSubscriptions[subId];

          break;
        case SUBSCRIPTION_DATA:
          if (parsedMessage.payload.data && !parsedMessage.payload.errors) {
              this.subscriptions[subId].handler(null, parsedMessage.payload.data);
          } else {
            this.subscriptions[subId].handler(this.formatErrors(parsedMessage.payload.errors), null);
          }
          break;

        case SUBSCRIPTION_KEEPALIVE:
          break;

        default:
          throw new Error('Invalid message type - must be of type `subscription_start`, `subscription_data` or `subscription_keepalive`.');
      }
    };
  }
};
