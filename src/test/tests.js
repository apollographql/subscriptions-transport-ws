import {
  assert,
  expect,
} from 'chai';

import {
  parse,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
  validate,
} from 'graphql';

import { SubscriptionManager } from 'graphql-subscriptions';

import {
  SUBSCRIPTION_FAIL,
  SUBSCRIPTION_DATA,
  SUBSCRIPTION_START,
  SUBSCRIPTION_SUCCESS,
  SUBSCRIPTION_END,
} from '../messageTypes';

import { createServer } from 'http';
import Server from '../server';
import Client from '../client';

const data = {
  "1": {
    "id": "1",
    "name": "Dan"
  },
  "2": {
    "id": "2",
    "name": "Marie"
  },
  "3": {
    "id": "3",
    "name": "Jessie"
  }
};

var userType = new GraphQLObjectType({
  name: 'User',
  fields: {
    id: { type: GraphQLString },
    name: { type: GraphQLString },
  }
});

var schema = new GraphQLSchema({
  query: new GraphQLObjectType({
    name: 'Query',
    fields: {
      testString: { type: GraphQLString },
    }
  }),
  subscription: new GraphQLObjectType({
    name: 'Subscription',
    fields: {
      user: {
        type: userType,
        // `args` describes the arguments that the `user` query accepts
        args: {
          id: { type: GraphQLString }
        },
        // The resolve function describes how to "resolve" or fulfill
        // the incoming query.
        // In this case we use the `id` argument from above as a key
        // to get the User from `data`
        resolve: function (_, args) {
          return data[args.id];
        }
      },
      error: { type: GraphQLString, resolve: () => { throw new Error('E1') } },
    }
  })
});

const subscriptionManager = new SubscriptionManager({
  schema,
  filters: {
    'userInfoFilter1': options => {
      return user => {
        return user.id === options.variables.id;
      }
    },
  }
});

var options = {
  subscriptionManager,
  onSubscribe: (msg, params) => params,
};

var httpServer = createServer(function(request, response) {
    response.writeHead(404);
    response.end();
  });

httpServer.listen(8080, function() {
  console.log("Server is listening on port 8080");
});
var server = new Server(options, httpServer);


