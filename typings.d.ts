/// <reference types="typed-graphql" />

declare module 'lodash.isobject' {
  import main = require('lodash');
  export = main.isObject;
}

declare module 'lodash.isstring' {
  import main = require('lodash');
  export = main.isString;
}
