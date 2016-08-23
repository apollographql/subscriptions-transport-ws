# test-websocket-server
**(Work in progress!)**
A GraphQL websocket server to facilitate GraphQL subscriptions.
See the [websocket-integration branch](https://github.com/apollostack/GitHunt/branches) on GitHunt for example code.
## Client
### Constructor
- `url: string` : url that the client will connect to

### Methods
#### subscribe(options, handler)
- `options: {SubscriptionOptions}`
    * `query: string` : GraphQL subscription
    * `variables: Object` : GraphQL subscription variables
    * `operationName: string` : operation name of the subscription
- `handler: (error: Object, data: Object) => void` : function to handle any errors and results from the subscription response

#### unsubscribe(id)
- `id: string` : the subscription ID of the subscription to unsubscribe from

## Server
### Constructor
- `options: {ServerOptions}`
    * `schema: GraphQLSchema` : the schema for the data
    * `triggerGenerator: (name: string, args: Object, context?: Object) => Array<{name: string, filter: Function}>` : function which,
     given the name ofa subscription, its arguments, and its operation name, will return a list of actions that trigger it, stored by
     name and a filter function
    * `contextValue?: any` : contextValue to be passed into graphql
    * `rootValue?: any` : rootValue to be passed into graphql
    * `formatResponse?: (GraphQLResult) => Object` : function to format GraphQL response before sending it to client
    * `validationRules?: Array<any>` : array of addition rules to run when validating GraphQL subscription

### Methods
#### triggerAction(triggerObject)
- `triggerObject` : object with information on an action
    * `name: string` : name of the action
    * `rootValue: any` : rootValue to be passed into the GraphQL call of any subscription that is called as a result of the action
    * `contextValue?: any` : contextValue to be passed into the GraphQL call of any subscription that is called as a result of the action
    
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