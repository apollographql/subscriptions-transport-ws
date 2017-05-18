import { $$asyncIterator } from 'iterall';

export const createRejectionIterable = (error: Error): AsyncIterator<any> => {
  return {
    next() {
      return Promise.reject(error);
    },
    return() {
      return Promise.resolve({ done: true, value: undefined });
    },
    throw(e: Error) {
      return Promise.reject(e);
    },
    [$$asyncIterator]() {
      return this;
    },
  };
};
