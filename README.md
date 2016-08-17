# test-websocket-server
**(Work in progress!)**
A GraphQL websocket server to facilitate GraphQL subscriptions.
See the [websocket-integration branch](https://github.com/apollostack/GitHunt/branches) on GitHunt for example code.
## Client
### Constructor
- `url: string` - url that the client will connect to
### Methods
#### subscribe(options, handler)
- `options: {SubscriptionOptions}`
    * `query: string` - GraphQL subscription
    * `variables: Object` - GraphQL subscription variables
    * `operationName: string` - operation name of the subscription
- `handler: (error: Object, data: Object) => void` - function to handle any errors and results from the subscription response

#### unsubscribe(id)
- `id: string` - the subscription ID of the subscription to unsubscribe from

## Server
### Constructor
- `options: {ServerOptions}`
    * `schema: GraphQLSchema` - the schema for the data
    * `triggerGenerator: (name: string, args: Object, context?: Object) => Array<{name: string, filter: Function}>` - function which,
     given the name of a subscription, its arguments, and its operation name, will return a list of actions that trigger it, stored by
     name and a filter function
    * `contextValue?: any` - contextValue to be passed into graphql
    * `rootValue?: any` - rootValue to be passed into graphql
    * `formatResponse?: (GraphQLResult) => Object` - function to format GraphQL response before sending it to client
    * `validationRules?: Array<any>` - array of addition rules to run when validating GraphQL subscription
### Methods
#### triggerAction(triggerObject)
- `triggerObject` - object with information on an action
    * `name: string` - name of the action
    * `rootValue: any` - rootValue to be passed into the GraphQL call of any subscription that is called as a result of the action
    * `contextValue?: any` - contextValue to be passed into the GraphQL call of any subscription that is called as a result of the action
    
## Client-server messages
Each message has a type, as well as associated fields depending on the message type.
### Client -> Server
#### 'subscription_start'
Client sends this message to start a subscription for a query.
- `query: GraphQLDocument` -  GraphQL subscription
- `variables: Object` - GraphQL subscription variables
- `operationName: string` - operation name of the subscription
- `id: string` - subscription ID

#### 'subscription_end'
Client sends this message to end a subscription.
- `id: string` - subscription ID of the subscription to be terminated

### Server -> Client
#### 'subscription_fail'
Server sends this message upon failing to register a subscription, in response to client **subscription_start** message.
- `errors: Array<Object>` - array of errors attributed to the subscription failing on the server
- `id: string` - subscription ID of the subscription that failed on the server

#### 'subscription_data'
GraphQL result sent periodically from server to client according to subscription.
- `payload: GraphQLResult` - GraphQL result from running the subscription
- `id: string` - subscription ID

