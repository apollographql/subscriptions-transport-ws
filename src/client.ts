const W3CWebSocket = require('websocket').w3cwebsocket;

import {
  SUBSCRIPTION_FAIL,
  SUBSCRIPTION_DATA,
  SUBSCRIPTION_START,
  SUBSCRIPTION_END,
} from './messageTypes';

import {
  isString,
  isObject,
} from 'lodash';

interface SubscriptionOptions {
  query: string;
  variables: Object;
  operationName: string;
}

export default class Client {

  public client: any;
  public subscriptionHandlers: {[id: string]: (error, result) => void};
  private maxId: number;

  constructor(url: string) {

    this.client = new W3CWebSocket(url, 'graphql-subscriptions');
    this.subscriptionHandlers = {}; // id: handler
    this.maxId = 0;

    this.client.onmessage = (message) => {
      let parsedMessage;
      try {
        parsedMessage = JSON.parse(message.data);
      } catch (e) {
        throw new Error('Message must be JSON-parseable.');
      }
      switch (parsedMessage.type) {

        case SUBSCRIPTION_FAIL:
          const delId = parsedMessage.id;
          if (this.subscriptionHandlers[delId]) {
            this.subscriptionHandlers[delId](parsedMessage.errors, null);
          }
          delete this.subscriptionHandlers[delId];
          break;

        case SUBSCRIPTION_DATA:
          const subId = parsedMessage.id;
          if (parsedMessage.payload.data) {
            if (this.subscriptionHandlers[subId]) {
              this.subscriptionHandlers[subId](null, parsedMessage.payload.data); // pass data into data handler
            } else {
              this.unsubscribe(subId);
            }
          } else {
            this.subscriptionHandlers[subId](parsedMessage.payload.errors, null);
          }
          break;

        default:
          throw new Error('Invalid message type - must be of type `subscription_start` or `subscription_data`.');
      }

    };
  }

  public subscribe(options: SubscriptionOptions, handler) {
    const { query, variables, operationName } = options;

    if (!query || !variables || !operationName) {
      throw new Error('Must provide `query`, `variables`, and `operationName` to subscribe.');
    }

    if (!handler) {
      throw new Error('Must provide `handler` to subscribe.');
    }

    if (!isString(query) || !isString(operationName) || !isObject(variables)) {
      throw new Error('Incorrect option types to subscribe. `subscription` must be a string,' +
      '`operationName` must be a string, and `variables` must be an object.');
    }

    switch (this.client.readyState) {

      case this.client.OPEN:
        const subId = this.generateSubscriptionId();
        let message = Object.assign(options, {type: SUBSCRIPTION_START, id: subId});
        this.sendMessage(message);
        this.subscriptionHandlers[subId] = handler;
        return subId;

      case this.client.CONNECTING:
        throw new Error('Client is still connecting to websocket.');

      case this.client.CLOSING:
        throw new Error('Client websocket connection is closing.');

      case this.client.CLOSED:
        throw new Error('Client is not connected to a websocket.');

      default:
        throw new Error('Client is not connected to a websocket.');
    }
  }

  public unsubscribe(id) {
    switch (this.client.readyState) {

      case this.client.OPEN:
        let message = { id: id, type: SUBSCRIPTION_END};
        this.sendMessage(message);
        delete this.subscriptionHandlers[id];
        break;

      case this.client.CONNECTING:
        throw new Error('Client is still connecting to websocket.');

      case this.client.CLOSING:
        throw new Error('Client websocket connection is closing.');

      case this.client.CLOSED:
        throw new Error('Client is not connected to a websocket.');

      default:
        throw new Error('Client is not connected to a websocket.');
    }

  }

  private sendMessage(message) {
    if (this.client.readyState === this.client.OPEN) {
      this.client.send(JSON.stringify(message));
    }
  }

  private generateSubscriptionId() {
    const id = this.maxId;
    this.maxId += 1;
    return id;
  }

};
