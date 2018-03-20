---
title: Usage for Integration Testing
---

You can use this package for really nice integration testing. I will demonstrate a use with ApolloClient, but it would work similarly with other clients and servers.

```js
/* eslint-env jest */
import { SubscriptionServer } from "subscriptions-transport-custom-ws";
import { execute, subscribe } from "graphql";
import { ApolloClient } from "apollo-client";
import { InMemoryCache } from "apollo-cache-inmemory";
import { WebSocketLink } from "apollo-link-ws";
import gql from "graphql-tag";
import { PubSub } from "graphql-subscriptions";
import { makeExecutableSchema } from "graphql-tools";
import { Server, WebSocket } from "mock-socket-with-protocol";

// There is a lot of imports here, but most of them would be moved to a separate file, the gqlClient should preferably be imported in
// different spec files, to test different subscriptions/queries/mutations.

const pubsub = new PubSub();
const SOMETHING_CHANGED_TOPIC = "something_changed";

const gqClient = () => {

// setting up schema and resolvers would be externalised usually as well - just import your production schema here
  const resolvers = {
    Subscription: {
      somethingChanged: {
        resolve: payload => payload,
        subscribe: () => pubsub.asyncIterator(SOMETHING_CHANGED_TOPIC)
      }
    }
  };

  const typeDefs = gql`
    type Query {
      empty: String
    }

    type Subscription {
      somethingChanged: String
    }

    schema {
      query: Query
      subscription: Subscription
    }
  `;

  const schema = makeExecutableSchema({
    typeDefs,
    resolvers
  });

// we are not opening any ports - this example of WebSocket client/server uses string matching to know to what server connect a given client
// we should use different string for every test to not share state
  const RANDOM_WS_PORT = Math.floor(Math.random() * 100000);

  const customServer = new Server(`ws://localhost:${RANDOM_WS_PORT}`);

  // We pass customServer instead of typical configuration of a default WebSocket server
  SubscriptionServer.create(
    {
      schema,
      execute,
      subscribe
    },
    customServer
  );

  const wsLink = new WebSocketLink({
    uri: `ws://localhost:${RANDOM_WS_PORT}`,
    webSocketImpl: WebSocket
  });

  return new ApolloClient({
    link: wsLink,
    cache: new InMemoryCache()
  });
};

test(
  "subscription",
  async done => {
    gqClient()
      .subscribe({
        query: gql`
          subscription {
            somethingChanged
          }
        `
      })
      .subscribe({
        next({ data }) {
          expect(data.somethingChanged).toEqual("passedId");
          done();
        },
        error(err) {
          throw new Error(err);
        }
      });

    setTimeout(() => {
      pubsub.publish(SOMETHING_CHANGED_TOPIC, "passedId");
    }, 100);
  },
  1000
);

```

