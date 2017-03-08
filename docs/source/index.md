---
title: Installing
order: 401
---

This section details how to set up a GraphQL server to support subscriptions based on `graphql-subscriptions` and `subscriptions-transport-ws`. 

`graphql-subscriptions` is a transport-agnostic JavaScript utility that helps you execute GraphQL subscription on your NodeJS server. `subscriptions-transport-ws` is a WebSocket server and client library for GraphQL subscriptions that complements `graphql-subscriptions` and can be used directly in a JavaScript app or wired up to a fully-featured GraphQL client like Apollo or Relay.

The process of setting up a GraphQL subscriptions server consist of the following steps:

1. Declaring subscriptions in the GraphQL schema
2. Setup a PubSub instance that our server we will publish new events to
3. Connecting the PubSub mechanism to the schema with `SubscriptionManager` that will receive publications from the PubSub and resolve them through GraphQL executer
4. Setting up `SubscriptionsServer`, a transport between the server and the clients