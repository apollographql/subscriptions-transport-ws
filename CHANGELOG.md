# Changelog

### vNEXT

### 0.7.3
- Fix for first subscription is never unsubscribed [PR #179](https://github.com/apollographql/subscriptions-transport-ws/pull/179)

### 0.7.2
- Increase default keep-alive timeout to 30s [PR #177](https://github.com/apollographql/subscriptions-transport-ws/pull/177)
- Operation key is now `string` instead of `number` [PR #176](https://github.com/apollographql/subscriptions-transport-ws/pull/176)

### 0.7.1
- Fix for reconnect after manual close [PR #164](https://github.com/apollographql/subscriptions-transport-ws/pull/164)
- test(disconnect): added tests for client-server flow for unsubscribe and disconnect [PR #163](https://github.com/apollographql/subscriptions-transport-ws/pull/163)
- Various dependencies updates [PR #152](https://github.com/apollographql/subscriptions-transport-ws/pull/152) [PR #162](https://github.com/apollographql/subscriptions-transport-ws/pull/162)
- docs(README): fix docs [PR #151](https://github.com/apollographql/subscriptions-transport-ws/pull/151)

### 0.7.0
- Client exposes new asyncronous middleware to modify `OperationOptions` [PR #78](https://github.com/apollographql/subscriptions-transport-ws/pull/78)
- Added `WebSocketServer` error handler to prevent uncaught exceptions. Fixes [Issue #94](https://github.com/apollographql/subscriptions-transport-ws/issues/94)
- Updated `ws` dependency to the lastest.
- Introduce lazy mode for connection, and accept function as `connectionParams` [PR #131](https://github.com/apollographql/subscriptions-transport-ws/pull/131)
- Extend transport protocol to support GraphQL queries and mutations over WebSocket [PR #108](https://github.com/apollographql/subscriptions-transport-ws/pull/108) 
- Added built-in support for `subscribe` from `graphql-js` [PR #133](https://github.com/apollographql/subscriptions-transport-ws/pull/133)
- Fixed infinity reconnects when server accepts connections but its in an error state. [PR #135](https://github.com/apollographql/subscriptions-transport-ws/pull/135)
- Force close client-side socket when using `close()`, and ignore reconnect logic. [PR #137](https://github.com/apollographql/subscriptions-transport-ws/pull/137)
- Added new connection events to give a more accurate control over the connection state [PR #139](https://github.com/apollographql/subscriptions-transport-ws/pull/139). Fixes [Issue #136](https://github.com/apollographql/subscriptions-transport-ws/issues/136).
- Replaced `Object.assign` by `lodash.assign` to extend browser support [PR #144](https://github.com/apollographql/subscriptions-transport-ws/pull/144). Fixes [Issue #141](https://github.com/apollographql/subscriptions-transport-ws/issues/141)

### 0.6.0

- Enabled Greenkeeper and updated dependencies, includes major version bump of ws [PR #90](https://github.com/apollographql/subscriptions-transport-ws/pull/90)

### 0.6.0
- Protocol update to support queries, mutations and also subscriptions. [PR #108](https://github.com/apollographql/subscriptions-transport-ws/pull/108)
- Added support in the server for GraphQL Executor. [PR #108](https://github.com/apollographql/subscriptions-transport-ws/pull/108)
- Added support in the server executor for `graphql-js subscribe`. [PR #846](https://github.com/graphql/graphql-js/pull/846)

### 0.5.5
- Remove dependency on `graphql-tag/printer` per [graphql-tag#54](https://github.com/apollographql/graphql-tag/issues/54) [PR #98](https://github.com/apollographql/subscriptions-transport-ws/pull/98)

### 0.5.4
- Ensure INIT is sent before SUBSCRIPTION_START even when client reconnects [PR #85](https://github.com/apollographql/subscriptions-transport-ws/pull/85)
- Allow data and errors in payload of SUBSCRIPTION_DATA [PR #84](https://github.com/apollographql/subscriptions-transport-ws/pull/84)
- Expose `index.js` as entrypoint for server/NodeJS application to allow NodeJS clients to use `SubscriptionClient` [PR #91](https://github.com/apollographql/subscriptions-transport-ws/pull/91)
- Fixed a bug with missing error message on `INIT_FAIL` message [#88](https://github.com/apollographql/subscriptions-transport-ws/issues/88)

### 0.5.3
- Fixed a bug with `browser` declaration on package.json ([Issue #79](https://github.com/apollographql/subscriptions-transport-ws/issues/79))

### 0.5.2
- Updated dependencies versions
- Fixed typings issue with missing `index.d.ts` file. [PR #73](https://github.com/apollographql/subscriptions-transport-ws/pull/73)
- Transpiling client.js to target browsers using webpack. [PR #77](https://github.com/apollographql/subscriptions-transport-ws/pull/77)

### 0.5.1
- Only attempt reconnect on closed connection. Fixes [Issue #70](https://github.com/apollographql/subscriptions-transport-ws/issues/70)

### 0.5.0

- Updated `graphql-subscriptions@0.3.0`.
- Added `addGraphQLSubscriptions` - use it to extend your network interface to work with `SubscriptionsClient` instance. [PR #64](https://github.com/apollographql/subscriptions-transport-ws/pull/64)
- Client now uses native WebSocket by default, and has optional field to provide another implementation (for NodeJS clients)[PR #53](https://github.com/apollographql/subscriptions-transport-ws/pull/53)
- Client now support INIT with custom object, so you can use if for authorization, or any other init params. [PR #53](https://github.com/apollographql/subscriptions-transport-ws/pull/53)
- Server and client are now separated with `browser` and `main` fields of `package.json`. [PR #53](https://github.com/apollographql/subscriptions-transport-ws/pull/53)
- Client exposes workflow events for connect, disconnect and reconnect. [PR #53](https://github.com/apollographql/subscriptions-transport-ws/pull/53)
- Server exposes new events: `onUnsubscribe`, `onSubscribe`, `onConnect` and `onDisconnect`. [PR #53](https://github.com/apollographql/subscriptions-transport-ws/pull/53)
- Use `ws` package on server side, and expose it's options from server constructor. [PR #53](https://github.com/apollographql/subscriptions-transport-ws/pull/53)

### v0.4.0

- Don't throw in the server on certain unsub messages.
[PR #54](https://github.com/apollostack/subscriptions-transport-ws/pull/54)
- Moved typings to `@types/graphql`.
[PR #60](https://github.com/apollostack/subscriptions-transport-ws/pull/60)

### v0.3.1

- Server now passes back subscriptionManager errors encountered during publish.
[PR #42](https://github.com/apollostack/subscriptions-transport-ws/pull/42)

### v0.3.0

- (SEMVER-MINOR) Bump graphql-subscriptions dependency to ^0.2.0 which changes the setupFunctions format
- Fix missing unsubscription from first (id = 0) subscription

### v0.2.6

- Add `reconnect` and `reconnectionAttempts` options to the constructor which will enable reconnection with exponential backoff.

### v0.2.5

- Pass WebSocketRequest to onSubscribe to support reading HTTP headers when creating a subscription

### v0.2.4

- Server reports back an error on an unparsable client message
- Server reports back an error on an unsupported client message type
- Fix intermittent failure in timeout test case
- Standardize server and client errors handling to always create an array of errors with a message property
