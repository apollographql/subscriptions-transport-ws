---
title: Usage for Integration Testing
---

You can use this package for setting up integration testing with.
Using a mock for WebSocket allows you to write thousands of decoupled integration tests:
- that don't interfere with each other.
- without finding available open ports.
- that are faster, since they skip the network layer altogether.
- without worry about closing ports.
- can be run in parallel with tools like wallabyjs or jest parallel testing.

Example below uses the ApolloClient, but it would work similarly with other graphql clients and servers.

```js
import { Server, WebSocket } from "mock-socket-with-protocol";
import { SubscriptionServer } from "subscriptions-transport-ws";
// (..) Skipping all the other imports

const gqClient = () => {
// To make the point clear that we are not opening any ports here we use a randomized string that will not produce a correct port number.
// This example of WebSocket client/server uses string matching to know to what server connect a given client.
// We are randomizing because we should use different string for every test to not share state.
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

  // The uri of the WebSocketLink has to match the customServer uri.
  const wsLink = new WebSocketLink({
    uri: `ws://localhost:${RANDOM_WS_PORT}`,
    webSocketImpl: WebSocket
  });

  // Nothing new here
  return new ApolloClient({
    link: wsLink,
    cache: new InMemoryCache()
  });
};

// The test looks exactly the same as if you used a real WebSocket connection.
test(
  "subscription works with custom WebSocket",
  done => {
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
          expect(data.somethingChanged).toEqual("finally");
          done();
        }
      });

    setTimeout(() => {
      pubsub.publish(SOMETHING_CHANGED, "finally");
    }, 100);
  },
  1000
);

```

