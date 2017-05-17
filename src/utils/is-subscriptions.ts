import { DocumentNode, getOperationAST } from 'graphql';

export const isASubscriptionOperation = (document: DocumentNode, operationName: string): boolean => {
  const operationAST = getOperationAST(document, operationName);

  return !!operationAST && operationAST.operation === 'subscription';
};
