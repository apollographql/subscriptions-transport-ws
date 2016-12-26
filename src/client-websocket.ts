declare let window: any;
const _global = typeof global !== 'undefined' ? global : (typeof window !== 'undefined' ? window : {});
let NativeSocket: any = _global.WebSocket || _global.MozWebSocket;

if (!NativeSocket) {
  NativeSocket = require('ws');
}

export const WebSocket = NativeSocket;
