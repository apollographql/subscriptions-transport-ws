module.exports = {
  pathPrefix: '/docs/graphql-subscriptions',
  __experimentalThemes: [
    {
      resolve: 'gatsby-theme-apollo-docs',
      options: {
        root: __dirname,
        subtitle: 'GraphQL Subscriptions Guide',
        description: 'A guide to using GraphQL Subscriptions',
        githubRepo: 'apollographql/subscriptions-transport-ws',
        sidebarCategories: {
          null: [
            'index',
            'subscriptions-to-schema',
            'setup',
            'lifecycle-events',
            'authentication',
            'express',
            'external-pubsub',
            'meteor'
          ]
        }
      }
    }
  ]
};
