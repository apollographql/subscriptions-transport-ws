import { $$asyncIterator, isAsyncIterable } from 'iterall';

export function createIterableFromPromise<T>(promise: Promise<T | AsyncIterator<T>>): Promise<AsyncIterator<T>> {
  let isResolved = false;

  return promise.then((value: T | AsyncIterator<T>) => {
    if ( isAsyncIterable(value) ) {
      return value as AsyncIterator<T>;
    }

    return {
      next() {
        if (!isResolved) {
          isResolved = true;

          return Promise.resolve({ value, done: false });
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
    } as AsyncIterator<T>;
  });
}
