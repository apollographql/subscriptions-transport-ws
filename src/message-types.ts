export default class MessageTypes {
  public static GQL_CONNECTION_INIT = 'connection_init';
  public static GQL_CONNECTION_ACK = 'connection_ack';
  public static GQL_CONNECTION_ERROR = 'connection_error';
  // NOTE: This one here don't follow the standard due to connection optimization
  public static GQL_CONNECTION_KEEP_ALIVE = 'ka';
  public static GQL_CONNECTION_TERMINATE = 'connection_terminate';
  public static GQL_START = 'start';
  public static GQL_DATA = 'data';
  public static GQL_ERROR = 'error';
  public static GQL_COMPLETE = 'complete';
  public static GQL_END = 'end';
  // NOTE: Those message types are deprecated and will be removed soon.
  /**
   * @deprecated
   */
  public static SUBSCRIPTION_START = 'subscription_start';
  /**
   * @deprecated
   */
  public static SUBSCRIPTION_DATA = 'subscription_data';
  /**
   * @deprecated
   */
  public static SUBSCRIPTION_SUCCESS = 'subscription_success';
  /**
   * @deprecated
   */
  public static SUBSCRIPTION_FAIL = 'subscription_fail';
  /**
   * @deprecated
   */
  public static SUBSCRIPTION_END = 'subscription_end';
  /**
   * @deprecated
   */
  public static INIT = 'init';
  /**
   * @deprecated
   */
  public static INIT_SUCCESS = 'init_success';
  /**
   * @deprecated
   */
  public static INIT_FAIL = 'init_fail';
  constructor() { throw new Error('Static Class'); }
};
