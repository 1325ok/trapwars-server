import { WebSocket } from 'ws';

export function send(ws, type, payload = {}, requestId = null) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const envelope = { type, payload };
  if (requestId) envelope.requestId = requestId;
  ws.send(JSON.stringify(envelope));
}

export function fail(ws, requestId, code, message) {
  send(ws, 'ACTION_REJECTED', { code, message }, requestId);
}
