import { SubscriptionClient } from './client';

/**
 * @deprecated This method will become deprecated in the new package graphql-transport-ws.
 * Start using the GraphQLTransportWSClient to make queries, mutations and subscriptions over websockets.
 */

// Quick way to add the subscribe and unsubscribe functions to the network interface
// We will move this into a new package in the future
export function addGraphQLSubscriptions(networkInterface: any, wsClient: SubscriptionClient): any {
  if (process.env.NODE_ENV !== 'production') {
    console.warn('This method becomes deprecated in the new package graphql-transport-ws. Start using the ' +
      'GraphQLTransportWSClient to make queries, mutations and subscriptions over websockets.');
  }

  return Object.assign(networkInterface, {
    subscribe(request: any, handler: any): number {
      return wsClient.subscribe(request, handler);
    },
    unsubscribe(id: number): void {
      wsClient.unsubscribe(id);
    },
  });
}
