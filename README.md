[![npm version](https://badge.fury.io/js/subscriptions-transport-ws.svg)](https://badge.fury.io/js/subscriptions-transport-ws) [![GitHub license](https://img.shields.io/github/license/apollostack/subscriptions-transport-ws.svg)](https://github.com/apollostack/subscriptions-transport-ws/blob/license/LICENSE)

# subscriptions-transport-ws

**(Work in progress!)**

A GraphQL websocket server and client to facilitate GraphQL subscriptions.

See [GitHunt-API](https://github.com/apollostack/GitHunt-API) and [GitHunt-React](https://github.com/apollostack/GitHunt-React) for an example server and client integration.

## Client
### `Constructor(url, options, connectionCallback)`
- `url: string` : url that the client will connect to
- `options?: Object` : optional, object to modify default client behavior
  * `timeout?: number` : how long the client should wait in ms for a subscription to be started (default 5000 ms)how long the client should wait in ms for a subscription to be started (default 5000 ms)
  * `connectionParams?: Object` : object that will be available as first argument of `onConnect` (in server side)
  * `reconnect?: boolean` : automatic reconnect in case of connection error
  * `reconnectionAttempts?: number` : how much reconnect attempts
  * `connectionCallback?: (error) => {}` : optional, callback that called after the first init message, with the error (if there is one)

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
### `Constructor(options, socketOptions)`
- `options: {ServerOptions}`
  * `subscriptionManager: SubscriptionManager` : GraphQL subscription manager
  * `onSubscribe?: (message: SubscribeMessage, params: SubscriptionOptions, webSocket: WebSocket)` : optional method to create custom params that will be used when resolving this subscription
  * `onUnsubscribe?: (webSocket: WebSocket)` : optional method that called when a client unsubscribe
  * `onConnect?: (connectionParams: Object, webSocket: WebSocket)` : optional method that called when a client connects to the socket, called with the `connectionParams` from the client, if the return value is an object, its elements will be added to the context. return `false` or throw an exception to reject the connection. May return a Promise.
  * `onDisconnect?: (webSocket: WebSocket)` : optional method that called when a client disconnects
  * `keepAlive?: number` : optional interval in ms to send `KEEPALIVE` messages to all clients
- `socketOptions: {WebSocket.IServerOptions}` : options to pass to the WebSocket object (full docs [here](https://github.com/websockets/ws/blob/master/doc/ws.md))    
  * `server?: HttpServer` - existing HTTP server to use (use without `host`/`port`)
  * `host?: string` - server host
  * `port?: number` - server port
  * `path?: string` - endpoint path
    
## Client-server messages
Each message has a type, as well as associated fields depending on the message type.
### Client -> Server

#### INIT
Client sends this message after connecting, this triggers `onConnect` on the server.

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

#### INIT_FAIL
The server sends this message if `onConnect` callback returns `false` or throws an exception. after sending this message, the server disconnects the client.
- `payload: Object`: the server side error

#### INIT_SUCCESS
The server sends this message if `onConnect` callback returns any other value then `false`.

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

#### KEEPALIVE
Server message sent periodically to keep the client connection alive.
