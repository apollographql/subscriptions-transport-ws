---
title: Adding Subscriptions To Schema
order: 402
---

Adding GraphQL subscriptions to your GraphQL schema is simple, since subscriptions is just another GraphQL operation type like Query and Mutation - 

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

Create a resolver just like queries and mutations if you need to perform a logic over the published data:

```js
const rootResolver = {
    Query: () => { ... },
    Mutation: () => { ... },
    Subscription: {
        commentAdded: comment => {
          // the subscription payload is the comment.
          return comment;
        },
    },
};
```
