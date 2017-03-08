---
title: Lifecycle Events
order: 404
---

`SubscriptionServer` exposes lifecycle hooks you can use to manage your subscription and clients:

* `onConnect` - called upon client connection, with the `connectionParams` passed to `SubscriptionsClient` - you can return a Promise and reject the connection by throwing an exception. The resolved return value will be appended to the GraphQL `context` of your subscriptions.
* `onDisconnect` - called when the client disconnects.
* `onSubscribe` - called when the client subscribes to GraphQL subscription - use this method to create custom params that will be used when resolving this subscription.
* `onUnsubscribe` - called when client unsubscribes from a GraphQL subscription.

```js
const subscriptionsServer = new SubscriptionServer(
  {
    subscriptionManager: subscriptionManager,
    onConnect: (connectionParams, webSocket) => {
        // ...
    },
    onSubscribe: (message, params, webSocket) => {
        // ...
    },
    onUnsubsribe: (webSocket) => {
        // ...
    },
    onDisconnect: (webSocket) => {
        // ...
    }
  },
  {
    server: websocketServer
  }
);
```