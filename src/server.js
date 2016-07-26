var http = require('http');
var graphql = require('graphql');
require('babel-register');
var WebSocketServer = require('websocket').server;
var graphql_tools = require('graphql-tools');
var data = require('../data.json');

class Server {
  constructor(schema, port) {
    this.schema = schema;
    //initialize http server
    var httpServer = http.createServer(function(request, response) {
      response.writeHead(404);
      response.end();
    });

    httpServer.listen(port, function() {
      console.log("Server is listening on port " + port);
    });

    //init and connect websocket server to http
    this.wsServer = new WebSocketServer({
      httpServer: httpServer,
      autoAcceptConnections: false
    });

    this.wsServer.on('request', (request) => {
      //accept connection
      var connection = request.accept('graphql-protocol', request.origin);
      connection.on('message', (message) => {
        let message_data = JSON.parse(message.utf8Data);
        if (message_data.type === 'subscription_start') {
          const sub_id = message_data.id;
          if (!connection.subscriptions) {
            connection.subscriptions = {};
          }
          try {
            connection.subscriptions[sub_id] = {query: message_data.query, variables: message_data.variables};
            let message = {
              type: 'subscription_success',
            };
            //send success message
            connection.sendUTF(JSON.stringify(message));
            //set up polling message
            const pollingInterval = message_data.pollingInterval || 100;
            setInterval(
              () => {
                graphql.graphql(
                  this.schema,
                  message_data.query,
                  message_data.rootValue, //rootValue
                  message_data.contextValue, //contextValue
                  message_data.variables,
                  message_data.operationName
                ).then(function(response){
                  let message = response;
                  message.type = 'subscription_data';
                  message.id = sub_id;
                  connection.sendUTF(JSON.stringify(message));
                }, function(err) {
                  console.log(err);
                });
              }, 100);
          } catch (error) {
            let message = {
              type: 'subscription_fail',
              error: error,
              id: sub_id,
            };
            connection.sendUTF(JSON.stringify(message));
          }
        } else if (message_data.type === 'subscription_end') {
          const sub_id = message.data.id;
          delete connection.subscriptions[sub_id];
        }
      });

      connection.on('close', function(reasonCode, description) {
        console.log(" Peer " + connection.remoteAddress + ' disconnected.');
      });
    });
  }
} 
module.exports = Server;
