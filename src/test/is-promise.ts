import { expect } from 'chai';
import { isPromise } from '../utils/is-promise';

describe('isPromise', () => {
  it('should return true for native promises', () => {
    const promise = Promise.resolve(null);
    expect(isPromise(promise)).to.equal(true);
  });

  it('should return true for other types of promises', () => {
    const promise = {
      then() {
        // Intentionally blank
      },
      catch() {
        // Intentionally blank
      },
    };


    expect(isPromise(promise)).to.equal(true);
  });

  it('should return false for non-promises', () => {
    const nonPromise = 'foo';
    expect(isPromise(nonPromise)).to.equal(false);
  });
});
