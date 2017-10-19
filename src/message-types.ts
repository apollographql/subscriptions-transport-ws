export default class MessageTypes {
  public static GQL_CONNECTION_INIT = 'connection_init'; // Client -> Server
  public static GQL_CONNECTION_ACK = 'connection_ack'; // Server -> Client
  public static GQL_CONNECTION_ERROR = 'connection_error'; // Server -> Client

  // NOTE: The keep alive message type does not follow the standard due to connection optimizations
  public static GQL_CONNECTION_KEEP_ALIVE = 'ka'; // Server -> Client

  public static GQL_CONNECTION_TERMINATE = 'connection_terminate'; // Client -> Server
  public static GQL_START = 'start'; // Client -> Server
  public static GQL_DATA = 'data'; // Server -> Client
  public static GQL_ERROR = 'error'; // Server -> Client
  public static GQL_COMPLETE = 'complete'; // Server -> Client
  public static GQL_STOP = 'stop'; // Client -> Server

  // NOTE: The following message types are deprecated and will be removed soon.
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
  /**
   * @deprecated
   */
  public static KEEP_ALIVE = 'keepalive';

  constructor() {
    throw new Error('Static Class');
  }
}
