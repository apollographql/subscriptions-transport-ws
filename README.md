[![npm version](https://badge.fury.io/js/subscriptions-transport-ws.svg)](https://badge.fury.io/js/subscriptions-transport-ws) [![GitHub license](https://img.shields.io/github/license/apollostack/subscriptions-transport-ws.svg)](https://github.com/apollostack/subscriptions-transport-ws/blob/license/LICENSE)

# subscriptions-transport-ws

**(Work in progress!)**

A GraphQL WebSocket server and client to facilitate GraphQL subscriptions.

> `subscriptions-transport-ws` is an extension for GraphQL, and you can use it with any GraphQL client and server (not only Apollo).

See [GitHunt-API](https://github.com/apollostack/GitHunt-API) and [GitHunt-React](https://github.com/apollostack/GitHunt-React) for an example server and client integration.

# Getting Started

Start by installing the package, using Yarn or NPM:

    Using Yarn:
    $ yarn add subscriptions-transport-ws

    Or, using NPM:
    $ npm install --save subscriptions-transport-ws

> This command also installs this package's dependencies, including `graphql-subscriptions`.

### Server

Starting with the server, create a new simple `SubscriptionsManager`, with a `PubSub` implementation:

```js
import { SubscriptionManager, PubSub } from 'graphql-subscriptions';

const schema = {}; // Replace with your GraphQL schema object
const pubsub = new PubSub();

const subscriptionManager = new SubscriptionManager({
  schema,
  pubsub
});
```

Now, use your `subscriptionManager`, and create your `SubscriptionServer`:

```js
import { createServer } from 'http';
import { SubscriptionServer } from 'subscriptions-transport-ws';

const WS_PORT = 5000;

// Create WebSocket listener server
const websocketServer = createServer((request, response) => {
  response.writeHead(404);
  response.end();
});

// Bind it to port and start listening
websocketServer.listen(WS_PORT, () => console.log(
  `Websocket Server is now running on http://localhost:${WS_PORT}`
));

const subscriptionServer = new SubscriptionServer(
  {
    onConnect: async (connectionParams) => {
      // Implement if you need to handle and manage connection
    },
    subscriptionManager: subscriptionManager
  },
  {
    server: websocketServer,
    path: '/'
  }
);
```

### Client (browser)

For client side, we will use `SubscriptionClient`, and we also need to extend our network interface to use this transport for GraphQL subscriptions:

```js
import {SubscriptionClient, addGraphQLSubscriptions} from 'subscriptions-transport-ws';
import ApolloClient, {createNetworkInterface} from 'apollo-client';

// Create regular NetworkInterface by using apollo-client's API:
const networkInterface = createNetworkInterface({
 uri: 'http://localhost:3000' // Your GraphQL endpoint
});

// Create WebSocket client
const wsClient = new SubscriptionClient(`ws://localhost:5000/`, {
    reconnect: true,
    connectionParams: {
        // Pass any arguments you want for initialization
    }
});

// Extend the network interface with the WebSocket
const networkInterfaceWithSubscriptions = addGraphQLSubscriptions(
    networkInterface,
    wsClient
);

// Finally, create your ApolloClient instance with the modified network interface
const apolloClient = new ApolloClient({
    networkInterface: networkInterfaceWithSubscriptions
});
```

Now, when you want to use subscriptions in client side, use your `ApolloClient` instance, with `subscribe` or `subscribeToMore` (according to your apollo-client usage):

```js
apolloClient.subscribeToMore({
    document: gql`
        subscription onNewItem {
            newItemCreated {
                id
            }
        }`,
    variables: {},
    updateQuery: (prev, {subscriptionData}) => {
        return; // Modify your store and return new state with the new arrived data
    }
});
```

If you don't use any package/modules loader, you can still use this package, by using `unpkg` service, and get the client side package from:

```
https://unpkg.com/subscriptions-transport-ws@VERSION/browser/client.js
```

> Replace VERSION with the latest version of the package.

### Use it with GraphiQL

You can use this package's power with GraphiQL, and subscribe to live-data stream inside GraphiQL.

If you are using the latest version of `graphql-server` flavors (`graphql-server-express`, `graphql-server-koa`, etc...), you already can use it! Make sure to specify `subscriptionsEndpoint` in GraphiQL configuration, and that's it!

For example, `graphql-server-express` users need to add the following:

```js
app.use('/graphiql', graphiqlExpress({
  endpointURL: '/graphql',
  subscriptionsEndpoint: `YOUR_SUBSCRIPTION_ENDPOINT_HERE`,
}));
```

If you are using older version, or another GraphQL server, start by modifying GraphiQL static HTML, and add this package and it's fetcher from CDN:

```html
    <script src="//unpkg.com/subscriptions-transport-ws@0.5.4/browser/client.js"></script>
    <script src="//unpkg.com/graphiql-subscriptions-fetcher@0.0.2/browser/client.js"></script>
```

Then, create `SubscriptionClient` and define the fetcher:

```js
let subscriptionsClient = new window.SubscriptionsTransportWs.SubscriptionClient('SUBSCRIPTION_WS_URL_HERE', {
  reconnect: true
});
let myCustomFetcher = window.GraphiQLSubscriptionsFetcher.graphQLFetcher(subscriptionsClient, graphQLFetcher);
```

> `graphQLFetcher` is the default fetcher, and we use it as fallback for non-subscription GraphQL operations.

And replace your GraphiQL creation logic to use the new fetcher:

```js
ReactDOM.render(
  React.createElement(GraphiQL, {
    fetcher: myCustomFetcher, // <-- here
    onEditQuery: onEditQuery,
    onEditVariables: onEditVariables,
    onEditOperationName: onEditOperationName,
    query: ${safeSerialize(queryString)},
    response: ${safeSerialize(resultString)},
    variables: ${safeSerialize(variablesString)},
    operationName: ${safeSerialize(operationName)},
  }),
  document.body
);
```

# API

## SubscriptionClient
### `Constructor(url, options, connectionCallback)`
- `url: string` : url that the client will connect to
- `options?: Object` : optional, object to modify default client behavior
  * `timeout?: number` : how long the client should wait in ms for a subscription to be started (default 5000 ms)how long the client should wait in ms for a subscription to be started (default 5000 ms)
  * `connectionParams?: Object` : object that will be available as first argument of `onConnect` (in server side)
  * `reconnect?: boolean` : automatic reconnect in case of connection error
  * `reconnectionAttempts?: number` : how much reconnect attempts
  * `connectionCallback?: (error) => {}` : optional, callback that called after the first init message, with the error (if there is one)
- `webSocketImpl: Object` - optional, WebSocket implementation. use this when your environment does not have a built-in native WebSocket (for example, with NodeJS client)

### Methods
#### `subscribe(options, handler) => id`
- `options: {SubscriptionOptions}`
  * `query: string` : GraphQL subscription
  * `variables: Object` : GraphQL subscription variables
  * `operationName: string` : operation name of the subscription
- `handler: (errors: Error[], result?: any) => void` : function to handle any errors and results from the subscription response

#### `unsubscribe(id) => void` - unsubscribes from a specific subscription
- `id: string` : the subscription ID of the subscription to unsubscribe from

#### `unsubscribeAll() => void` - unsubscribes from all active subscriptions.

#### `on(eventName, callback, thisContext) => Function`
- `eventName: string`: the name of the event, available events are: `connect`, `reconnect` and `disconnect`
- `callback: Function`: function to be called when websocket connects and initialized.
- `thisContext: any`: `this` context to use when calling the callback function.
- => Returns an `off` method to cancel the event subscription.

#### `onConnect(callback, thisContext) => Function` - shorthand for `.on('connect', ...)`
- `callback: Function`: function to be called when websocket connects and initialized.
- `thisContext: any`: `this` context to use when calling the callback function.
- => Returns an `off` method to cancel the event subscription.

#### `onReconnect(callback, thisContext) => Function` - shorthand for `.on('reconnect', ...)`
- `callback: Function`: function to be called when websocket re-connects and initialized.
- `thisContext: any`: `this` context to use when calling the callback function.
- => Returns an `off` method to cancel the event subscription.

#### `onDisconnect(callback, thisContext) => Function` - shorthand for `.on('disconnect', ...)`
- `callback: Function`: function to be called when websocket disconnects.
- `thisContext: any`: `this` context to use when calling the callback function.
- => Returns an `off` method to cancel the event subscription.

## Client-side helpers

#### `addGraphQLSubscriptions(networkInterface, wsClient) => void`
- `networkInterface: any` - network interface to extend with `subscribe` and `unsubscribe` methods.
- `wsClient: SubscriptionClient` - network interface to extend with `subscribe` and `unsubscribe` methods.

A quick way to add the `subscribe` and `unsubscribe` functions to the [network interface](http://dev.apollodata.com/core/network.html#createNetworkInterface)


## SubscriptionServer
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
    
## Client-server communication

Each message has a `type` field, which defined in the protocol of this package, as well as associated fields depending on the message type.

### Client -> Server

#### INIT
Client sends this message after connecting, this triggers `onConnect` on the server.
- `payload: Object` : optional parameters that the client specifies in `connectionParams`

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
- `payload: { errors: Array<Object> }` : payload with an array of errors attributed to the subscription failing on the server
- `id: string` : subscription ID of the subscription that failed on the server

#### SUBSCRIPTION_DATA
GraphQL result sent periodically from server to client according to subscription.
- `payload: GraphQLResult` : GraphQL result from running the subscription
- `id: string` : subscription ID

#### KEEPALIVE
Server message sent periodically to keep the client connection alive.

### Messages Flow

This is a demonstration of client-server communication, in order to get a better understanding of the protocol flow:

- Client creates a WebSocket instance using `SubscriptionsClient` object.
- Client sends `INIT` message to the server.
- Server calls `onConnect` callback with the init arguments, waits for init to finish and returns it's return value with `INIT_SUCCESS`, or `INIT_FAIL` in case of `false` or thrown exception from `onConnect` callback.
- Client gets `INIT_SUCCESS` and waits for the client's app to create subscriptions.
- App creates a subscription using `subscribe` client's API, and the `SUBSCRIPTION_START` message sent to the server.
- Server calls `onSubscribe` callback, and responds with `SUBSCRIPTION_SUCCESS` in case of zero errors, or `SUBSCRIPTION_FAIL` if there is a problem with the subscription.
- Client get `SUBSCRIPTION_SUCCESS` and waits for data.
- App triggers `PubSub`'s publication method, and the server publishes the event, passing it through the `graphql-subscriptions` package for filtering and resolving.
- Client receives `SUBSCRIPTION_DATA` with the data, and handles it with `apollo-client` instance.
