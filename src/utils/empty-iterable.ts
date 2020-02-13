import { $$asyncIterator } from 'iterall';

export const createEmptyIterable = (): AsyncIterator<any> => {
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
    // Supress error TS2322
    // @see https://github.com/microsoft/TypeScript/issues/27525
    // @ts-ignore
    [$$asyncIterator]() {
      return this;
    },
  };
};
