// ------------------------------------------------------------------
//  Socket.io connection helper.
//  The socket.io client script (/socket.io/socket.io.js) is loaded
//  globally via a <script> tag, exposing window.io.
//  The JWT is sent in the handshake auth so the server can authenticate
//  the socket and join us to our personal user:<id> room.
// ------------------------------------------------------------------

import { getToken } from './api.js';

export function connectSocket() {
  const token = getToken();
  if (!token || typeof window.io !== 'function') return null;

  const socket = window.io({
    auth: { token },
    transports: ['websocket', 'polling'],
  });

  socket.on('connect_error', (err) => {
    // Handshake rejected (bad/expired token) — don't spam; log once.
    console.warn('[socket] connection error:', err.message);
  });

  return socket;
}
