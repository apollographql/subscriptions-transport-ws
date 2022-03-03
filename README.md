# `subscriptions-transport-ws` is no longer maintained

`subscriptions-transport-ws` was the first implementation of a WebSocket-based GraphQL subscriptions transport in TypeScript. It was created in 2016 and was largely unmaintained after 2018.

Users should migrate to [`graphql-ws`](https://github.com/enisdenjo/graphql-ws), a newer actively-maintained implementation of a similar protocol.

Note that the packages implement distinct protocols, so you must migrate all clients and servers.

If you're using subscriptions with the Apollo platform, the [Apollo Server docs](https://www.apollographql.com/docs/apollo-server/data/subscriptions/#switching-from-subscriptions-transport-ws) show how to use `graphql-ws` with Apollo Server, Apollo Studio Explorer, Apollo Client Web, Apollo iOS, and Apollo Kotlin. If you have more questions about using `graphql-ws` with the Apollo platform, file an issue on the corresponding repository or post in [the community](https://community.apollographql.com/).

The [`graphql-ws` README](https://github.com/enisdenjo/graphql-ws/blob/master/README.md) shows how to integrate `graphql-ws` with other software.

If you have not yet migrated off of `subscriptions-transport-ws` and need to learn more about it, you can read [the previous version of this file](https://github.com/apollographql/subscriptions-transport-ws/blob/51270cc7dbaf09c7b9aa67368f1de58148c7d334/README.md).
