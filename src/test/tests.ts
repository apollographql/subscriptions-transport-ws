// chai style expect().to.be.true violates no-unused-expression
/* tslint:disable:no-unused-expression */

// Temporary workaround for missing typings
declare module 'graphql' {
  export function subscribe(): any;
}

import 'mocha';
import {
  assert,
  expect,
} from 'chai';
import * as sinon from 'sinon';
import * as WebSocket from 'ws';
import { execute, subscribe } from 'graphql';

Object.assign(global, {
  WebSocket: WebSocket,
});

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

import {
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
} from 'graphql';

import { PubSub, SubscriptionManager, SubscriptionOptions } from 'graphql-subscriptions';

import MessageTypes  from '../message-types';

import {
  GRAPHQL_SUBSCRIPTIONS,
} from '../protocol';

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { SubscriptionServer } from '../server';
import { SubscriptionClient } from '../client';
import { addGraphQLSubscriptions } from '../helpers';
import { OperationMessagePayload } from '../server';
import { $$asyncIterator } from 'iterall';

const TEST_PORT = 4953;
const KEEP_ALIVE_TEST_PORT = TEST_PORT + 1;
const DELAYED_TEST_PORT = TEST_PORT + 2;
const RAW_TEST_PORT = TEST_PORT + 4;
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
        resolve: function (_, { id }) {
          return data[id];
        },
      },
      userFiltered: {
        type: userType,
        args: {
          id: { type: GraphQLString },
        },
        resolve: function (_, { id }) {
          return data[id];
        },
      },
      context: {
        type: GraphQLString,
        resolve: (root, args, ctx) => {
          return ctx;
        },
      },
      error: {
        type: GraphQLString, resolve: () => {
          throw new Error('E1');
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

const subscriptionManager = new SubscriptionManager({
  schema,
  pubsub: new PubSub(),
  setupFunctions: {
    'userFiltered': (options: SubscriptionOptions, args: { [key: string]: any }) => ({
      'userFiltered': {
        filter: (user: any) => {
          return !args['id'] || user.id === args['id'];
        },
      },
    }),
  },
});

// indirect call to support spying
const handlers = {
  onSubscribe: (msg: OperationMessagePayload, params: SubscriptionOptions, webSocketRequest: WebSocket) => {
    return Promise.resolve(Object.assign({}, params, { context: msg['context'] }));
  },
};

const options = {
  subscriptionManager,
  onSubscribe: (msg: OperationMessagePayload | any, params: SubscriptionOptions, webSocketRequest: WebSocket) => {
    return handlers.onSubscribe(msg, params, webSocketRequest);
  },
};

const eventsOptions = {
  subscriptionManager,
  onSubscribe: sinon.spy((msg: OperationMessagePayload
                            | any, params: SubscriptionOptions, webSocketRequest: WebSocket) => {
    return Promise.resolve(Object.assign({}, params, { context: msg['context'] }));
  }),
  onUnsubscribe: sinon.spy(),
  onConnect: sinon.spy(() => {
    return { test: 'test context' };
  }),
  onDisconnect: sinon.spy(),
};

const onConnectErrorOptions = {
  subscriptionManager,
  onConnect: (msg: any, connection: any, connectionContext: any) => {
    connectionContext.isLegacy = true;
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
new SubscriptionServer(Object.assign({}, options, { keepAlive: 10 }), { server: httpServerWithKA });

const httpServerWithEvents = createServer(notFoundRequestListener);
httpServerWithEvents.listen(EVENTS_TEST_PORT);
const eventsServer = new SubscriptionServer(eventsOptions, { server: httpServerWithEvents });

const httpServerWithOnConnectError = createServer(notFoundRequestListener);
httpServerWithOnConnectError.listen(ONCONNECT_ERROR_TEST_PORT);
new SubscriptionServer(onConnectErrorOptions, { server: httpServerWithOnConnectError });

const httpServerWithDelay = createServer(notFoundRequestListener);
httpServerWithDelay.listen(DELAYED_TEST_PORT);
new SubscriptionServer(Object.assign({}, options, {
  onSubscribe: (msg: OperationMessagePayload | any, params: SubscriptionOptions): any => {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(Object.assign({}, params, { context: msg['context'] }));
      }, 100);
    });
  },
}), { server: httpServerWithDelay });

const httpServerRaw = createServer(notFoundRequestListener);
httpServerRaw.listen(RAW_TEST_PORT);

