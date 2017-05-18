import { $$asyncIterator } from 'iterall';

export function createIterableFromPromise<T>(promise: Promise<T>): AsyncIterator<T> {
  let isResolved = false;

  return {
    next() {
      if (!isResolved) {
        isResolved = true;

        return promise
          .then(value => ({ value, done: false }));
      }

      return Promise.resolve({ value: undefined, done: true });
    },
    return() {
      isResolved = true;

      return Promise.resolve({ value: undefined, done: true });
    },
    throw(e: Error) {
      isResolved = true;

      return Promise.reject(e);
    },
    [$$asyncIterator]() {
      return this;
    },
  };
}
