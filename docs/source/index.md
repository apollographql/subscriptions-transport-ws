---
title: Installation
---

This section details how to set up a GraphQL server to support subscriptions based on `graphql` subscriptions and `subscriptions-transport-ws`.

We will use the `PubSub` implementation from `graphql-subscriptions`, and we will connect it to `subscribe` executor of `graphql`, and publish the data using `subscriptions-transport-ws` (a WebSocket server and client library for GraphQL that can be used directly in a JavaScript app or wired up to a fully-featured GraphQL client like Apollo or Relay.

The process of setting up a GraphQL subscriptions server consist of the following steps:

1. Declaring subscriptions in the GraphQL schema
2. Setup a PubSub instance that our server will publish new events to
3. Hook together `PubSub` event and GraphQL subscription.
4. Setting up `SubscriptionsServer`, a transport between the server and the clients

