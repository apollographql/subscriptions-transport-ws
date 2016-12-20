import * as WebSocket from 'ws';

import {
  SUBSCRIPTION_FAIL,
  SUBSCRIPTION_DATA,
  SUBSCRIPTION_START,
  SUBSCRIPTION_END,
  SUBSCRIPTION_SUCCESS,
  SUBSCRIPTION_KEEPALIVE, INIT, INIT_FAIL, INIT_SUCCESS,
} from './messageTypes';
import {GRAPHQL_SUBSCRIPTIONS} from './protocols';

import {SubscriptionManager} from 'graphql-subscriptions';
import {SubscriptionOptions} from 'graphql-subscriptions/dist/pubsub';

type ConnectionSubscriptions = {[subId: string]: number};

export interface SubscribeMessage {
  payload: string;
  [key: string]: any; // any extention that will come with the message.
  query?: string;
  variables?: {[key: string]: any};
  operationName?: string;
  id: string;
  type: string;
}

export interface ServerOptions {
  subscriptionManager: SubscriptionManager;
  onSubscribe?: Function;
  onUnsubscribe?: Function;
  onConnect?: Function;
  onDisconnect?: Function;
  keepAlive?: number;
  // contextValue?: any;
  // rootValue?: any;
  // formatResponse?: (Object) => Object;
  // validationRules?: Array<any>;
  // triggerGenerator?: (name: string, args: Object, context?: Object) => Array<{name: string, filter: Function}>;
}

class Server {
  private onSubscribe: Function;
  private onUnsubscribe: Function;
  private onConnect: Function;
  private onDisconnect: Function;
  private wsServer: WebSocket.Server;
  private initResult: any;
  private subscriptionManager: SubscriptionManager;

  constructor(options: ServerOptions, socketOptions: WebSocket.IServerOptions) {
    const {subscriptionManager, onSubscribe, onUnsubscribe, onConnect, onDisconnect, keepAlive} = options;

    if (!subscriptionManager) {
      throw new Error('Must provide `subscriptionManager` to websocket server constructor.');
    }

    this.subscriptionManager = subscriptionManager;
    this.onSubscribe = onSubscribe;
    this.onUnsubscribe = onUnsubscribe;
    this.onConnect = onConnect;
    this.onDisconnect = onDisconnect;

    // init and connect websocket server to http
    this.wsServer = new WebSocket.Server(socketOptions || {});

    this.wsServer.on('connection', (request: WebSocket) => {
      request.pause();
      if (request.protocol === undefined || request.protocol.indexOf(GRAPHQL_SUBSCRIPTIONS) === -1) {
        request.close(1002);
        request.terminate();

        return;
      }

      // accept connection
      request.resume();

      // Regular keep alive messages if keepAlive is set
      if (keepAlive) {
        const keepAliveTimer = setInterval(() => {
          if (request.readyState === WebSocket.OPEN) {
            this.sendKeepAlive(request);
          } else {
            clearInterval(keepAliveTimer);
          }
        }, keepAlive);
      }

      const connectionSubscriptions: ConnectionSubscriptions = {};
      request.on('message', this.onMessage(request, connectionSubscriptions));
      request.on('close', () => {
        this.onClose(request, connectionSubscriptions);

        if (this.onDisconnect) {
          this.onDisconnect(request);
        }
      });
    });
  }

  private unsubscribe(connection: WebSocket, handleId: number) {
    this.subscriptionManager.unsubscribe(handleId);

    if (this.onUnsubscribe) {
      this.onUnsubscribe();
    }
  }

  // TODO test that this actually works
  private onClose(connection: WebSocket, connectionSubscriptions: ConnectionSubscriptions) {
    return () => {
      Object.keys(connectionSubscriptions).forEach((subId) => {
        this.unsubscribe(connection, connectionSubscriptions[subId]);
        delete connectionSubscriptions[subId];
      });
    };
  }

