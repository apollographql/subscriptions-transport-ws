// chai style expect().to.be.true violates no-unused-expression
/* tslint:disable:no-unused-expression */

import 'mocha';
import {
  assert,
  expect,
} from 'chai';
import * as sinon from 'sinon';
import * as WebSocket from 'ws';
import { specifiedRules, execute, subscribe } from 'graphql';

Object.assign(global, {
  WebSocket: WebSocket,
});

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

import {
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
} from 'graphql';

import { PubSub, withFilter } from 'graphql-subscriptions';

import MessageTypes  from '../message-types';

import {
  GRAPHQL_SUBSCRIPTIONS,
} from '../protocol';

import { createServer, IncomingMessage, ServerResponse, Server } from 'http';
import { SubscriptionServer, ExecutionParams } from '../server';
import { SubscriptionClient } from '../client';
import { OperationMessage } from '../server';
import { $$asyncIterator } from 'iterall';

const TEST_PORT = 4953;
const KEEP_ALIVE_TEST_PORT = TEST_PORT + 1;
const DELAYED_TEST_PORT = TEST_PORT + 2;
const EVENTS_TEST_PORT = TEST_PORT + 5;
const ONCONNECT_ERROR_TEST_PORT = TEST_PORT + 6;
const ERROR_TEST_PORT = TEST_PORT + 7;

const SERVER_EXECUTOR_TESTS_PORT = ERROR_TEST_PORT + 8;

const data: { [key: string]: { [key: string]: string } } = {
  '1': {
    'id': '1',
    'name': 'Dan',
  },
  '2': {
    'id': '2',
    'name': 'Marie',
  },
  '3': {
    'id': '3',
    'name': 'Jessie',
  },
};

const userType = new GraphQLObjectType({
  name: 'User',
  fields: {
    id: { type: GraphQLString },
    name: { type: GraphQLString },
  },
});

const testPubsub = new PubSub();
const schema = new GraphQLSchema({
  query: new GraphQLObjectType({
    name: 'Query',
    fields: {
      testString: { type: GraphQLString, resolve: () => 'value' },
    },
  }),
  subscription: new GraphQLObjectType({
    name: 'Subscription',
    fields: {
      user: {
        type: userType,
        // `args` describes the arguments that the `user` query accepts
        args: {
          id: { type: GraphQLString },
        },
        // The resolve function describes how to 'resolve' or fulfill
        // the incoming query.
        // In this case we use the `id` argument from above as a key
        // to get the User from `data`
        resolve: (_, { id }) => {
          return data[id];
        },
        subscribe: () => {
          return testPubsub.asyncIterator('user');
        },
      },
      userFiltered: {
        type: userType,
        args: {
          id: { type: GraphQLString },
        },
        resolve: (_, { id }) => {
          return data[id];
        },
        subscribe: withFilter(() => testPubsub.asyncIterator('userFiltered'),
          (user: any, args: { [key: string]: any }) => {
            return !args['id'] || user.id === parseInt(args['id'], 10);
          }),
      },
      context: {
        type: GraphQLString,
        resolve: (root, args, ctx) => {
          return ctx;
        },
        subscribe: () => {
          return testPubsub.asyncIterator('context');
        },
      },
      error: {
        type: GraphQLString,
        resolve: () => {
          throw new Error('E1');
        },
        subscribe: () => {
          return testPubsub.asyncIterator('error');
        },
      },
    },
  }),
});

const subscriptionsPubSub = new PubSub();
const TEST_PUBLICATION = 'test_publication';
const subscriptionAsyncIteratorSpy = sinon.spy();
const resolveAsyncIteratorSpy = sinon.spy();

const subscriptionsSchema = new GraphQLSchema({
  query: new GraphQLObjectType({
    name: 'Query',
    fields: {
      testString: { type: GraphQLString, resolve: () => 'value' },
    },
  }),
  subscription: new GraphQLObjectType({
    name: 'Subscription',
    fields: {
      somethingChanged: {
        type: GraphQLString,
        resolve: payload => {
          resolveAsyncIteratorSpy();

          return payload;
        },
        subscribe: () => {
          subscriptionAsyncIteratorSpy();

          return subscriptionsPubSub.asyncIterator(TEST_PUBLICATION);
        },
      },
    },
  }),
});

// indirect call to support spying
const handlers = {
  onOperation: (msg: OperationMessage, params: ExecutionParams<any>, webSocketRequest: WebSocket) => {
    return Promise.resolve(Object.assign({}, params, { context: msg.payload.context }));
  },
};

const options = {
  schema,
  subscribe,
  execute,
  onOperation: (msg: OperationMessage | any, params: ExecutionParams<any>, webSocketRequest: WebSocket) => {
    return handlers.onOperation(msg, params, webSocketRequest);
  },
};

const eventsOptions = {
  schema,
  subscribe,
  execute,
  onOperation: sinon.spy((msg: OperationMessage, params: ExecutionParams<any>, webSocketRequest: WebSocket) => {
    return Promise.resolve(Object.assign({}, params, { context: msg.payload.context }));
  }),
  onOperationComplete: sinon.spy(),
  onConnect: sinon.spy(() => {
    return { test: 'test context' };
  }),
  onDisconnect: sinon.spy(),
};

const onConnectErrorOptions = {
  schema,
  subscribe,
  execute,
  isLegacy: true,
  onConnect: (msg: any, connection: any, connectionContext: any) => {
    connectionContext.isLegacy = onConnectErrorOptions.isLegacy;
    throw new Error('Error');
  },
};

function notFoundRequestListener(request: IncomingMessage, response: ServerResponse) {
  response.writeHead(404);
  response.end();
}

const httpServer = createServer(notFoundRequestListener);
httpServer.listen(TEST_PORT);
new SubscriptionServer(options, { server: httpServer });

const httpServerWithKA = createServer(notFoundRequestListener);
httpServerWithKA.listen(KEEP_ALIVE_TEST_PORT);
new SubscriptionServer(Object.assign({}, options, { keepAlive: 500 }), { server: httpServerWithKA });

const httpServerWithEvents = createServer(notFoundRequestListener);
httpServerWithEvents.listen(EVENTS_TEST_PORT);
const eventsServer = new SubscriptionServer(eventsOptions, { server: httpServerWithEvents });

const httpServerWithOnConnectError = createServer(notFoundRequestListener);
httpServerWithOnConnectError.listen(ONCONNECT_ERROR_TEST_PORT);
new SubscriptionServer(onConnectErrorOptions, { server: httpServerWithOnConnectError });

const httpServerWithDelay = createServer(notFoundRequestListener);
httpServerWithDelay.listen(DELAYED_TEST_PORT);
new SubscriptionServer(Object.assign({}, options, {
  onOperation: (msg: OperationMessage, params: ExecutionParams<any>): Promise<any> => {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(Object.assign({}, params, { context: msg.payload.context }));
      }, 100);
    });
  },
}), { server: httpServerWithDelay });

