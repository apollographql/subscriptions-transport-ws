---
title: Using an external PubSub Engine (Redis/MQTT)
---

`graphql` also supports any external Pub/Sub system that implements the `AsyncIterator` interface.

By default `graphql-subscriptions` exports an in-memory (`EventEmitter`) event system to re-run subscriptions.

This is not suitable for running in a serious production app, because there is no way to share subscriptions and publishes across many running servers.

There are implementations for the following PubSub systems:

* Redis PubSub using [`graphql-redis-subscriptions`](https://www.npmjs.com/package/graphql-redis-subscriptions)
* MQTT using [`graphql-mqtt-subscriptions`](https://www.npmjs.com/package/graphql-mqtt-subscriptions)
