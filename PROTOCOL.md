# GraphQL over WebSocket Protocol

## Client-server communication

Each message has a `type` field, which defined in the protocol of this package, as well as associated fields inside `payload` field, depending on the message type.

### Client -> Server

#### GQL_CONNECTION_INIT
Client sends this message after connecting, this triggers `onConnect` on the server.
- `payload: Object` : optional parameters that the client specifies in `connectionParams`

#### GQL_CONNECTION_TERMINATE
Client sends this message to terminate the connection.

#### GQL_START
Client sends this message to execute GraphQL operation
- `query: string` : GraphQL operation as string or parsed GraphQL document node
- `variables?: Object` : Object with GraphQL variables
- `operationName?: string` : GraphQL operation name
- `context?: any` : Execution context for the operation
    
#### GQL_STOP
Client sends this message in order to stop a running GraphQL operation execution (for example: unsubscribe)
- `id: string` : operation id
    
### Server -> Client

#### GQL_CONNECTION_ERROR
The server sends this message if `onConnect` callback returns `false` or throws an exception. after sending this message, the server disconnects the client.
- `payload: Object`: the server side error

#### GQL_CONNECTION_ACK
The server sends this message if `onConnect` callback returns any other value then `false`.

#### GQL_DATA
The server sends this message to transfter the GraphQL execution result from the server to the client.
- `id: string` : ID of the operation that was successfully set up
- `payload: { data: any }` : Execution result
- `payload: { errors?: [] }` : Array of resolvers errors

#### GQL_ERROR
Server sends this message upon failing to **register** or **execute** a GraphQL operation (resolver errors are part of `GQL_DATA` message, and will be added as `errors` array)
- `payload: { errors: Array<Object> }` : payload with an array of errors attributed to the subscription failing on the server
- `id: string` : operation ID of the operation that failed on the server

#### GQL_COMPLETE
Server sends this message to indicate that a GraphQL operation is done, and no more data will arrive (for queries and subscription, it called immediatly, and for subscriptions it called when unsubscribing)
- `id: string` : operation ID of the operation that completed

#### GQL_CONNECTION_KEEP_ALIVE
Server message sent periodically to keep the client connection alive.

### Messages Flow

This is a demonstration of client-server communication, in order to get a better understanding of the protocol flow:

- Server configured with GraphQL schema (and `PubSub` implementation when using subscriptions)
- Client creates a WebSocket instance using `SubscriptionsClient` object.
- Client connected immediatly, or stops and wait if using lazy mode (until first operation execution)
- Client sends `GQL_CONNECTION_INIT` message to the server.
- Server calls `onConnect` callback with the init arguments, waits for init to finish and returns it's return value with `GQL_CONNECTION_ACK`, or `GQL_CONNECTION_ERROR` in case of `false` or thrown exception from `onConnect` callback.
- Client gets `GQL_CONNECTION_ACK` and waits for the client's app to create subscriptions.
- App creates a subscription using `subscribe` or `query` client's API, and the `GQL_START` message sent to the server.
- Server calls `onOperation` callback, and responds with `GQL_DATA` in case of zero errors, or `GQL_ERROR` if there is a problem with the operation.
- Server calls `onOperationDone` if the operation is a query or mutation (for subscriptions, this called when unsubscribing)
- Server sends `GQL_COMPLETE` if the operation is a query or mutation (for subscriptions, this sent when unsubscribing)
- Client get `GQL_DATA` and handles it.

For subscriptions:
- App triggers `PubSub`'s publication method, and the server publishes the event, passing it through the `subscribe` executor to create GraphQL execution result
- Client receives `GQL_DATA` with the data, and handles it.
- When client unsubscribe, the server triggers `onOperationDone` and sends `GQL_COMPLETE` message to the client.

