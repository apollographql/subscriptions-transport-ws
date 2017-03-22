import 'mocha';
import {
  assert,
  expect,
} from 'chai';
import * as sinon from 'sinon';
import * as WebSocket from 'ws';

Object.assign(global, {
  WebSocket: WebSocket,
});

import {
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
} from 'graphql';

import {PubSub, SubscriptionManager} from 'graphql-subscriptions';

import {
  SUBSCRIPTION_START,
  SUBSCRIPTION_FAIL,
  SUBSCRIPTION_DATA,
  KEEPALIVE,
  SUBSCRIPTION_END,
  INIT,
  INIT_SUCCESS,
  SUBSCRIPTION_SUCCESS,
} from '../messageTypes';

import {
  GRAPHQL_SUBSCRIPTIONS,
} from '../protocols';

import {createServer, IncomingMessage, ServerResponse} from 'http';
import {SubscriptionServer} from '../server';
import {SubscriptionClient} from '../client';
import {SubscribeMessage} from '../server';
import {SubscriptionOptions} from 'graphql-subscriptions/dist/pubsub';

const TEST_PORT = 4953;
const KEEP_ALIVE_TEST_PORT = TEST_PORT + 1;
const DELAYED_TEST_PORT = TEST_PORT + 2;
const RAW_TEST_PORT = TEST_PORT + 4;
const EVENTS_TEST_PORT = TEST_PORT + 5;
const ONCONNECT_ERROR_TEST_PORT = TEST_PORT + 6;

const data: {[key: string]: {[key: string]: string}} = {
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
    id: {type: GraphQLString},
    name: {type: GraphQLString},
  },
});

