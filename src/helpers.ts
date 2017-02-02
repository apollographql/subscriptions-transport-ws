import Client from './client';
import { print } from 'graphql-tag/printer';

// quick way to add the subscribe and unsubscribe functions to the network interface
function addGraphQLSubscriptions(networkInterface: any, wsClient: Client): any {
  return Object.assign(networkInterface, {
    subscribe(request: any, handler: any): number {
      return wsClient.subscribe({
        query: print(request.query),
        variables: request.variables,
      }, handler);
    },
    unsubscribe(id: number): void {
      wsClient.unsubscribe(id);
    }
  });
}

export { addGraphQLSubscriptions };