describe('Client', function () {

  let httpServerRaw: Server;
  let wsServer: WebSocket.Server;
  let rawTestPort: number;

  beforeEach(() => {
    httpServerRaw = createServer(notFoundRequestListener);
    httpServerRaw.listen();
    rawTestPort = httpServerRaw.address().port;
    wsServer = new WebSocket.Server({
      server: httpServerRaw,
    });
  });

  afterEach(() => {
    if (wsServer) {
      wsServer.close();
    }
    if (httpServerRaw) {
      httpServerRaw.close();
    }
  });

  it('should send GQL_CONNECTION_INIT message when creating the connection', (done) => {
    let client: SubscriptionClient;
    wsServer.on('connection', (connection: any) => {
      connection.on('message', (message: any) => {
        const parsedMessage = JSON.parse(message);
        expect(parsedMessage.type).to.equals(MessageTypes.GQL_CONNECTION_INIT);
        client.close();
        done();
      });
    });

    client = new SubscriptionClient(`ws://localhost:${rawTestPort}/`);
  });

  it('should subscribe once after reconnect', (done) => {
    let isClientReconnected = false;
    let subscriptionsCount = 0;

    wsServer.on('headers', () => {
      if (!isClientReconnected) {
        isClientReconnected = true;
        const stop = Date.now() + 1100;
        while (Date.now() < stop) {
          // busy wait
        }
      }
    });

    wsServer.on('connection', (connection: any) => {
      connection.on('message', (message: any) => {
        const parsedMessage = JSON.parse(message);

        if (parsedMessage.type === MessageTypes.GQL_CONNECTION_INIT) {
          connection.send(JSON.stringify({ type: MessageTypes.GQL_CONNECTION_ACK, payload: {} }));
        } else if (parsedMessage.type === MessageTypes.GQL_START) {
          subscriptionsCount++;
        }
      });
    });

    const client = new SubscriptionClient(`ws://localhost:${rawTestPort}/`, {
      reconnect: true,
      reconnectionAttempts: 1,
    });

    client.request({
      query: `subscription useInfo {
        user(id: 3) {
          id
          name
        }
      }`,
    }).subscribe({});

    setTimeout(() => {
      expect(subscriptionsCount).to.be.equal(1);
      client.close();
      done();
    }, 1500);
  });

  it('should send GQL_CONNECTION_INIT message first, then the GQL_START message', (done) => {
    let initReceived = false;

    let sub: any;
    const client = new SubscriptionClient(`ws://localhost:${rawTestPort}/`);
    wsServer.on('connection', (connection: any) => {
      connection.on('message', (message: any) => {
        const parsedMessage = JSON.parse(message);
        // mock server
        if (parsedMessage.type === MessageTypes.GQL_CONNECTION_INIT) {
          connection.send(JSON.stringify({ type: MessageTypes.GQL_CONNECTION_ACK, payload: {} }));
          initReceived = true;
        }
        if (parsedMessage.type === MessageTypes.GQL_START) {
          expect(initReceived).to.be.true;
          if ( sub ) {
            sub.unsubscribe();
            done();
          } else {
            done(new Error('did not get subscription'));
          }
          client.close();
        }
      });
    });

    sub = client.request({
      query: `subscription useInfo {
        user(id: 3) {
          id
          name
        }
      }`,
    }).subscribe({});
  });

  it('should emit connect event for client side when socket is open', (done) => {
    const client = new SubscriptionClient(`ws://localhost:${TEST_PORT}/`);

    const unregister = client.onConnected(() => {
      unregister();
      client.close();
      done();
    });
  });

  it('should emit disconnect event for client side when socket closed', (done) => {
    const client = new SubscriptionClient(`ws://localhost:${TEST_PORT}/`, {
      connectionCallback: () => {
        client.client.close();
      },
    });

    const unregister = client.onDisconnected(() => {
      unregister();
      client.close();
      done();
    });
  });

  it('should emit reconnect event for client side when socket closed', (done) => {
    const client = new SubscriptionClient(`ws://localhost:${TEST_PORT}/`, {
      reconnect: true,
      reconnectionAttempts: 1,
      connectionCallback: () => {
        client.client.close();
      },
    });

    const unregister = client.onReconnected(() => {
      unregister();
      done();
    });
  });

  it('should emit connected event for client side when socket closed', (done) => {
    const client = new SubscriptionClient(`ws://localhost:${TEST_PORT}/`);
    const onConnectingSpy = sinon.spy();
    const unregisterOnConnecting = client.onConnecting(onConnectingSpy);

    const unregister = client.onConnected(() => {
      unregisterOnConnecting();
      unregister();
      expect(onConnectingSpy.called).to.equal(true);
      client.close();
      done();
    });
  });

  it('should emit connecting event for client side when socket closed', (done) => {
    const subscriptionsClient = new SubscriptionClient(`ws://localhost:${TEST_PORT}/`);
    const onConnectedSpy = sinon.spy();
    const unregisterOnConnected = subscriptionsClient.onConnected(onConnectedSpy);
    const unregisterOnConnecting = subscriptionsClient.onConnecting(() => {
      unregisterOnConnecting();
      unregisterOnConnected();
      expect(onConnectedSpy.called).to.equal(false);
      subscriptionsClient.close();
      done();
    });
  });

  it('should emit disconnected event for client side when socket closed', (done) => {
    const client = new SubscriptionClient(`ws://localhost:${TEST_PORT}/`, {
      connectionCallback: () => {
        client.client.close();
      },
    });

    const unregister = client.onDisconnected(() => {
      unregister();
      client.close();
      done();
    });
  });

  it('should emit reconnected event for client side when socket closed', (done) => {
    const client = new SubscriptionClient(`ws://localhost:${TEST_PORT}/`, {
      reconnect: true,
      reconnectionAttempts: 1,
      connectionCallback: () => {
        client.client.close();
      },
    });
    const onReconnectingSpy = sinon.spy();
    const unregisterOnReconnecting = client.onReconnecting(onReconnectingSpy);

    const unregister = client.onReconnected(() => {
      unregisterOnReconnecting();
      unregister();
      expect(onReconnectingSpy.called).to.equal(true);
      done();
    });
  });

  it('should emit reconnecting event for client side when socket closed', (done) => {
    const subscriptionsClient = new SubscriptionClient(`ws://localhost:${TEST_PORT}/`, {
      reconnect: true,
      reconnectionAttempts: 1,
      connectionCallback: () => {
        subscriptionsClient.client.close();
      },
    });
    const onReconnectedSpy = sinon.spy();
    const unregisterOnReconnected = subscriptionsClient.onReconnected(onReconnectedSpy);
    const unregisterOnReconnecting = subscriptionsClient.onReconnecting(() => {
      unregisterOnReconnecting();
      unregisterOnReconnected();
      expect(onReconnectedSpy.called).to.equal(false);
      subscriptionsClient.close();
      done();
    });
  });

  it('should throw an exception when query is not provided', (done) => {
    const client = new SubscriptionClient(`ws://localhost:${TEST_PORT}/`);

    client.request({
        query: undefined,
        operationName: 'useInfo',
        variables: {
          id: 3,
        },
      }).subscribe({
        next: () => assert(false),
        error: (error) => {
          client.close();
          expect(error.message).to.be.equal('Must provide a query.');
          client.close();
          done();
        },
      });
  });

  it('should throw an exception when query is not valid', (done) => {
    const client = new SubscriptionClient(`ws://localhost:${TEST_PORT}/`);

    client.request({
        query: <string>{},
        operationName: 'useInfo',
        variables: {
          id: 3,
        },
      }).subscribe({
        next: () => assert(false),
        error: () => {
          client.close();
          done();
        },
      });
  });

  it('should allow both data and errors on GQL_DATA', (done) => {
    wsServer.on('connection', (connection: any) => {
      connection.on('message', (message: any) => {
        const parsedMessage = JSON.parse(message);
        // mock server
        if (parsedMessage.type === MessageTypes.GQL_CONNECTION_INIT) {
          connection.send(JSON.stringify({ type: MessageTypes.GQL_CONNECTION_ACK, payload: {} }));
        }
        if (parsedMessage.type === MessageTypes.GQL_START) {
          const dataMessage = {
            type: MessageTypes.GQL_DATA,
            id: parsedMessage.id,
            payload: {
              data: {
                some: 'data',
              },
              errors: [{
                message: 'Test Error',
              }],
            },
          };
          connection.send(JSON.stringify(dataMessage));
        }
      });
    });

    const client = new SubscriptionClient(`ws://localhost:${rawTestPort}/`);

    client.request(
      {
        query: `subscription useInfo($id: String) {
          user(id: $id) {
            id
            name
          }
        }`,
        operationName: 'useInfo',
        variables: {
          id: 3,
        },
      }).subscribe({
        next: (result) => {
          expect(result.data).to.have.property('some');
          expect(result.errors).to.be.lengthOf(1);
          client.close();
          done();
        },
      });
  });

  it('should send connectionParams along with init message', (done) => {
    const connectionParams: any = {
      test: true,
    };
    let client: SubscriptionClient;
    wsServer.on('connection', (connection: any) => {
      connection.on('message', (message: any) => {
        const parsedMessage = JSON.parse(message);
        expect(JSON.stringify(parsedMessage.payload)).to.equal(JSON.stringify(connectionParams));
        client.close();
        done();
      });
    });

    client = new SubscriptionClient(`ws://localhost:${rawTestPort}/`, {
      connectionParams: connectionParams,
    });
  });

  it('should send connectionParams which resolves from a promise along with init message', (done) => {
    const connectionParams: any = {
      test: true,
    };
    let client: SubscriptionClient;
    wsServer.on('connection', (connection: any) => {
      connection.on('message', (message: any) => {
        const parsedMessage = JSON.parse(message);
        expect(JSON.stringify(parsedMessage.payload)).to.equal(JSON.stringify(connectionParams));
        client.close();
        done();
      });
    });

    client = new SubscriptionClient(`ws://localhost:${rawTestPort}/`, {
      connectionParams: new Promise((resolve) => {
        setTimeout(() => {
          resolve(connectionParams);
        }, 100);
      }),
    });
  });

  it('waits for connection ack on reconnect', (done) => {
    let firstConnection: WebSocket | null = null;
    let acked = false;
    let started = false;
    wsServer.on('connection', (connection: WebSocket) => {
      if (firstConnection === null) {
        firstConnection = connection;
      }
      connection.on('message', (message: any) => {
        const parsedMessage = JSON.parse(message);
        if (parsedMessage.type === MessageTypes.GQL_CONNECTION_INIT) {
          if (connection === firstConnection) {
            connection.close();
          } else {
            acked = true;
            connection.send(JSON.stringify({ type: MessageTypes.GQL_CONNECTION_ACK, payload: {} }));
          }
        } else if (!started) {
          started = true;
          expect(parsedMessage.type).to.equal(MessageTypes.GQL_START);
          expect(acked).to.be.true;
          done();
        }
      });
    });

    const client = new SubscriptionClient(`ws://localhost:${rawTestPort}/`, {
      reconnect: true,
    });

    client.request({
      query: `subscription useInfo {
        user(id: 3) {
          id
          name
        }
      }`,
    }).subscribe({});
  });

  it('waits for acks for messages queued between reconnects', (done) => {
    let connections = 0;
    wsServer.on('connection', (connection: WebSocket) => {
      connections += 1;
      const connectionId = connections;
      let acked = false;
      connection.on('message', (message: any) => {
        const parsedMessage = JSON.parse(message);
        if (parsedMessage.type === MessageTypes.GQL_CONNECTION_INIT) {
          setTimeout(() => {
            connection.send(JSON.stringify({ type: MessageTypes.GQL_CONNECTION_ACK, payload: {} }));
            acked = true;
          }, 100);
        } else if (parsedMessage.type === MessageTypes.GQL_START) {
          expect(acked).to.be.true;
          if (connectionId === 1) {
            connection.close();
          } else {
            done();
          }
        }
      });
    });

    const client = new SubscriptionClient(`ws://localhost:${rawTestPort}/`, {
      reconnect: true,
    });

    setTimeout(() => {
      client.request({
        query: `subscription useInfo {
          user(id: 3) {
            id
            name
          }
        }`,
      }).subscribe({});
    }, 50);
  });

  it('should send connectionParams as a function which returns a promise along with init message', (done) => {
    const connectionParams: any = {
      test: true,
    };
    let client: SubscriptionClient;
    wsServer.on('connection', (connection: any) => {
      connection.on('message', (message: any) => {
        const parsedMessage = JSON.parse(message);
        expect(JSON.stringify(parsedMessage.payload)).to.equal(JSON.stringify(connectionParams));
        client.close();
        done();
      });
    });

    client = new SubscriptionClient(`ws://localhost:${rawTestPort}/`, {
      connectionParams: new Promise((resolve) => {
        setTimeout(() => {
          resolve(connectionParams);
        }, 100);
      }),
    });
  });

  it('should catch errors in connectionParams which came from a promise', (done) => {
    const error = 'foo';
    let client: SubscriptionClient;

    wsServer.on('connection', (connection: any) => {
      connection.on('message', (message: any) => {
        const parsedMessage = JSON.parse(message);
        expect(parsedMessage.payload).to.equal(error);
        client.close();
        done();
      });
    });

    client = new SubscriptionClient(`ws://localhost:${rawTestPort}/`, {
      connectionParams: new Promise((_, reject) => {
        setTimeout(() => {
          reject(error);
        }, 100);
      }),
    });
  });

  it('should override OperationOptions with middleware', function (done) {
    const client3 = new SubscriptionClient(`ws://localhost:${TEST_PORT}/`);
    let asyncFunc = (next: any) => {
      setTimeout(() => {
        next();
      }, 100);
    };
    let spyApplyMiddlewareAsyncContents = sinon.spy(asyncFunc);
    let middleware = {
      applyMiddleware(opts: any, next: any) {
        spyApplyMiddlewareAsyncContents(next);
      },
    };
    let spyApplyMiddlewareFunction = sinon.spy(middleware, 'applyMiddleware');
    client3.use([ middleware ]);

    client3.request({
        query: `subscription useInfo($id: String) {
            user(id: $id) {
              id
              name
            }
          }`,
        operationName: 'useInfo',
        variables: {
          id: '3',
        },
      }).subscribe({
        next: (result: any) => {
          try {
            client3.unsubscribeAll();
            if (result.errors) {
              assert(false, 'got error during subscription creation');
            }

            if (result.data) {
              assert.equal(spyApplyMiddlewareFunction.called, true);
              assert.equal(spyApplyMiddlewareAsyncContents.called, true);
            }
            client3.close();
            done();
          } catch (e) {
            client3.close();
            done(e);
          }
        },
        error: (e) => {
          client3.close();
          done(e);
        },
      });

    setTimeout(() => {
      testPubsub.publish('user', {});
    }, 200);
  });

  it('should handle correctly GQL_CONNECTION_ERROR message', (done) => {
    wsServer.on('connection', (connection: any) => {
      connection.on('message', (message: any) => {
        connection.send(JSON.stringify({
          type: MessageTypes.GQL_CONNECTION_ERROR,
          payload: { message: 'test error' },
        }));
      });
    });

    const client = new SubscriptionClient(`ws://localhost:${rawTestPort}/`, {
      connectionCallback: (error: any) => {
        expect(error.message).to.equals('test error');
        client.close();
        done();
      },
    });
  });

  it('should handle connection_error message and handle server that closes connection', (done) => {
    let client: any = null;

    wsServer.on('connection', (connection: any) => {
      connection.on('message', (message: any) => {
        connection.send(JSON.stringify({
          type: MessageTypes.GQL_CONNECTION_ERROR,
          payload: { message: 'test error' },
        }), () => {
          connection.close();

          setTimeout(() => {
            expect(client.status).to.equals(WebSocket.CLOSED);
            client.close();
            done();
          }, 500);
        });
      });
    });

    client = new SubscriptionClient(`ws://localhost:${rawTestPort}/`);
  });

  it('should handle correctly GQL_CONNECTION_ACK message', (done) => {
    wsServer.on('connection', (connection: any) => {
      connection.on('message', (message: any) => {
        connection.send(JSON.stringify({ type: MessageTypes.GQL_CONNECTION_ACK }));
      });
    });

    const client = new SubscriptionClient(`ws://localhost:${rawTestPort}/`, {
      connectionCallback: (error: any) => {
        expect(error).to.equals(undefined);
        client.close();
        done();
      },
    });
  });

  it('removes subscription when it unsubscribes from it', function () {
    const client = new SubscriptionClient(`ws://localhost:${TEST_PORT}/`);

    return new Promise((resolve, reject) => {
      let sub = client.request({
        query: `subscription useInfo($id: String) {
          user(id: $id) {
            id
            name
          }
        }`,
        operationName: 'useInfo',
        variables: {
          id: 3,
        },
      }).subscribe({
        next: (result: any) => {
          //do nothing
          try {
            sub.unsubscribe();
            expect(Object.keys(client.operations).length).to.equals(0);
            resolve();
          } catch (e) {
            reject(e);
          }
        },
        error: (e) => reject(e),
      });

      setTimeout(() => {
        testPubsub.publish('user', {});
      }, 100);
    });
  });

  it('should call error handler when graphql result has errors', function (done) {
    const client = new SubscriptionClient(`ws://localhost:${TEST_PORT}/`);

    setTimeout(() => {
      client.request({
          query: `subscription useInfo{
          error
        }`,
          variables: {},
      }).subscribe({
        next: (result: any) => {
          if (result.errors.length) {
            client.unsubscribeAll();
            client.close();
            done();
            return;
          }

          if (result) {
            client.unsubscribeAll();
            assert(false);
          }
        },
      });
    }, 100);

    setTimeout(() => {
      testPubsub.publish('error', {});
    }, 200);
  });

  it('should call error handler when graphql query is not valid', function (done) {
    const client = new SubscriptionClient(`ws://localhost:${TEST_PORT}/`);

    setTimeout(() => {
      client.request({
          query: `subscription useInfo{
          invalid
        }`,
          variables: {},
      }).subscribe({
        next: (result: any) => {
          if (result.errors.length) {
            expect(result.errors[0].message).to.equals('Cannot query field "invalid" on type "Subscription".');
            client.close();
            done();
          } else {
            assert(false);
          }
        },
      });
    }, 100);
  });

  function testBadServer(payload: any, errorMessage: string, done: Function) {
    wsServer.on('connection', (connection: WebSocket) => {
      connection.on('message', (message: any) => {
        const parsedMessage = JSON.parse(message);
        if (parsedMessage.type === MessageTypes.GQL_CONNECTION_INIT) {
          connection.send(JSON.stringify({ type: MessageTypes.GQL_CONNECTION_ACK, payload: {} }));
        } else if (parsedMessage.type === MessageTypes.GQL_START) {
          connection.send(JSON.stringify({
            type: MessageTypes.GQL_ERROR,
            id: parsedMessage.id,
            payload,
          }));
        }
      });
    });

    const client = new SubscriptionClient(`ws://localhost:${rawTestPort}/`);
    client.request({
      query: `
        subscription useInfo{
          invalid
        }
      `,
      variables: {},
    }).subscribe({
      next: () => assert(false),
      error: (error) => {
        expect(error.message).to.equals(errorMessage);
        client.close();
        done();
      },
    });
  }

  it('should not connect until subscribe is called if lazy mode', (done) => {
    const client: SubscriptionClient = new SubscriptionClient(`ws://localhost:${rawTestPort}/`, {
      lazy: true,
    });
    expect(client.client).to.be.null;

    let sub = client.request({
        query: `subscription useInfo($id: String) {
        user(id: $id) {
          id
          name
        }
      }`,
        operationName: 'useInfo',
        variables: {
          id: 3,
        },
      }).subscribe({
        error: (e) => {
          client.close();
          done(e);
        },
      });

    let isDone = false;

    wsServer.on('connection', (connection: any) => {
      connection.on('message', () => {
        if (!isDone) {
          isDone = true;
          try {
            expect(client.client).to.not.be.null;
            sub.unsubscribe();
            client.close();
            done();
          } catch (e) {
            client.close();
            done(e);
          }
        }
      });
    });
  });

  it('should call the connectionParams function upon connection to get connectionParams if connectionParams is a function', (done) => {
    const connectionParams = sinon.spy(() => ({
      foo: 'bar',
    }));

    const client: SubscriptionClient = new SubscriptionClient(`ws://localhost:${rawTestPort}/`, {
      lazy: true,
      connectionParams,
    });

    let isDone = false
      , sub: any = null;

    wsServer.on('connection', (connection: any) => {
      connection.on('message', (message: any) => {
        if (!isDone) {
          isDone = true;
          try {
            const parsedMessage = JSON.parse(message);
            if ( sub ) {
              sub.unsubscribe();
            }
            expect(parsedMessage.payload).to.eql({
              foo: 'bar',
            });
            client.close();
            done();
          } catch (e) {
            client.close();
            done(e);
          }
        }
      });
    });

    sub = client.request({
        query: `subscription useInfo($id: String) {
        user(id: $id) {
          id
          name
        }
      }`,
        operationName: 'useInfo',
        variables: {
          id: 3,
        },
      }).subscribe({});
  });


  it('should handle missing errors', function (done) {
    const errorMessage = 'Unknown error';
    const payload = {};
    testBadServer(payload, errorMessage, done);
  });

  it('should handle errors that are not an array', function (done) {
    const errorMessage = 'Just an error';
    const payload = {
      message: errorMessage,
    };
    testBadServer(payload, errorMessage, done);
  });

  it('should reconnect to the server', function (done) {
    let connections = 0;
    let client: SubscriptionClient;
    let originalClient: any;
    wsServer.on('connection', (connection: WebSocket) => {
      connection.on('error', (error) => {
        // ignored for testing
      });
      connections += 1;
      if (connections === 1) {
        originalClient.close();
      } else {
        expect(client.client).to.not.be.equal(originalClient);
        client.close();
        done();
      }
    });
    client = new SubscriptionClient(`ws://localhost:${rawTestPort}/`, { reconnect: true });
    originalClient = client.client;
  });

  it('should resubscribe after reconnect', function (done) {
    let connections = 0;
    let sub: any;
    let client: SubscriptionClient = null;
    wsServer.on('connection', (connection: WebSocket) => {
      connections += 1;
      connection.on('message', (message: any) => {
        const parsedMessage = JSON.parse(message);
        if (parsedMessage.type === MessageTypes.GQL_CONNECTION_INIT) {
          connection.send(JSON.stringify({ type: MessageTypes.GQL_CONNECTION_ACK, payload: {} }));
        } else if (parsedMessage.type === MessageTypes.GQL_START) {
          if (connections === 1) {
            client.client.close();
          } else {
            sub.unsubscribe();
            client.close();
            done();
          }
        }
      });
    });
    client = new SubscriptionClient(`ws://localhost:${rawTestPort}/`, { reconnect: true });

    sub = client.request({
      query: `
        subscription useInfo{
          invalid
        }
      `,
      variables: {},
    }).subscribe({
      next: () => {
        assert(false);
      },
    });
  });

  it('should emit event when an websocket error occurs', function (done) {
    const client = new SubscriptionClient(`ws://localhost:${ERROR_TEST_PORT}/`);

    client.request({
      query: `subscription useInfo{
        invalid
      }`,
      variables: {},
    }).subscribe({
      next: () => {
        assert(false);
      },
    });

    client.onError((err: Error) => {
      expect(err.message).to.be.equal(`connect ECONNREFUSED 127.0.0.1:${ERROR_TEST_PORT}`);
      done();
    });
  });

  it('should stop trying to reconnect to the server', function (done) {
    wsServer.on('connection', (connection: WebSocket) => {
      connection.close();
    });
    let errorCount = 0;
    const subscriptionsClient = new SubscriptionClient(`ws://localhost:${rawTestPort}/`, {
      timeout: 500,
      reconnect: true,
      reconnectionAttempts: 2,
    });
    subscriptionsClient.onError((error) => {
      expect(error.message).to.contain('A message was not sent');
      errorCount += 1;
    });
    const connectSpy = sinon.spy(subscriptionsClient as any, 'connect');

    setTimeout(() => {
      expect(connectSpy.callCount).to.be.equal(2);
      expect(errorCount).to.be.equal(1);
      subscriptionsClient.close();
      done();
    }, 1500);
  });

  it('should stop trying to reconnect to the server if it does not receives the ack', function (done) {
    const subscriptionsClient = new SubscriptionClient(`ws://localhost:${rawTestPort}/`, {
      timeout: 500,
      reconnect: true,
      reconnectionAttempts: 2,
    });
    const connectSpy = sinon.spy(subscriptionsClient as any, 'connect');
    wsServer.on('connection', (connection: any) => {
      connection.on('message', (message: any) => {
        const parsedMessage = JSON.parse(message);
        // mock server
        if (parsedMessage.type === MessageTypes.GQL_CONNECTION_INIT) {
          connection.close();
        }
      });
    });

    setTimeout(() => {
      expect(connectSpy.callCount).to.be.equal(2);
      subscriptionsClient.close();
      done();
    }, 1500);
  });

  it('should keep trying to reconnect if receives the ack from the server', function (done) {
    const subscriptionsClient = new SubscriptionClient(`ws://localhost:${rawTestPort}/`, {
      timeout: 500,
      reconnect: true,
      reconnectionAttempts: 2,
    });
    const connectSpy = sinon.spy(subscriptionsClient as any, 'connect');
    let connections = 0;
    wsServer.on('connection', (connection: any) => {
      connection.on('message', (message: any) => {
        const parsedMessage = JSON.parse(message);
        // mock server
        if (parsedMessage.type === MessageTypes.GQL_CONNECTION_INIT) {
          ++connections;
          connection.send(JSON.stringify({ type: MessageTypes.GQL_CONNECTION_ACK, payload: {} }));
          connection.close();
        }
      });
    });

    setTimeout(() => {
      expect(connections).to.be.greaterThan(3);
      expect(connectSpy.callCount).to.be.greaterThan(2);
      wsServer.close();
      subscriptionsClient.close();
      done();
    }, 1900);
  });

  it('should take care of received keep alive', (done) => {
    let wasKAReceived = false;

    const subscriptionsClient = new SubscriptionClient(`ws://localhost:${KEEP_ALIVE_TEST_PORT}/`, { timeout: 600 });
    const originalOnMessage = subscriptionsClient.client.onmessage;
    subscriptionsClient.client.onmessage = (dataReceived: any) => {
      let receivedDataParsed = JSON.parse(dataReceived.data);
      if (receivedDataParsed.type === MessageTypes.GQL_CONNECTION_KEEP_ALIVE) {
        if (!wasKAReceived) {
          wasKAReceived = true;
          originalOnMessage(dataReceived);
        }
      }
    };

    setTimeout(() => {
      expect(wasKAReceived).to.equal(true);
      expect(subscriptionsClient.status).to.equal(WebSocket.CLOSED);
      subscriptionsClient.close();
      done();
    }, 1200);
  });

  it('should correctly clear timeout if receives ka too early', (done) => {
    let receivedKeepAlive = 0;

    const subscriptionsClient = new SubscriptionClient(`ws://localhost:${KEEP_ALIVE_TEST_PORT}/`, { timeout: 600 });
    const checkConnectionSpy = sinon.spy(subscriptionsClient as any, 'checkConnection');
    const originalOnMessage = subscriptionsClient.client.onmessage;
    subscriptionsClient.client.onmessage = (dataReceived: any) => {
      let receivedDataParsed = JSON.parse(dataReceived.data);
      if (receivedDataParsed.type === MessageTypes.GQL_CONNECTION_KEEP_ALIVE) {
        ++receivedKeepAlive;
        originalOnMessage(dataReceived);
      }
    };

    setTimeout(() => {
      expect(checkConnectionSpy.callCount).to.be.equal(receivedKeepAlive);
      expect(subscriptionsClient.status).to.be.equal(subscriptionsClient.client.OPEN);
      subscriptionsClient.close();
      done();
    }, 1300);
  });

  it('should take care of invalid message received', (done) => {
    const subscriptionsClient = new SubscriptionClient(`ws://localhost:${rawTestPort}/`);
    const originalOnMessage = subscriptionsClient.client.onmessage;
    const dataToSend = {
      data: JSON.stringify({ type: 'invalid' }),
    };

    expect(() => {
      originalOnMessage.call(subscriptionsClient, dataToSend)();
    }).to.throw('Invalid message type!');
    subscriptionsClient.close();
    done();
  });

  it('should throw if received data is not JSON-parseable', (done) => {
    const subscriptionsClient = new SubscriptionClient(`ws://localhost:${rawTestPort}/`);
    const originalOnMessage = subscriptionsClient.client.onmessage;
    const dataToSend = {
      data: 'invalid',
    };

    expect(() => {
      originalOnMessage.call(subscriptionsClient, dataToSend)();
    }).to.throw('Message must be JSON-parseable. Got: invalid');
    subscriptionsClient.close();
    done();
  });

  it('should delete operation when receive a GQL_COMPLETE', (done) => {
    const subscriptionsClient = new SubscriptionClient(`ws://localhost:${rawTestPort}/`);
    subscriptionsClient.operations['1'] = {
      processed: true,
      started: true,
      options: {
        query: 'invalid',
      },
      handler: () => {
        // nothing
      },
    };

    const originalOnMessage = subscriptionsClient.client.onmessage;
    const dataToSend = {
      data: JSON.stringify({ id: 1, type: MessageTypes.GQL_COMPLETE }),
    };

    expect(subscriptionsClient.operations).to.have.property('1');
    originalOnMessage(dataToSend);
    expect(subscriptionsClient.operations).to.not.have.property('1');
    subscriptionsClient.close();
    done();
  });

  it('should force close the connection without tryReconnect', function (done) {
    const subscriptionsClient = new SubscriptionClient(`ws://localhost:${rawTestPort}/`, {
      reconnect: true,
      reconnectionAttempts: 1,
    });
    const tryReconnectSpy = sinon.spy(subscriptionsClient as any, 'tryReconnect');
    let receivedConnecitonTerminate = false;
    wsServer.on('connection', (connection: any) => {
      connection.on('message', (message: any) => {
        const parsedMessage = JSON.parse(message);
        // mock server
        if (parsedMessage.type === MessageTypes.GQL_CONNECTION_INIT) {
          connection.send(JSON.stringify({ type: MessageTypes.GQL_CONNECTION_ACK, payload: {} }));
        }

        if (parsedMessage.type === MessageTypes.GQL_CONNECTION_TERMINATE) {
          receivedConnecitonTerminate = true;
        }
      });
    });

    const originalOnMessage = subscriptionsClient.client.onmessage;
    subscriptionsClient.client.onmessage = (dataReceived: any) => {
      let receivedDataParsed = JSON.parse(dataReceived.data);
      if (receivedDataParsed.type === MessageTypes.GQL_CONNECTION_ACK) {
        originalOnMessage(dataReceived);
        subscriptionsClient.close();
      }
    };

    setTimeout(() => {
      expect(receivedConnecitonTerminate).to.be.equal(true);
      expect(tryReconnectSpy.callCount).to.be.equal(0);
      expect(subscriptionsClient.status).to.be.equal(WebSocket.CLOSED);
      subscriptionsClient.close();
      done();
    }, 500);
  });

  it('should close the connection without sent connection terminate and reconnect', function (done) {
    const subscriptionsClient = new SubscriptionClient(`ws://localhost:${rawTestPort}/`, {
      reconnect: true,
      reconnectionAttempts: 1,
    });
    const tryReconnectSpy = sinon.spy(subscriptionsClient as any, 'tryReconnect');
    let receivedConnecitonTerminate = false;
    wsServer.on('connection', (connection: any) => {
      connection.on('message', (message: any) => {
        const parsedMessage = JSON.parse(message);
        // mock server
        if (parsedMessage.type === MessageTypes.GQL_CONNECTION_INIT) {
          connection.send(JSON.stringify({ type: MessageTypes.GQL_CONNECTION_ACK, payload: {} }));
        }

        if (parsedMessage.type === MessageTypes.GQL_CONNECTION_TERMINATE) {
          receivedConnecitonTerminate = true;
        }
      });
    });

    const originalOnMessage = subscriptionsClient.client.onmessage;
    subscriptionsClient.client.onmessage = (dataReceived: any) => {
      let receivedDataParsed = JSON.parse(dataReceived.data);
      if (receivedDataParsed.type === MessageTypes.GQL_CONNECTION_ACK) {
        originalOnMessage(dataReceived);
        subscriptionsClient.close(false);
      }
    };

    setTimeout(() => {
      expect(tryReconnectSpy.callCount).to.be.equal(1);
      expect(subscriptionsClient.status).to.be.equal(WebSocket.OPEN);
      expect(receivedConnecitonTerminate).to.be.equal(false);
      subscriptionsClient.close();
      done();
    }, 500);
  });

  it('should close the connection after inactivityTimeout and zero active subscriptions', function (done) {
    const subscriptionsClient = new SubscriptionClient(`ws://localhost:${rawTestPort}/`, {
      inactivityTimeout: 100,
    });
    const sub = subscriptionsClient.request({
      query: `subscription useInfo($id: String) {
        user(id: $id) {
          id
          name
        }
      }`,
      operationName: 'useInfo',
      variables: {
        id: 3,
      },
    }).subscribe({});

    setTimeout(() => {
      expect(Object.keys(subscriptionsClient.operations).length).to.be.equal(1);
      sub.unsubscribe();
      setTimeout(() => {
        expect(Object.keys(subscriptionsClient.operations).length).to.be.equal(0);
        setTimeout(() => {
          expect(subscriptionsClient.status).to.be.equal(WebSocket.CLOSED);
          subscriptionsClient.close();
          done();
        }, 101);
      }, 50);
    }, 50);
  });

  it('should allow passing custom WebSocket protocols', () => {
    const testCases = ['custom-protocol', ['custom', 'protocols']];

    for (const testCase of testCases) {
      const mockWebSocket = sinon.spy();
      new SubscriptionClient(`ws://localhost:${TEST_PORT}`, {}, mockWebSocket, testCase);
      expect(mockWebSocket.calledOnce).to.be.true;
      expect(mockWebSocket.firstCall.args[1]).to.equal(testCase);
    }
  });
});

