var assert = require('chai').assert;
var Client = require('../src/client.js');
var graphql_tools = require('graphql-tools');
var graphql = require('graphql');
var casual = require('casual-browserify');
var http = require('http');
var Server = require('../src/server.js');
var data = require('../data.json');
var index = require('../index.js');

const triggerGen = function(message_data) {
  if ((message_data.query).startsWith('query useInfo')) {
    return [{name: 'mutation auto'}];
  }
}

var userType = new graphql.GraphQLObjectType({
  name: 'User',
  fields: {
    id: { type: graphql.GraphQLString },
    name: { type: graphql.GraphQLString },
  }
});

var options = {};

var schema = new graphql.GraphQLSchema({
  query: new graphql.GraphQLObjectType({
    name: 'Query',
    fields: {
      user: {
        type: userType,
        // `args` describes the arguments that the `user` query accepts
        args: {
          id: { type: graphql.GraphQLString }
        },
        // The resolve function describes how to "resolve" or fulfill
        // the incoming query.
        // In this case we use the `id` argument from above as a key
        // to get the User from `data`
        resolve: function (_, args) {
          return data[args.id];
        }
      }
    }
  })
});

options.schema = schema;
options.triggerGenerator = triggerGen;

var httpServer = http.createServer(function(request, response) {
    response.writeHead(404);
    response.end();
  });

httpServer.listen(8080, function() {
  console.log("Server is listening on port 8080");
});
var server = new Server(options, httpServer);
var client = new Client('ws://localhost:8080/', 'graphql-protocol');

describe('Client', function() {
  it('should connect to the correct url with the correct protocol', function() {
    assert.equal(client.url, 'ws://localhost:8080/');
    assert.equal(client.protocol, 'graphql-protocol');
  });

  it.skip('should call error handler when connection fails', function(done) {
    var client_1 = new Client('ws://localhost:6000/', 'graphql-protocol');
    client_1.openConnection((error) => {
      assert(true);
      done();
    });
  });

  it('removes subscription when it unsubscribes from it', function() {
    let sub_id = client.subscribe({
      query: 
      `query useInfo($id: String) {
        user(id: $id) {
          id
          name
        }
      }`,
      variables: {
        id: 3
      },
      pollingInterval: 100,
      }, function(error, result) {
        //do nothing
      }
    );
    client.unsubscribe(sub_id);
    assert.notProperty(client.subscriptions, sub_id);
  });

  it.skip('should call error handler when graphql result has errors', function(done) {
    let id = client.subscribe({
      query: 
      `query useInfo($id: String) {
        user(id: $id) {
          id
          name
        }
      }`,
      variables: {
        id: 6
      },
      pollingInterval: 100,
      }, function(error, result) {
        client.unsubscribe(id);
        done();
      }
    );
  });
});