describe('Client', function() {

  it('removes subscription when it unsubscribes from it', function() {
    var client = new Client('ws://localhost:8080/');

    setTimeout( () => {
      let sub_id = client.subscribe({
        query:
        `subscription useInfo($id: String) {
          user(id: $id) {
            id
            name
          }
        }`,
        operationName: 'useInfo',
        variables: {
          id: 3
        },
        }, function(error, result) {
          //do nothing
        }
      );
      client.unsubscribe(sub_id);
      assert.notProperty(client.subscriptionHandlers, sub_id);
    }, 100);
  });

  it('should call error handler when graphql result has errors', function(done) {
    var client = new Client('ws://localhost:8080/');

    setTimeout( () => {
    let id = client.subscribe({
        query:
        `subscription useInfo{
          error
        }`,
        operationName: 'useInfo',
        variables: {},
        }, function(error, result) {
          if (error){
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
      subscriptionManager.publish('useInfo', {});
    }, 200);
  });
});

describe('Server', function() {

  it('should send correct results to multiple clients with subscriptions', function(done) {

    var client = new Client('ws://localhost:8080/');
    let client1 = new Client('ws://localhost:8080');

    let num_results = 0;
    setTimeout( () => {
      let id = client.subscribe({
        query:
        `subscription useInfo($id: String) {
          user(id: $id) {
            id
            name
          }
        }`,
        operationName: 'useInfo',
        variables: {
          id: 3
        },

      }, function(error, result) {
        if (error) {
          assert(false);
        }
        if (result) {
          assert.property(result, 'user');
          assert.equal(result.user.id, '3');
          assert.equal(result.user.name, 'Jessie');
          num_results++;
        } else {
          // pass
        }
        // if both error and result are null, this was a SUBSCRIPTION_SUCCESS message.
      });
    }, 100);

    var client_1 = new Client('ws://localhost:8080/');
    let num_results_1 = 0;
    setTimeout(function() {
      let id_1 = client_1.subscribe({
        query:
        `subscription useInfo($id: String) {
          user(id: $id) {
            id
            name
          }
        }`,
        operationName: 'useInfo',
        variables: {
          id: 2
        },

      }, function(error, result) {

      if (error) {
        assert(false);
      }
      if (result) {
        assert.property(result, 'user');
        assert.equal(result.user.id, '2');
        assert.equal(result.user.name, 'Marie');
        num_results_1++;
      }
      // if both error and result are null, this was a SUBSCRIPTION_SUCCESS message.
      });
    }, 100);

    setTimeout(() => {
      subscriptionManager.publish('useInfo', {});
    }, 200);

    setTimeout(() => {
      client.unsubscribeAll();
      expect(num_results).to.equals(1);
      client1.unsubscribeAll();
      expect(num_results_1).to.equals(1);
      done();
    }, 300);

  });

  it('should send a subscription_fail message to client with invalid query', function(done) {
    var client_1 = new Client('ws://localhost:8080/');
    setTimeout(function() {
      client_1.client.onmessage = (message) => {
        let message_data = JSON.parse(message.data);
        assert.equal(message_data.type, SUBSCRIPTION_FAIL);
        assert.isAbove(message_data.payload.errors.length, 0, 'Number of errors is greater than 0.');
        done();
      };
      client_1.subscribe({
        query:
        `subscription useInfo($id: String) {
          user(id: $id) {
            id
            birthday
          }
        }`,
        operationName: 'useInfo',
        variables: {
          id: 3
        },
        }, function(error, result) {
          //do nothing
        }
      );
    }, 100);

  });

  it('should set up the proper filters when subscribing', function(done) {
    let num_triggers = 0;
    var client_3 = new Client('ws://localhost:8080/');
    var client_4 = new Client('ws://localhost:8080/');
    setTimeout(() => {
      client_3.subscribe({
        query:
          `subscription userInfoFilter1($id: String) {
            user(id: $id) {
              id
              name
            }
          }`,
          operationName: 'userInfoFilter1',
          variables: {
            id: 3
          },
          triggers: [{name: 'mutation bye', fortune_cookie: 'unlucky'}],
        }, (error, result) => {
          if (error){
            assert(false);
          }
          if (result) {
            num_triggers += 1;
            assert.property(result, 'user');
            assert.equal(result.user.id, '3');
            assert.equal(result.user.name, 'Jessie');
          }
          // both null means it's a SUBSCRIPTION_SUCCESS message
        }
      );
      client_4.subscribe({
        query:
          `subscription userInfoFilter1($id: String) {
            user(id: $id) {
              id
              name
            }
          }`,
          operationName: 'userInfoFilter1',
          variables: {
            id: 1
          },
        }, (error, result) => {
          if (result) {
            num_triggers += 1;
            assert.property(result, 'user');
            assert.equal(result.user.id, '1');
            assert.equal(result.user.name, 'Dan');
          }
          if (error) {
            assert(false);
          }
          // both null means SUBSCRIPTION_SUCCESS
        }
      );
    }, 100);
    setTimeout(() => {
      subscriptionManager.publish('userInfoFilter1', { id: 1 });
      subscriptionManager.publish('userInfoFilter1', { id: 2 });
      subscriptionManager.publish('userInfoFilter1', { id: 3 });
    }, 200);
    setTimeout(() => {
      assert.equal(num_triggers, 2);
      done();
    }, 300);
  });

  it('does not send more subscription data after client unsubscribes', function() {
    var client_4 = new Client('ws://localhost:8080/');
    setTimeout(() => {
      let sub_id = client_4.subscribe({
        query:
        `subscription useInfo($id: String) {
          user(id: $id) {
            id
            name
          }
        }`,
        operationName: 'useInfo',
        variables: {
          id: 3
        },
        }, function(error, result) {
          //do nothing
        }
      );
      client_4.unsubscribe(sub_id);
    }, 100);
    setTimeout(() => {
      subscriptionManager.publish('useInfo', {});
    }, 200);

    client_4.client.onmessage = (message) => {
      if (JSON.parse(message.data).type === SUBSCRIPTION_DATA) {
        assert(false);
      }
    };
  });
});


