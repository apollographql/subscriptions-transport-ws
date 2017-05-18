---
title: Meteor
order: 407
---

Meteor exposes `httpServer` server over a `meteor/web` package, so you can use it the same way as any other http server:

```js
import { WebApp } from 'meteor/webapp';
import { execute, subscribe } from 'graphql';
import { SubscriptionServer } from 'subscripitons-transport-ws';
import { myGraphQLSchema } from './my-schema';

const pubsub = new PubSub();

new SubscriptionServer({
  schema: myGraphQLSchema,
  execute,
  subscribe,
}, {
  server: WebApp.httpServer,
  path: '/subscriptions',
});
```
