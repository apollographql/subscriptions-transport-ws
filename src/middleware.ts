import { OperationOptions } from './client';

export interface MiddlewareInterface {
  applyMiddleware(options: OperationOptions, next: Function): void;
}
