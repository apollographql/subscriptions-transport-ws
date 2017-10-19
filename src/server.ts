import * as WebSocket from 'ws';

import MessageTypes from './message-types';
import { GRAPHQL_WS, GRAPHQL_SUBSCRIPTIONS } from './protocol';
import isObject = require('lodash.isobject');
import {
  parse,
  ExecutionResult,
  GraphQLSchema,
  DocumentNode,
  validate,
  ValidationContext,
  specifiedRules,
  GraphQLFieldResolver,
} from 'graphql';
import { createEmptyIterable } from './utils/empty-iterable';
import { createAsyncIterator, forAwaitEach, isAsyncIterable } from 'iterall';
import { createIterableFromPromise } from './utils/promise-to-iterable';
import { isASubscriptionOperation } from './utils/is-subscriptions';
import { parseLegacyProtocolMessage } from './legacy/parse-legacy-protocol';
import { IncomingMessage } from 'http';

export type ExecutionIterator = AsyncIterator<ExecutionResult>;

export interface ExecutionParams<TContext = any> {
  query: string | DocumentNode;
  variables: { [key: string]: any };
  operationName: string;
  context: TContext;
  formatResponse?: Function;
  formatError?: Function;
  callback?: Function;
}

export type ConnectionContext = {
  initPromise?: Promise<any>,
  isLegacy: boolean,
  socket: WebSocket,
  operations: {
    [opId: string]: ExecutionIterator,
  },
};

export interface OperationMessagePayload {
  [key: string]: any; // this will support for example any options sent in init like the auth token
  query?: string;
  variables?: { [key: string]: any };
  operationName?: string;
}

export interface OperationMessage {
  payload?: OperationMessagePayload;
  id?: string;
  type: string;
}

export type ExecuteFunction = (schema: GraphQLSchema,
                               document: DocumentNode,
                               rootValue?: any,
                               contextValue?: any,
                               variableValues?: { [key: string]: any },
                               operationName?: string,
                               fieldResolver?: GraphQLFieldResolver<any, any>) =>
                               Promise<ExecutionResult> |
                               AsyncIterator<ExecutionResult>;

export type SubscribeFunction = (schema: GraphQLSchema,
                                 document: DocumentNode,
                                 rootValue?: any,
                                 contextValue?: any,
                                 variableValues?: { [key: string]: any },
                                 operationName?: string,
                                 fieldResolver?: GraphQLFieldResolver<any, any>,
                                 subscribeFieldResolver?: GraphQLFieldResolver<any, any>) =>
                                 AsyncIterator<ExecutionResult> |
                                 Promise<AsyncIterator<ExecutionResult> | ExecutionResult>;

export interface ServerOptions {
  rootValue?: any;
  schema?: GraphQLSchema;
  execute?: ExecuteFunction;
  subscribe?: SubscribeFunction;
  validationRules?: Array<(context: ValidationContext) => any>;

  onOperation?: Function;
  onOperationComplete?: Function;
  onConnect?: Function;
  onDisconnect?: Function;
  keepAlive?: number;
}

export class SubscriptionServer {
  private onOperation: Function;
  private onOperationComplete: Function;
  private onConnect: Function;
  private onDisconnect: Function;

  private wsServer: WebSocket.Server;
  private execute: ExecuteFunction;
  private subscribe: SubscribeFunction;
  private schema: GraphQLSchema;
  private rootValue: any;
  private keepAlive: number;
  private closeHandler: () => void;
  private specifiedRules: Array<(context: ValidationContext) => any>;

  public static create(options: ServerOptions, socketOptions: WebSocket.ServerOptions) {
    return new SubscriptionServer(options, socketOptions);
  }

