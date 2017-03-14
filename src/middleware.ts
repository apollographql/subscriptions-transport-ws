import { SubscriptionOptions } from './client';

export interface MiddlewareInterface {
  applyMiddleware(options: SubscriptionOptions, next: Function): void;
}
