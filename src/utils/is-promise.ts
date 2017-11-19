export function isPromise(instance: any): instance is Promise<any> {
  return !!instance &&
    typeof instance.then === 'function' &&
    typeof instance.catch === 'function';
}
