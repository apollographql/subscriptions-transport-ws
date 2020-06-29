export const createEmptyIterable = (): AsyncIterableIterator<any> => {
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
