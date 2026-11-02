import { randomUUID } from 'node:crypto';

import { GAME_CONFIG } from '../config/gameConfig.js';
import { createInitialGameState, publicState } from '../game/GameState.js';
import { send, fail } from '../network/protocol.js';

export class RoomManager {
  constructor() {
    this.rooms = new Map();
    this.sessions = new Map();
  }

  listRooms() {
    return [...this.rooms.values()].map(room => ({
      roomId: room.id, name: room.name, status: room.status,
      playerCount: Object.keys(room.sockets).length, maxPlayers: 2
    }));
  }

  createRoom(socket, name = 'Trap Wars', requestId) {
    if (this.getSession(socket)) return fail(socket, requestId, 'ALREADY_IN_ROOM', 'Leave your current room first');
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 40) {
      return fail(socket, requestId, 'INVALID_ROOM_NAME', 'Name must be 1 to 40 characters');
    }
    const roomId = `room-${randomUUID()}`;
    const room = { id: roomId, name: name.trim(), status: 'WAITING', sockets: { P1: socket }, state: null };
    this.rooms.set(roomId, room);
    this.sessions.set(socket, { roomId, playerId: 'P1' });
    send(socket, 'ROOM_CREATED', { roomId, name: room.name, playerId: 'P1', status: room.status }, requestId);
    return room;
  }

  joinRoom(socket, roomId, requestId) {
    if (this.getSession(socket)) return fail(socket, requestId, 'ALREADY_IN_ROOM', 'Leave your current room first');
    if (typeof roomId !== 'string' || !roomId) return fail(socket, requestId, 'INVALID_ROOM_ID', 'roomId is required');
    const room = this.rooms.get(roomId);
    if (!room) return fail(socket, requestId, 'ROOM_NOT_FOUND', 'Room no longer exists');
    if (room.status !== 'WAITING') return fail(socket, requestId, 'ROOM_FULL', 'Room already started');
    if (room.sockets.P1.readyState !== 1) {
      this.destroyRoom(roomId);
      return fail(socket, requestId, 'ROOM_NOT_FOUND', 'Host disconnected');
    }
    room.sockets.P2 = socket;
    this.sessions.set(socket, { roomId, playerId: 'P2' });
    room.status = 'PLAYING';
    room.state = createInitialGameState(roomId);
    send(socket, 'ROOM_JOINED', { roomId, name: room.name, playerId: 'P2', status: room.status }, requestId);
    for (const [playerId, ws] of Object.entries(room.sockets)) {
      send(ws, 'GAME_STARTED', { roomId, playerId, boardSize: GAME_CONFIG.boardSize });
    }
    this.broadcastState(room);
    return room;
  }

  leaveRoom(socket, requestId, disconnected = false) {
    const session = this.getSession(socket);
    if (!session) {
      if (!disconnected) fail(socket, requestId, 'NOT_IN_ROOM', 'Not in a room');
      return;
    }
    const room = this.rooms.get(session.roomId);
    if (!room) return;
    for (const [playerId, ws] of Object.entries(room.sockets)) {
      if (playerId !== session.playerId) {
        send(ws, disconnected ? 'OPPONENT_DISCONNECTED' : 'ROOM_CLOSED', {
          roomId: room.id, playerId: session.playerId,
          reason: disconnected ? 'DISCONNECTED' : 'PLAYER_LEFT', reconnectSupported: false
        });
      }
    }
    this.destroyRoom(room.id);
    if (!disconnected) send(socket, 'ROOM_LEFT', { roomId: room.id }, requestId);
  }

  broadcastState(room) {
    for (const socket of Object.values(room.sockets)) {
      send(socket, 'GAME_STATE', publicState(room.state));
    }
  }

  getSession(ws) {
    return this.sessions.get(ws) ?? null;
  }

  getRoomForSocket(ws) {
    const session = this.getSession(ws);
    if (!session) return null;
    return this.rooms.get(session.roomId) ?? null;
  }

  destroyRoom(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return;

    for (const socket of Object.values(room.sockets)) {
      this.sessions.delete(socket);
    }

    this.rooms.delete(roomId);
  }
}
