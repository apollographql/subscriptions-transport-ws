import * as WebSocket from 'ws';

import MessageTypes from './message-types';
import { GRAPHQL_WS } from './protocol';
import { SubscriptionManager } from 'graphql-subscriptions';
import isObject = require('lodash.isobject');
import { getOperationAST, parse} from 'graphql';

type ConnectionContext = {
  initPromise?: Promise<any>,
  isLegacy: boolean,
  socket: WebSocket,
  requests: {[reqId: string]: number},
};

export interface RequestMessage {
  payload?: {
    [key: string]: any; // this will support for example any options sent in init like the auth token
    query?: string;
    variables?: {[key: string]: any};
    operationName?: string;
  };
  id?: string;
  type: string;
}

export interface ServerOptions {
  subscriptionManager: SubscriptionManager;
  /**
   * @deprecated onSubscribe is deprecated, use onRequest instead
   */
  onSubscribe?: Function;
  /**
   * @deprecated onUnsubscribe is deprecated, use onRequestComplete instead
   */
  onUnsubscribe?: Function;
  onRequest?: Function;
  onRequestComplete?: Function;
  onConnect?: Function;
  onDisconnect?: Function;
  keepAlive?: number;
  // contextValue?: any;
  // rootValue?: any;
  // formatResponse?: (Object) => Object;
  // validationRules?: Array<any>;
  // triggerGenerator?: (name: string, args: Object, context?: Object) => Array<{name: string, filter: Function}>;
}

export class GraphQLTransportWSServer {
  /**
   * @deprecated onSubscribe is deprecated, use onRequest instead
   */
  private onSubscribe: Function;
  /**
   * @deprecated onUnsubscribe is deprecated, use onRequestComplete instead
   */
  private onUnsubscribe: Function;
  private onRequest: Function;
  private onRequestComplete: Function;
  private onConnect: Function;
  private onDisconnect: Function;
  private wsServer: WebSocket.Server;
  private subscriptionManager: SubscriptionManager;

  constructor(options: ServerOptions, socketOptions: WebSocket.IServerOptions) {
    const {subscriptionManager, onSubscribe, onUnsubscribe, onRequest, onRequestComplete, onConnect, onDisconnect, keepAlive} = options;

    if (!subscriptionManager) {
      throw new Error('Must provide `subscriptionManager` to websocket server constructor.');
    }

    this.subscriptionManager = subscriptionManager;
    this.onSubscribe = this.defineDeprecateFunctionWrapper('onSubscribe function is deprecated. ' +
      'Use onRequest instead.');
    this.onUnsubscribe = this.defineDeprecateFunctionWrapper('onUnsubscribe function is deprecated. ' +
      'Use onRequestComplete instead.');
    this.onRequest = onSubscribe ? onSubscribe : onRequest;
    this.onRequestComplete = onUnsubscribe ? onUnsubscribe : onRequestComplete;
    this.onConnect = onConnect;
    this.onDisconnect = onDisconnect;

    // Init and connect websocket server to http
    this.wsServer = new WebSocket.Server(socketOptions || {});

    this.wsServer.on('connection', (socket: WebSocket) => {
      if (socket.protocol === undefined || socket.protocol.indexOf(GRAPHQL_WS) === -1) {
        // Close the connection with an error code, and
        // then terminates the actual network connection (sends FIN packet)
        // 1002: protocol error
        socket.close(1002);
        socket.terminate();

        return;
      }

      const connectionContext: ConnectionContext = Object.create(null);
      connectionContext.isLegacy = false;
      connectionContext.socket = socket;

      // Regular keep alive messages if keepAlive is set
      if (keepAlive) {
        const keepAliveTimer = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            this.sendMessage(connectionContext, undefined, MessageTypes.GQL_CONNECTION_KEEP_ALIVE, undefined);
          } else {
            clearInterval(keepAliveTimer);
          }
        }, keepAlive);
      }