  private onMessage(connection: WebSocket, connectionSubscriptions: ConnectionSubscriptions) {
    return (message: any) => {
      let parsedMessage: SubscribeMessage;
      try {
        parsedMessage = JSON.parse(message);
      } catch (e) {
        this.sendSubscriptionFail(connection, null, {errors: [{message: e.message}]});
        return;
      }

      const subId = parsedMessage.id;
      switch (parsedMessage.type) {
        case INIT:
          let onConnectPromise = Promise.resolve(true);
          if (this.onConnect) {
            onConnectPromise = Promise.resolve(this.onConnect(parsedMessage.payload, connection));
          }

          onConnectPromise.then((result) => {
            if (result === false) {
              throw new Error('Prohibited connection!');
            }

            this.initResult = result;

            return {
              type: INIT_SUCCESS,
            };
          }).catch((error: Error) => {
            return {
              type: INIT_FAIL,
              error: error.message,
            };
          }).then((resultMessage: any) => {
            this.sendInitResult(connection, resultMessage);
          });

          break;

        case SUBSCRIPTION_START:
          const baseParams: SubscriptionOptions = {
            query: parsedMessage.query,
            variables: parsedMessage.variables,
            operationName: parsedMessage.operationName,
            context: Object.assign({}, this.initResult),
            formatResponse: undefined,
            formatError: undefined,
            callback: undefined,
          };
          let promisedParams = Promise.resolve(baseParams);

          if (this.onSubscribe) {
            promisedParams = Promise.resolve(this.onSubscribe(parsedMessage, baseParams, connection));
          }

          // if we already have a subscription with this id, unsubscribe from it first
          // TODO: test that this actually works
          if (connectionSubscriptions[subId]) {
            this.unsubscribe(connection, connectionSubscriptions[subId]);
            delete connectionSubscriptions[subId];
          }


          promisedParams.then(params => {
            if (typeof params !== 'object') {
              const error = `Invalid params returned from onSubscribe! return values must be an object!`;
              this.sendSubscriptionFail(connection, subId, {
                errors: [{
                  message: error,
                }],
              });

              throw new Error(error);
            }

            console.log(params.context);

            // create a callback
            // error could be a runtime exception or an object with errors
            // result is a GraphQL ExecutionResult, which has an optional errors property
            params.callback = (error: any, result: any) => {
              if (!error) {
                this.sendSubscriptionData(connection, subId, result);
              } else if (error.errors) {
                this.sendSubscriptionData(connection, subId, {errors: error.errors});
              } else {
                this.sendSubscriptionData(connection, subId, {errors: [{message: error.message}]});
              }
            };

            return this.subscriptionManager.subscribe(params);
          }).then((graphqlSubId: number) => {
            connectionSubscriptions[subId] = graphqlSubId;
            this.sendSubscriptionSuccess(connection, subId);
          }).catch(e => {
            if (e.errors) {
              this.sendSubscriptionFail(connection, subId, {errors: e.errors});
            } else {
              this.sendSubscriptionFail(connection, subId, {errors: [{message: e.message}]});
            }
            return;
          });
          break;

        case SUBSCRIPTION_END:
          // find subscription id. Call unsubscribe.
          // TODO untested. catch errors, etc.
          if (typeof connectionSubscriptions[subId] !== 'undefined') {
            this.unsubscribe(connection, connectionSubscriptions[subId]);
            delete connectionSubscriptions[subId];
          }
          break;

        default:
          this.sendSubscriptionFail(connection, subId, {
            errors: [{
              message: 'Invalid message type!.',
            }],
          });
      }
    };
  }

  private sendSubscriptionData(connection: WebSocket, subId: string, payload: any): void {
    let message = {
      type: SUBSCRIPTION_DATA,
      id: subId,
      payload,
    };

    connection.send(JSON.stringify(message));
  }

  private sendSubscriptionFail(connection: WebSocket, subId: string, payload: any): void {
    let message = {
      type: SUBSCRIPTION_FAIL,
      id: subId,
      payload,
    };

    connection.send(JSON.stringify(message));
  }

  private sendSubscriptionSuccess(connection: WebSocket, subId: string): void {
    let message = {
      type: SUBSCRIPTION_SUCCESS,
      id: subId,
    };

    connection.send(JSON.stringify(message));
  }

  private sendInitResult(connection: WebSocket, result: any): void {
    connection.send(JSON.stringify(result), () => {
      if (result.type === INIT_FAIL) {
        connection.close();
        connection.terminate();
      }
    });
  }

  private sendKeepAlive(connection: WebSocket): void {
    let message = {
      type: SUBSCRIPTION_KEEPALIVE,
    };

    connection.send(JSON.stringify(message));
  }
}

export default Server;
