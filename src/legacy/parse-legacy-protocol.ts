import { ConnectionContext } from '../server';
import MessageTypes from '../message-types';

export const parseLegacyProtocolMessage = (connectionContext: ConnectionContext, message: any) => {
  let messageToReturn = message;

  switch (message.type) {
    case MessageTypes.INIT:
      connectionContext.isLegacy = true;
      messageToReturn = { ...message, type: MessageTypes.GQL_CONNECTION_INIT };
      break;
    case MessageTypes.SUBSCRIPTION_START:
      messageToReturn = {
        id: message.id,
        type: MessageTypes.GQL_START,
        payload: {
          query: message.query,
          operationName: message.operationName,
          variables: message.variables,
        },
      };
      break;
    case MessageTypes.SUBSCRIPTION_END:
      messageToReturn = { ...message, type: MessageTypes.GQL_STOP };
      break;
    case MessageTypes.GQL_CONNECTION_ACK:
      if (connectionContext.isLegacy) {
        messageToReturn = { ...message, type: MessageTypes.INIT_SUCCESS };
      }
      break;
    case MessageTypes.GQL_CONNECTION_ERROR:
      if (connectionContext.isLegacy) {
        messageToReturn = {
          ...message, type: MessageTypes.INIT_FAIL,
          payload: message.payload.message ? { error: message.payload.message } : message.payload,
        };
      }
      break;
    case MessageTypes.GQL_ERROR:
      if (connectionContext.isLegacy) {
        messageToReturn = { ...message, type: MessageTypes.SUBSCRIPTION_FAIL };
      }
      break;
    case MessageTypes.GQL_DATA:
      if (connectionContext.isLegacy) {
        messageToReturn = { ...message, type: MessageTypes.SUBSCRIPTION_DATA };
      }
      break;
    case MessageTypes.GQL_COMPLETE:
      if (connectionContext.isLegacy) {
        messageToReturn = null;
      }
      break;
    case MessageTypes.SUBSCRIPTION_SUCCESS:
      if (!connectionContext.isLegacy) {
        messageToReturn = null;
      }
      break;
    default:
      break;
  }

  return messageToReturn;
};
