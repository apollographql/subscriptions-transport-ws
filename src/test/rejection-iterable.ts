import 'mocha';
import {
  expect,
} from 'chai';
import * as sinon from 'sinon';
import { forAwaitEach, isAsyncIterable, createAsyncIterator } from 'iterall';
import { createRejectionIterable } from '../utils/rejection-iterable';

describe('createRejectionIterable', () => {
  it('should return a valid AsyncIterator from Promise', () => {
    const iterator = createRejectionIterable(new Error('test error'));

    expect(isAsyncIterable(iterator)).to.eq(true);
  });

  it('should not trigger next callback, only catch error', (done) => {
    const iterator = createRejectionIterable(new Error('test error'));
    const spy = sinon.spy();
    const doneSpy = sinon.spy();

    forAwaitEach(createAsyncIterator(iterator) as any, spy)
      .then(doneSpy)
      .catch((e) => {
        expect(e.message).to.eq('test error');
        expect(spy.callCount).to.eq(0);
        expect(doneSpy.callCount).to.eq(0);
        done();
      });
  });

  it('next promise should always reject', (done) => {
    const iterator = createRejectionIterable(new Error('test error'));
    const spy = sinon.spy();

    iterator.next()
      .then(spy)
      .catch((e) => {
        expect(e.message).to.eq('test error');
        expect(spy.callCount).to.eq(0);
        done();
      });
  });
});
