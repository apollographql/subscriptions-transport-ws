import { $$asyncIterator } from 'iterall';

export function createIterableFromPromise<T>(promise: Promise<T>): AsyncIterator<T> {
  let isResolved = false;

  return {
    next() {
      if (isResolved) {
        return this.return();
      }

      return promise
        .then(value => ({ value, done: false }))
        .catch(error => this.throw(error))
        .then(res => {
          isResolved = true;

          return res;
        });
    },
    return() {
      return promise
        .then(value => ({ value: undefined, done: true }));
    },
    throw(e: Error) {
      return Promise.reject(e);
    },
    [$$asyncIterator]() {
      return this;
    },
  };
}
