var WebSocketClient = require('websocket').client;
class Client {
  constructor(url, protocol) {
    this.url = url;
    this.protocol = protocol;
    this.client = new WebSocketClient();
    this.connection = null;
    this.subscriptions = {}; // id: handler
    this.max_id = 0;

    this.client.on('connect', (connection) => {
      this.connection = connection;
      connection.on('error', function(error){
        this.connection = null;
        //console.log('connection error: ' + error.toString());
      });
      connection.on('close', function() {
        this.connection = null;
        console.log("connection closed");
      });
      connection.on('message', (message) => {
        let message_data = JSON.parse(message.utf8Data);
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
      });
    });
  }
  openConnection(handler) {
    if (!handler) {
      handler = (error) => {console.log(error);};
    }
    this.client.on('connectFailed', function(error) {
      handler(error);
    });
    this.client.connect(this.url, this.protocol);
  }

  sendMessage(message) {
    if (this.connection.connected) {
      this.connection.sendUTF(JSON.stringify(message));
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
    if (! this.connection) {
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
    if (! this.connection) {
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
