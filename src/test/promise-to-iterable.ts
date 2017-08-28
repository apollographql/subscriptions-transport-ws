import 'mocha';
import {
  expect,
} from 'chai';
import { createIterableFromPromise } from '../utils/promise-to-iterable';
import { forAwaitEach, isAsyncIterable, createAsyncIterator } from 'iterall';

describe('promiseToIterable', () => {
  it('should return a valid AsyncIterator from Promise', async () => {
    const promise = Promise.resolve('test value');
    const iterator = await createIterableFromPromise(promise);

    expect(isAsyncIterable(iterator)).to.eq(true);
  });

  it('should return a valid AsyncIterable value when promise resolved', async () => {
    const promise = Promise.resolve('test value');
    const iterator = await createIterableFromPromise(promise);

    return iterator.next().then((value: any) => {
      expect(value).to.have.property('value');
      expect(value).to.have.property('done');
      expect(value.done).to.eq(false);
      expect(value.value).to.eq('test value');
    });
  });

  it('value is iterable using forAwaitEach', async () => {
    const promise = Promise.resolve('test value');
    const iterator = await createIterableFromPromise(promise);

    let itemCallbackCalled = false;

    return forAwaitEach(createAsyncIterator(iterator) as any, (value: any) => {
      expect(value).to.eq('test value');
      itemCallbackCalled = true;
    })
      .then((doneValue: any) => {
        expect(doneValue).to.eq(undefined);
        expect(itemCallbackCalled).to.eq(true);
      })
      .catch((error: Error) => {
        expect(error).to.eq(undefined);
      });
  });

  it('should return done=true after promise has been resolved', async () => {
    const promise = Promise.resolve('test value');
    const iterator = await createIterableFromPromise(promise);

    return iterator.next()
      .then(() => iterator.next())
      .then(doneValue => {
        expect(doneValue).to.have.property('value');
        expect(doneValue).to.have.property('done');
        expect(doneValue.done).to.eq(true);
        expect(doneValue.value).to.eq(undefined);
      });
  });

  it('should return done=true after promise has been resolved', async () => {
    const promise = Promise.resolve('test value');
    const iterator = await createIterableFromPromise(promise);

    return iterator.next()
      .then(() => iterator.next())
      .then(doneValue => {
        expect(doneValue).to.have.property('value');
        expect(doneValue).to.have.property('done');
        expect(doneValue.done).to.eq(true);
        expect(doneValue.value).to.eq(undefined);
      });
  });

  it('should reject async iterator promise if given promise rejected', async () => {
    let errored = false;
    const promise = Promise.reject(new Error('test error'));

    try {
      await createIterableFromPromise(promise);
    } catch (e) {
      errored = true;
      expect(e.message).to.equal('test error');
    }
    expect(errored).to.equal(true);
  });
});