const schema = new GraphQLSchema({
  query: new GraphQLObjectType({
    name: 'Query',
    fields: {
      testString: {type: GraphQLString},
    },
  }),
  subscription: new GraphQLObjectType({
    name: 'Subscription',
    fields: {
      user: {
        type: userType,
        // `args` describes the arguments that the `user` query accepts
        args: {
          id: {type: GraphQLString},
        },
        // The resolve function describes how to 'resolve' or fulfill
        // the incoming query.
        // In this case we use the `id` argument from above as a key
        // to get the User from `data`
        resolve: function (_, {id}) {
          return data[id];
        },
      },
      userFiltered: {
        type: userType,
        args: {
          id: {type: GraphQLString},
        },
        resolve: function (_, {id}) {
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

const subscriptionManager = new SubscriptionManager({
  schema,
  pubsub: new PubSub(),
  setupFunctions: {
    'userFiltered': (options: SubscriptionOptions, args: {[key: string]: any}) => ({
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
  onSubscribe: (msg: SubscribeMessage, params: SubscriptionOptions, webSocketRequest: WebSocket) => {
    return Promise.resolve(Object.assign({}, params, {context: msg['context']}));
  },
};

const options = {
  subscriptionManager,
  onSubscribe: (msg: SubscribeMessage, params: SubscriptionOptions, webSocketRequest: WebSocket) => {
    return handlers.onSubscribe(msg, params, webSocketRequest);
  },
};

const eventsOptions = {
  subscriptionManager,
  onSubscribe: sinon.spy((msg: SubscribeMessage, params: SubscriptionOptions, webSocketRequest: WebSocket) => {
    return Promise.resolve(Object.assign({}, params, {context: msg['context']}));
  }),
  onUnsubscribe: sinon.spy(),
  onConnect: sinon.spy(() => {
    return {test: 'test context'};
  }),
  onDisconnect: sinon.spy(),
};

const onConnectErrorOptions = {
  subscriptionManager,
  onConnect: () => {
    throw new Error('Error');
  },
};

function notFoundRequestListener(request: IncomingMessage, response: ServerResponse) {
  response.writeHead(404);
  response.end();
}

const httpServer = createServer(notFoundRequestListener);
httpServer.listen(TEST_PORT);
new SubscriptionServer(options, {server: httpServer});

const httpServerWithKA = createServer(notFoundRequestListener);
httpServerWithKA.listen(KEEP_ALIVE_TEST_PORT);
new SubscriptionServer(Object.assign({}, options, {keepAlive: 10}), {server: httpServerWithKA});

const httpServerWithEvents = createServer(notFoundRequestListener);
httpServerWithEvents.listen(EVENTS_TEST_PORT);
const eventsServer = new SubscriptionServer(eventsOptions, {server: httpServerWithEvents});

const httpServerWithOnConnectError = createServer(notFoundRequestListener);
httpServerWithOnConnectError.listen(ONCONNECT_ERROR_TEST_PORT);
new SubscriptionServer(onConnectErrorOptions, {server: httpServerWithOnConnectError});

const httpServerWithDelay = createServer(notFoundRequestListener);
httpServerWithDelay.listen(DELAYED_TEST_PORT);
new SubscriptionServer(Object.assign({}, options, {
  onSubscribe: (msg: SubscribeMessage, params: SubscriptionOptions) => {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(Object.assign({}, params, {context: msg['context']}));
      }, 100);
    });
  },
}), {server: httpServerWithDelay});

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

  it('should send INIT message when creating the connection', (done) => {
    wsServer.on('connection', (connection: any) => {
      connection.on('message', (message: any) => {
        const parsedMessage = JSON.parse(message);
        expect(parsedMessage.type).to.equals('init');
        done();
      });
    });

    new SubscriptionClient(`ws://localhost:${RAW_TEST_PORT}/`);
  });

  it('should send INIT message first, then the SUBSCRIPTION_START message', (done) => {
    let initReceived = false;

    const client = new SubscriptionClient(`ws://localhost:${RAW_TEST_PORT}/`);
    wsServer.on('connection', (connection: any) => {
      connection.on('message', (message: any) => {
        const parsedMessage = JSON.parse(message);
        // mock server
        if (parsedMessage.type === INIT) {
          connection.send(JSON.stringify({type: INIT_SUCCESS, payload: {}}));
          initReceived = true;
        }
        if (parsedMessage.type === SUBSCRIPTION_START) {
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
      }
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

  it('should throw an exception when query is not provided', () => {
    const client = new SubscriptionClient(`ws://localhost:${TEST_PORT}/`);

    expect(() => {
      client.subscribe({
          query: undefined,
          operationName: 'useInfo',
          variables: {
            id: 3,
          },
        }, function (error: any, result: any) {
          //do nothing
        }
      );
    }).to.throw();
  });

  it('should throw an exception when query is not valid', () => {
    const client = new SubscriptionClient(`ws://localhost:${TEST_PORT}/`);

    expect(() => {
      client.subscribe({
          query: <string>{},
          operationName: 'useInfo',
          variables: {
            id: 3,
          },
        }, function (error: any, result: any) {
          //do nothing
        }
      );
    }).to.throw();
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
        undefined
      );
    }).to.throw();
  });

  it('should allow both data and errors on SUBSCRIPTION_DATA', (done) => {
    wsServer.on('connection', (connection: any) => {
      connection.on('message', (message: any) => {
        const parsedMessage = JSON.parse(message);
        // mock server
        if (parsedMessage.type === INIT) {
          connection.send(JSON.stringify({type: INIT_SUCCESS, payload: {}}));
        }
        if (parsedMessage.type === SUBSCRIPTION_START) {
          connection.send(JSON.stringify({type: SUBSCRIPTION_SUCCESS, id: parsedMessage.id}), () => {
            const dataMessage = {
              type: SUBSCRIPTION_DATA,
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
          });
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
      }
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

  it('should override SubscriptionOptions with middleware', function (done) {
    const CTX = 'testContext';
    const CTX2 = 'overrideContext';
    const client3 = new SubscriptionClient(`ws://localhost:${TEST_PORT}/`);
    client3.use([{
      applyMiddleware(opts, next) {
        // modify options for SubscriptionClient.subscribe here
        opts.context = CTX2;
        next();
      },
    }]);

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
          assert.equal(result.context, CTX2);
        }
        done();
      }
    );
    setTimeout(() => {
      subscriptionManager.publish('context', {});
    }, 100);
  });

  it('should handle correctly init_fail message', (done) => {
    wsServer.on('connection', (connection: any) => {
      connection.on('message', (message: any) => {
        connection.send(JSON.stringify({type: 'init_fail', payload: {error: 'test error'}}));
      });
    });

    new SubscriptionClient(`ws://localhost:${RAW_TEST_PORT}/`, {
      connectionCallback: (error: any) => {
        expect(error).to.equals('test error');
        done();
      },
    });
  });

  it('should handle init_fail message and handle server that closes connection', (done) => {
    let client: any = null;

    wsServer.on('connection', (connection: any) => {
      connection.on('message', (message: any) => {
        connection.send(JSON.stringify({type: 'init_fail', payload: {error: 'test error'}}), () => {
          connection.close();
          connection.terminate();

          setTimeout(() => {
            expect(client.client.readyState).to.equals(WebSocket.CLOSED);
            done();
          }, 500);
        });
      });
    });

    client = new SubscriptionClient(`ws://localhost:${RAW_TEST_PORT}/`);
  });

  it('should handle correctly init_success message', (done) => {
    wsServer.on('connection', (connection: any) => {
      connection.on('message', (message: any) => {
        connection.send(JSON.stringify({type: 'init_success'}));
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
        }
      );
      client.unsubscribe(subId);
      assert.notProperty(client.subscriptions, `${subId}`);
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
      }
    );

    client.unsubscribe(subId);

    client.onConnect(() => {
     expect((client as any).unsentMessagesQueue.length).to.equals(2);

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
        }
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
        }
      );
    }, 100);
  });

  function testBadServer(payload: any, errorMessage: string, done: Function) {
    wsServer.on('connection', (connection: WebSocket) => {
      connection.on('message', (message: any) => {
        const parsedMessage = JSON.parse(message);
        if (parsedMessage.type === SUBSCRIPTION_START) {
          connection.send(JSON.stringify({
            type: SUBSCRIPTION_FAIL,
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

  it('should handle missing errors', function (done) {
    const errorMessage = 'Unknown error';
    const payload = {};
    testBadServer(payload, errorMessage, done);
  });

  it('should handle errors that are not an array', function (done) {
    const errorMessage = 'Just an error';
    const payload = {
      errors: {message: errorMessage},
    };
    testBadServer(payload, errorMessage, done);
  });

  it('should throw an error when the susbcription times out', function (done) {
    // hopefully 1ms is fast enough to time out before the server responds
    const client = new SubscriptionClient(`ws://localhost:${DELAYED_TEST_PORT}/`, {timeout: 1});

    setTimeout(() => {
      client.subscribe({
        query: `subscription useInfo{
            error
          }`,
        operationName: 'useInfo',
        variables: {},
      }, function (error: any, result: any) {
        if (error) {
          expect(error[0].message).to.equals('Subscription timed out - no response from server');
          done();
        }
        if (result) {
          assert(false);
        }
      });
    }, 100);
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
    client = new SubscriptionClient(`ws://localhost:${RAW_TEST_PORT}/`, {reconnect: true});
    originalClient = client.client;
  });

  it('should resubscribe after reconnect', function (done) {
    let connections = 0;
    let client: SubscriptionClient = null;
    wsServer.on('connection', (connection: WebSocket) => {
      connections += 1;
      connection.on('message', (message: any) => {
        const parsedMessage = JSON.parse(message);
        if (parsedMessage.type === SUBSCRIPTION_START) {
          if (connections === 1) {
            client.client.close();
          } else {
            done();
          }
        }
      });
    });
    client = new SubscriptionClient(`ws://localhost:${RAW_TEST_PORT}/`, {reconnect: true});
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

    client = new SubscriptionClient(`ws://localhost:${TEST_PORT}/`, {reconnect: true});

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

    const client = new SubscriptionClient(`ws://localhost:${RAW_TEST_PORT}/`, {
      timeout: 100,
      reconnect: true,
      reconnectionAttempts: 1,
    });
    setTimeout(() => {
      expect(client.client.readyState).to.be.equal(client.client.CLOSED);
      done();
    }, 500);
  });
});

describe('Server', function () {
  let onSubscribeSpy: sinon.SinonSpy;

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
      new SubscriptionServer({subscriptionManager: undefined}, {server: httpServer});
    }).to.throw();
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

  it('should trigger onConnect and return init_fail with error', (done) => {
    const connectionCallbackSpy = sinon.spy();

    new SubscriptionClient(`ws://localhost:${ONCONNECT_ERROR_TEST_PORT}/`, {
      connectionCallback: connectionCallbackSpy,
    });

    setTimeout(() => {
      expect(connectionCallbackSpy.calledOnce).to.be.true;
      expect(connectionCallbackSpy.getCall(0).args[0]).to.equal('Error');
      done();
    }, 200);
  });

  it('should trigger onDisconnect when client disconnects', (done) => {
    const client = new SubscriptionClient(`ws://localhost:${EVENTS_TEST_PORT}/`);
    client.client.close();

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
      }
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
      //do nothing
    });

    client.unsubscribe(subId);

    setTimeout(() => {
      assert(eventsOptions.onUnsubscribe.calledOnce);
      done();
    }, 200);
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

  it('should send a subscription_fail message to client with invalid query', function (done) {
    const client1 = new SubscriptionClient(`ws://localhost:${TEST_PORT}/`);
    setTimeout(function () {
      client1.client.onmessage = (message: any) => {
        let messageData = JSON.parse(message.data);
        assert.equal(messageData.type, SUBSCRIPTION_FAIL);
        assert.isAbove(messageData.payload.errors.length, 0, 'Number of errors is greater than 0.');
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
        }
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
        }
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
        }
      );
    }, 100);
    setTimeout(() => {
      subscriptionManager.publish('userFiltered', {id: 1});
      subscriptionManager.publish('userFiltered', {id: 2});
      subscriptionManager.publish('userFiltered', {id: 3});
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
      }
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

  it('does not send more subscription data after client unsubscribes', function () {
    const client4 = new SubscriptionClient(`ws://localhost:${TEST_PORT}/`);
    setTimeout(() => {
      let subId = client4.subscribe({
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
        }
      );
      client4.unsubscribe(subId);
    }, 100);
    setTimeout(() => {
      subscriptionManager.publish('user', {});
    }, 200);

    client4.client.onmessage = (message: any) => {
      if (JSON.parse(message.data).type === SUBSCRIPTION_DATA) {
        assert(false);
      }
    };
  });

  it('rejects a client that does not specify a supported protocol', function (done) {
    const client = new WebSocket(`ws://localhost:${TEST_PORT}/`);

    client.on('close', (code) => {
      if (code === 1002) {
        done();
      } else {
        assert(false);
      }
    });
  });

  it('rejects unparsable message', function (done) {
    const client = new WebSocket(`ws://localhost:${TEST_PORT}/`, GRAPHQL_SUBSCRIPTIONS);
    client.onmessage = (message: any) => {
      let messageData = JSON.parse(message.data);
      assert.equal(messageData.type, SUBSCRIPTION_FAIL);
      assert.isAbove(messageData.payload.errors.length, 0, 'Number of errors is greater than 0.');
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
      assert.equal(messageData.type, SUBSCRIPTION_FAIL);
      assert.isAbove(messageData.payload.errors.length, 0, 'Number of errors is greater than 0.');
      client.close();
      done();
    };
    client.onopen = () => {
      client.send(JSON.stringify({}));
    };
  });

  it('does not crash on unsub for Object.prototype member', function(done) {
    // Use websocket because Client.unsubscribe will only take a number.
    const client = new WebSocket(`ws://localhost:${TEST_PORT}/`, GRAPHQL_SUBSCRIPTIONS);

    client.onopen = () => {
      client.send(JSON.stringify({type: SUBSCRIPTION_END, id: 'toString'}));
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
    handlers.onSubscribe = (msg: SubscribeMessage, params: SubscriptionOptions, webSocketRequest: WebSocket) => {
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
      if (parsedMessage.type === KEEPALIVE) {
        yieldCount += 1;
        if (yieldCount > 1) {
          client.close();
          done();
        }
      }
    };
  });
});
