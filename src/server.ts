import {
  server as WebSocketServer, // these are NOT the correct typings!
  connection as Connection,
  IMessage,
} from 'websocket';

import {
  SUBSCRIPTION_FAIL,
  SUBSCRIPTION_DATA,
  SUBSCRIPTION_START,
  SUBSCRIPTION_END,
  SUBSCRIPTION_SUCCESS,
} from './messageTypes';

import { SubscriptionManager } from 'graphql-subscriptions';
import { SubscriptionOptions } from 'graphql-subscriptions/dist/pubsub';
import { Server as HttpServer} from 'http';

type ConnectionSubscriptions = { [subId: string]: number };

export interface SubscribeMessage {
  [key: string]: any, // any extention that will come with the message.
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

  constructor(options: ServerOptions, httpServer: HttpServer) {
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
      const connection: Connection = request.accept('graphql-subscriptions', request.origin);

      const connectionSubscriptions: ConnectionSubscriptions = {};
      connection.on('message', this.onMessage(connection, connectionSubscriptions));
      connection.on('close', this.onClose(connection, connectionSubscriptions));
    });
  }

  // TODO test that this actually works
  private onClose(connection: Connection, connectionSubscriptions: ConnectionSubscriptions) {
    return () => {
      Object.keys(connectionSubscriptions).forEach( (subId) => {
        this.subscriptionManager.unsubscribe(connectionSubscriptions[subId]);
        delete connectionSubscriptions[subId];
      });
    }
  }

  private onMessage(connection: Connection, connectionSubscriptions: ConnectionSubscriptions) {
    return  (message: IMessage) => {
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
          const baseParams: SubscriptionOptions = {
            query: parsedMessage.query,
            variables: parsedMessage.variables,
            operationName: parsedMessage.operationName,
            context: {},
            formatResponse: undefined,
            formatError: undefined,
            callback: undefined,
          };
          let promisedParams = Promise.resolve(baseParams);

          if (this.onSubscribe){
            promisedParams = Promise.resolve(this.onSubscribe(parsedMessage, baseParams));
          }

          // if we already have a subscription with this id, unsubscribe from it first
          // TODO: test that this actually works
          if (connectionSubscriptions[subId]) {
            this.subscriptionManager.unsubscribe(connectionSubscriptions[subId]);
            delete connectionSubscriptions[subId];
          }

          promisedParams.then( params => {
            // create a callback
            params['callback'] = (errors: Error[], data: any) => {
              // TODO: we don't do anything with errors
              this.sendSubscriptionData(connection, subId, data);
            };
            return this.subscriptionManager.subscribe( params );
          }).then((graphqlSubId: number) => {
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