  constructor(options: ServerOptions, socketOptions: WebSocket.ServerOptions) {
    const {
      onOperation, onOperationComplete, onConnect, onDisconnect, keepAlive,
    } = options;

    this.specifiedRules = options.validationRules || specifiedRules;
    this.loadExecutor(options);

    this.onOperation = onOperation;
    this.onOperationComplete = onOperationComplete;
    this.onConnect = onConnect;
    this.onDisconnect = onDisconnect;
    this.keepAlive = keepAlive;

    // Init and connect websocket server to http
    this.wsServer = new WebSocket.Server(socketOptions || {});

    const connectionHandler = ((socket: WebSocket, request: IncomingMessage) => {
      // Add `upgradeReq` to the socket object to support old API, without creating a memory leak
      // See: https://github.com/websockets/ws/pull/1099
      (socket as any).upgradeReq = request;
      // NOTE: the old GRAPHQL_SUBSCRIPTIONS protocol support should be removed in the future
      if (socket.protocol === undefined ||
        (socket.protocol.indexOf(GRAPHQL_WS) === -1 && socket.protocol.indexOf(GRAPHQL_SUBSCRIPTIONS) === -1)) {
        // Close the connection with an error code, ws v2 ensures that the
        // connection is cleaned up even when the closing handshake fails.
        // 1002: protocol error
        socket.close(1002);

        return;
      }

      const connectionContext: ConnectionContext = Object.create(null);
      connectionContext.isLegacy = false;
      connectionContext.socket = socket;
      connectionContext.operations = {};

      const connectionClosedHandler = (error: any) => {
        if (error) {
          this.sendError(
            connectionContext,
            '',
            { message: error.message ? error.message : error },
            MessageTypes.GQL_CONNECTION_ERROR,
          );

          setTimeout(() => {
            // 1011 is an unexpected condition prevented the request from being fulfilled
            connectionContext.socket.close(1011);
          }, 10);
        }
        this.onClose(connectionContext);

        if (this.onDisconnect) {
          this.onDisconnect(socket);
        }
      };

      socket.on('error', connectionClosedHandler);
      socket.on('close', connectionClosedHandler);
      socket.on('message', this.onMessage(connectionContext));
    });

    this.wsServer.on('connection', connectionHandler);
    this.closeHandler = () => {
      this.wsServer.removeListener('connection', connectionHandler);
      this.wsServer.close();
    };
  }

  public get server(): WebSocket.Server {
    return this.wsServer;
  }

  public close(): void {
    this.closeHandler();
  }

  private loadExecutor(options: ServerOptions) {
    const { execute, subscribe, schema, rootValue } = options;

    if (!execute) {
      throw new Error('Must provide `execute` for websocket server constructor.');
    }

    if (!schema) {
      throw new Error('`schema` is missing');
    }

    this.schema = schema;
    this.rootValue = rootValue;
    this.execute = execute;
    this.subscribe = subscribe;
  }

  private unsubscribe(connectionContext: ConnectionContext, opId: string) {
    if (connectionContext.operations && connectionContext.operations[opId]) {
      if (connectionContext.operations[opId].return) {
        connectionContext.operations[opId].return();
      }

      delete connectionContext.operations[opId];

      if (this.onOperationComplete) {
        this.onOperationComplete(connectionContext.socket, opId);
      }
    }
  }

  private onClose(connectionContext: ConnectionContext) {
    Object.keys(connectionContext.operations).forEach((opId) => {
      this.unsubscribe(connectionContext, opId);
    });
  }