describe('Server', function() {
  it('should accept multiple distinct connections', function() {
    var client_1 = new Client('ws://localhost:8080/', 'graphql-protocol');
    var client_2 = new Client('ws://localhost:8080/', 'graphql-protocol');
    setTimeout(function() {
      assert.notEqual(client_1, client_2);
    }, 100);
  });

  it('should poll correct results to client for a subscription', function(done) {
    let pollCount = 0;
    setTimeout(function() {
      let id = client.subscribe({
        query: 
        `query useInfo($id: String) {
          user(id: $id) {
            id
            name
          }
        }`,
        variables: {
          id: 3
        },
        pollingInterval: 100,
      }, function(error, result) {
        pollCount += 1;
        assert.property(result, 'user');
        assert.equal(result.user.id, '3');
        assert.equal(result.user.name, 'Jessie');
        if (pollCount == 3) {
          client.unsubscribe(id);
          done();
        }
      });
    }, 500);

  });

  it('should poll correct results to client for multiple subscriptions', function(done) {
    let pollCount_1 = 0;
    let pollCount_2 = 0;

    let id_1 = client.subscribe({
      query: 
      `query useInfo($id: String) {
        user(id: $id) {
          id
          name
        }
      }`,
      variables: {
        id: 3
      },
      pollingInterval: 100,
    }, function(error, result) {
      pollCount_1 += 1;
      assert.property(result, 'user');
      assert.equal(result.user.id, '3');
      assert.equal(result.user.name, 'Jessie');   
    });
    let id_2 = client.subscribe({
      query: 
      `query useInfo($id: String) {
        user(id: $id) {
          id
          name
        }
      }`,
      variables: {
        id: 2
      },
      pollingInterval: 100,
    }, function(error, result) {
        pollCount_2 += 1;
        assert.property(result, 'user');
        assert.equal(result.user.id, '2');
        assert.equal(result.user.name, 'Marie');
      }
    );
    setTimeout(function() {
      if (pollCount_1 > 3 && pollCount_2 > 3) {
        client.unsubscribe(id_1);
        client.unsubscribe(id_2);
        done();
      }
    }, 1000);
  }); 

  it('should send correct results to multiple clients with subscriptions', function(done) {
    let pollCount_1 = 0;
    let pollCount_2 = 0;

    let id = client.subscribe({
      query: 
      `query useInfo($id: String) {
        user(id: $id) {
          id
          name
        }
      }`,
      variables: {
        id: 3
      },
      pollingInterval: 100,
    }, function(error, result) {
      pollCount_1 += 1;
      assert.property(result, 'user');
      assert.equal(result.user.id, '3');
      assert.equal(result.user.name, 'Jessie');
    });

    var client_1 = new Client('ws://localhost:8080/', 'graphql-protocol');
    setTimeout(function() {
      let id_1 = client_1.subscribe({
        query: 
        `query useInfo($id: String) {
          user(id: $id) {
            id
            name
          }
        }`,
        variables: {
          id: 2
        },
        pollingInterval: 100,
      }, function(error, result) {
        pollCount_2 += 1;
        assert.property(result, 'user');
        assert.equal(result.user.id, '2');
        assert.equal(result.user.name, 'Marie');
        if (pollCount_1 > 3 && pollCount_2 > 3) {
          client_1.unsubscribe(id_1);
          client.unsubscribe(id);
          done();
        }
      });
    }, 100);
  });

  it('does not call subscribe handler when client unsubscribes', function() {
    let sub_id = client.subscribe({
      query: 
      `query useInfo($id: String) {
        user(id: $id) {
          id
          name
        }
      }`,
      variables: {
        id: 3
      },
      pollingInterval: 100,
      }, function(error, result) {
        assert(false);
      }
    );
    client.unsubscribe(sub_id);
  });

  it('should send a subscription_fail message to client with invalid query', function(done) {
    var client_1 = new Client('ws://localhost:8080/', 'graphql-protocol');
    setTimeout(function() {
      client_1.client.onmessage = (message) => {
        let message_data = JSON.parse(message.data);
        assert.equal(message_data.type, 'subscription_fail');
        assert.isAbove(message_data.errors.length, 0, 'Number of errors is greater than 0.');
        done();
      };
      client_1.subscribe({
        query: 
        `query useInfo($id: String) {
          user(id: $id) {
            id
            birthday
          }
        }`,
        variables: {
          id: 3
        },
        pollingInterval: 100,
        }, function(error, result) {
          //do nothing
        }
      );
    }, 100);

  });

  it('should correctly handle query triggers', function(done) {
    let num_triggers = 0;
    var client_3 = new Client('ws://localhost:8080/', 'graphql-protocol');
    setTimeout(() => {
      client_3.subscribe({
        query: 
          `query useInfo($id: String) {
            user(id: $id) {
              id
              name
            }
          }`,
          variables: {
            id: 3
          },
          triggers: [{name: 'mutation hi', fortune_cookie: 'lucky'}],
        }, (error, result) => {
          num_triggers += 1;
          assert.property(result, 'user');
          assert.equal(result.user.id, '3');
          assert.equal(result.user.name, 'Jessie');
        }
      );
    }, 100);
    setTimeout(() => {
      server.triggerAction({
        name: 'mutation hi',
        fortune_cookie: 'lucky'
      });
    }, 500);
    setTimeout(() => {
      assert.equal(num_triggers, 1);
      done();
    }, 1000);
  });

  it('should correctly handle query triggers for multiple clients with different subscriptions', function(done) {
    let num_triggers = 0;
    var client_3 = new Client('ws://localhost:8080/', 'graphql-protocol');
    var client_4 = new Client('ws://localhost:8080/', 'graphql-protocol');
    setTimeout(() => {
      client_3.subscribe({
        query: 
          `query useInfo($id: String) {
            user(id: $id) {
              id
              name
            }
          }`,
          variables: {
            id: 3
          },
          triggers: [{name: 'mutation bye'}],
        }, (error, result) => {
          num_triggers += 1;
          assert.property(result, 'user');
          assert.equal(result.user.id, '3');
          assert.equal(result.user.name, 'Jessie');
        }
      );
      client_4.subscribe({
        query: 
          `query useInfo($id: String) {
            user(id: $id) {
              id
              name
            }
          }`,
          variables: {
            id: 1
          },
          triggers: [{name: 'mutation bye'}],
        }, (error, result) => {
          num_triggers += 1;
          assert.property(result, 'user');
          assert.equal(result.user.id, '1');
          assert.equal(result.user.name, 'Dan');
        }
      );
    }, 100);
    setTimeout(() => {
      server.triggerAction({
        name: 'mutation bye',
      });
    }, 500);
    setTimeout(() => {
      assert.equal(num_triggers, 2);
      done();
    }, 1000);
  });

  it('should correctly distinguish between subscriptions with different properties', function(done) {
    let num_triggers = 0;
    var client_3 = new Client('ws://localhost:8080/', 'graphql-protocol');
    var client_4 = new Client('ws://localhost:8080/', 'graphql-protocol');
    setTimeout(() => {
      client_3.subscribe({
        query: 
          `query useInfo($id: String) {
            user(id: $id) {
              id
              name
            }
          }`,
          variables: {
            id: 3
          },
          triggers: [{name: 'mutation bye', fortune_cookie: 'unlucky'}],
        }, (error, result) => {
          num_triggers += 1;
          assert.property(result, 'user');
          assert.equal(result.user.id, '3');
          assert.equal(result.user.name, 'Jessie');
        }
      );
      client_4.subscribe({
        query: 
          `query useInfo($id: String) {
            user(id: $id) {
              id
              name
            }
          }`,
          variables: {
            id: 1
          },
          triggers: [{name: 'mutation bye', fortune_cookie: 'lucky'}],
        }, (error, result) => {
          num_triggers += 1;
          assert.property(result, 'user');
          assert.equal(result.user.id, '1');
          assert.equal(result.user.name, 'Dan');
        }
      );
    }, 100);
    setTimeout(() => {
      server.triggerAction({
        name: 'mutation bye',
        fortune_cookie: 'lucky'
      });
    }, 500);
    setTimeout(() => {
      assert.equal(num_triggers, 1);
      done();
    }, 1000);
  });

  it('should correctly generate triggers', function(done) {
    let num_triggers = 0;
    var client_3 = new Client('ws://localhost:8080/', 'graphql-protocol');
    var client_4 = new Client('ws://localhost:8080/', 'graphql-protocol');
    setTimeout(() => {
      client_3.subscribe({
        query: 
          `query useInfo($id: String) {
            user(id: $id) {
              id
              name
            }
          }`,
          variables: {
            id: 3
          },
          triggers: [{name: 'mutation bye', fortune_cookie: 'unlucky'}],
        }, (error, result) => {
          assert(false);
          num_triggers += 1;
          assert.property(result, 'user');
          assert.equal(result.user.id, '3');
          assert.equal(result.user.name, 'Jessie');
        }
      );
      client_4.subscribe({
        query: 
          `query useInfo($id: String) {
            user(id: $id) {
              id
              name
            }
          }`,
          variables: {
            id: 1
          },
        }, (error, result) => {
          num_triggers += 1;
          assert.property(result, 'user');
          assert.equal(result.user.id, '1');
          assert.equal(result.user.name, 'Dan');
        }
      );
    }, 100);
    setTimeout(() => {
      server.triggerAction({
        name: 'mutation auto',
      });
    }, 500);
    setTimeout(() => {
      assert.equal(num_triggers, 1);
      done();
    }, 1000);
  });

  it('does not send more subscription data after client unsubscribes', function() {
    var client_4 = new Client('ws://localhost:8080/', 'graphql-protocol');
    setTimeout(() => {
      let sub_id = client_4.subscribe({
        query: 
        `query useInfo($id: String) {
          user(id: $id) {
            id
            name
          }
        }`,
        variables: {
          id: 3
        },
        pollingInterval: 100,
        }, function(error, result) {
          //do nothing
        }
      );
      client_4.unsubscribe(sub_id);
    }, 300);

    client_4.client.onmessage = (message) => {
      if (JSON.parse(message.data).type === 'subscription_data') {
        assert(false);
      }
    };
  }); 
 
});

