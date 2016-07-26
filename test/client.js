var assert = require('chai').assert;
var Client = require('../src/client.js');
var graphql_tools = require('graphql-tools');
var graphql = require('graphql');
var casual = require('casual-browserify');
var http = require('http');
var Server = require('../src/server.js');
var data = require('../data.json');

const removeWhiteSpace = function(str) {
  return str.replace(/ /g, '');
}

var userType = new graphql.GraphQLObjectType({
  name: 'User',
  fields: {
    id: { type: graphql.GraphQLString },
    name: { type: graphql.GraphQLString },
  }
});

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
var server = new Server(schema, 8080);
var client = new Client('ws://localhost:8080/', 'graphql-protocol');
client.openConnection();

describe('Client', function() {
  it('should connect to the correct url with the correct protocol', function() {
    assert.equal(client.url, 'ws://localhost:8080/');
    assert.equal(client.protocol, 'graphql-protocol');
  });

  it('should correctly subscribe to a query', function(done) {
    setTimeout(function() {
      client.subscribe({
        query: 
        `query useInfo($id: String) {
          user(id: $id) {
            id
            name
          }
        }`,
        variables: {
          id: 3
        }
      }, (result) => {
        assert.property(result, 'user');
        assert.equal(result.user.id, '3');
        assert.equal(result.user.name, 'Jessie');
        done();
      });
    }, 500);
  });
});
