import {
  server as WebSocketServer,
} from 'websocket';

import {
  GraphQLResult,
  GraphQLSchema,
  validate,
  graphql,
  parse,
} from 'graphql';

import {
  SUBSCRIPTION_FAIL,
  SUBSCRIPTION_DATA,
  SUBSCRIPTION_START,
  SUBSCRIPTION_END,
} from './messageTypes';

import {
  isEqual,
} from 'lodash';

interface Connection {
  // define a websocket connection here?
  sendUTF: Function;
}

interface SubscribeMessage {
  query?: string;
  variables?: { [key: string]: any };
  operationName?: string;
  id: string;
  type: string;
};

interface SubscriptionData {
  query: string;
  variables?: { [key: string]: any };
  operationName: string;
}

interface ServerOptions {
  schema: GraphQLSchema;
  contextValue?: any;
  rootValue?: any;
  formatResponse?: (Object) => Object;
  validationRules?: Array<any>;
  triggerGenerator: (name: string, args: Object, context?: Object) => Array<{name: string, filter: Function}>;
}

interface TriggerAction {
  name: string;
  rootValue: any;
  contextValue?: any;
}

class Server {

  public triggers: {[triggerName: string]: Array<{ connection: Connection,
    subscriptionArgs: SubscriptionData, subId: string, filter: Function }>};
  private options: ServerOptions;
  private wsServer: WebSocketServer;

  constructor(options: ServerOptions, httpServer) {
    const { schema, triggerGenerator } = options;

    if (!schema) {
      throw new Error('Must provide `schema` to websocket server constructor.');
    }

    if (!triggerGenerator) {
      throw new Error('Must provide `triggerGenerator` function to websocket server constructor.');
    }

    this.options = options;
    this.triggers = {};

    // init and connect websocket server to http
    this.wsServer = new WebSocketServer({
      httpServer: httpServer,
      autoAcceptConnections: false,
    });

    this.wsServer.on('request', (request) => {
      // accept connection
      const connection = request.accept('graphql-subscriptions', request.origin);
      connection.on('message', (message) => {
        let parsedMessage: SubscribeMessage;
        try {
          parsedMessage = JSON.parse(message.utf8Data);
        } catch (e) {
          let failMessage = {
            type: SUBSCRIPTION_FAIL,
            errors: ['Message must be JSON-parseable.'],
            id: parsedMessage.id,
          };
          connection.sendUTF(JSON.stringify(failMessage));
        }

        const subId = parsedMessage.id;
        switch (parsedMessage.type) {

          case SUBSCRIPTION_START:

            if (! this.isValidSubscriptionOrSendMessage(connection, parsedMessage)) {
              break;
            }

            // set up trigger listeners
            let msgTriggers = [];
            if (this.options.triggerGenerator) {
              // 1. parse query
              // 2. validate
              // 3. get operation definition out of it
              // make sure it's a subscription
              // 4. make sure there's only one field on that operation definition

              // here, we are assuming that the message is a subscription.
              try {
                msgTriggers = this.options.triggerGenerator(parsedMessage.operationName, parsedMessage.variables);
              } catch (e) {
                throw new Error('Trigger generator was not able to generate triggers - make sure it is in the format:' +
                '`(operationName: string, variables: Object) => [{name: string, filter: (any) => boolean}]`');
              }

            } else {
              throw new Error('Server does not have trigger generator.');
            }

            this.addTriggers({
              msgTriggers,
              connection,
              subId,
              parsedMessage,
            });

            break;

          case SUBSCRIPTION_END:
            let allTriggers = Object.keys(this.triggers);

            // delete trigger information
            allTriggers.forEach((triggerName) => {
              this.triggers[triggerName] = this.triggers[triggerName].filter((triggerObject, index) => {
                return (!(isEqual(triggerObject.subId, subId) && isEqual(triggerObject.connection, connection)));
              });
            });
            break;

          default:
            throw new Error('Invalid message type. Message type must be `subscription_start` or `subscription_end`.');
        }

      });
    });
  }

  public triggerAction(triggerObject: TriggerAction): void {
    const { name, rootValue, contextValue } = triggerObject;

    if (this.triggers[name]) {
      let triggeredSubs = this.triggers[name].filter((subscriber) => {
        return subscriber.filter(rootValue);
      });

      triggeredSubs.forEach((subObj) => {
        const { connection, subId, subscriptionArgs } = subObj;

        // since subscription has been validated, we don't need to catch error here.
        // any graphql errors will show up in the GraphQLResult

        graphql(
          this.options.schema,
          subscriptionArgs.query,
          rootValue,
          contextValue || this.options.contextValue,
          subscriptionArgs.variables,
          subscriptionArgs.operationName
        ).then((response) => {
          this.sendSubscriptionData(connection, response, subId);
        });
      });
    }
  }

  private sendSubscriptionData(connection: Connection, response: GraphQLResult, subId: string): void {
    if (this.options.formatResponse) {
      response = this.options.formatResponse(response);
    }
    let message = {
      type: SUBSCRIPTION_DATA,
      id: subId,
      payload: response,
    };

    connection.sendUTF(JSON.stringify(message));
  }

  /**
   * Validates subscription. If the subscription is not valid, sends a SUBSCRIPTION_FAIL message.
   * @return true if the subscription is valid. Else, false.
   */
  private isValidSubscriptionOrSendMessage(connection: Connection, parsedMessage: SubscribeMessage): boolean {
    let syntaxErrors = validate(
      this.options.schema,
      parse(parsedMessage.query),
      this.options.validationRules
    );

    if (syntaxErrors.length > 0) {
      let message = {
        type: SUBSCRIPTION_FAIL,
        errors: syntaxErrors,
        id: parsedMessage.id,
      };
      connection.sendUTF(JSON.stringify(message));
      return false;
    }
    return true;
  }

  /**
   * Adds triggers to server.
   */
  private addTriggers({
    msgTriggers,
    connection,
    subId,
    parsedMessage,
  }: {
    msgTriggers: Array<any>,
    connection: Connection,
    subId: string,
    parsedMessage: SubscribeMessage,
  }): void {
    msgTriggers.forEach((trigger) => {
      const { name, filter } = trigger;
      let triggerObject = {
        connection: connection,
        filter: filter,
        subId: subId,
        subscriptionArgs: {
          query: parsedMessage.query,
          variables: parsedMessage.variables,
          operationName: parsedMessage.operationName,
        },
      };
      if (! this.triggers[name]) {
        this.triggers[name] = [triggerObject];
      } else {
        this.triggers[name].push(triggerObject);
      }
    });
  }
}
export default Server;
