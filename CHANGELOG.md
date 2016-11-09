# Changelog

### vNEXT

- Added ability to send headers on connection (sent on `SUBSCRIPTION_START` message), and use them on the server side using `onSubscribe` callback (useful for authorization, custom connection properties). You can use this feature to authorize the custom and then build the context object in the server side.
- ...

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
