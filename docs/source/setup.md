---
title: Setup
order: 403
---

<h2 id="setup">PubSub</h2>

`PubSub` is a class that exposes a simple `publish` and `subscribe` API.

It sits between you application's logic and the GraphQL subscriptions engine - it receives a publish command from your app logic and pushing it to your GraphQL execution engine.

`graphql-subscriptions` exposes a default `PubSub` class you can use for a simple usage of data publication.

> Check out how to change the `PubSub` mechanism to an external one [here](/tools/graphql-subscriptions/external-pubsub.html)

To get started, install `graphql-subscriptions` package:

```bash
npm install --save graphql-subscriptions
```

Use your `PubSub` instance for publishing new data over your subscriptions transport, for example:

```js
import { PubSub } from `graphql-subscriptions`;

export const pubsub = new PubSub();

// ... Later in your code, when you want to publish data over subscription, run:

const payload = {
    id: '1',
    content: 'Hello!',
};

pubsub.publish('commentAdded', payload);
```

> At this point, nothing works yet because there is nothing to publish into


<h2 id="subscription-manager">SubscriptionManager</h2>

SubscriptionManager will intercept the published data from the PubSub and execute this data over the GraphQL engine with the selection set from the clients.

Create a new `SubscriptionManager` and pass it the schema and the PubSub instance:

```js
import { SubscriptionManager } from 'graphql-subscriptions';
import mySchema from './schema';
import { pubsub } from './pubsub';

const subscriptionManager = new SubscriptionManager({
  schema: mySchema,
  pubsub: pubsub
});
```

<h2 id="subscription-server">SubscriptionsServer</h2>

`SubscriptionsServer` will manage the WebSocket connection between the `SubscriptionManager` and the clients.

We will use the server provided by the `subscriptions-transport-ws` transport package.

First install the `subscriptions-transport-ws` package:

```bash
npm install --save subscriptions-transport-ws
```

`SubscriptionsServer` gets `SubscriptionManager` instance and a http server:

```js
import { createServer } from 'http';
import { SubscriptionServer } from 'subscriptions-transport-ws';

const WS_PORT = 5000;

// Create WebSocket listener server
const websocketServer = createServer((request, response) => {
  response.writeHead(404);
  response.end();
});

// Bind it to port and start listening
websocketServer.listen(WS_PORT, () => console.log(
  `Websocket Server is now running on http://localhost:${WS_PORT}`
));

const subscriptionsServer = new SubscriptionServer(
  {
    subscriptionManager: subscriptionManager
  },
  {
    server: websocketServer
  }
);
```

<h2 id="filter-subscriptions">Filter Subscriptions</h2>

Somtimes a client will want filter out specific events based on context and arguments.

You can filter subscription's publications per client using `setupFunctions` which is a part of `SubscriptionManager` API.

Let's see an example - for the following server-side subscription, the client want to subscribe only to comments added to a specific repo:

```
subscription($repoName: String!){
  commentAdded(repoFullName: $repoName) { # <-- `commentAdded` is the actual GraphQL subscription name
    id
    content
  }
}
```

Here is the following definition of `setupFunctions` that will filter out all of the `commentAdded` events that are not the requested repository:

```js
const subscriptionManager = new SubscriptionManager({
  schema,
  pubsub,
  setupFunctions: {
    commentAdded: (options, args) => ({
      commentAdded: {
        filter: comment => comment.repository_name === args.repoFullName,
      },
    }),
  },
});
```
