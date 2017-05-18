import 'mocha';
import {
  expect,
} from 'chai';
import * as sinon from 'sinon';
import { createIterableFromPromise } from '../utils/promise-to-iterable';
import { forAwaitEach, isAsyncIterable, createAsyncIterator } from 'iterall';

describe('promiseToIterable', () => {
  it('should return a valid AsyncIterator from Promise', () => {
    const promise = Promise.resolve('test value');
    const iterator = createIterableFromPromise(promise);

    expect(isAsyncIterable(iterator)).to.eq(true);
  });

  it('should return a valid AsyncIterable value when promise resolved', (done) => {
    const promise = Promise.resolve('test value');
    const iterator = createIterableFromPromise(promise);

    iterator.next().then((value: any) => {
      expect(value).to.have.property('value');
      expect(value).to.have.property('done');
      expect(value.done).to.eq(false);
      expect(value.value).to.eq('test value');
      done();
    });
  });

  it('value is iterable using forAwaitEach', (done) => {
    const promise = Promise.resolve('test value');
    const iterator = createIterableFromPromise(promise);

    let itemCallbackCalled = false;

    forAwaitEach(createAsyncIterator(iterator) as any, (value: any) => {
      expect(value).to.eq('test value');
      itemCallbackCalled = true;
    })
      .then((doneValue: any) => {
        expect(doneValue).to.eq(undefined);
        expect(itemCallbackCalled).to.eq(true);

        done();
      })
      .catch((error: Error) => {
        expect(error).to.eq(undefined);
      });
  });

  it('should return done=true after promise has been resolved', (done) => {
    const promise = Promise.resolve('test value');
    const iterator = createIterableFromPromise(promise);

    iterator.next()
      .then(() => iterator.next())
      .then(doneValue => {
        expect(doneValue).to.have.property('value');
        expect(doneValue).to.have.property('done');
        expect(doneValue.done).to.eq(true);
        expect(doneValue.value).to.eq(undefined);
        done();
      });
  });

  it('should return done=true after promise has been resolved', (done) => {
    const promise = Promise.resolve('test value');
    const iterator = createIterableFromPromise(promise);

    iterator.next()
      .then(() => iterator.next())
      .then(doneValue => {
        expect(doneValue).to.have.property('value');
        expect(doneValue).to.have.property('done');
        expect(doneValue.done).to.eq(true);
        expect(doneValue.value).to.eq(undefined);
        done();
      });
  });

  it('should reject next promise when promise rejected', (done) => {
    const promise = Promise.reject(new Error('test error'));
    const iterator = createIterableFromPromise(promise);
    const spy = sinon.spy();

    forAwaitEach(createAsyncIterator(iterator) as any, spy)
      .catch((e) => {
        expect(spy.callCount).to.equal(0);
        expect(e.message).to.equal('test error');
        done();
      });
  });
});
