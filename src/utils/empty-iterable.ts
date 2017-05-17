export const createEmptyIterable = (): AsyncIterable<any> & AsyncIterator<any> => {
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
    [Symbol.asyncIterator]() {
      return this;
    },
  };
};
