import {
  server as WebSocketServer, // these are NOT the correct typings!
} from 'websocket';

import {
  SUBSCRIPTION_FAIL,
  SUBSCRIPTION_DATA,
  SUBSCRIPTION_START,
  SUBSCRIPTION_END,
  SUBSCRIPTION_SUCCESS,
} from './messageTypes';

import { SubscriptionManager } from 'graphql-subscriptions';

interface Connection {
  // define a websocket connection here?
  sendUTF: Function;
}

interface SubscribeMessage {
  query?: string;
  variables?: { [key: string]: any };
  operationName?: string;
  id: string;
  type: string;
};

interface SubscriptionData {
  query: string;
  variables?: { [key: string]: any };
  operationName: string;
}

export interface ServerOptions {
  subscriptionManager: SubscriptionManager;
  onSubscribe?: Function;
  // contextValue?: any;
  // rootValue?: any;
  // formatResponse?: (Object) => Object;
  // validationRules?: Array<any>;
  // triggerGenerator?: (name: string, args: Object, context?: Object) => Array<{name: string, filter: Function}>;
}

interface TriggerAction {
  name: string;
  rootValue: any;
  contextValue?: any;
}

class Server {
  private onSubscribe: Function;
  private wsServer: WebSocketServer;
  private subscriptionManager: SubscriptionManager;

  constructor(options: ServerOptions, httpServer) {
    const { subscriptionManager, onSubscribe } = options;

    if (!subscriptionManager) {
      throw new Error('Must provide `subscriptionManager` to websocket server constructor.');
    }

    this.subscriptionManager = subscriptionManager;
    this.onSubscribe = onSubscribe;

    // init and connect websocket server to http
    this.wsServer = new WebSocketServer({
      httpServer: httpServer,
      autoAcceptConnections: false,
      // TODO: origin filter
    });

    this.wsServer.on('request', (request) => {
      // accept connection
      const connection = request.accept('graphql-subscriptions', request.origin);

      const connectionSubscriptions = {};
      connection.on('message', this.onMessage(connection, connectionSubscriptions));
    });

    //TODO: on close, clean everything up!
  }

  private onMessage(connection, connectionSubscriptions) {
    return  (message) => {
      let parsedMessage: SubscribeMessage;
      try {
        parsedMessage = JSON.parse(message.utf8Data);
      } catch (e) {
        let failMessage = {
          type: SUBSCRIPTION_FAIL,
          errors: ['Message must be JSON-parseable.'],
          id: parsedMessage.id,
        };
        connection.sendUTF(JSON.stringify(failMessage));
      }

      const subId = parsedMessage.id;
      switch (parsedMessage.type) {

        case SUBSCRIPTION_START:
          let params = {
            query: parsedMessage.query,
            variables: parsedMessage.variables,
            operationName: parsedMessage.operationName,
            context: {},
            formatResponse: undefined,
            formatError: undefined,
            callback: undefined,
          };
          params = this.onSubscribe(parsedMessage, params) || params;

          // create a callback
          params['callback'] = (errors, data) => {
            // TODO: we don't do anything with errors
            this.sendSubscriptionData(connection, subId, data);
          };

          let graphqlSubId;
          this.subscriptionManager.subscribe( params ).then( graphqlSubId => {
            connectionSubscriptions[subId] = graphqlSubId;
            this.sendSubscriptionSuccess(connection, subId);
          }).catch( e => {
            this.sendSubscriptionFail(connection, subId, { errors: e.errors });
            return;
          });
          break;

        case SUBSCRIPTION_END:
          // find subscription id. Call unsubscribe.
          // TODO untested. catch errors, etc.
          if (connectionSubscriptions[subId]) {
            this.subscriptionManager.unsubscribe(connectionSubscriptions[subId]);
            delete connectionSubscriptions[subId];
          }
          break;

        default:
          throw new Error('Invalid message type. Message type must be `subscription_start` or `subscription_end`.');
      }

    };
  }

  private sendSubscriptionData(connection: Connection, subId: string, payload: any): void {
    let message = {
      type: SUBSCRIPTION_DATA,
      id: subId,
      payload,
    };

    connection.sendUTF(JSON.stringify(message));
  }

  private sendSubscriptionFail(connection: Connection, subId: string, payload: any): void {
    let message = {
      type: SUBSCRIPTION_FAIL,
      id: subId,
      payload,
    };

    connection.sendUTF(JSON.stringify(message));
  }

  private sendSubscriptionSuccess(connection: Connection, subId: string): void {
    let message = {
      type: SUBSCRIPTION_SUCCESS,
      id: subId,
    };

    connection.sendUTF(JSON.stringify(message));
  }

}
export default Server;
