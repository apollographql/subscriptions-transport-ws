const themeOptions = require('gatsby-theme-apollo-docs/theme-options');

module.exports = {
  pathPrefix: '/docs/graphql-subscriptions',
  plugins: [
    {
      resolve: 'gatsby-theme-apollo-docs',
      options: {
        ...themeOptions,
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
