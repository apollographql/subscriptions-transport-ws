import { $$asyncIterator } from 'iterall';

type EmptyIterable = AsyncIterator<any> & { [$$asyncIterator]: any };

export const createEmptyIterable = (): EmptyIterable => {
  return {
    next() {
      return Promise.resolve({ value: undefined, done: true });
    },
    return() {
      return Promise.resolve({ value: undefined, done: true });
    },
    throw(e: Error) {
      return Promise.reject(e);
    },
    [$$asyncIterator]() {
      return this;
    },
  };
};
