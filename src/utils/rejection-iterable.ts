import { $$asyncIterator } from 'iterall';

export const createRejectionIterable = (error: Error): AsyncIterator<any> => {
  return {
    next() {
      return this.throw(error);
    },
    return() {
      return this.throw(error);
    },
    throw(e: Error) {
      return Promise.reject(e);
    },
    [$$asyncIterator]() {
      return this;
    },
  };
};