describe('Client', function () {

  let wsServer: WebSocket.Server;

  beforeEach(() => {
    wsServer = new WebSocket.Server({
      server: httpServerRaw,
    });
  });

  afterEach(() => {
    if (wsServer) {
      wsServer.close();
    }
  });

  it('should send GQL_CONNECTION_INIT message when creating the connection', (done) => {
    wsServer.on('connection', (connection: any) => {
      connection.on('message', (message: any) => {
        const parsedMessage = JSON.parse(message);
        expect(parsedMessage.type).to.equals(MessageTypes.GQL_CONNECTION_INIT);
        done();
      });
    });

    new SubscriptionClient(`ws://localhost:${RAW_TEST_PORT}/`);
  });

  it('should send GQL_CONNECTION_INIT message first, then the GQL_START message', (done) => {
    let initReceived = false;

    const client = new SubscriptionClient(`ws://localhost:${RAW_TEST_PORT}/`);
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
          client.unsubscribeAll();
          done();
        }
      });
    });
    client.subscribe(
      {
        query: `subscription useInfo {
          user(id: 3) {
            id
            name
          }
        }`,
      },
      (error, result) => {
        // do nothing
      },
    );
  });

  it('should emit connect event for client side when socket is open', (done) => {
    const client = new SubscriptionClient(`ws://localhost:${TEST_PORT}/`);

    const unregister = client.onConnect(() => {
      unregister();
      done();
    });
  });

  it('should emit disconnect event for client side when socket closed', (done) => {
    const client = new SubscriptionClient(`ws://localhost:${TEST_PORT}/`, {
      connectionCallback: () => {
        client.client.close();
      },
    });

    const unregister = client.onDisconnect(() => {
      unregister();
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

    const unregister = client.onReconnect(() => {
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
      done();
    });
  });

  it('should throw an exception when query is not provided', (done) => {
    const client = new SubscriptionClient(`ws://localhost:${TEST_PORT}/`);

    client.subscribe({
        query: undefined,
        operationName: 'useInfo',
        variables: {
          id: 3,
        },
      }, function (error: any, result: any) {
        expect(error).to.be.lengthOf(1);
        expect(error[0].message).to.be.equal('Must provide a query.');
        done();
      },
    );
  });

  it('should throw an exception when query is not valid', (done) => {
    const client = new SubscriptionClient(`ws://localhost:${TEST_PORT}/`);

    client.subscribe({
        query: <string>{},
        operationName: 'useInfo',
        variables: {
          id: 3,
        },
      }, function (error: any, result: any) {
        //do nothing
        expect(error).to.be.lengthOf(1);
        done();
      },
    );
  });

  it('should throw an exception when handler is not provided', () => {
    const client = new SubscriptionClient(`ws://localhost:${TEST_PORT}/`);

    expect(() => {
      client.subscribe({
          query: `subscription useInfo($id: String) {
            user(id: $id) {
              id
              name
            }
          }`,
        },
        undefined,
      );
    }).to.throw();
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

    const client = new SubscriptionClient(`ws://localhost:${RAW_TEST_PORT}/`);

    client.subscribe(
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
      },
      (error, result) => {
        expect(result).to.have.property('some');
        expect(error).to.be.lengthOf(1);
        done();
      },
    );
  });

  it('should send connectionParams along with init message', (done) => {
    const connectionParams: any = {
      test: true,
    };
    wsServer.on('connection', (connection: any) => {
      connection.on('message', (message: any) => {
        const parsedMessage = JSON.parse(message);
        expect(JSON.stringify(parsedMessage.payload)).to.equal(JSON.stringify(connectionParams));
        done();
      });
    });

    new SubscriptionClient(`ws://localhost:${RAW_TEST_PORT}/`, {
      connectionParams: connectionParams,
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

    client3.subscribe({
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
      }, (error: any, result: any) => {
        client3.unsubscribeAll();
        if (error) {
          assert(false, 'got error during subscription creation');
        }
        if (result) {
          assert.equal(spyApplyMiddlewareFunction.called, true);
          assert.equal(spyApplyMiddlewareAsyncContents.called, true);
        }
        done();
      },
    );
    setTimeout(() => {
      subscriptionManager.publish('user', {});
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

    new SubscriptionClient(`ws://localhost:${RAW_TEST_PORT}/`, {
      connectionCallback: (error: any) => {
        expect(error.message).to.equals('test error');
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
            expect(client.client.readyState).to.equals(WebSocket.CLOSED);
            done();
          }, 500);
        });
      });
    });

    client = new SubscriptionClient(`ws://localhost:${RAW_TEST_PORT}/`);
  });

  it('should handle correctly GQL_CONNECTION_ACK message', (done) => {
    wsServer.on('connection', (connection: any) => {
      connection.on('message', (message: any) => {
        connection.send(JSON.stringify({ type: MessageTypes.GQL_CONNECTION_ACK }));
      });
    });

    new SubscriptionClient(`ws://localhost:${RAW_TEST_PORT}/`, {
      connectionCallback: (error: any) => {
        expect(error).to.equals(undefined);
        done();
      },
    });
  });

  it('removes subscription when it unsubscribes from it', function () {
    const client = new SubscriptionClient(`ws://localhost:${TEST_PORT}/`);

    setTimeout(() => {
      let subId = client.subscribe({
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
        }, function (error: any, result: any) {
          //do nothing
        },
      );
      client.unsubscribe(subId);
      assert.notProperty(client.operations, `${subId}`);
    }, 100);
  });

  it('queues messages while websocket is still connecting', function (done) {
    const client = new SubscriptionClient(`ws://localhost:${TEST_PORT}/`);

    let subId = client.subscribe({
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
      }, function (error: any, result: any) {
        //do nothing
      },
    );

    client.onConnect(() => {
      expect((client as any).unsentMessagesQueue.length).to.equals(1);
      client.unsubscribe(subId);

      setTimeout(() => {
        expect((client as any).unsentMessagesQueue.length).to.equals(0);
        done();
      }, 100);
    });
  });

  it('should call error handler when graphql result has errors', function (done) {
    const client = new SubscriptionClient(`ws://localhost:${TEST_PORT}/`);

    setTimeout(() => {
      client.subscribe({
          query: `subscription useInfo{
          error
        }`,
          variables: {},
        }, function (error: any, result: any) {
          if (error) {
            client.unsubscribeAll();
            done();
          }
          if (result) {
            client.unsubscribeAll();
            assert(false);
          }
        },
      );
    }, 100);
    setTimeout(() => {
      subscriptionManager.publish('error', {});
    }, 200);
  });

  it('should call error handler when graphql query is not valid', function (done) {
    const client = new SubscriptionClient(`ws://localhost:${TEST_PORT}/`);

    setTimeout(() => {
      client.subscribe({
          query: `subscription useInfo{
          invalid
        }`,
          variables: {},
        }, function (error: Error[], result: any) {
          if (error) {
            expect(error[0].message).to.equals('Cannot query field "invalid" on type "Subscription".');
            done();
          } else {
            assert(false);
          }
        },
      );
    }, 100);
  });

  function testBadServer(payload: any, errorMessage: string, done: Function) {
    wsServer.on('connection', (connection: WebSocket) => {
      connection.on('message', (message: any) => {
        const parsedMessage = JSON.parse(message);
        if (parsedMessage.type === MessageTypes.GQL_START) {
          connection.send(JSON.stringify({
            type: MessageTypes.GQL_ERROR,
            id: parsedMessage.id,
            payload,
          }));
        }
      });
    });

    const client = new SubscriptionClient(`ws://localhost:${RAW_TEST_PORT}/`);
    client.subscribe({
      query: `
        subscription useInfo{
          invalid
        }
      `,
      variables: {},
    }, function (errors: Error[], result: any) {
      if (errors) {
        expect(errors[0].message).to.equals(errorMessage);
      } else {
        assert(false);
      }
      done();
    });
  }

  it('should not connect until subscribe is called if lazy mode', (done) => {
    const client: SubscriptionClient = new SubscriptionClient(`ws://localhost:${RAW_TEST_PORT}/`, {
      lazy: true,
    });
    expect(client.client).to.be.null;

    let subId = client.subscribe({
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
      }, function (error: any, result: any) {
        //do nothing
      },
    );

    let isDone = false;

    wsServer.on('connection', (connection: any) => {
      connection.on('message', () => {
        if (!isDone) {
          isDone = true;
          try {
            expect(client.client).to.not.be.null;
            client.unsubscribe(subId);
            done();
          } catch (e) {
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

    const client: SubscriptionClient = new SubscriptionClient(`ws://localhost:${RAW_TEST_PORT}/`, {
      lazy: true,
      connectionParams,
    });

    let isDone = false
      , subId: any = null;

    wsServer.on('connection', (connection: any) => {
      connection.on('message', (message: any) => {
        if (!isDone) {
          isDone = true;
          try {
            const parsedMessage = JSON.parse(message);
            client.unsubscribe(subId);
            expect(parsedMessage.payload).to.eql({
              foo: 'bar',
            });
            done();
          } catch (e) {
            done(e);
          }
        }
      });
    });

    subId = client.subscribe({
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
      }, function (error: any, result: any) {
        //do nothing
      },
    );
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
      connections += 1;
      if (connections === 1) {
        originalClient.close();
      } else {
        expect(client.client).to.not.be.equal(originalClient);
        done();
      }
    });
    client = new SubscriptionClient(`ws://localhost:${RAW_TEST_PORT}/`, { reconnect: true });
    originalClient = client.client;
  });

  it('should resubscribe after reconnect', function (done) {
    let connections = 0;
    let client: SubscriptionClient = null;
    wsServer.on('connection', (connection: WebSocket) => {
      connections += 1;
      connection.on('message', (message: any) => {
        const parsedMessage = JSON.parse(message);
        if (parsedMessage.type === MessageTypes.GQL_START) {
          if (connections === 1) {
            client.client.close();
          } else {
            done();
          }
        }
      });
    });
    client = new SubscriptionClient(`ws://localhost:${RAW_TEST_PORT}/`, { reconnect: true });
    client.subscribe({
      query: `
        subscription useInfo{
          invalid
        }
      `,
      variables: {},
    }, function (errors: Error[], result: any) {
      assert(false);
    });
  });

  it('should throw an exception when trying to subscribe when socket is closed', function (done) {
    let client: SubscriptionClient = null;

    client = new SubscriptionClient(`ws://localhost:${TEST_PORT}/`, { reconnect: true });

    setTimeout(() => {
      client.client.close();
    }, 500);

    setTimeout(() => {
      expect(() => {
        client.subscribe({
          query: `
        subscription useInfo{
          invalid
        }
      `,
          variables: {},
        }, function (errors: Error[], result: any) {
          // nothing
        });

        done();
      }).to.throw();
    }, 1000);
  });

  it('should throw an exception when the sent message is not a valid json', function (done) {


    setTimeout(() => {
      expect(() => {
        let client: SubscriptionClient = null;

        wsServer.on('connection', (connection: any) => {
          connection.on('message', (message: any) => {
            connection.send('invalid json');
          });
        });

        client = new SubscriptionClient(`ws://localhost:${RAW_TEST_PORT}/`);
        done();
      }).to.throw();
    }, 1000);
  });

  it('should stop trying to reconnect to the server', function (done) {
    let connections = 0;
    wsServer.on('connection', (connection: WebSocket) => {
      connections += 1;
      if (connections === 1) {
        wsServer.close();
      } else {
        assert(false);
      }
    });

    const subscriptionsClient = new SubscriptionClient(`ws://localhost:${RAW_TEST_PORT}/`, {
      timeout: 100,
      reconnect: true,
      reconnectionAttempts: 1,
    });
    const connectSpy = sinon.spy(subscriptionsClient, 'connect');

    setTimeout(() => {
      expect(connectSpy.callCount).to.be.equal(2);
      done();
    }, 500);
  });

  it('should stop trying to reconnect if not receives the ack from the server', function (done) {
    const subscriptionsClient = new SubscriptionClient(`ws://localhost:${RAW_TEST_PORT}/`, {
      reconnect: true,
      reconnectionAttempts: 1,
    });
    const connectSpy = sinon.spy(subscriptionsClient, 'connect');
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
      done();
    }, 1000);
  });

  it('should keep trying to reconnect if receives the ack from the server', function (done) {
    const subscriptionsClient = new SubscriptionClient(`ws://localhost:${RAW_TEST_PORT}/`, {
      reconnect: true,
      reconnectionAttempts: 1,
    });
    const connectSpy = sinon.spy(subscriptionsClient, 'connect');
    wsServer.on('connection', (connection: any) => {
      connection.on('message', (message: any) => {
        const parsedMessage = JSON.parse(message);
        // mock server
        if (parsedMessage.type === MessageTypes.GQL_CONNECTION_INIT) {
          connection.send(JSON.stringify({ type: MessageTypes.GQL_CONNECTION_ACK, payload: {} }));
          connection.close();
        }
      });
    });

    setTimeout(() => {
      expect(connectSpy.callCount).to.be.greaterThan(2);
      done();
    }, 1000);
  });

  it('should take care of received keep alive', (done) => {
    let wasKAReceived = false;

    const subscriptionsClient = new SubscriptionClient(`ws://localhost:${KEEP_ALIVE_TEST_PORT}/`, { timeout: 5 });
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
      done();
    }, 100);
  });

  it('should correctly clear timeout if receives ka too early', (done) => {
    const subscriptionsClient = new SubscriptionClient(`ws://localhost:${KEEP_ALIVE_TEST_PORT}/`, { timeout: 25 });
    const checkConnectionSpy = sinon.spy(subscriptionsClient, 'checkConnection');

    setTimeout(() => {
      expect(checkConnectionSpy.callCount).to.be.equal(1);
      expect(subscriptionsClient.status).to.be.equal(subscriptionsClient.client.OPEN);
      done();
    }, 100);
  });

  it('should take care of invalid message received', (done) => {
    const subscriptionsClient = new SubscriptionClient(`ws://localhost:${RAW_TEST_PORT}/`);
    const originalOnMessage = subscriptionsClient.client.onmessage;
    const dataToSend = {
      data: JSON.stringify({ type: 'invalid' }),
    };

    expect(() => {
      originalOnMessage.call(subscriptionsClient, dataToSend)();
    }).to.throw('Invalid message type!');
    done();
  });

  it('should throw if received data is not JSON-parseable', (done) => {
    const subscriptionsClient = new SubscriptionClient(`ws://localhost:${RAW_TEST_PORT}/`);
    const originalOnMessage = subscriptionsClient.client.onmessage;
    const dataToSend = {
      data: 'invalid',
    };

    expect(() => {
      originalOnMessage.call(subscriptionsClient, dataToSend)();
    }).to.throw('Message must be JSON-parseable. Got: invalid');
    done();
  });

  it('should delete operation when receive a GQL_COMPLETE', (done) => {
    const subscriptionsClient = new SubscriptionClient(`ws://localhost:${RAW_TEST_PORT}/`);
    subscriptionsClient.operations['1'] = {
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
    done();
  });

  it('should call executeOperation when query is called', (done) => {
    const client = new SubscriptionClient(`ws://localhost:${TEST_PORT}/`);
    const executeOperationSpy = sinon.spy(client, 'executeOperation');

    client.query({
      query: `query useInfo($id: String) {
          user(id: $id) {
            id
            name
          }
        }`,
      operationName: 'useInfo',
      variables: {
        id: 3,
      },
    }).then(
      (result: any) => {
        // do nothing
      },
      (error: any) => {
        // do nothing
      },
    );

    setTimeout(() => {
      assert(executeOperationSpy.calledOnce);
      done();
    }, 200);
  });

  it('should force close the connection without tryReconnect', function (done) {
    const subscriptionsClient = new SubscriptionClient(`ws://localhost:${RAW_TEST_PORT}/`, {
      reconnect: true,
      reconnectionAttempts: 1,
    });
    const tryReconnectSpy = sinon.spy(subscriptionsClient, 'tryReconnect');
    wsServer.on('connection', (connection: any) => {
      connection.on('message', (message: any) => {
        const parsedMessage = JSON.parse(message);
        // mock server
        if (parsedMessage.type === MessageTypes.GQL_CONNECTION_INIT) {
          connection.send(JSON.stringify({ type: MessageTypes.GQL_CONNECTION_ACK, payload: {} }));
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
      expect(tryReconnectSpy.callCount).to.be.equal(0);
      expect(subscriptionsClient.status).to.be.equal(WebSocket.CLOSED);
      done();
    }, 500);
  });
});

describe('Server', function () {
  let onSubscribeSpy: any;

  beforeEach(() => {
    onSubscribeSpy = sinon.spy(handlers, 'onSubscribe');
  });

  afterEach(() => {
    if (onSubscribeSpy) {
      onSubscribeSpy.restore();
    }

    if (eventsOptions) {
      eventsOptions.onConnect.reset();
      eventsOptions.onDisconnect.reset();
      eventsOptions.onSubscribe.reset();
      eventsOptions.onUnsubscribe.reset();
    }
  });

  it('should throw an exception when creating a server without subscriptionManager', () => {
    expect(() => {
      new SubscriptionServer({ subscriptionManager: undefined }, { server: httpServer });
    }).to.throw();
  });

  it('should throw an exception when creating a server with both subscriptionManager and execute', () => {
    expect(() => {
      new SubscriptionServer({ subscriptionManager: {} as any, execute: {} as any }, { server: httpServer });
    }).to.throw();
  });

  it('should throw an exception when creating a server with subscribe only', () => {
    expect(() => {
      new SubscriptionServer({ subscribe: {} as any }, { server: httpServer });
    }).to.throw();
  });

  it('should throw an exception when both execute and subscriptionManager are missing', () => {
    expect(() => {
      new SubscriptionServer({}, { server: httpServer });
    }).to.throw();
  });

  it('should throw an exception when using execute but schema is missing', () => {
    expect(() => {
      new SubscriptionServer({ execute: {} as any }, { server: httpServer });
    }).to.throw();
  });

  it('should accept execute method than returns a Promise (original execute)', (done) => {
    const server = createServer(notFoundRequestListener);
    server.listen(SERVER_EXECUTOR_TESTS_PORT);

    SubscriptionServer.create({
      schema,
      execute,
    }, {
      server,
      path: '/',
    });

    const client = new SubscriptionClient(`ws://localhost:${SERVER_EXECUTOR_TESTS_PORT}/`);
    client.onConnect(() => {
      client.subscribe({
        query: `query { testString }`,
        variables: {},
      }, (err, res) => {
        if (err) {
          assert(false, 'unexpected error from subscribe');
        } else {
          expect(res).to.deep.equal({ testString: 'value' });
        }

        server.close();
        done();
      });
    });
  });

  it('should return an error when invalid execute method provided', (done) => {
    const server = createServer(notFoundRequestListener);
    server.listen(SERVER_EXECUTOR_TESTS_PORT);

    SubscriptionServer.create({
      schema,
      execute: (() => ({})) as any,
    }, {
      server,
      path: '/',
    });

    const client = new SubscriptionClient(`ws://localhost:${SERVER_EXECUTOR_TESTS_PORT}/`);
    client.onConnect(() => {
      client.subscribe({
        query: `query { testString }`,
        variables: {},
      }, (err) => {
        expect(err.length).to.equal(1);
        expect(err[0].message).to.equal('GraphQL execute engine is not available');
        client.client.close();
        server.close();
        done();
      });
    });
  });

  it('should accept execute method than returns an AsyncIterator', (done) => {
    const server = createServer(notFoundRequestListener);
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
    client.onConnect(() => {
      client.subscribe({
        query: `query { testString }`,
        variables: {},
      }, (err, res) => {
        if (err) {
          assert(false, 'unexpected error from subscribe');
        } else {
          expect(res).to.deep.equal({ testString: 'value' });
        }

        server.close();
        done();
      });
    });
  });

  it('should handle socket error and close the connection on error', (done) => {
    const spy = sinon.spy();

    const httpServerForError = createServer(notFoundRequestListener);
    httpServerForError.listen(ERROR_TEST_PORT);

    new SubscriptionServer({
      subscriptionManager,
      onConnect: (payload: any, socket: any) => {
        setTimeout(() => {
          socket.emit('error', new Error('test'));

          setTimeout(() => {
            assert(spy.calledOnce);
            httpServerForError.close();
            done();
          }, 500);
        }, 100);
      },
    }, { server: httpServerForError });

    const client = new SubscriptionClient(`ws://localhost:${ERROR_TEST_PORT}/`);
    client.onDisconnect(spy);
  });

  it('should trigger onConnect when client connects and validated', (done) => {
    new SubscriptionClient(`ws://localhost:${EVENTS_TEST_PORT}/`);

    setTimeout(() => {
      assert(eventsOptions.onConnect.calledOnce);
      done();
    }, 200);
  });

  it('should trigger onConnect with the correct connectionParams', (done) => {
    const connectionParams: any = {
      test: true,
    };

    new SubscriptionClient(`ws://localhost:${EVENTS_TEST_PORT}/`, {
      connectionParams: connectionParams,
    });

    setTimeout(() => {
      assert(eventsOptions.onConnect.calledOnce);
      expect(JSON.stringify(eventsOptions.onConnect.getCall(0).args[0])).to.equal(JSON.stringify(connectionParams));
      done();
    }, 200);
  });

  it('should trigger onConnect and return GQL_CONNECTION_ERROR with error', (done) => {
    const connectionCallbackSpy = sinon.spy();

    const subscriptionsClient = new SubscriptionClient(`ws://localhost:${ONCONNECT_ERROR_TEST_PORT}/`, {
      connectionCallback: connectionCallbackSpy,
    });

    const originalOnMessage = subscriptionsClient.client.onmessage;
    subscriptionsClient.client.onmessage = (dataReceived: any) => {
      let messageData = JSON.parse(dataReceived.data);

      if (messageData.type === MessageTypes.INIT_FAIL) {
        messageData.type = MessageTypes.GQL_CONNECTION_ERROR;
      }

      dataReceived.data = JSON.stringify(messageData);
      originalOnMessage(dataReceived);
    };

    setTimeout(() => {
      expect(connectionCallbackSpy.calledOnce).to.be.true;
      expect(connectionCallbackSpy.getCall(0).args[0]).to.equal('Error');
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
      done();
    }, 200);
  });

  it('should call unsubscribe when client closes the connection', (done) => {
    const client = new SubscriptionClient(`ws://localhost:${EVENTS_TEST_PORT}/`);
    const spy = sinon.spy(eventsServer, 'unsubscribe');

    client.subscribe({
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
      }, function (error: any, result: any) {
        // nothing
      },
    );

    setTimeout(() => {
      client.client.close();
    }, 500);

    setTimeout(() => {
      assert(spy.calledOnce);
      done();
    }, 1000);
  });

  it('should trigger onSubscribe when client subscribes', (done) => {
    const client = new SubscriptionClient(`ws://localhost:${EVENTS_TEST_PORT}/`);
    client.subscribe({
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
    }, (error: any, result: any) => {
      if (error) {
        assert(false);
      }
    });

    setTimeout(() => {
      assert(eventsOptions.onSubscribe.calledOnce);
      done();
    }, 200);
  });

  it('should trigger onUnsubscribe when client unsubscribes', (done) => {
    const client = new SubscriptionClient(`ws://localhost:${EVENTS_TEST_PORT}/`);
    const subId = client.subscribe({
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
    }, function (error: any, result: any) {
      if (error) {
        assert(false);
        done();
      }

      if (result) {
        client.unsubscribe(subId);
        setTimeout(() => {
          assert(eventsOptions.onUnsubscribe.calledOnce);
          done();
        }, 200);
      }
    });

    setTimeout(() => {
      subscriptionManager.publish('user', {});
    }, 100);
  });

  it('should send correct results to multiple clients with subscriptions', function (done) {
    const client = new SubscriptionClient(`ws://localhost:${TEST_PORT}/`);
    let client1 = new SubscriptionClient(`ws://localhost:${TEST_PORT}/`);

    let numResults = 0;
    setTimeout(() => {
      client.subscribe({
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

      }, function (error: any, result: any) {
        if (error) {
          assert(false);
        }
        if (result) {
          assert.property(result, 'user');
          assert.equal(result.user.id, '3');
          assert.equal(result.user.name, 'Jessie');
          numResults++;
        } else {
          // pass
        }
        // if both error and result are null, this was a SUBSCRIPTION_SUCCESS message.
      });
    }, 100);

    const client11 = new SubscriptionClient(`ws://localhost:${TEST_PORT}/`);
    let numResults1 = 0;
    setTimeout(function () {
      client11.subscribe({
        query: `subscription useInfo($id: String) {
          user(id: $id) {
            id
            name
          }
        }`,
        operationName: 'useInfo',
        variables: {
          id: 2,
        },

      }, function (error: any, result: any) {
        if (error) {
          assert(false);
        }
        if (result) {
          assert.property(result, 'user');
          assert.equal(result.user.id, '2');
          assert.equal(result.user.name, 'Marie');
          numResults1++;
        }
        // if both error and result are null, this was a SUBSCRIPTION_SUCCESS message.
      });
    }, 100);

    setTimeout(() => {
      subscriptionManager.publish('user', {});
    }, 200);

    setTimeout(() => {
      client.unsubscribeAll();
      expect(numResults).to.equals(1);
      client1.unsubscribeAll();
      expect(numResults1).to.equals(1);
      done();
    }, 300);

  });

  it('should send a gql_error message to client with invalid query', function (done) {
    const client1 = new SubscriptionClient(`ws://localhost:${TEST_PORT}/`);
    setTimeout(function () {
      client1.client.onmessage = (message: any) => {
        let messageData = JSON.parse(message.data);
        assert.equal(messageData.type, MessageTypes.GQL_ERROR);
        assert.isDefined(messageData.payload, 'Number of errors is greater than 0.');
        done();
      };
      client1.subscribe({
          query: `subscription useInfo($id: String) {
          user(id: $id) {
            id
            birthday
          }
        }`,
          operationName: 'useInfo',
          variables: {
            id: 3,
          },
        }, function (error: any, result: any) {
          //do nothing
        },
      );
    }, 100);

  });

  it('should set up the proper filters when subscribing', function (done) {
    let numTriggers = 0;
    const client3 = new SubscriptionClient(`ws://localhost:${TEST_PORT}/`);
    const client4 = new SubscriptionClient(`ws://localhost:${TEST_PORT}/`);
    setTimeout(() => {
      client3.subscribe({
          query: `subscription userInfoFilter1($id: String) {
            userFiltered(id: $id) {
              id
              name
            }
          }`,
          operationName: 'userInfoFilter1',
          variables: {
            id: 3,
          },
        }, (error: any, result: any) => {
          if (error) {
            assert(false);
          }
          if (result) {
            numTriggers += 1;
            assert.property(result, 'userFiltered');
            assert.equal(result.userFiltered.id, '3');
            assert.equal(result.userFiltered.name, 'Jessie');
          }
          // both null means it's a SUBSCRIPTION_SUCCESS message
        },
      );
      client4.subscribe({
          query: `subscription userInfoFilter1($id: String) {
            userFiltered(id: $id) {
              id
              name
            }
          }`,
          operationName: 'userInfoFilter1',
          variables: {
            id: 1,
          },
        }, (error: any, result: any) => {
          if (result) {
            numTriggers += 1;
            assert.property(result, 'userFiltered');
            assert.equal(result.userFiltered.id, '1');
            assert.equal(result.userFiltered.name, 'Dan');
          }
          if (error) {
            assert(false);
          }
          // both null means SUBSCRIPTION_SUCCESS
        },
      );
    }, 100);
    setTimeout(() => {
      subscriptionManager.publish('userFiltered', { id: 1 });
      subscriptionManager.publish('userFiltered', { id: 2 });
      subscriptionManager.publish('userFiltered', { id: 3 });
    }, 200);
    setTimeout(() => {
      assert.equal(numTriggers, 2);
      done();
    }, 300);
  });

  it('correctly sets the context in onSubscribe', function (done) {
    const CTX = 'testContext';
    const client3 = new SubscriptionClient(`ws://localhost:${TEST_PORT}/`);
    client3.subscribe({
        query: `subscription context {
          context
        }`,
        variables: {},
        context: CTX,
      }, (error: any, result: any) => {
        client3.unsubscribeAll();
        if (error) {
          assert(false);
        }
        if (result) {
          assert.property(result, 'context');
          assert.equal(result.context, CTX);
        }
        done();
      },
    );
    setTimeout(() => {
      subscriptionManager.publish('context', {});
    }, 100);
  });

  it('passes through webSocketRequest to onSubscribe', function (done) {
    const client = new SubscriptionClient(`ws://localhost:${TEST_PORT}/`);
    client.subscribe({
      query: `
        subscription context {
          context
        }
      `,
      variables: {},
    }, (error: any, result: any) => {
      if (error) {
        assert(false);
      }
    });
    setTimeout(() => {
      assert(onSubscribeSpy.calledOnce);
      expect(onSubscribeSpy.getCall(0).args[2]).to.not.be.undefined;
      done();
    }, 100);
  });

  it('does not send more subscription data after client unsubscribes', function (done) {
    const client4 = new SubscriptionClient(`ws://localhost:${TEST_PORT}/`);
    let subId: string;
    setTimeout(() => {
      client4.unsubscribe(subId);
    }, 50);
    setTimeout(() => {
      subscriptionManager.publish('user', {});
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
    subId = client4.subscribe({
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
    }, function (error: any, result: any) {
      //do nothing
    });
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
    client.subscribe({
      query: `invalid useInfo{
          error
        }`,
      variables: {},
    }, function (errors: any, result: any) {
      client.unsubscribeAll();
      assert.isAbove(errors.length, 0, 'Number of errors is greater than 0.');
      done();
    });
  });

  it('handles errors prior to graphql execution', function (done) {
    // replace the onSubscribeSpy with a custom handler, the spy will restore
    // the original method
    handlers.onSubscribe = (msg: OperationMessagePayload, params: SubscriptionOptions, webSocketRequest: WebSocket) => {
      return Promise.resolve(Object.assign({}, params, {
        context: () => {
          throw new Error('bad');
        },
      }));
    };
    const client = new SubscriptionClient(`ws://localhost:${TEST_PORT}/`);
    client.subscribe({
      query: `
        subscription context {
          context
        }
      `,
      variables: {},
      context: {},
    }, (error: any, result: any) => {
      client.unsubscribeAll();
      if (error) {
        assert(Array.isArray(error));
        assert.equal(error[0].message, 'bad');
      } else {
        assert(false);
      }
      done();
    });
    setTimeout(() => {
      subscriptionManager.publish('context', {});
    }, 100);
  });

  it('sends a keep alive signal in the socket', function (done) {
    let client = new WebSocket(`ws://localhost:${KEEP_ALIVE_TEST_PORT}/`, GRAPHQL_SUBSCRIPTIONS);
    let yieldCount = 0;
    client.onmessage = (message: any) => {
      const parsedMessage = JSON.parse(message.data);
      if (parsedMessage.type === MessageTypes.GQL_CONNECTION_KEEP_ALIVE) {
        yieldCount += 1;
        if (yieldCount > 1) {
          client.close();
          done();
        }
      }
    };
  });
});

describe('Helpers', function () {
  it('should extend provided network interface correctly', (done) => {
    let mockedSubscriptionClient: any = sinon.createStubInstance(SubscriptionClient);
    let mockNetworkInterface = {
      subscribe: sinon.stub(),
      unsubscribe: sinon.stub(),
    };

    addGraphQLSubscriptions(mockNetworkInterface, mockedSubscriptionClient);

    mockNetworkInterface.subscribe({}, sinon.stub());
    mockNetworkInterface.unsubscribe(0);

    expect(mockedSubscriptionClient.subscribe.callCount).to.be.equal(1);
    expect(mockedSubscriptionClient.unsubscribe.callCount).to.be.equal(1);
    done();
  });

  it('should call console warn when env is not production', (done) => {
    let mockedSubscriptionClient: any = sinon.createStubInstance(SubscriptionClient);
    let mockNetworkInterface = {
      subscribe: sinon.stub(),
      unsubscribe: sinon.stub(),
    };
    const consoleStub = sinon.stub(console, 'warn');

    addGraphQLSubscriptions(mockNetworkInterface, mockedSubscriptionClient);

    assert(consoleStub.calledWith('This method becomes deprecated in the new package graphql-transport-ws. ' +
      'Start using the GraphQLTransportWSClient to make queries, mutations and subscriptions over websockets.'));
    consoleStub.restore();
    done();
  });

  it('should not call console warn when env is production', (done) => {
    let mockedSubscriptionClient: any = sinon.createStubInstance(SubscriptionClient);
    let mockNetworkInterface = {
      subscribe: sinon.stub(),
      unsubscribe: sinon.stub(),
    };
    const consoleStub = sinon.stub(console, 'warn');
    const originalProccessEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    addGraphQLSubscriptions(mockNetworkInterface, mockedSubscriptionClient);

    assert.isFalse(consoleStub.called);
    consoleStub.restore();
    process.env.NODE_ENV = originalProccessEnv;
    done();
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
  it('should reconnect after manually closing the connection and then resubscribing', (done) => {
    const testServer = createServer(notFoundRequestListener);
    testServer.listen(SERVER_EXECUTOR_TESTS_PORT);

    SubscriptionServer.create({
      schema: subscriptionsSchema,
      execute,
      subscribe,
    }, {
      server: testServer,
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
          client.close();

          // Subscribe to data, without manually reconnect before
          const opId = client.subscribe({
            query: `query { testString }`,
            variables: {},
          }, (err, res) => {
            expect(opId).not.to.eq(null);
            expect(err).to.eq(null);
            expect(res.testString).to.eq('value');
            testServer.close();
            done();
          });
        }, 300);
      }
    });
  });

  it('should close iteration over AsyncIterator when client unsubscribes', async () => {
    subscriptionAsyncIteratorSpy.reset();
    resolveAsyncIteratorSpy.reset();

    const testServer = createServer(notFoundRequestListener);
    testServer.listen(SERVER_EXECUTOR_TESTS_PORT);

    SubscriptionServer.create({
      schema: subscriptionsSchema,
      execute,
      subscribe,
    }, {
      server: testServer,
      path: '/',
    });

    const createClientAndSubscribe = (): Promise<any> => {
      const client = new SubscriptionClient(`ws://localhost:${SERVER_EXECUTOR_TESTS_PORT}/`);
      let opId: any = null;
      const cbSpy = sinon.spy();

      client.onConnected(() => {
        opId = client.subscribe({
          query: `subscription { somethingChanged }`,
          variables: {},
        }, (err, res) => {
          cbSpy(err, res);
        });
      });

      return new Promise(resolve => {
        setTimeout(() => {
          resolve({
            unsubscribe: () => opId && client.unsubscribe(opId),
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
    subscriptionAsyncIteratorSpy.reset();
    resolveAsyncIteratorSpy.reset();
    client1.spy.reset();
    client2.spy.reset();

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
    testServer.close();
  });

  it('should close iteration over AsyncIterator when client disconnects', async () => {
    resolveAsyncIteratorSpy.reset();

    const testServer = createServer(notFoundRequestListener);
    testServer.listen(SERVER_EXECUTOR_TESTS_PORT);

    SubscriptionServer.create({
      schema: subscriptionsSchema,
      execute,
      subscribe,
    }, {
      server: testServer,
      path: '/',
    });

    const createClientAndSubscribe = (): Promise<any> => {
      const client = new SubscriptionClient(`ws://localhost:${SERVER_EXECUTOR_TESTS_PORT}/`);
      const cbSpy = sinon.spy();

      client.onConnected(() => {
        client.subscribe({
          query: `subscription { somethingChanged }`,
          variables: {},
        }, (err, res) => {
          cbSpy(err, res);
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
    resolveAsyncIteratorSpy.reset();
    client1.spy.reset();
    client2.spy.reset();

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
    testServer.close();
  });

  it('should handle correctly multiple subscriptions one after each other', (done) => {
    // This tests the use case of a UI component that creates a subscription acoording to it's
    // local data, for example: subscribe to changed on a visible items in a list, and it might
    // change quickly and we want to make sure that the subscriptions flow is correct

    // Create the server
    const server = createServer(notFoundRequestListener);
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
    client.onConnect(() => {
      // Subscribe to a regular query
      client.subscribe({
        query: `query { testString }`,
        variables: {},
      }, (err, res) => {
        assert(err === null, 'unexpected error from query');
        expect(res).to.deep.equal({ testString: 'value' });

        // Now, subscribe to graphql subscription
        const firstSubscriptionId = client.subscribe({
          query: `subscription {
            user(id: "3") {
              id
              name
            }
          }`,
        }, (sErr, sRes) => {
          assert(sErr === null, 'unexpected error from 1st subscription');
          assert(sRes !== null, 'unexpected null from 1st subscription result');
          expect(Object.keys(client['operations']).length).to.eq(1);
          expect(sRes.user.id).to.eq('3');
          firstSubscriptionSpy();

          client.unsubscribe(firstSubscriptionId);

          setTimeout(() => {
            client.subscribe({
              query: `subscription {
            user(id: "1") {
              id
              name
            }
          }`,
            }, (s2Err, s2Res) => {
              assert(s2Err === null, 'unexpected error from 2nd subscription');
              assert(s2Res !== null, 'unexpected null from 2nd ubscription result');
              expect(s2Res.user.id).to.eq('1');
              expect(Object.keys(client['operations']).length).to.eq(1);
              expect(firstSubscriptionSpy.callCount).to.eq(1);

              server.close();
              done();
            });
          }, 10);
        });
      });
    });
  });
});
