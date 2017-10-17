---
title: Adding Subscriptions To Schema
---

Adding GraphQL subscriptions to your GraphQL schema is simple, since Subscription is just another GraphQL operation type like Query and Mutation.

You specify operation type, then the operation name and you can customize the publication data with a selection set and arguments.

You need to create a root schema definition and a root resolver for your `Subscription` root, just like with Query and Mutation:

```
type Comment {
    id: String
    content: String
}

type Subscription {
  commentAdded(repoFullName: String!): Comment
}

schema {
  query: Query
  mutation: Mutation
  subscription: Subscription
}
```

Create a resolver just like queries and mutations, but instead of function, pass an Object with `subscribe` field and a subscription resolver method.

The subscription resolver method must return `AsyncIterator`, which you can get from using `asyncIterator` method of your `PubSub`:

```js
const rootResolver = {
    Query: () => { ... },
    Mutation: () => { ... },
    Subscription: {
        commentAdded: {
          subscribe: () => pubsub.asyncIterator('commentAdded')
        }
    },
};
```

Then, later in your code, you can publish data to your topic by using `pubsub.publish` with the topic name and the payload you want to publish:

```js
pubsub.publish('commentAdded', { commentAdded: { id: 1, content: 'Hello!' }})
```

<h2 id="subscription-server">Payload Transformation</h2>

When using `subscribe` field, it's also possible to manipulate the event payload before running it through the GraphQL execution engine.

Add `resolve` method near your `subscribe` and change the payload as you wish:


```js
const rootResolver = {
    Subscription: {
        commentAdded: {
          resolve: (payload) => {
            return {
              customData: payload,
            };
          },
          subscribe: () => pubsub.asyncIterator('commentAdded')
        }
    },
};
```