describe('Server', function () {
  let onOperationSpy: any;
  let server: Server;

  beforeEach(() => {
    onOperationSpy = sinon.spy(handlers, 'onOperation');
  });

  afterEach(() => {
    if (server) {
      server.close();
    }

    if (onOperationSpy) {
      onOperationSpy.restore();
    }

    if (eventsOptions) {
      eventsOptions.onConnect.resetHistory();
      eventsOptions.onDisconnect.resetHistory();
      eventsOptions.onOperation.resetHistory();
      eventsOptions.onOperationComplete.resetHistory();
    }
  });

  it('should throw an exception when creating a server without execute', () => {
    expect(() => {
      new SubscriptionServer({ execute: undefined }, { server: httpServer });
    }).to.throw();
  });

  it('should throw an exception when creating a server with subscribe only', () => {
    expect(() => {
      new SubscriptionServer({ subscribe: {} as any }, { server: httpServer });
    }).to.throw();
  });

  it('should throw an exception when execute is missing', () => {
    expect(() => {
      new SubscriptionServer({}, { server: httpServer });
    }).to.throw();
  });

  it('should throw an exception when schema is not provided', (done) => {
    server = createServer(notFoundRequestListener);
    server.listen(SERVER_EXECUTOR_TESTS_PORT);

    SubscriptionServer.create({
      execute,
    }, {
      server,
      path: '/',
    });

    let errorMessage: string;

    const client = new SubscriptionClient(`ws://localhost:${SERVER_EXECUTOR_TESTS_PORT}/`);
    client.onConnected(() => {
      client.request({
        query: `query { testString }`,
        variables: {},
      }).subscribe({
        next: (res) => {
          assert(false, 'expected error to be thrown');
        },
        error: (err) => {
          errorMessage = err.message;
          expect(errorMessage).to.contain('Missing schema information');
          client.close();
          done();
        },
        complete: () => {
          assert(false, 'expected error to be thrown');
        },
      });
    });
  });

  it('should use schema provided in onOperation', (done) => {
    server = createServer(notFoundRequestListener);
    server.listen(SERVER_EXECUTOR_TESTS_PORT);

    SubscriptionServer.create({
      execute,
      onOperation: () => {
        return {
          schema,
        };
      },
    }, {
      server,
      path: '/',
    });

    let msgCnt = 0;

    const client = new SubscriptionClient(`ws://localhost:${SERVER_EXECUTOR_TESTS_PORT}/`);
    client.onConnected(() => {
      client.request({
        query: `query { testString }`,
        variables: {},
      }).subscribe({
        next: (res) => {
          if ( res.errors ) {
            assert(false, 'unexpected error from request');
          }

          expect(res.data).to.deep.equal({ testString: 'value' });
          msgCnt ++;
        },
        error: (err) => {
          assert(false, 'unexpected error from request');
        },
        complete: () => {
          expect(msgCnt).to.equals(1);
          client.close();
          done();
        },
      });
    });
  });

  it('should accept execute method than returns a Promise (original execute)', (done) => {
    server = createServer(notFoundRequestListener);
    server.listen(SERVER_EXECUTOR_TESTS_PORT);
    let msgCnt = 0;

    SubscriptionServer.create({
      schema,
      execute,
    }, {
      server,
      path: '/',
    });

    const client = new SubscriptionClient(`ws://localhost:${SERVER_EXECUTOR_TESTS_PORT}/`);
    client.onConnected(() => {
      client.request({
        query: `query { testString }`,
        variables: {},
      }).subscribe({
        next: (res) => {
          if ( res.errors ) {
            assert(false, 'unexpected error from request');
          }

          expect(res.data).to.deep.equal({ testString: 'value' });
          msgCnt ++;
        },
        error: (err) => {
          assert(false, 'unexpected error from request');
        },
        complete: () => {
          expect(msgCnt).to.equals(1);
          client.close();
          done();
        },
      });
    });
  });

  it('server close should work', (done) => {
    server = createServer(notFoundRequestListener);
    server.listen(SERVER_EXECUTOR_TESTS_PORT);

    const subServer = SubscriptionServer.create({
      schema,
      execute,
    }, {
      server,
      path: '/',
    });

    const client = new SubscriptionClient(`ws://localhost:${SERVER_EXECUTOR_TESTS_PORT}/`);
    client.onDisconnected(() => {
      client.close();
      done();
    });

    client.onConnected(() => {
      client.request({
        query: `query { testString }`,
        variables: {},
      }).subscribe({
        next: (res) => {
          if (res.errors) {
            assert(false, 'unexpected error from request');
          } else {
            expect(res.data).to.deep.equal({ testString: 'value' });
          }
        },
        complete: () => subServer.close(),
      });
    });
  });

  it('should have request interface (apollo client 2.0)', (done) => {
    server = createServer(notFoundRequestListener);
    server.listen(SERVER_EXECUTOR_TESTS_PORT);

    SubscriptionServer.create({
      schema,
      execute,
    }, {
      server,
      path: '/',
    });

    const client = new SubscriptionClient(`ws://localhost:${SERVER_EXECUTOR_TESTS_PORT}/`);
    client.onConnected(() => {
      let hasValue = false;

      client.request({
        query: `query { testString }`,
        variables: {},
      }).subscribe({
        next: (res) => {
          expect(hasValue).to.equal(false);
          expect(res).to.deep.equal({ data: { testString: 'value' } });
          hasValue = true;
        },
        error: (err) => {
          client.close();
          done(new Error('unexpected error from subscribe'));
        },
        complete: () => {
          if ( false === hasValue ) {
            return done(new Error('No value recived from observable'));
          }
          client.close();
          done();
        },
      });
    });
  });

  it('should accept execute method than returns an AsyncIterator', (done) => {
    server = createServer(notFoundRequestListener);
    server.listen(SERVER_EXECUTOR_TESTS_PORT);

    const executeWithAsyncIterable = () => {
      let called = false;

      return {
        next() {
          if (called === true) {
            return this.return();
          }

          called = true;

          return Promise.resolve({ value: { data: { testString: 'value' } }, done: false });
        },
        return() {
          return Promise.resolve({ value: undefined, done: true });
        },
        throw(e: Error) {
          return Promise.reject(e);
        },
        [$$asyncIterator]() {
          return this;
        },
      };
    };

    SubscriptionServer.create({
      schema,
      execute: executeWithAsyncIterable,
    }, {
      server,
      path: '/',
    });

    const client = new SubscriptionClient(`ws://localhost:${SERVER_EXECUTOR_TESTS_PORT}/`);
    client.onConnected(() => {
      client.request({
        query: `query { testString }`,
        variables: {},
      }).subscribe({
        next: (res) => {
          if (res.errors) {
            assert(false, 'unexpected error from request');
          } else {
            expect(res.data).to.deep.equal({ testString: 'value' });
          }
          client.close();
          done();
        },
      });
    });
  });

  it('should handle socket error and close the connection on error', (done) => {
    const spy = sinon.spy();

    const httpServerForError = createServer(notFoundRequestListener);
    httpServerForError.listen(ERROR_TEST_PORT);

    let client: SubscriptionClient;
    new SubscriptionServer({
      schema,
      execute,
      onConnect: (payload: any, socket: any) => {
        setTimeout(() => {
          socket.emit('error', new Error('test'));

          setTimeout(() => {
            assert(spy.calledOnce);
            httpServerForError.close();
            client.close();
            done();
          }, 500);
        }, 100);
      },
    }, { server: httpServerForError });

    client = new SubscriptionClient(`ws://localhost:${ERROR_TEST_PORT}/`);
    client.onDisconnected(spy);
  });

  it('should trigger onConnect when client connects and validated', (done) => {
    const client = new SubscriptionClient(`ws://localhost:${EVENTS_TEST_PORT}/`);

    setTimeout(() => {
      assert(eventsOptions.onConnect.calledOnce);
      client.close();
      done();
    }, 200);
  });

  it('should trigger onConnect with the correct connectionParams', (done) => {
    const connectionParams: any = {
      test: true,
    };

    const client = new SubscriptionClient(`ws://localhost:${EVENTS_TEST_PORT}/`, {
      connectionParams: connectionParams,
    });

    setTimeout(() => {
      assert(eventsOptions.onConnect.calledOnce);
      expect(JSON.stringify(eventsOptions.onConnect.getCall(0).args[0])).to.equal(JSON.stringify(connectionParams));
      client.close();
      done();
    }, 200);
  });

  it('should trigger onConnect with the request available in ConnectionContext', (done) => {
    const client = new SubscriptionClient(`ws://localhost:${EVENTS_TEST_PORT}/`);

    setTimeout(() => {
      assert(eventsOptions.onConnect.calledOnce);
      expect(eventsOptions.onConnect.getCall(0).args[2].request).to.be.an.instanceof(IncomingMessage);
      client.close();
      done();
    }, 200);
  });

  it('should trigger onConnect and return GQL_CONNECTION_ERROR with error', (done) => {
    const connectionCallbackSpy = sinon.spy();

    onConnectErrorOptions.isLegacy = false;
    const subscriptionsClient = new SubscriptionClient(`ws://localhost:${ONCONNECT_ERROR_TEST_PORT}/`, {
      connectionCallback: connectionCallbackSpy,
    });

    setTimeout(() => {
      expect(connectionCallbackSpy.calledOnce).to.be.true;
      expect(connectionCallbackSpy.getCall(0).args[0]).to.eql({ message: 'Error' });
      subscriptionsClient.close();
      done();
    }, 200);
  });

  it('should trigger onConnect and return INIT_FAIL with error', (done) => {
    const connectionCallbackSpy = sinon.spy();

    onConnectErrorOptions.isLegacy = true;
    const subscriptionsClient = new SubscriptionClient(`ws://localhost:${ONCONNECT_ERROR_TEST_PORT}/`, {
      connectionCallback: connectionCallbackSpy,
    });

    const originalOnMessage = subscriptionsClient.client.onmessage;
    subscriptionsClient.client.onmessage = (dataReceived: any) => {
      let messageData = JSON.parse(dataReceived.data);
      // Reformat message to avoid unknown message type
      if (messageData.type === MessageTypes.INIT_FAIL) {
        messageData.type = MessageTypes.GQL_CONNECTION_ERROR;
      }
      dataReceived.data = JSON.stringify(messageData);
      originalOnMessage(dataReceived);
    };

    setTimeout(() => {
      expect(connectionCallbackSpy.calledOnce).to.be.true;
      // Old client used: connectionCallback(parsedMessage.payload.error)
      // But new client uses: connectionCallback(parsedMessage.payload)
      // So check complete payload
      expect(connectionCallbackSpy.getCall(0).args[0]).to.eql({ error: 'Error' });
      subscriptionsClient.close();
      done();
    }, 200);
  });

  it('should trigger onDisconnect when client disconnects', (done) => {
    const client = new SubscriptionClient(`ws://localhost:${EVENTS_TEST_PORT}/`);
    setTimeout(() => {
      client.client.close();
    }, 100);
    setTimeout(() => {
      assert(eventsOptions.onDisconnect.calledOnce);
      client.close();
      done();
    }, 200);
  });

  it('should trigger onDisconnect with ConnectionContext as second argument', (done) => {
    const client = new SubscriptionClient(`ws://localhost:${EVENTS_TEST_PORT}/`);
    setTimeout(() => {
      client.client.close();
    }, 100);
    setTimeout(() => {
      assert(eventsOptions.onDisconnect.calledOnce);
      expect(eventsOptions.onConnect.getCall(0).args[1]).to.not.be.undefined;
      client.close();
      done();
    }, 200);
  });

  it('should call unsubscribe when client closes the connection', (done) => {
    const client = new SubscriptionClient(`ws://localhost:${EVENTS_TEST_PORT}/`);
    const spy = sinon.spy(eventsServer as any, 'unsubscribe');

    client.request({
        query: `subscription useInfo($id: String) {
        user(id: $id) {
          id
          name
        }
      }`,
        operationName: 'useInfo',
        variables: {
          id: '3',
        },
      }).subscribe({});

    setTimeout(() => {
      client.client.close();
    }, 500);

    setTimeout(() => {
      assert(spy.calledOnce);
      client.close();
      done();
    }, 1000);
  });

  it('should trigger onOperation when client subscribes', (done) => {
    const client = new SubscriptionClient(`ws://localhost:${EVENTS_TEST_PORT}/`);
    client.request({
      query: `subscription useInfo($id: String) {
          user(id: $id) {
            id
            name
          }
        }`,
      operationName: 'useInfo',
      variables: {
        id: '3',
      },
    }).subscribe({
      next: (result: any) => {
        if (result.errors) {
          assert(false);
        }
      },
    });

    setTimeout(() => {
      assert(eventsOptions.onOperation.calledOnce);
      client.close();
      done();
    }, 200);
  });

  it('should trigger onOperationComplete when client unsubscribes', (done) => {
    const client = new SubscriptionClient(`ws://localhost:${EVENTS_TEST_PORT}/`);
    const sub = client.request({
      query: `subscription useInfo($id: String) {
          user(id: $id) {
            id
            name
          }
        }`,
      operationName: 'useInfo',
      variables: {
        id: '3',
      },
    }).subscribe({
      next: (result: any) => {
        if (result.errors) {
          sub.unsubscribe();
          client.close();
          assert(false);
          done();
        }

        if (result.data) {
          sub.unsubscribe();
          setTimeout(() => {
            assert(eventsOptions.onOperationComplete.calledOnce);
            client.close();
            done();
          }, 200);
        }
      },
    });

    setTimeout(() => {
      testPubsub.publish('user', {});
    }, 100);
  });

  it('should send correct results to multiple clients with subscriptions', function (done) {
    const client = new SubscriptionClient(`ws://localhost:${TEST_PORT}/`);
    let client1 = new SubscriptionClient(`ws://localhost:${TEST_PORT}/`);

    let numResults = 0;
    setTimeout(() => {
      client.request({
        query: `subscription useInfo($id: String) {
          user(id: $id) {
            id
            name
          }
        }`,
        operationName: 'useInfo',
        variables: {
          id: '3',
        },

      }).subscribe({
        next: (result: any) => {
          if (result.errors) {
            assert(false);
          }

          if (result.data) {
            assert.property(result.data, 'user');
            assert.equal(result.data.user.id, '3');
            assert.equal(result.data.user.name, 'Jessie');
            numResults++;
          }
          // if both error and result are null, this was a SUBSCRIPTION_SUCCESS message.
        },
      });
    }, 100);

    const client11 = new SubscriptionClient(`ws://localhost:${TEST_PORT}/`);
    let numResults1 = 0;
    setTimeout(function () {
      client11.request({
        query: `subscription useInfo($id: String) {
          user(id: $id) {
            id
            name
          }
        }`,
        operationName: 'useInfo',
        variables: {
          id: '2',
        },

      }).subscribe({
        next: (result: any) => {
          if (result.errors) {
            assert(false);
          }
          if (result.data) {
            assert.property(result.data, 'user');
            assert.equal(result.data.user.id, '2');
            assert.equal(result.data.user.name, 'Marie');
            numResults1++;
          }
          // if both error and result are null, this was a SUBSCRIPTION_SUCCESS message.
        },
      });
    }, 100);

    setTimeout(() => {
      testPubsub.publish('user', {});
    }, 200);

    setTimeout(() => {
      client.unsubscribeAll();
      expect(numResults).to.equals(1);
      client1.unsubscribeAll();
      expect(numResults1).to.equals(1);
      client.close();
      done();
    }, 400);

  });

  it('should send a gql_data with errors message to client with invalid query', function (done) {
    const client1 = new SubscriptionClient(`ws://localhost:${TEST_PORT}/`);

    setTimeout(function () {
      client1.client.onmessage = (message: any) => {
        let messageData = JSON.parse(message.data);

        assert.isTrue(
          messageData.type === MessageTypes.GQL_DATA
          || messageData.type === MessageTypes.GQL_COMPLETE);

        if (messageData.type === MessageTypes.GQL_COMPLETE) {
          client1.close();
          done();
          return;
        }

        const result = messageData.payload;
        assert.isAbove(result.errors.length, 0, 'Query should\'ve failed');
      };

      client1.request({
        query: `subscription useInfo($id: String) {
          user(id: $id) {
            id
            birthday
          }
        }`,
        operationName: 'useInfo',
        variables: {
          id: '3',
        },
      }).subscribe({});
    }, 100);

  });

  it('should set up the proper filters when subscribing', function (done) {
    let numTriggers = 0;
    const client3 = new SubscriptionClient(`ws://localhost:${TEST_PORT}/`);
    const client4 = new SubscriptionClient(`ws://localhost:${TEST_PORT}/`);
    setTimeout(() => {
      client3.request({
          query: `subscription userInfoFilter1($id: String) {
            userFiltered(id: $id) {
              id
              name
            }
          }`,
          operationName: 'userInfoFilter1',
          variables: {
            id: '3',
          },
        }).subscribe({
          next: (result: any) => {
            if (result.errors) {
              assert(false);
            }

            if (result.data) {
              numTriggers += 1;
              assert.property(result.data, 'userFiltered');
              assert.equal(result.data.userFiltered.id, '3');
              assert.equal(result.data.userFiltered.name, 'Jessie');
            }
            // both null means it's a SUBSCRIPTION_SUCCESS message
          },
        });

      client4.request({
          query: `subscription userInfoFilter1($id: String) {
            userFiltered(id: $id) {
              id
              name
            }
          }`,
          operationName: 'userInfoFilter1',
          variables: {
            id: '1',
          },
        }).subscribe({
          next: (result: any) => {
            if (result.errors) {
              assert(false);
            }
            if (result.data) {
              numTriggers += 1;
              assert.property(result.data, 'userFiltered');
              assert.equal(result.data.userFiltered.id, '1');
              assert.equal(result.data.userFiltered.name, 'Dan');
            }
            // both null means SUBSCRIPTION_SUCCESS
          },
        });
    }, 100);
    setTimeout(() => {
      testPubsub.publish('userFiltered', { id: 1 });
      testPubsub.publish('userFiltered', { id: 2 });
      testPubsub.publish('userFiltered', { id: 3 });
    }, 200);
    setTimeout(() => {
      assert.equal(numTriggers, 2);
      client3.close();
      done();
    }, 300);
  });

  it('correctly sets the context in onOperation', function (done) {
    const CTX = 'testContext';
    const client3 = new SubscriptionClient(`ws://localhost:${TEST_PORT}/`);
    client3.request({
        query: `subscription context {
          context
        }`,
        variables: {},
        context: CTX,
    }).subscribe({
      next: (result: any) => {
        client3.unsubscribeAll();
        if (result.errors) {
          assert(false);
        }
        if (result.data) {
          assert.property(result.data, 'context');
          assert.equal(result.data.context, CTX);
        }
        client3.close();
        done();
      },
    });

    setTimeout(() => {
      testPubsub.publish('context', {});
    }, 100);
  });

  it('passes through webSocketRequest to onOperation', function (done) {
    const client = new SubscriptionClient(`ws://localhost:${TEST_PORT}/`);
    client.request({
      query: `
        subscription context {
          context
        }
      `,
      variables: {},
    }).subscribe({});

    setTimeout(() => {
      client.close();
      assert(onOperationSpy.calledOnce);
      expect(onOperationSpy.getCall(0).args[2]).to.not.be.undefined;
      client.close();
      done();
    }, 100);
  });

  it('does not send more subscription data after client unsubscribes', function (done) {
    const client4 = new SubscriptionClient(`ws://localhost:${TEST_PORT}/`);
    let sub: any;

    setTimeout(() => {
      sub.unsubscribe();
    }, 50);
    setTimeout(() => {
      testPubsub.publish('user', {});
    }, 100);
    setTimeout(() => {
      client4.close();
      done();
    }, 150);
    client4.client.onmessage = (message: any) => {
      if (JSON.parse(message.data).type === MessageTypes.GQL_DATA) {
        assert(false);
      }
    };
    sub = client4.request({
      query: `subscription useInfo($id: String) {
      user(id: $id) {
        id
        name
      }
    }`,
      operationName: 'useInfo',
      variables: {
        id: '3',
      },
    }).subscribe({});
  });

  it('rejects a client that does not specify a supported protocol', function (done) {
    const client = new WebSocket(`ws://localhost:${TEST_PORT}/`);

    client.on('close', (code) => {
      expect(code).to.be.eq(1002);
      done();
    });
  });

  it('rejects unparsable message', function (done) {
    const client = new WebSocket(`ws://localhost:${TEST_PORT}/`, GRAPHQL_SUBSCRIPTIONS);
    client.onmessage = (message: any) => {
      let messageData = JSON.parse(message.data);
      assert.equal(messageData.type, MessageTypes.GQL_CONNECTION_ERROR);
      assert.isDefined(messageData.payload, 'Number of errors is greater than 0.');
      client.close();
      done();
    };
    client.onopen = () => {
      client.send('HI');
    };
  });

  it('rejects nonsense message', function (done) {
    const client = new WebSocket(`ws://localhost:${TEST_PORT}/`, GRAPHQL_SUBSCRIPTIONS);
    client.onmessage = (message: any) => {
      let messageData = JSON.parse(message.data);
      assert.equal(messageData.type, MessageTypes.GQL_ERROR);
      assert.isDefined(messageData.payload, 'Number of errors is greater than 0.');
      client.close();
      done();
    };
    client.onopen = () => {
      client.send(JSON.stringify({}));
    };
  });

  it('does not crash on unsub for Object.prototype member', function (done) {
    // Use websocket because Client.unsubscribe will only take a number.
    const client = new WebSocket(`ws://localhost:${TEST_PORT}/`, GRAPHQL_SUBSCRIPTIONS);

    client.onopen = () => {
      client.send(JSON.stringify({ type: MessageTypes.GQL_STOP, id: 'toString' }));
      // Strangely we don't send any acknowledgement for unsubbing from an
      // unknown sub, so we just set a timeout and implicitly assert that
      // there's no uncaught exception within the server code.
      setTimeout(done, 10);
    };
  });

  it('sends back any type of error', function (done) {
    const client = new SubscriptionClient(`ws://localhost:${TEST_PORT}/`);
    client.request({
      query: `invalid useInfo{
          error
        }`,
      variables: {},
    }).subscribe({
      next: () => assert(false),
      error: () => {
        client.unsubscribeAll();
        client.close();
        done();
      },
    });
  });

  it('sends a keep alive signal in the socket', function (done) {
    let client = new WebSocket(`ws://localhost:${KEEP_ALIVE_TEST_PORT}/`, GRAPHQL_SUBSCRIPTIONS);
    let yieldCount = 0;
    client.onmessage = (message: any) => {
      const parsedMessage = JSON.parse(message.data);
      if (parsedMessage.type === MessageTypes.GQL_CONNECTION_KEEP_ALIVE) {
        yieldCount += 1;
        if (yieldCount > 2) {
          client.close();
          done();
        }
      }
    };
    client.onopen = () => {
      client.send(JSON.stringify({
        id: 1,
        type: MessageTypes.GQL_CONNECTION_INIT,
      }));
    };
  });

  it('sends legacy keep alive signal in the socket', function (done) {
    let client = new WebSocket(`ws://localhost:${KEEP_ALIVE_TEST_PORT}/`, GRAPHQL_SUBSCRIPTIONS);
    let yieldCount = 0;
    client.onmessage = (message: any) => {
      const parsedMessage = JSON.parse(message.data);
      if (parsedMessage.type === MessageTypes.KEEP_ALIVE) {
        yieldCount += 1;
        if (yieldCount > 2) {
          client.close();
          done();
        }
      }
    };
    client.onopen = () => {
      client.send(JSON.stringify({
        id: 1,
        type: MessageTypes.INIT,
      }));
    };
  });
});

