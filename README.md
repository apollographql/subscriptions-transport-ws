[![npm version](https://badge.fury.io/js/subscriptions-transport-ws.svg)](https://badge.fury.io/js/subscriptions-transport-ws) [![GitHub license](https://img.shields.io/github/license/apollostack/subscriptions-transport-ws.svg)](https://github.com/apollostack/subscriptions-transport-ws/blob/license/LICENSE)

# subscriptions-transport-ws

**(Work in progress!)**

A GraphQL websocket server and client to facilitate GraphQL subscriptions.

See [GitHunt-API](https://github.com/apollostack/GitHunt-API) and [GitHunt-React](https://github.com/apollostack/GitHunt-React) for an example server and client integration.

## Client
### `Constructor(url, options)`
- `url: string` : url that the client will connect to
- `options?: Object` : optional object to modify default client behavior
  * `timeout: number` : how long the client should wait in ms for a subscription to be started (default 5000 ms)

### Methods
#### `subscribe(options, handler) => id`
- `options: {SubscriptionOptions}`
  * `query: string` : GraphQL subscription
  * `variables: Object` : GraphQL subscription variables
  * `operationName: string` : operation name of the subscription
- `handler: (errors: Error[], result?: any) => void` : function to handle any errors and results from the subscription response

#### `unsubscribe(id) => void`
- `id: string` : the subscription ID of the subscription to unsubscribe from

## Server
### `Constructor(options, httpServer)`
- `options: {ServerOptions}`
  * `subscriptionManager: SubscriptionManager` : GraphQL subscription manager
  * `onSubscribe?: (message: SubscribeMessage, params: SubscriptionOptions, webSocketRequest: WebSocketRequest)` : optional method to create custom params that will be used when resolving this subscription
  * `keepAlive?: number` : optional interval in ms to send `SUBSCRIPTION_KEEPALIVE` messages to all clients
    
## Client-server messages
Each message has a type, as well as associated fields depending on the message type.
### Client -> Server
#### SUBSCRIPTION_START
Client sends this message to start a subscription for a query.
- `query: GraphQLDocument` :  GraphQL subscription
- `variables: Object` : GraphQL subscription variables
- `operationName: string` : operation name of the subscription
- `id: string` : subscription ID

#### SUBSCRIPTION_END
Client sends this message to end a subscription.
- `id: string` : subscription ID of the subscription to be terminated

### Server -> Client
#### SUBSCRIPTION_SUCCESS
The server sends this message to confirm that it has validated the subscription query and
is subscribed to the triggers.
- `id: string` : ID of the subscription that was successfully set up

#### SUBSCRIPTION_FAIL
Server sends this message upon failing to register a subscription. It may also send this message
at any point during the subscription to notify the client the the subscription has been stopped.
- `errors: Array<Object>` : array of errors attributed to the subscription failing on the server
- `id: string` : subscription ID of the subscription that failed on the server

#### SUBSCRIPTION_DATA
GraphQL result sent periodically from server to client according to subscription.
- `payload: GraphQLResult` : GraphQL result from running the subscription
- `id: string` : subscription ID

#### SUBSCRIPTION_KEEPALIVE
Server message sent periodically to keep the client connection alive.
