---
title: Setup
---

## PubSub

`PubSub` is a class that exposes a simple `publish` and `subscribe` API.

It sits between your application's logic and the GraphQL subscriptions engine - it receives a publish command from your app logic and pushes it to your GraphQL execution engine.

`graphql-subscriptions` exposes a default `PubSub` class you can use for a simple usage of data publication.

The `PubSub` implementation also includes a mechanism that converts a specific `PubSub` event into a stream of `AsyncIterator`, which you can use with `graphql` subscriptions resolver.

> Check out how to change the `PubSub` mechanism to an external one [here](/external-pubsub/)

To get started, install `graphql-subscriptions` package:

```bash
npm install --save graphql-subscriptions
```

Use your `PubSub` instance for publishing new data over your subscriptions transport, for example:

```js
import { PubSub } from 'graphql-subscriptions';

export const pubsub = new PubSub();

// ... Later in your code, when you want to publish data over subscription, run:

const payload = {
    commentAdded: {
        id: '1',
        content: 'Hello!',
    }
};

pubsub.publish('commentAdded', payload);
```

> At this point, nothing works yet because there is nothing to publish into

## SubscriptionServer

`SubscriptionServer` will manage the WebSocket connection between the GraphQL engine and the clients.

We will use the server provided by the `subscriptions-transport-ws` transport package.

First install the `subscriptions-transport-ws` package:

```bash
npm install --save subscriptions-transport-ws
```

`SubscriptionServer` expect a `schema`, `execute` and `subscribe` (optional) and a http server. Here is complete setup code, supporting both queries and subscriptions.

```js
import express from 'express';
import {
  graphqlExpress,
  graphiqlExpress,
} from 'apollo-server-express';
import bodyParser from 'body-parser';
import cors from 'cors';
import { execute, subscribe } from 'graphql';
import { createServer } from 'http';
import { SubscriptionServer } from 'subscriptions-transport-ws';

import { schema } from './src/schema';

const PORT = 3000;
const server = express();

server.use('*', cors({ origin: `http://localhost:${PORT}` }));

server.use('/graphql', bodyParser.json(), graphqlExpress({
  schema
}));

server.use('/graphiql', graphiqlExpress({
  endpointURL: '/graphql',
  subscriptionsEndpoint: `ws://localhost:${PORT}/subscriptions`
}));

// Wrap the Express server
const ws = createServer(server);
ws.listen(PORT, () => {
  console.log(`Apollo Server is now running on http://localhost:${PORT}`);
  // Set up the WebSocket for handling GraphQL subscriptions
  new SubscriptionServer({
    execute,
    subscribe,
    schema
  }, {
    server: ws,
    path: '/subscriptions',
  });
});

```

See [the tutorial on Medium for complete working sample code](https://blog.apollographql.com/tutorial-graphql-subscriptions-server-side-e51c32dc2951).

## Subscription Resolver

To connect the published event from our `PubSub` to GraphQL engine, we need to create `AsyncIterable` and use it in the GraphQL subscription resolver definition.

You can see [an example for creating subscription resolver here](/subscriptions-to-schema/)

## Filter Subscriptions

Sometimes a client will want filter out specific events based on context and arguments.

To do so, we can use `withFilter` helper from this package, which wraps `AsyncIterator` with a filter function, and let you control each publication for each user.

Let's see an example - for the `commentAdded` server-side subscription, the client want to subscribe only to comments added to a specific repo:

```graphql
subscription($repoName: String!){
  commentAdded(repoFullName: $repoName) {
    id
    content
  }
}
```

When using `withFilter`, provide a filter function, which executed with the payload (the published value), variables, context and operation info, and it must return boolean or Promise<boolean> indicating if the payload should pass to the subscriber.

Here is the following definition of the subscription resolver, with `withFilter` that will filter out all of the `commentAdded` events that are not the requested repository:

```js
import { withFilter } from 'graphql-subscriptions';

const rootResolver = {
    Query: () => { ... },
    Mutation: () => { ... },
    Subscription: {
        commentAdded: {
          subscribe: withFilter(() => pubsub.asyncIterator('commentAdded'), (payload, variables) => {
             return payload.commentAdded.repository_name === variables.repoFullName;
          }),
        }
    },
};
```
