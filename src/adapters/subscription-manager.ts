import { SubscriptionManager } from 'graphql-subscriptions';
import { print, DocumentNode, ExecutionResult, GraphQLSchema } from 'graphql';
import { isASubscriptionOperation } from '../utils/is-subscriptions';
import { ExecutionIterator } from '../server';

export const executeFromSubscriptionManager = (subscriptionManager: SubscriptionManager) => {
  return (schema: GraphQLSchema,
          document: DocumentNode,
          rootValue?: any,
          contextValue?: any,
          variableValues?: { [key: string]: any },
          operationName?: string): ExecutionIterator => {
    const pullQueue: any[] = [];
    const pushQueue: any[] = [];
    let listening = true;

    const pushValue = (event: any) => {
      if (pullQueue.length !== 0) {
        const promise = pullQueue.shift();
        promise.resolve({ value: event, done: false });
      } else {
        pushQueue.push(event);
      }
    };

    const pushError = (error: Error) => {
      if (pullQueue.length !== 0) {
        const promise = pullQueue.shift();
        promise.reject(error);
      } else {
        pushQueue.push(error);
      }
    };

    const pullValue = () => {
      return new Promise((resolve, reject) => {
        if (pushQueue.length !== 0) {
          const valueOrError = pushQueue.shift();

          if (valueOrError instanceof Error) {
            reject(valueOrError);
          } else {
            resolve({ value: valueOrError, done: false });
          }
        } else {
          pullQueue.push({ resolve, reject });
        }
      });
    };

    const emptyQueue = () => {
      if (listening) {
        listening = false;
        pullQueue.forEach(p => p.resolve({ value: undefined, done: true }));
        pullQueue.length = 0;
        pushQueue.length = 0;
      }
    };

    if (isASubscriptionOperation(document, operationName)) {
      throw new Error('GraphQL Query or Mutation are not supported using SubscriptionManager!');
    }

    const callbackHandler = (error: Error, result: ExecutionResult) => {
      if (error) {
        pushError(error);
      } else {
        pushValue(result);
      }
    };

    const subIdPromise = subscriptionManager.subscribe({
      query: print(document),
      operationName,
      callback: callbackHandler,
      variables: variableValues,
      context: contextValue,
    }).catch((e: Error) => pushError(e));

    return {
      next() {
        return listening ? pullValue() : this.return();
      },
      return() {
        emptyQueue();

        if (subIdPromise) {
          subIdPromise.then((opId: number) => {
            if (opId) {
              subscriptionManager.unsubscribe(opId);
            }
          });
        }

        return Promise.resolve({ value: undefined, done: true });
      },
      throw(error: Error) {
        emptyQueue();

        return Promise.reject(error);
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    };
  };
};