describe('Message Types', function () {
  it('should throw an error if static class is instantiated', (done) => {
    expect(() => {
      new MessageTypes();
    }).to.throw('Static Class');
    done();
  });
});

describe('Client<->Server Flow', () => {
  let server: Server;

  afterEach(() => {
    if (server) {
      server.close();
    }
  });

  it('should reconnect after inactivityTimeout closing the connection and then resubscribing', (done) => {
    server = createServer(notFoundRequestListener);
    server.listen(SERVER_EXECUTOR_TESTS_PORT);

    SubscriptionServer.create({
      schema: subscriptionsSchema,
      execute,
      subscribe,
    }, {
      server,
      path: '/',
    });

    const client = new SubscriptionClient(`ws://localhost:${SERVER_EXECUTOR_TESTS_PORT}/`, {
      inactivityTimeout: 100,
    });
    let isFirstTime = true;

    client.onConnected(async () => {
      // Manually close the connection only in the first time, to avoid infinite loop
      if (isFirstTime) {
        isFirstTime = false;

        setTimeout(() => {
          const sub1 = client.request({
            query: `query { testString }`,
            variables: {},
          }).subscribe({});
          setTimeout(() => {
            sub1.unsubscribe();
            setTimeout(() => {
              const sub2 = client.request({
                query: `query { testString }`,
                variables: {},
              }).subscribe({
                next: (res) => {
                  expect(sub2).not.to.eq(null);
                  expect(res.errors).to.equals(undefined);
                  expect(res.data.testString).to.eq('value');
                  sub2.unsubscribe();
                  client.close();
                  done();
                },
              });
            }, 200);
          }, 50);
        }, 50);
      }
    });
  });

  it('should reconnect after manually closing the connection and then resubscribing', (done) => {
    server = createServer(notFoundRequestListener);
    server.listen(SERVER_EXECUTOR_TESTS_PORT);

    SubscriptionServer.create({
      schema: subscriptionsSchema,
      execute,
      subscribe,
    }, {
      server,
      path: '/',
    });

    const client = new SubscriptionClient(`ws://localhost:${SERVER_EXECUTOR_TESTS_PORT}/`);
    let isFirstTime = true;

    client.onConnected(async () => {
      // Manually close the connection only in the first time, to avoid infinite loop
      if (isFirstTime) {
        isFirstTime = false;

        setTimeout(() => {
          // Disconnect the client
          client.close(false);

          // Subscribe to data, without manually reconnect before
          const sub = client.request({
            query: `query { testString }`,
            variables: {},
          }).subscribe({
            next: (res) => {
              expect(sub).not.to.eq(null);
              expect(res.errors).to.equals(undefined);
              expect(res.data.testString).to.eq('value');

              sub.unsubscribe();
              client.close();
              done();
            },
          });
        }, 300);
      }
    });
  });

  it('validate requests against schema', (done) => {
    server = createServer(notFoundRequestListener);
    server.listen(SERVER_EXECUTOR_TESTS_PORT);

    SubscriptionServer.create({
      schema: subscriptionsSchema,
      execute,
      subscribe,
      validationRules: specifiedRules,
    }, {
      server,
      path: '/',
    });

    const client = new SubscriptionClient(`ws://localhost:${SERVER_EXECUTOR_TESTS_PORT}/`);
    let isFirstTime = true;

    client.onConnected(async () => {
      // Manually close the connection only in the first time, to avoid infinite loop
      if (isFirstTime) {
        isFirstTime = false;

        setTimeout(() => {
          // Disconnect the client
          client.close(false);

          // Subscribe to data, without manually reconnect before
          const sub = client.request({
            query: `query { invalid }`,
            variables: {},
          }).subscribe({
            next: (res) => {
              expect(sub).not.to.eq(null);

              expect(res.data).to.eq(undefined);
              expect(res.errors[0].message).to.eq(
                'Cannot query field "invalid" on type "Query".',
              );

              sub.unsubscribe();
              client.close();
              done();
            },
          });
        }, 300);
      }
    });
  });

  it('should close iteration over AsyncIterator when client unsubscribes', async () => {
    subscriptionAsyncIteratorSpy.resetHistory();
    resolveAsyncIteratorSpy.resetHistory();

    server = createServer(notFoundRequestListener);
    server.listen(SERVER_EXECUTOR_TESTS_PORT);

    SubscriptionServer.create({
      schema: subscriptionsSchema,
      execute,
      subscribe,
    }, {
      server,
      path: '/',
    });

    const createClientAndSubscribe = (): Promise<any> => {
      const client = new SubscriptionClient(`ws://localhost:${SERVER_EXECUTOR_TESTS_PORT}/`);
      let sub: any = null;
      const cbSpy = sinon.spy();

      client.onConnected(() => {
        sub = client.request({
          query: `subscription { somethingChanged }`,
          variables: {},
        }).subscribe({
          next: (res) => {
            cbSpy(null, res);
          },
          error: (err) => {
            cbSpy(err, null);
          },
          complete: () => {
            cbSpy(null, null);
          },
        });
      });

      return new Promise(resolve => {
        setTimeout(() => {
          resolve({
            unsubscribe: () => sub && sub.unsubscribe(),
            spy: cbSpy,
          });
        }, 300);
      });
    };

    const client1 = await createClientAndSubscribe();
    const client2 = await createClientAndSubscribe();

    // Publish data - both client should get this message
    subscriptionsPubSub.publish(TEST_PUBLICATION, { somethingChanged: 'test-payload' });
    await wait(400);
    // Each client listener should call once
    expect(client1.spy.callCount).to.eq(1);
    expect(client2.spy.callCount).to.eq(1);
    // But the async iterator subscription should call twice, one for each subscription
    expect(subscriptionAsyncIteratorSpy.callCount).to.eq(2);
    expect(resolveAsyncIteratorSpy.callCount).to.eq(2);
    // Clear spies before publishing again
    subscriptionAsyncIteratorSpy.resetHistory();
    resolveAsyncIteratorSpy.resetHistory();
    client1.spy.resetHistory();
    client2.spy.resetHistory();

    // Unsubscribe client 1
    client1.unsubscribe();
    await wait(300);

    // Now only client 2 should get the published payload
    subscriptionsPubSub.publish(TEST_PUBLICATION, { somethingChanged: 'test-payload-2' });
    await wait(400);

    expect(client1.spy.callCount).to.eq(0);
    expect(client2.spy.callCount).to.eq(1);
    // should be 1 because there is only one subscriber now (client2)
    expect(resolveAsyncIteratorSpy.callCount).to.eq(1);
    // should be 0 because subscribe called only in the beginning
    expect(subscriptionAsyncIteratorSpy.callCount).to.eq(0);
    client2.unsubscribe();
  });

  it('should close iteration over AsyncIterator when client disconnects', async () => {
    resolveAsyncIteratorSpy.resetHistory();

    server = createServer(notFoundRequestListener);
    server.listen(SERVER_EXECUTOR_TESTS_PORT);

    SubscriptionServer.create({
      schema: subscriptionsSchema,
      execute,
      subscribe,
    }, {
      server,
      path: '/',
    });

    const createClientAndSubscribe = (): Promise<any> => {
      const client = new SubscriptionClient(`ws://localhost:${SERVER_EXECUTOR_TESTS_PORT}/`);
      const cbSpy = sinon.spy();

      client.onConnected(() => {
        client.request({
          query: `subscription { somethingChanged }`,
          variables: {},
        }).subscribe({
          next: (res) => {
            cbSpy(null, res);
          },
          error: (err) => {
            cbSpy(err, null);
          },
          complete: () => {
            cbSpy(null, null);
          },
        });
      });

      return new Promise(resolve => {
        setTimeout(() => {
          resolve({
            close: () => client.close(),
            spy: cbSpy,
          });
        }, 300);
      });
    };

    const client1 = await createClientAndSubscribe();
    const client2 = await createClientAndSubscribe();

    // Publish data - both client should get this message
    subscriptionsPubSub.publish(TEST_PUBLICATION, { somethingChanged: 'test-payload' });
    await wait(400);
    // Each client listener should call once
    expect(client1.spy.callCount).to.eq(1);
    expect(client2.spy.callCount).to.eq(1);
    // But the async iterator subscription should call twice, one for each subscription
    expect(resolveAsyncIteratorSpy.callCount).to.eq(2);
    // Clear spies before publishing again
    resolveAsyncIteratorSpy.resetHistory();
    client1.spy.resetHistory();
    client2.spy.resetHistory();

    // Close client 1
    client1.close();
    await wait(300);

    // Now only client 2 should get the published payload
    subscriptionsPubSub.publish(TEST_PUBLICATION, { somethingChanged: 'test-payload-2' });
    await wait(400);

    expect(client1.spy.callCount).to.eq(0);
    expect(client2.spy.callCount).to.eq(1);
    // should be 1 because there is only one subscriber now (client2)
    expect(resolveAsyncIteratorSpy.callCount).to.eq(1);
  });

  it('should handle correctly multiple subscriptions one after each other', (done) => {
    // This tests the use case of a UI component that creates a subscription acoording to it's
    // local data, for example: subscribe to changed on a visible items in a list, and it might
    // change quickly and we want to make sure that the subscriptions flow is correct

    // Create the server
    server = createServer(notFoundRequestListener);
    server.listen(SERVER_EXECUTOR_TESTS_PORT);

    SubscriptionServer.create({
      schema,
      execute,
    }, {
      server,
      path: '/',
    });

    const firstSubscriptionSpy = sinon.spy();

    // Create the client
    const client = new SubscriptionClient(`ws://localhost:${SERVER_EXECUTOR_TESTS_PORT}/`);
    client.onConnected(() => {
      // Subscribe to a regular query
      client.request({
        query: `query { testString }`,
        variables: {},
      }).subscribe({
        next: (res) => {
          assert(res.errors === undefined, 'unexpected error from query');
          expect(res.data).to.deep.equal({ testString: 'value' });

          // Now, subscribe to graphql subscription
          const firstSub = client.request({
            query: `subscription {
              user(id: "3") {
                id
                name
              }
            }`,
          }).subscribe({
            next: (sRes) => {
              assert(sRes.errors === undefined, 'unexpected error from 1st subscription');
              assert(sRes.data, 'unexpected null from 1st subscription result');
              expect(Object.keys(client['operations']).length).to.eq(1);
              expect(sRes.data.user.id).to.eq('3');
              firstSubscriptionSpy();

              firstSub.unsubscribe();

              setTimeout(() => {
                client.request({
                  query: `subscription {
                    user(id: "1") {
                      id
                      name
                    }
                  }`,
                }).subscribe({
                  next: (s2Res) => {
                    assert(s2Res.errors === undefined, 'unexpected error from 2nd subscription');
                    assert(s2Res.data !== null, 'unexpected null from 2nd subscription result');
                    expect(s2Res.data.user.id).to.eq('1');
                    expect(Object.keys(client['operations']).length).to.eq(1);
                    expect(firstSubscriptionSpy.callCount).to.eq(1);

                    client.close();
                    done();
                  },
                });
              }, 10);
            },
          });
        },
      });
    });
  });

  it('works with custom WebSocket implementation', (done) => {
    const MockServer = require('mock-socket-with-protocol').Server;
    const MockWebSocket = require('mock-socket-with-protocol').WebSocket;

    const CUSTOM_PORT = 234235;
    const customServer = new MockServer(`ws://localhost:${CUSTOM_PORT}`);
    SubscriptionServer.create(
      {
        schema,
        execute,
        subscribe,
      },
      customServer,
    );

    const client = new SubscriptionClient(`ws://localhost:${CUSTOM_PORT}`, {},
      MockWebSocket,
    );

    let numTriggers = 0;
        client.request({
            query: `
            subscription userInfoFilter1($id: String) {
              userFiltered(id: $id) {
                id
                name
              }
            }`,
            operationName: 'userInfoFilter1',
            variables: {
                id: '3',
            },
        }).subscribe({
            next: (result: any) => {
                if (result.errors) {
                    assert(false);
                }

                if (result.data) {
                    numTriggers += 1;
                    assert.property(result.data, 'userFiltered');
                    assert.equal(result.data.userFiltered.id, '3');
                    assert.equal(result.data.userFiltered.name, 'Jessie');
                }
            },
        });

    setTimeout(() => {
      testPubsub.publish('userFiltered', {id: 1});
      testPubsub.publish('userFiltered', {id: 2});
      testPubsub.publish('userFiltered', {id: 3});
    }, 50);

    setTimeout(() => {
      expect(numTriggers).equal(1);
      client.close();
      done();
    }, 200);
  });
});
