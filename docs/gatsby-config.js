module.exports = {
  __experimentalThemes: [
    {
      resolve: 'gatsby-theme-apollo-docs',
      options: {
        root: __dirname,
        subtitle: 'GraphQL Subscriptions Guide',
        description: 'A guide to using GraphQL Subscriptions',
        basePath: '/docs/graphql-subscriptions',
        contentDir: 'docs/source',
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
