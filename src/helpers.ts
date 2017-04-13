import { GraphQLTransportWSClient } from './client';
import { print } from 'graphql/language/printer';

/**
 * @deprecated This method becomes deprecated in the new package graphql-transport-ws.
 * Start using the GraphQLTransportWSClient to make queries, mutations and subscriptions over websockets.
 */

// Quick way to add the subscribe and unsubscribe functions to the network interface
export function addGraphQLSubscriptions(networkInterface: any, wsClient: GraphQLTransportWSClient): any {
  console.warn('This method becomes deprecated in the new package graphql-transport-ws. Start using the ' +
    'GraphQLTransportWSClient to make queries, mutations and subscriptions over websockets.');

  return Object.assign(networkInterface, {
    subscribe(request: any, handler: any): number {
      return wsClient.subscribe({
        query: print(request.query),
        variables: request.variables,
      }, handler);
    },
    unsubscribe(id: number): void {
      wsClient.unsubscribe(id);
    },
  });
}
