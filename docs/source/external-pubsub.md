---
title: Using an external PubSub Engine (Redis/MQTT)
order: 407
---

`graphql-subscriptions` also supports any external Pub/Sub system that implements the subscriptions interface of [`PubSubEngine`](https://github.com/apollographql/graphql-subscriptions/blob/master/src/pubsub.ts#L21-L25).

By default `graphql-subscriptions` uses an in-memory event system to re-run subscriptions. This is not suitable for running in a serious production app, because there is no way to share subscriptions and publishes across many running servers.

There are implementations for the following PubSub systems:

* Redis PubSub using [`graphql-redis-subscriptions`](https://www.npmjs.com/package/graphql-redis-subscriptions)
* MQTT using [`graphql-mqtt-subscriptions`](https://www.npmjs.com/package/graphql-mqtt-subscriptions)
