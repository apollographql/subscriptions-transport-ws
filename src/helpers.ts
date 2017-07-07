import { SubscriptionClient } from './client';
import assign = require('lodash.assign');

/**
 * @deprecated This method will become deprecated in the new package graphql-transport-ws.
 * Start using the GraphQLTransportWSClient to make queries, mutations and subscriptions over websockets.
 */

// Quick way to add the subscribe and unsubscribe functions to the network interface
// We will move this into a new package in the future
export function addGraphQLSubscriptions(networkInterface: any, wsClient: SubscriptionClient): any {
  if (process && process.env && process.env.NODE_ENV !== 'production') {
    console.warn('Notice that addGraphQLSubscriptions method will become deprecated in the new package ' +
      'graphql-transport-ws that will be released soon. Keep track for the new hybrid network release here: ' +
      'https://github.com/apollographql/subscriptions-transport-ws/issues/169');
  }

  return assign(networkInterface, {
    subscribe(request: any, handler: any): string {
      return wsClient.subscribe(request, handler);
    },
    unsubscribe(id: string): void {
      wsClient.unsubscribe(id);
    },
  });
}
