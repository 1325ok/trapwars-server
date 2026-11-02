import { pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';

import { GAME_CONFIG } from './config/gameConfig.js';
import { GameEngine } from './game/GameEngine.js';
import { publicState } from './game/GameState.js';
import { FpsEngine } from './fps/FpsEngine.js';
import { fail, send } from './network/protocol.js';
import { RoomManager } from './rooms/RoomManager.js';

export function createServer(port = Number(process.env.PORT || 8080)) {
  const roomManager = new RoomManager();
  const gameEngine = new GameEngine(roomManager);
  const fpsEngine = new FpsEngine(gameEngine);

  const wss = new WebSocketServer({ port });
  console.log(`Trap Wars WS server: ws://localhost:${port}`);

  function disconnect(ws) {
    roomManager.leaveRoom(ws, undefined, true);
  }

  const fpsTimer = setInterval(() => {
    for (const room of roomManager.rooms.values()) {
      if (room.state) fpsEngine.update(room);
    }
  }, GAME_CONFIG.fps.tickMs);

  wss.on('close', () => clearInterval(fpsTimer));

  wss.on('connection', (ws) => {
    send(ws, 'WELCOME', { protocolVersion: 2, boardSize: GAME_CONFIG.boardSize });

    ws.on('message', (data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return fail(ws, null, 'INVALID_JSON', 'Invalid JSON');
      }

      if (!msg || Array.isArray(msg) || typeof msg.type !== 'string' ||
          (msg.payload !== undefined && (!msg.payload || typeof msg.payload !== 'object' || Array.isArray(msg.payload))) ||
          (msg.requestId !== undefined && typeof msg.requestId !== 'string')) {
        return fail(ws, msg?.requestId ?? null, 'INVALID_MESSAGE', 'Missing type');
      }

      if (msg.type === 'PING') {
        return send(ws, 'PONG', { serverTime: Date.now() }, msg.requestId);
      }

      if (msg.type === 'ROOM_LIST') {
        return send(ws, 'ROOM_LIST', { rooms: roomManager.listRooms() }, msg.requestId);
      }
      if (msg.type === 'ROOM_CREATE') {
        return roomManager.createRoom(ws, msg.payload?.name, msg.requestId);
      }
      if (msg.type === 'ROOM_JOIN') {
        return roomManager.joinRoom(ws, msg.payload?.roomId, msg.requestId);
      }
      if (msg.type === 'ROOM_LEAVE') {
        return roomManager.leaveRoom(ws, msg.requestId);
      }
      if (msg.type === 'MATCH_JOIN' || msg.type === 'MATCH_CANCEL') {
        return fail(ws, msg.requestId, 'MATCHMAKING_REMOVED', 'Use ROOM_LIST, ROOM_CREATE and ROOM_JOIN');
      }

      const session = roomManager.getSession(ws);
      if (!session) {
        return fail(ws, msg.requestId, 'NOT_IN_ROOM', 'Create or join a room first');
      }

      const room = roomManager.getRoomForSocket(ws);
      if (!room) {
        return fail(ws, msg.requestId, 'ROOM_NOT_FOUND', 'Room no longer exists');
      }

      if (!room.state) {
        return fail(ws, msg.requestId, 'GAME_NOT_STARTED', 'Waiting for another player');
      }

      if (['MOVE', 'PLACE_WALL', 'USE_CARD'].includes(msg.type)) {
        return gameEngine.handleAction(room, session.playerId, msg, ws);
      }

      if (msg.type === 'GET_STATE') {
        return send(ws, 'GAME_STATE', publicState(room.state), msg.requestId);
      }

      return fail(ws, msg.requestId, 'NOT_IMPLEMENTED', 'This message is not implemented in v0.1');
    });

    ws.on('close', () => disconnect(ws));
    ws.on('error', () => disconnect(ws));
  });

  return wss;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createServer();
}