  private onMessage(connectionContext: ConnectionContext) {
    let onInitResolve: any = null, onInitReject: any = null;

    connectionContext.initPromise = new Promise((resolve, reject) => {
      onInitResolve = resolve;
      onInitReject = reject;
    });

    return (message: any) => {
      let parsedMessage: OperationMessage;
      try {
        parsedMessage = parseLegacyProtocolMessage(connectionContext, JSON.parse(message));
      } catch (e) {
        this.sendError(connectionContext, null, { message: e.message }, MessageTypes.GQL_CONNECTION_ERROR);
        return;
      }

      const opId = parsedMessage.id;
      switch (parsedMessage.type) {
        case MessageTypes.GQL_CONNECTION_INIT:
          let onConnectPromise = Promise.resolve(true);
          if (this.onConnect) {
            onConnectPromise = new Promise((resolve, reject) => {
              try {
                // TODO - this should become a function call with just 2 arguments in the future
                // when we release the breaking change api: parsedMessage.payload and connectionContext
                resolve(this.onConnect(parsedMessage.payload, connectionContext.socket, connectionContext));
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

            if (this.keepAlive) {
              this.sendKeepAlive(connectionContext);
              // Regular keep alive messages if keepAlive is set
              const keepAliveTimer = setInterval(() => {
                if (connectionContext.socket.readyState === WebSocket.OPEN) {
                  this.sendKeepAlive(connectionContext);
                } else {
                  clearInterval(keepAliveTimer);
                }
              }, this.keepAlive);
            }
          }).catch((error: Error) => {
            this.sendError(
              connectionContext,
              opId,
              { message: error.message },
              MessageTypes.GQL_CONNECTION_ERROR,
            );

            // Close the connection with an error code, ws v2 ensures that the
            // connection is cleaned up even when the closing handshake fails.
            // 1011: an unexpected condition prevented the operation from being fulfilled
            // We are using setTimeout because we want the message to be flushed before
            // disconnecting the client
            setTimeout(() => {
              connectionContext.socket.close(1011);
            }, 10);
          });
          break;

        case MessageTypes.GQL_CONNECTION_TERMINATE:
          connectionContext.socket.close();
          break;

        case MessageTypes.GQL_START:
          connectionContext.initPromise.then((initResult) => {
            // if we already have a subscription with this id, unsubscribe from it first
            if (connectionContext.operations && connectionContext.operations[opId]) {
              this.unsubscribe(connectionContext, opId);
            }

            const baseParams: ExecutionParams = {
              query: parsedMessage.payload.query,
              variables: parsedMessage.payload.variables,
              operationName: parsedMessage.payload.operationName,
              context: Object.assign(
                {},
                isObject(initResult) ? initResult : {},
              ),
              formatResponse: <any>undefined,
              formatError: <any>undefined,
              callback: <any>undefined,
            };
            let promisedParams = Promise.resolve(baseParams);

            // set an initial mock subscription to only registering opId
            connectionContext.operations[opId] = createEmptyIterable();

            if (this.onOperation) {
              let messageForCallback: any = parsedMessage;
              promisedParams = Promise.resolve(this.onOperation(messageForCallback, baseParams, connectionContext.socket));
            }

            promisedParams.then((params: any) => {
              if (typeof params !== 'object') {
                const error = `Invalid params returned from onOperation! return values must be an object!`;
                this.sendError(connectionContext, opId, { message: error });

                throw new Error(error);
              }

              const document = typeof baseParams.query !== 'string' ? baseParams.query : parse(baseParams.query);
              let executionIterable: Promise<AsyncIterator<ExecutionResult> | ExecutionResult>;
              const validationErrors: Error[] = validate(this.schema, document, this.specifiedRules);

              if ( validationErrors.length > 0 ) {
                executionIterable = Promise.resolve(createIterableFromPromise<ExecutionResult>(
                  Promise.resolve({ errors: validationErrors }),
                ));
              } else {
                let executor: SubscribeFunction | ExecuteFunction = this.execute;
                if (this.subscribe && isASubscriptionOperation(document, params.operationName)) {
                  executor = this.subscribe;
                }

                const promiseOrIterable = executor(this.schema,
                  document,
                  this.rootValue,
                  params.context,
                  params.variables,
                  params.operationName);

                if (!isAsyncIterable(promiseOrIterable) && promiseOrIterable instanceof Promise) {
                  executionIterable = promiseOrIterable;
                } else if (isAsyncIterable(promiseOrIterable)) {
                  executionIterable = Promise.resolve(promiseOrIterable as any as AsyncIterator<ExecutionResult>);
                } else {
                  // Unexpected return value from execute - log it as error and trigger an error to client side
                  console.error('Invalid `execute` return type! Only Promise or AsyncIterable are valid values!');

                  this.sendError(connectionContext, opId, {
                    message: 'GraphQL execute engine is not available',
                  });
                }
              }

              return executionIterable.then((ei) => ({
                executionIterable: isAsyncIterable(ei) ?
                  ei : createAsyncIterator([ ei ]),
                params,
              }));
            }).then(({ executionIterable, params }) => {
              forAwaitEach(
                createAsyncIterator(executionIterable) as any,
                (value: ExecutionResult) => {
                  let result = value;

                  if (params.formatResponse) {
                    try {
                      result = params.formatResponse(value, params);
                    } catch (err) {
                      console.error('Error in formatError function:', err);
                    }
                  }

                  this.sendMessage(connectionContext, opId, MessageTypes.GQL_DATA, result);
                })
                .then(() => {
                  this.sendMessage(connectionContext, opId, MessageTypes.GQL_COMPLETE, null);
                })
                .catch((e: Error) => {
                  let error = e;

                  if (params.formatError) {
                    try {
                      error = params.formatError(e, params);
                    } catch (err) {
                      console.error('Error in formatError function: ', err);
                    }
                  }

                  // plain Error object cannot be JSON stringified.
                  if (Object.keys(e).length === 0) {
                    error = { name: e.name, message: e.message };
                  }

                  this.sendError(connectionContext, opId, error);
                });

              return executionIterable;
            }).then((subscription: ExecutionIterator) => {
              connectionContext.operations[opId] = subscription;
            }).then(() => {
              // NOTE: This is a temporary code to support the legacy protocol.
              // As soon as the old protocol has been removed, this coode should also be removed.
              this.sendMessage(connectionContext, opId, MessageTypes.SUBSCRIPTION_SUCCESS, undefined);
            }).catch((e: any) => {
              if (e.errors) {
                this.sendMessage(connectionContext, opId, MessageTypes.GQL_DATA, { errors: e.errors });
              } else {
                this.sendError(connectionContext, opId, { message: e.message });
              }

              // Remove the operation on the server side as it will be removed also in the client
              this.unsubscribe(connectionContext, opId);
              return;
            });
          });
          break;

        case MessageTypes.GQL_STOP:
          connectionContext.initPromise.then(() => {
            // Find subscription id. Call unsubscribe.
            this.unsubscribe(connectionContext, opId);
          });
          break;

        default:
          this.sendError(connectionContext, opId, { message: 'Invalid message type!' });
      }
    };
  }

  private sendKeepAlive(connectionContext: ConnectionContext): void {
    if (connectionContext.isLegacy) {
      this.sendMessage(connectionContext, undefined, MessageTypes.KEEP_ALIVE, undefined);
    } else {
      this.sendMessage(connectionContext, undefined, MessageTypes.GQL_CONNECTION_KEEP_ALIVE, undefined);
    }
  }

  private sendMessage(connectionContext: ConnectionContext, opId: string, type: string, payload: any): void {
    const parsedMessage = parseLegacyProtocolMessage(connectionContext, {
      type,
      id: opId,
      payload,
    });

    if (parsedMessage && connectionContext.socket.readyState === WebSocket.OPEN) {
      connectionContext.socket.send(JSON.stringify(parsedMessage));
    }
  }

  private sendError(connectionContext: ConnectionContext, opId: string, errorPayload: any,
                    overrideDefaultErrorType?: string): void {
    const sanitizedOverrideDefaultErrorType = overrideDefaultErrorType || MessageTypes.GQL_ERROR;
    if ([
        MessageTypes.GQL_CONNECTION_ERROR,
        MessageTypes.GQL_ERROR,
      ].indexOf(sanitizedOverrideDefaultErrorType) === -1) {
      throw new Error('overrideDefaultErrorType should be one of the allowed error messages' +
        ' GQL_CONNECTION_ERROR or GQL_ERROR');
    }

    this.sendMessage(
      connectionContext,
      opId,
      sanitizedOverrideDefaultErrorType,
      errorPayload,
    );
  }
}
