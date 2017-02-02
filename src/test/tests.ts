import 'mocha';
import {
  assert,
  expect,
} from 'chai';
import * as sinon from 'sinon';

import {
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
} from 'graphql';

import { PubSub, SubscriptionManager } from 'graphql-subscriptions';

import {
  SUBSCRIPTION_START,
  SUBSCRIPTION_FAIL,
  SUBSCRIPTION_DATA,
  SUBSCRIPTION_KEEPALIVE,
  SUBSCRIPTION_END,
} from '../messageTypes';

import {
  GRAPHQL_SUBSCRIPTIONS,
} from '../protocols';

import { createServer, IncomingMessage, ServerResponse } from 'http';
import SubscriptionServer from '../server';
import Client from '../client';

import { SubscribeMessage } from '../server';
import { SubscriptionOptions } from 'graphql-subscriptions/dist/pubsub';

import {
  server as WebSocketServer,
  connection as Connection,
  request as WebSocketRequest,
} from 'websocket';
import * as websocket from 'websocket';
const W3CWebSocket = (websocket as { [key: string]: any })['w3cwebsocket'];

const TEST_PORT = 4953;
const KEEP_ALIVE_TEST_PORT = TEST_PORT + 1;
const DELAYED_TEST_PORT = TEST_PORT + 2;
const RAW_TEST_PORT = TEST_PORT + 4;

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
      testString: { type: GraphQLString },
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
        resolve: function (_, {id}) {
          return data[id];
        },
      },
      userFiltered: {
        type: userType,
        args: {
          id: { type: GraphQLString },
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
      error: { type: GraphQLString, resolve: () => { throw new Error('E1'); } },
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
  onSubscribe: (msg: SubscribeMessage, params: SubscriptionOptions, webSocketRequest: WebSocketRequest) => {
    return Promise.resolve(Object.assign({}, params, { context: msg['context'] }));
  },
};

const options = {
  subscriptionManager,
  onSubscribe: (msg: SubscribeMessage, params: SubscriptionOptions, webSocketRequest: WebSocketRequest) => {
    return handlers.onSubscribe(msg, params, webSocketRequest);
  },
};

function notFoundRequestListener(request: IncomingMessage, response: ServerResponse) {
  response.writeHead(404);
  response.end();
}

const httpServer = createServer(notFoundRequestListener);
httpServer.listen(TEST_PORT);
new SubscriptionServer(options, httpServer);

const httpServerWithKA = createServer(notFoundRequestListener);
httpServerWithKA.listen(KEEP_ALIVE_TEST_PORT);
new SubscriptionServer(Object.assign({}, options, {keepAlive: 10}), httpServerWithKA);

const httpServerWithDelay = createServer(notFoundRequestListener);
httpServerWithDelay.listen(DELAYED_TEST_PORT);
new SubscriptionServer(Object.assign({}, options, {
  onSubscribe: (msg: SubscribeMessage, params: SubscriptionOptions) => {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve(Object.assign({}, params, { context: msg['context'] }));
      }, 100);
    });
  },
}), httpServerWithDelay);

const httpServerRaw = createServer(notFoundRequestListener);
httpServerRaw.listen(RAW_TEST_PORT);

