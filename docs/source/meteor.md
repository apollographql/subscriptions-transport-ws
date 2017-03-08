---
title: Meteor
order: 407
---

Meteor exposes `httpServer` server over a `meteor/web` package, so you can use it the same way as any other http server:

```js
import { WebApp } from 'meteor/webapp';

const pubsub = new PubSub();
const subscriptionManager = new SubscriptionManager({
  schema: myGraphQLSchema,
  pubsub: pubsub,
});

new SubscriptionServer({
  subscriptionManager: subscriptionManager,
}, {
  server: WebApp.httpServer,
  path: '/subscriptions',
});
```
