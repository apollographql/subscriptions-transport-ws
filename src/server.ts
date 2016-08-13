import * as http from 'http';
var graphql = require('graphql');
var WebSocketServer = require('websocket').server;
var graphql_validator = require('graphql/validation');
var graphql_execution = require('graphql/execution');

import {
  Document,
  GraphQLSchema,
} from 'graphql';


interface Connection{
  // define a websocket connection here?
  subscriptions: {[key: string]: any};
  sendUTF: Function;
}

interface SubscribeMessage {
  query: string;
  variables?: { [key: string]: any };
  operationName: string,
  id: string,
  type: string,
};

interface SubscriptionData {
  query: string;
  variables?: { [key: string]: any };
}

interface ServerOptions {
  schema: GraphQLSchema;
  contextValue?: any;
  //tbc
}

class Server {

  options: any; // better to define an interface here!
  triggers: {[key: string]: Array<{ connection: Connection, sub_data: SubscriptionData, sub_id: number, filter: Function}>};
  wsServer: any;
  /*
  options {
    schema: GraphQLSchema
    contextValue?: any,
    rootValue?: any,
    formatResponse?: (Object) => Object,
    validationRules?: Array<any> 
    triggerGenerator?: (Object) => [{name: , filter: }] 
  }
  */
  constructor(options, httpServer) {
    this.options = options;
    this.triggers = {}; // trigger_object: [{connection, sub_id}]
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
            let msg_triggers = [];

            if (this.options.triggerGenerator) {
              // 1. parse query
              // 2. validate
              // 3. get operation definition out of it
              // make sure it's a subscription
              // 4. make sure there's only one field on that operation definition

              msg_triggers = this.options.triggerGenerator(message_data.operationName, message_data.variables);
            } else {
              throw new Error('Server does not have trigger generator.');
            }
            
            msg_triggers.forEach((trigger) => {
              let trigger_name = trigger.name;
              let trigger_object = {
                  connection: connection,
                  filter: trigger.filter,
                  sub_id: sub_id,
                  sub_data: {
                    query: message_data.query,
                    variables: message_data.variables,
                  }
                }
              if (! this.triggers[trigger_name]) {
                this.triggers[trigger_name] = [trigger_object];
              } else {
                this.triggers[trigger_name].push(trigger_object);
              }
            });
            

            connection.subscriptions[sub_id] = message_data;
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

  triggerAction(message_data) {
    const trigger_name = message_data.name;
    const trigger_value = message_data.value; //rootValue

    if (this.triggers[trigger_name]) {
      //not sure how to filter
      let triggered_subs = this.triggers[trigger_name].filter((subscriber) => {
        return subscriber.filter(trigger_value);
      });

      triggered_subs.forEach((sub_obj) => {
        let sub_connection = sub_obj.connection;
        let sub_id = sub_obj.sub_id;
        let sub_data = sub_connection.subscriptions[sub_id as number];
        graphql.graphql(
          this.options.schema,
          sub_data.query,
          trigger_value,
          this.options.contextValue,
          sub_data.variables,
          sub_data.operationName
        ).then((response) => {
          let message = response;
          message.type = 'subscription_data';
          message.id = sub_id;
          if (this.options.formatResponse) {
            message = this.options.formatResponse(message);
          }
          sub_connection.sendUTF(JSON.stringify(message));
        }, (err) => {
          // XXX same as above here...
          let message = err;
          if (this.options.formatResponse) {
            message = this.options.formatResponse(message);
          }
          message.type = 'subscription_data';
          message.id = sub_id;
          sub_connection.sendUTF(JSON.stringify(message));
        });
      })
    }
  }

} 
export default Server;
