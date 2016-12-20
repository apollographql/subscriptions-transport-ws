declare let window: any;
let _global = typeof global !== 'undefined' ? global : (typeof window !== 'undefined' ? window: {});

import * as NodeSocket from 'ws';
let NativeSocket: any = _global.WebSocket || _global.MozWebSocket;

if (!NativeSocket) {
  NativeSocket = NodeSocket;
}

export const WebSocket = NativeSocket;