      socket.on('message', this.onMessage(connectionContext));
      socket.on('close', () => {
        this.onClose(connectionContext);

        if (this.onDisconnect) {
          this.onDisconnect(socket);
        }
      });
    });
  }

  private unsubscribe(connectionContext: ConnectionContext, reqId: string) {
    if (connectionContext.requests[reqId]) {
      this.subscriptionManager.unsubscribe(connectionContext.requests[reqId]);
      delete connectionContext.requests[reqId];
    }

    if (this.onRequestComplete) {
      this.onRequestComplete(connectionContext.socket);
    }
  }

  private onClose(connectionContext: ConnectionContext) {
    Object.keys(connectionContext.requests).forEach((reqId) => {
      this.unsubscribe(connectionContext, reqId);
    });
  }

  private onMessage(connectionContext: ConnectionContext) {
    let onInitResolve: any = null, onInitReject: any = null;

    connectionContext.initPromise = new Promise((resolve, reject) => {
      onInitResolve = resolve;
      onInitReject = reject;
    });

    return (message: any) => {
      let parsedMessage: RequestMessage;
      try {
        parsedMessage = this.parseLegacyProtocolMessage(connectionContext, JSON.parse(message));
      } catch (e) {
        this.sendError(connectionContext, null, { message: e.message }, MessageTypes.GQL_CONNECTION_ERROR);
        return;
      }

      const reqId = parsedMessage.id;
      switch (parsedMessage.type) {
        case MessageTypes.GQL_CONNECTION_INIT:
          let onConnectPromise = Promise.resolve(true);
          if (this.onConnect) {
            onConnectPromise = new Promise((resolve, reject) => {
              try {
                resolve(this.onConnect(parsedMessage.payload, connectionContext));
              } catch (e) {
                reject(e);
              }
            });
          }

          onInitResolve(onConnectPromise);

          connectionContext.initPromise.then((result) => {
            if (result === false) {
              throw new Error('Prohibited connection!');
            }

            this.sendMessage(
              connectionContext,
              undefined,
              MessageTypes.GQL_CONNECTION_ACK,
              undefined,
            );
          }).catch((error: Error) => {
            this.sendError(
              connectionContext,
              reqId,
              { message: error.message },
              MessageTypes.GQL_CONNECTION_ERROR,
            );

            // Close the connection with an error code, and
            // then terminates the actual network connection (sends FIN packet)
            // 1011: an unexpected condition prevented the request from being fulfilled
            // We are using setTimeout because we want the message to be flushed before
            // disconnecting the client
            setTimeout(() => {
              connectionContext.socket.close(1011);
              connectionContext.socket.terminate();
            }, 10);

          });
          break;

        case MessageTypes.GQL_CONNECTION_TERMINATE:
          connectionContext.socket.close();
          connectionContext.socket.terminate();
          break;

        case MessageTypes.GQL_START:
          connectionContext.initPromise.then((initResult) => {
            const baseParams = {
              query: parsedMessage.payload.query,
              variables: parsedMessage.payload.variables,
              operationName: parsedMessage.payload.operationName,
              context: Object.assign({}, isObject(initResult) ? initResult : {}),
              formatResponse: <any>undefined,
              formatError: <any>undefined,
              callback: <any>undefined,
            };
            let promisedParams = Promise.resolve(baseParams);

            if (this.onRequest) {
              promisedParams = Promise.resolve(this.onRequest(parsedMessage, baseParams, connectionContext.socket));
            }

            // if we already have a subscription with this id, unsubscribe from it first
            this.unsubscribe(connectionContext, reqId);

            promisedParams.then(params => {
              if (typeof params !== 'object') {
                const error = `Invalid params returned from onRequest! return values must be an object!`;
                this.sendError(connectionContext, reqId, { message: error });

                throw new Error(error);
              }

              // NOTE: This is a temporary code to identify if the request is a real subscription or only a query/mutation.
              // As soon as subscription manager starts handling complete function from the observable calling  the
              // callback function with (null, null) this can be replaced
              const isSubscription = this.isASubscriptionRequest(params.query, params.operationName);

              // Create a callback
              // Error could be a runtime exception or an object with errors
              // Result is a GraphQL ExecutionResult, which has an optional errors property
              params.callback = (error: any, result: any) => {
                if (connectionContext.requests[reqId]) {
                  if (result) {
                    this.sendMessage(connectionContext, reqId, MessageTypes.GQL_DATA, result);
                  }

                  if (error) {
                    const errorsToSend = error.errors ?
                      { errors: error.errors } :
                      { errors: [ { message: error.message } ]};
                    this.sendMessage(connectionContext, reqId, MessageTypes.GQL_DATA, errorsToSend);
                  }
                }

                // NOTE: This is a temporary code to identify if the request is a real subscription or only a query/mutation.
                // As soon as subscription manager starts handling complete function from the observable calling  the
                // callback function with (null, null) this can be replaced
                if (!isSubscription) {
                  this.unsubscribe(connectionContext, reqId);
                  this.sendMessage(connectionContext, reqId, MessageTypes.GQL_COMPLETE, null);
                }
              };
              return this.subscriptionManager.subscribe(params);
            }).then((graphqlReqId: number) => {
              connectionContext.requests[reqId] = graphqlReqId;
            }).then(() => {
              // NOTE: This is a temporary code to support the legacy protocol.
              // As soon as the old protocol has been removed, this coode should also be removed.
              this.sendMessage(connectionContext, reqId, MessageTypes.SUBSCRIPTION_SUCCESS, undefined);
            }).catch(e => {
              if (e.errors) {
                this.sendMessage(connectionContext, reqId, MessageTypes.GQL_DATA, { errors: e.errors });
              } else {
                this.sendError(connectionContext, reqId, { message: e.message });
              }

              // Remove the request on the server side as it will be removed also in the client
              this.unsubscribe(connectionContext, reqId);
              return;
            });
          });
          break;

        case MessageTypes.GQL_END:
          connectionContext.initPromise.then(() => {
            // Find subscription id. Call unsubscribe.
            this.unsubscribe(connectionContext, reqId);
          });
          break;

        default:
          this.sendError(connectionContext, reqId, { message: 'Invalid message type!' });
      }
    };
  }

  // NOTE: The old protocol support should be removed in the future
  private parseLegacyProtocolMessage(connectionContext: ConnectionContext, message: any) {
    let messageToReturn;

    switch (message.type) {
      case MessageTypes.INIT:
        connectionContext.isLegacy = true;
        messageToReturn = { ...message, type: MessageTypes.GQL_CONNECTION_INIT };
        break;
      case MessageTypes.SUBSCRIPTION_START:
        messageToReturn = {
          id: message.id,
          type: MessageTypes.GQL_START,
          payload: {
            query: message.query,
            operationName: message.operationName,
            variables: message.variables,
          },
        };
        break;
      case MessageTypes.SUBSCRIPTION_END:
        messageToReturn = { ...message, type: MessageTypes.GQL_END };
        break;
      case MessageTypes.GQL_CONNECTION_ACK:
        if (connectionContext.isLegacy) {
          messageToReturn = {...message, type: MessageTypes.INIT_SUCCESS};
        }
        break;
      case MessageTypes.GQL_CONNECTION_ERROR:
        if (connectionContext.isLegacy) {
          messageToReturn = {...message, type: MessageTypes.INIT_FAIL};
        }
        break;
      case MessageTypes.GQL_ERROR:
        if (connectionContext.isLegacy) {
          messageToReturn = {...message, type: MessageTypes.SUBSCRIPTION_FAIL};
        }
        break;
      case MessageTypes.GQL_DATA:
        if (connectionContext.isLegacy) {
          messageToReturn = {...message, type: MessageTypes.SUBSCRIPTION_DATA};
        }
        break;
      case MessageTypes.GQL_COMPLETE:
        if (connectionContext.isLegacy) {
          messageToReturn = null;
        }
        break;
      case MessageTypes.SUBSCRIPTION_SUCCESS:
        if (!connectionContext.isLegacy) {
          messageToReturn = null;
        }
        break;
      default:
        messageToReturn = message;
        break;
    }

    return messageToReturn;
  };

  // NOTE: This is temporary and should be removed as soon as SubscriptionsManager
  // implements the complete function of the observable
  private isASubscriptionRequest(query: any, operationName: string): boolean {
    const document = parse(query);
    const operationAST = getOperationAST(document, operationName);

    return !!operationAST && operationAST.operation === 'subscription';
  }

  private sendMessage(connectionContext: ConnectionContext, reqId: string, type: string, payload: any): void {
    const parsedMessage = this.parseLegacyProtocolMessage(connectionContext, {
      type,
      id: reqId,
      payload,
    });

    if (parsedMessage) {
      connectionContext.socket.send(JSON.stringify(parsedMessage));
    }
  }

  private sendError(connectionContext: ConnectionContext, reqId: string, errorPayload: any,
                           overrideDefaultErrorType?: string): void {
    if ([
        MessageTypes.GQL_CONNECTION_ERROR,
        MessageTypes.GQL_ERROR,
      ].indexOf(overrideDefaultErrorType) === -1) {
      throw new Error('overrideDefaultErrorType should be one of the allowed error messages' +
        ' GQL_CONNECTION_ERROR or GQL_ERROR');
    }

    this.sendMessage(
      connectionContext,
      reqId,
      overrideDefaultErrorType || MessageTypes.GQL_ERROR,
      errorPayload,
    );
  }

  private defineDeprecateFunctionWrapper(deprecateMessage: string) {
    return () => {
      console.warn(deprecateMessage);
    };
  }
}
