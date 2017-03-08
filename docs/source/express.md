---
title: Express
order: 406
---

If you already have an existing Express HTTP server (created with `createServer`), you can add subscriptions on a specific path.

For example: if your server is already running on port 3000 and accepts GraphQL HTTP connections (POST) on the `/graphql` endpoint, you can expose `/subscriptions` as your WebSocket subscriptions endpoint:

```js
import express from 'express';
import bodyParser from 'body-parser';
import { graphqlExpress } from 'graphql-server-express';
import { createServer } from 'http';

const PORT = 3000;
const app = express();

app.use('/graphql', bodyParser.json(), graphqlExpress({ schema: myGraphQLSchema }));

const pubsub = new PubSub();
const subscriptionManager = new SubscriptionManager({
  schema: myGraphQLSchema,
  pubsub: pubsub,
});

const server = createServer(app);

server.listen(PORT, () => {
    new SubscriptionServer({
      subscriptionManager: subscriptionManager,
    }, {
      server: server,
      path: '/subscriptions',
    });
});
```
