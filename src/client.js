"use strict";
var W3CWebSocket = require('websocket').w3cwebsocket;
class Client {
  constructor(url, protocol) {
    this.url = url;
    this.protocol = protocol;
    this.client = new W3CWebSocket(url, protocol);
    this.subscriptions = {}; // id: handler
    this.max_id = 0;

    this.client.onopen = () => {
      console.log("Websocket client connected.");
    };

    this.client.onmessage = (message) => {
      let message_data = JSON.parse(message.data);
      if (message_data.type === 'subscription_fail') {
        const del_id = message_data.id;
        delete this.subscriptions[del_id];
      } else if (message_data.type === 'subscription_data') {
        if (message_data.data) {
          const sub_id = message_data.id;
          if (this.subscriptions[sub_id]) {
            this.subscriptions[sub_id](null, message_data.data); // pass data into data handler
          }
        } else {
          this.subscriptions[sub_id](message_data.errors, null);
        }
      }
    };

    this.client.onclose = function() {
      console.log("connection closed");
    };

    this.client.onerror = function(error) {
      console.log('connection error: ' + error.toString());
    };
  }
  openConnection(handler) {
    if (!handler) {
      handler = (error) => {console.log('Error opening connection', error);};
    }
    this.client.on('connectFailed', function(error) {
      handler(error);
    });
    this.client.connect(this.url, this.protocol);
  }

  sendMessage(message) {
    if (this.client.readyState === this.client.OPEN) {
      this.client.send(JSON.stringify(message));
    }
  }

  generateSubscriptionId() {
    const id = this.max_id;
    this.max_id += 1;
    return id;
  }

  /*
  options:
    - query
    - variables
    - rootValue
    - contextValue
    - operationName
    - pollingInterval
    - triggers
  */
  subscribe(options, handler) {
    if (this.client.readyState !== this.client.OPEN) {
      throw new Error('Client is not connected to a websocket.');
    } else {
      let message = options;
      const sub_id = this.generateSubscriptionId();
      message.type = 'subscription_start';
      message.id = sub_id;
      this.sendMessage(message);
      this.subscriptions[sub_id] = handler;
      return sub_id;
    }
  }

  unsubscribe(id) {
    if (this.client.readyState !== this.client.OPEN) {
      throw new Error('Client is not connected to a websocket.');
    } else {
      let message = { id: id, type: 'subscription_end'};
      this.sendMessage(message);
      if (this.subscriptions[id]) {
        delete this.subscriptions[id];
      }
    }
  }
}

module.exports = Client;
