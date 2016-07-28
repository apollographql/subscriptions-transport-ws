# test-websocket-server
**(Work in progress!)**
A GraphQL websocket server to facilitate GraphQL subscriptions (see [Kadira's blog post](https://kadira.io/blog/graphql/subscriptions-in-graphql) for more info). 
## The Goal
Clients should be able to subscribe to certain queries. For each subscription, the server should send a result for a query subscription every client-specified polling interval. Possible applications include getting information about new comments or deleted comments.
## How is this different from a live query system (Meteor's)?
A GraphQL subscription system allows developers to specify exactly which data they want to look out for and how to handle that data. Meteor's live query system watches for all changes - this is hard to scale, because it gets more expensive as the number of possible data mutations grows.
## Client-server messages
Each message has a type, as well as associated fields depending on the message type.
### Client -> Server
#### 'subscription_start'
Client sends this message to start a subscription for a query.
##### query
GraphQL query string
##### variables
GraphQL query variables
##### id
Client-generated subscription id
#### 'subscription_end'
Client sends this message to end a subscription.
##### subscription_id
The id of the subscription that will be terminated.

### Server -> Client
#### 'subscription_fail'
Server sends this message upon failing to register a subscription, in response to client **subscription_start** message.
##### errors
Array of errors
##### id
ID of subscription that failed to be registered on the server.
#### 'subscription_data'
GraphQL result sent periodically from server to client according to subscription.
##### result
GraphQL result
##### id
Subscription id
