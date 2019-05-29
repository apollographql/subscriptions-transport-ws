---
title: Authentication Over WebSocket
---

You can use `SubscriptionServer` lifecycle hooks to create an authenticated transport by using `onConnect` to validate the connection.

`SubscriptionsClient` supports `connectionParams` ([example available here](https://www.apollographql.com/react/advanced/subscriptions/#authentication)) that will be sent with the first WebSocket message. All GraphQL subscriptions are delayed until the connection has been fully authenticated and your `onConnect` callback returns a truthy value.

You can use these `connectionParams` in your `onConnect` callback and validate the user credentials. You can also
 extend the GraphQL context of the current user's subscription with the authenticated user data.

```js
import { execute, subscribe } from 'graphql';
import { SubscriptionServer } from 'subscriptions-transport-ws';
import { schema } from './schema';

const validateToken = (authToken) => {
    // ... validate token and return a Promise, rejects in case of an error
}

const findUser = (authToken) => {
    return (tokenValidationResult) => {
        // ... finds user by auth token and return a Promise, rejects in case of an error
    }
}

const subscriptionsServer = new SubscriptionServer(
  {
    execute,
    subscribe,
    schema,
    onConnect: (connectionParams, webSocket) => {
       if (connectionParams.authToken) {
            return validateToken(connectionParams.authToken)
                .then(findUser(connectionParams.authToken))
                .then((user) => {
                    return {
                        currentUser: user,
                    };
                });
       }

       throw new Error('Missing auth token!');
    }
  },
  {
    server: websocketServer
  }
);
```

The example above validates the user's token that is sent with the first initialization message on the transport, then it looks up the user and returns the user object as a Promise. The user object found will be available as `context.currentUser` in your GraphQL resolvers.

In case of an authentication error, the Promise will be rejected, and the client's connection will be rejected as well.
