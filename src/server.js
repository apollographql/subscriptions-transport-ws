"use strict";
var http = require('http');
var graphql = require('graphql');
require('babel-register');
var WebSocketServer = require('websocket').server;
var graphql_tools = require('graphql-tools');
var graphql_validator = require('graphql/validation');
var graphql_execution = require('graphql/execution');

class Server {
  /*
  options {
    schema: GraphQLSchema
    contextValue?: any,
    rootValue?: any,
    formatResponse?: (Object) => Object,
    validationRules?: Array<any> 
  }
  */
  constructor(options, httpServer) {
    this.options = options;
    this.triggers = {}; // trigger_name: [{connection, sub_id}]
    //initialize http server

    //init and connect websocket server to http
    this.wsServer = new WebSocketServer({
      httpServer: httpServer,
      autoAcceptConnections: false
    });

    this.wsServer.on('request', (request) => {
      //accept connection
      var connection = request.accept('graphql-protocol', request.origin);
      console.log('Accepted connection');
      connection.on('message', (message) => {
        let message_data = JSON.parse(message.utf8Data);
        if (! message_data.type) { //mutation message
          if (message_data.name && this.triggers && this.triggers[message_data.name]) {
            let triggered_subs = this.triggers[message_data.name];
            triggered_subs.forEach((sub_obj) => {
              let sub_connection = sub_obj.connection;
              let sub_id = sub_obj.sub_id;
              let sub_data = sub_connection.subscriptions[sub_id];
              graphql.graphql(
                this.options.schema,
                sub_data.query,
                this.options.rootValue,
                this.options.contextValue,
                sub_data.variables,
                sub_data.operationName
              ).then((response) => {
                let message = response;
                message.type = 'subscription_data';
                message.id = sub_id;
                if (this.options.formatResponse) {
                  message = formatResponse(message);
                }
                sub_connection.sendUTF(JSON.stringify(message));
              }, (err) => {
                let message = response;
                if (this.options.formatResponse) {
                  message = formatResponse(message);
                }
                message.type = 'subscription_data';
                message.id = sub_id;
                sub_connection.sendUTF(JSON.stringify(message));
              });
            })
          }
        } else {
          if (message_data.type === 'subscription_start') {
            let syntax_errors = graphql_validator.validate(this.options.schema, graphql.parse(message_data.query), this.options.validationRules);
            if (syntax_errors.length > 0) {
              let message = {
                type: 'subscription_fail',
                errors: syntax_errors,
                id: message_data.id,
              };
              connection.sendUTF(JSON.stringify(message));
            } else {
              const sub_id = message_data.id;
              if (!connection.subscriptions) {
                connection.subscriptions = {};
              }
              //set up trigger listeners
              if (message_data.triggers) {
                message_data.triggers.forEach((trigger) => {
                  if (! this.triggers[trigger]) {
                    this.triggers[trigger] = [{connection: connection, sub_id: sub_id}];
                  } else {
                    this.triggers[trigger].push({connection: connection, sub_id: sub_id});
                  }
                });
              }
              //set up polling message
              if (message_data.pollingInterval) {
                let pollingId = setInterval(
                  () => {
                    graphql.graphql(
                      this.options.schema,
                      message_data.query,
                      this.options.rootValue,
                      this.options.contextValue,
                      message_data.variables,
                      message_data.operationName
                    ).then(function(response){
                      let message = response;
                      message.type = 'subscription_data';
                      message.id = sub_id;
                      connection.sendUTF(JSON.stringify(message));
                    }, function(err) {
                      let message = response;
                      message.type = 'subscription_data';
                      message.id = sub_id;
                      connection.sendUTF(JSON.stringify(message));
                    });
                  }, 
                  message_data.pollingInterval
                );
                message_data.pollingId = pollingId;
              }

              connection.subscriptions[sub_id] = message_data;
            }
            
          } else if (message_data.type === 'subscription_end') {
            const sub_id = message.data.id;
            clearInterval(connection.subscriptions[sub_id][pollingId]);
            delete connection.subscriptions[sub_id];
          }
        }
      });

      connection.on('close', function(reasonCode, description) {
        console.log(" Peer " + connection.remoteAddress + ' disconnected.');
      });
    });
  }
} 
module.exports = Server;