describe('Client', function() {

  let wsServer: WebSocketServer;

  beforeEach(() => {
    wsServer = new WebSocketServer({
      httpServer: httpServerRaw,
      autoAcceptConnections: true,
    });
  });

  afterEach(() => {
    if (wsServer) {
      wsServer.shutDown();
    }
  });

  it('removes subscription when it unsubscribes from it', function() {
    const client = new Client(`ws://localhost:${TEST_PORT}/`);

    setTimeout( () => {
      let subId = client.subscribe({
        query:
        `subscription useInfo($id: String) {
          user(id: $id) {
            id
            name
          }
        }`,
        operationName: 'useInfo',
        variables: {
          id: 3,
        },
        }, function(error, result) {
          //do nothing
        }
      );
      client.unsubscribe(subId);
      assert.notProperty(client.subscriptions, `${subId}`);
    }, 100);
  });

  it('queues messages while websocket is still connecting', function() {
    const client = new Client(`ws://localhost:${TEST_PORT}/`);

    let subId = client.subscribe({
      query:
      `subscription useInfo($id: String) {
        user(id: $id) {
          id
          name
        }
      }`,
      operationName: 'useInfo',
      variables: {
        id: 3,
      },
      }, function(error, result) {
        //do nothing
      }
    );
    expect((client as any).unsentMessagesQueue.length).to.equals(1);
    client.unsubscribe(subId);
    expect((client as any).unsentMessagesQueue.length).to.equals(2);
    setTimeout(() => {
      expect((client as any).unsentMessagesQueue.length).to.equals(0);
    }, 100);
  });

  it('should call error handler when graphql result has errors', function(done) {
    const client = new Client(`ws://localhost:${TEST_PORT}/`);

    setTimeout( () => {
    client.subscribe({
        query:
        `subscription useInfo{
          error
        }`,
        variables: {},
        }, function(error, result) {
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
    setTimeout( () => {
      subscriptionManager.publish('error', {});
    }, 200);
  });

  it('should call error handler when graphql query is not valid', function(done) {
    const client = new Client(`ws://localhost:${TEST_PORT}/`);

    setTimeout( () => {
    client.subscribe({
        query:
        `subscription useInfo{
          invalid
        }`,
        variables: {},
      }, function(error: Error[], result: any) {
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
    wsServer.on('connect', (connection: Connection) => {
      connection.on('message', (message) => {
        const parsedMessage = JSON.parse(message.utf8Data);
        if (parsedMessage.type === SUBSCRIPTION_START) {
          connection.sendUTF(JSON.stringify({
            type: SUBSCRIPTION_FAIL,
            id: parsedMessage.id,
            payload,
          }));
        }
      });
    });

    const client = new Client(`ws://localhost:${RAW_TEST_PORT}/`);
    client.subscribe({
      query: `
        subscription useInfo{
          invalid
        }
      `,
      variables: {},
    }, function(errors: Error[], result: any) {
      if (errors) {
        expect(errors[0].message).to.equals(errorMessage);
      } else {
        assert(false);
      }
      done();
    });
  }

  it('should handle missing errors', function(done) {
    const errorMessage = 'Unknown error';
    const payload = {};
    testBadServer(payload, errorMessage, done);
  });

  it('should handle errors that are not an array', function(done) {
    const errorMessage = 'Just an error';
    const payload = {
      errors: { message: errorMessage },
    };
    testBadServer(payload, errorMessage, done);
  });

  it('should throw an error when the susbcription times out', function(done) {
    // hopefully 1ms is fast enough to time out before the server responds
    const client = new Client(`ws://localhost:${DELAYED_TEST_PORT}/`, { timeout: 1 });

    setTimeout( () => {
      client.subscribe({
        query:
          `subscription useInfo{
            error
          }`,
        operationName: 'useInfo',
        variables: {},
      }, function(error, result) {
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

  it('should reconnect to the server', function(done) {
    let connections = 0;
    let client: Client;
    let originalClient: any;
    wsServer.on('connect', (connection: Connection) => {
      connections += 1;
      if (connections === 1) {
        wsServer.closeAllConnections();
      } else {
        expect(client.client).to.not.be.equal(originalClient);
        done();
      }
    });
    client = new Client(`ws://localhost:${RAW_TEST_PORT}/`, { reconnect: true });
    originalClient = client.client;
  });

  it('should resubscribe after reconnect', function(done) {
    let connections = 0;
    wsServer.on('connect', (connection: Connection) => {
      connections += 1;
      connection.on('message', (message) => {
        const parsedMessage = JSON.parse(message.utf8Data);
        if (parsedMessage.type === SUBSCRIPTION_START) {
          if (connections === 1) {
            wsServer.closeAllConnections();
          } else {
            done();
          }
        }
      });
    });
    const client = new Client(`ws://localhost:${RAW_TEST_PORT}/`, { reconnect: true });
    client.subscribe({
      query: `
        subscription useInfo{
          invalid
        }
      `,
      variables: {},
    }, function(errors: Error[], result: any) {
      assert(false);
    });
  });

  it('should stop trying to reconnect to the server', function(done) {
    let connections = 0;
    wsServer.on('connect', (connection: Connection) => {
      connections += 1;
      if (connections === 1) {
        wsServer.unmount();
        wsServer.closeAllConnections();
      } else {
        assert(false);
      }
    });
    const client = new Client(`ws://localhost:${RAW_TEST_PORT}/`, {
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

describe('Server', function() {

  let onSubscribeSpy: sinon.SinonSpy;

  beforeEach(() => {
    onSubscribeSpy = sinon.spy(handlers, 'onSubscribe');
  });

  afterEach(() => {
    onSubscribeSpy.restore();
  });

  it('should send correct results to multiple clients with subscriptions', function(done) {

    const client = new Client(`ws://localhost:${TEST_PORT}/`);
    let client1 = new Client(`ws://localhost:${TEST_PORT}/`);

    let numResults = 0;
    setTimeout( () => {
      client.subscribe({
        query:
        `subscription useInfo($id: String) {
          user(id: $id) {
            id
            name
          }
        }`,
        operationName: 'useInfo',
        variables: {
          id: 3,
        },

      }, function(error, result) {
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

    const client11 = new Client(`ws://localhost:${TEST_PORT}/`);
    let numResults1 = 0;
    setTimeout(function() {
      client11.subscribe({
        query:
        `subscription useInfo($id: String) {
          user(id: $id) {
            id
            name
          }
        }`,
        operationName: 'useInfo',
        variables: {
          id: 2,
        },

      }, function(error, result) {

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

  it('should send a subscription_fail message to client with invalid query', function(done) {
    const client1 = new Client(`ws://localhost:${TEST_PORT}/`);
    setTimeout(function() {
      client1.client.onmessage = (message: any) => {
        let messageData = JSON.parse(message.data);
        assert.equal(messageData.type, SUBSCRIPTION_FAIL);
        assert.isAbove(messageData.payload.errors.length, 0, 'Number of errors is greater than 0.');
        done();
      };
      client1.subscribe({
        query:
        `subscription useInfo($id: String) {
          user(id: $id) {
            id
            birthday
          }
        }`,
        operationName: 'useInfo',
        variables: {
          id: 3,
        },
        }, function(error, result) {
          //do nothing
        }
      );
    }, 100);

  });

  it('should set up the proper filters when subscribing', function(done) {
    let numTriggers = 0;
    const client3 = new Client(`ws://localhost:${TEST_PORT}/`);
    const client4 = new Client(`ws://localhost:${TEST_PORT}/`);
    setTimeout(() => {
      client3.subscribe({
        query:
          `subscription userInfoFilter1($id: String) {
            userFiltered(id: $id) {
              id
              name
            }
          }`,
          operationName: 'userInfoFilter1',
          variables: {
            id: 3,
          },
        }, (error, result) => {
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
        query:
          `subscription userInfoFilter1($id: String) {
            userFiltered(id: $id) {
              id
              name
            }
          }`,
          operationName: 'userInfoFilter1',
          variables: {
            id: 1,
          },
        }, (error, result) => {
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
      subscriptionManager.publish('userFiltered', { id: 1 });
      subscriptionManager.publish('userFiltered', { id: 2 });
      subscriptionManager.publish('userFiltered', { id: 3 });
    }, 200);
    setTimeout(() => {
      assert.equal(numTriggers, 2);
      done();
    }, 300);
  });

  it('correctly sets the context in onSubscribe', function(done) {
    const CTX = 'testContext';
    const client3 = new Client(`ws://localhost:${TEST_PORT}/`);
    client3.subscribe({
      query:
        `subscription context {
          context
        }`,
        variables: { },
        context: CTX,
      }, (error, result) => {
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

  it('passes through webSocketRequest to onSubscribe', function(done) {
    const client = new Client(`ws://localhost:${TEST_PORT}/`);
    client.subscribe({
      query: `
        subscription context {
          context
        }
      `,
      variables: { },
    }, (error, result) => {
      assert(false);
    });
    setTimeout(() => {
      assert(onSubscribeSpy.calledOnce);
      expect(onSubscribeSpy.getCall(0).args[2]).to.not.be.undefined;
      done();
    }, 100);
  });

  it('does not send more subscription data after client unsubscribes', function() {
    const client4 = new Client(`ws://localhost:${TEST_PORT}/`);
    setTimeout(() => {
      let subId = client4.subscribe({
        query:
        `subscription useInfo($id: String) {
          user(id: $id) {
            id
            name
          }
        }`,
        operationName: 'useInfo',
        variables: {
          id: 3,
        },
        }, function(error, result) {
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

  it('rejects a client that does not specify a supported protocol', function(done) {
    const client = new W3CWebSocket(`ws://localhost:${TEST_PORT}/`);
    client.onerror = (message: any) => {
      done();
    };
  });

  it('rejects unparsable message', function(done) {
    const client = new W3CWebSocket(`ws://localhost:${TEST_PORT}/`, GRAPHQL_SUBSCRIPTIONS);
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

  it('rejects nonsense message', function(done) {
    const client = new W3CWebSocket(`ws://localhost:${TEST_PORT}/`, GRAPHQL_SUBSCRIPTIONS);
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
    const client = new W3CWebSocket(`ws://localhost:${TEST_PORT}/`,
                                    GRAPHQL_SUBSCRIPTIONS);
    client.onopen = () => {
      client.send(JSON.stringify({type: SUBSCRIPTION_END, id: 'toString'}));
      // Strangely we don't send any acknowledgement for unsubbing from an
      // unknown sub, so we just set a timeout and implicitly assert that
      // there's no uncaught exception within the server code.
      setTimeout(done, 10);
    };
  });

  it('sends back any type of error', function(done) {
    const client = new Client(`ws://localhost:${TEST_PORT}/`);
    client.subscribe({
      query:
        `invalid useInfo{
          error
        }`,
      variables: {},
    }, function(errors, result) {
      client.unsubscribeAll();
      assert.isAbove(errors.length, 0, 'Number of errors is greater than 0.');
      done();
    });
  });

  it('handles errors prior to graphql execution', function(done) {
    // replace the onSubscribeSpy with a custom handler, the spy will restore
    // the original method
    handlers.onSubscribe = (msg: SubscribeMessage, params: SubscriptionOptions, webSocketRequest: WebSocketRequest) => {
      return Promise.resolve(Object.assign({}, params, { context: () => { throw new Error('bad'); } }));
    };
    const client = new Client(`ws://localhost:${TEST_PORT}/`);
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

  it('sends a keep alive signal in the socket', function(done) {
    let client = new W3CWebSocket(`ws://localhost:${KEEP_ALIVE_TEST_PORT}/`, GRAPHQL_SUBSCRIPTIONS);
    let yieldCount = 0;
    client.onmessage = (message: any) => {
      const parsedMessage = JSON.parse(message.data);
      if (parsedMessage.type === SUBSCRIPTION_KEEPALIVE) {
        yieldCount += 1;
        if (yieldCount > 1) {
          client.close();
          done();
        }
      }
    };
  });
});
