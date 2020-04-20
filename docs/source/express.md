---
title: Express
description: ''
---

If you already have an existing Express HTTP server (created with `createServer`), you can add subscriptions on a specific path.

For example: if your server is already running on port 3000 and accepts GraphQL HTTP connections (POST) on the `/graphql` endpoint, you can expose `/subscriptions` as your WebSocket subscriptions endpoint:

```js
import express from 'express';
import bodyParser from 'body-parser';
import { graphqlExpress } from 'apollo-server-express';
import { createServer } from 'http';
import { execute, subscribe } from 'graphql';
import { PubSub } from 'graphql-subscriptions';
import { SubscriptionServer } from 'subscriptions-transport-ws';
import { myGraphQLSchema } from './my-schema';

const PORT = 3000;
const app = express();

app.use('/graphql', bodyParser.json(), graphqlExpress({ schema: myGraphQLSchema }));

const pubsub = new PubSub();
const server = createServer(app);

server.listen(PORT, () => {
    new SubscriptionServer({
      execute,
      subscribe,
      schema: myGraphQLSchema,
    }, {
      server: server,
      path: '/subscriptions',
    });
});
```
