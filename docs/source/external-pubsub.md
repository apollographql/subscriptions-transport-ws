---
title: Using an external PubSub Engine
---

`graphql` also supports any external PubSub system that implements the `AsyncIterator` interface.

By default `graphql-subscriptions` exports an in-memory (`EventEmitter`) event system to re-run subscriptions.

This is not suitable for running in a serious production app, because there is no way to share subscriptions and publishes across many running servers.

[`graphql-subscriptions` - PubSub Implementations](https://github.com/apollographql/graphql-subscriptions#pubsub-implementations) lists existing external PubSub implementations.
