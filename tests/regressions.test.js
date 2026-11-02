import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import WebSocket from 'ws';
import { createServer } from '../src/server.js';
import { RoomManager } from '../src/rooms/RoomManager.js';
import { GameEngine } from '../src/game/GameEngine.js';
import { FpsEngine } from '../src/fps/FpsEngine.js';
import { GAME_CONFIG } from '../src/config/gameConfig.js';

function fixture() {
  const socket = () => ({ readyState: 1, messages: [], send(data) { this.messages.push(JSON.parse(data)); } });
  const a = socket(), b = socket();
  const manager = new RoomManager();
  const room = manager.createRoom(a);
  manager.joinRoom(b, room.id);
  const engine = new GameEngine(manager);
  const act = (type, payload, player = 'P1') => engine.handleAction(room, player, { type, payload }, player === 'P1' ? a : b);
  return { a, b, manager, room, engine, act };
}

test('COMEBACK rejects occupied return without changing state', () => {
  const { room, act, a } = fixture();
  Object.assign(room.state.players.P1, { x: 5, y: 7 });
  room.state.players.P2.history = [{ x: 5, y: 7 }, { x: 5, y: 8 }, { x: 5, y: 9 }];
  const before = structuredClone(room.state);
  act('USE_CARD', { card: 'COMEBACK' });
  assert.equal(a.messages.at(-1).payload.code, 'OCCUPIED');
  assert.deepEqual(room.state, before);
});

test('COMEBACK rejects return trapped by walls added after movement', () => {
  const { room, act, a } = fixture();
  room.state.players.P2.history = [{ x: 0, y: 9 }, { x: 1, y: 9 }, { x: 2, y: 9 }];
  Object.assign(room.state.players.P2, { x: 2, y: 9 });
  room.state.walls = [{ x: 0, y: 8, orientation: 'H' }, { x: 1, y: 8, orientation: 'V' }];
  const before = structuredClone(room.state);
  act('USE_CARD', { card: 'COMEBACK' });
  assert.equal(a.messages.at(-1).payload.code, 'PATH_BLOCKED');
  assert.deepEqual(room.state, before);
});

test('COMEBACK restores two moves and consumes exactly one card and turn', () => {
  const { room, act } = fixture();
  room.state.players.P2.history = [{ x: 5, y: 9 }, { x: 5, y: 8 }, { x: 5, y: 7 }];
  Object.assign(room.state.players.P2, { x: 5, y: 7 });
  act('USE_CARD', { card: 'COMEBACK' });
  assert.equal(room.state.players.P2.y, 9);
  assert.equal(room.state.players.P2.history.length, 1);
  assert.equal(room.state.players.P1.cards.includes('COMEBACK'), false);
  assert.equal(room.state.turn, 'P2');
});

test('finish broadcasts result before releasing room and both sessions', () => {
  const { room, engine, manager, a, b } = fixture();
  engine.finishGame(room, 'P1', 'TEST');
  assert.equal(manager.rooms.size, 0);
  assert.equal(manager.sessions.size, 0);
  for (const ws of [a, b]) {
    assert.equal(ws.messages.at(-2).payload.phase, 'FINISHED');
    assert.equal(ws.messages.at(-1).type, 'GAME_RESULT');
    assert.equal(ws.messages.some(m => m.type === 'OPPONENT_DISCONNECTED'), false);
  }
  const next = manager.createRoom(a);
  manager.joinRoom(b, next.id);
  assert.equal(manager.rooms.size, 1);
});

test('room list, validation, full rooms and explicit leave lifecycle', () => {
  const { room, manager, a, b } = fixture();
  const c = { readyState: 1, messages: [], send(data) { this.messages.push(JSON.parse(data)); } };
  assert.equal(manager.listRooms()[0].status, 'PLAYING');
  manager.joinRoom(c, room.id);
  assert.equal(c.messages.at(-1).payload.code, 'ROOM_FULL');
  manager.createRoom(a);
  assert.equal(a.messages.at(-1).payload.code, 'ALREADY_IN_ROOM');
  manager.leaveRoom(a, 'leave');
  assert.equal(a.messages.at(-1).type, 'ROOM_LEFT');
  assert.equal(a.messages.at(-1).requestId, 'leave');
  assert.equal(b.messages.at(-1).type, 'ROOM_CLOSED');
  assert.equal(b.messages.at(-1).payload.playerId, 'P1');
  assert.deepEqual(manager.listRooms(), []);
  manager.createRoom(c, '  ');
  assert.equal(c.messages.at(-1).payload.code, 'INVALID_ROOM_NAME');
  manager.joinRoom(c, 'missing');
  assert.equal(c.messages.at(-1).payload.code, 'ROOM_NOT_FOUND');
  const waiting = manager.createRoom(c, '  Lobby  ');
  assert.deepEqual(manager.listRooms(), [{ roomId: waiting.id, name: 'Lobby', status: 'WAITING', playerCount: 1, maxPlayers: 2 }]);
  manager.leaveRoom(c);
  assert.equal(manager.rooms.size, 0);
  assert.equal(manager.sessions.size, 0);
});

test('movement enforces turns, walls and unchanged state on rejection', () => {
  const { room, act, a, b } = fixture();
  act('MOVE', { x: 5, y: 8 }, 'P2');
  assert.equal(b.messages.at(-1).payload.code, 'NOT_YOUR_TURN');
  act('PLACE_WALL', { x: 4, y: 0, orientation: 'H' });
  assert.equal(room.state.players.P1.wallsLeft, 9);
  act('MOVE', { x: 5, y: 8 }, 'P2');
  const before = structuredClone(room.state);
  act('MOVE', { x: 4, y: 1 });
  assert.equal(a.messages.at(-1).payload.code, 'WALL_BLOCKED');
  assert.deepEqual(room.state, before);
});

test('FREEZE skips exactly two opposing turns', () => {
  const { room, act } = fixture();
  act('USE_CARD', { card: 'FREEZE' });
  assert.equal(room.state.turn, 'P1');
  act('MOVE', { x: 4, y: 1 });
  assert.equal(room.state.turn, 'P1');
  assert.equal(room.state.players.P2.skipTurns, 0);
  act('MOVE', { x: 4, y: 2 });
  assert.equal(room.state.turn, 'P2');
});

test('ATTACK uses configured duration and returns to board on expiry', () => {
  const { room, act, engine } = fixture();
  act('USE_CARD', { card: 'ATTACK' });
  assert.equal(room.state.fps.durationSeconds, GAME_CONFIG.fps.attackDurationSeconds);
  room.state.fps.endsAt = 0;
  new FpsEngine(engine).update(room);
  assert.equal(room.state.phase, 'BOARD');
  assert.equal(room.state.turn, 'P2');
});

test('wall placement cannot seal a goal path and rejection preserves inventory', () => {
  const { room, act, a } = fixture();
  Object.assign(room.state.players.P1, { x: 0, y: 0 });
  room.state.walls = [{ x: 0, y: 1, orientation: 'V' }];
  act('PLACE_WALL', { x: 0, y: 0, orientation: 'H' });
  // The corner still has a route through (1,0), so this placement is valid.
  assert.equal(room.state.players.P1.wallsLeft, 9);
  room.state.turn = 'P1';
  const before = structuredClone(room.state);
  act('PLACE_WALL', { x: 1, y: 0, orientation: 'V' });
  assert.equal(a.messages.at(-1).payload.code, 'PATH_BLOCKED');
  assert.deepEqual(room.state, before);
});

test('PARKOUR persists on ordinary movement and consumes on wall crossing; BREAK removes target', () => {
  const { room, act } = fixture();
  room.state.walls = [{ id: 'wall', x: 4, y: 1, orientation: 'H' }];
  act('USE_CARD', { card: 'PARKOUR' });
  act('MOVE', { x: 5, y: 8 }, 'P2');
  act('MOVE', { x: 4, y: 1 });
  assert.equal(room.state.players.P1.parkourMoves, 1);
  act('MOVE', { x: 5, y: 7 }, 'P2');
  act('MOVE', { x: 4, y: 2 });
  assert.equal(room.state.players.P1.parkourMoves, 0);
  act('USE_CARD', { card: 'BREAK', wallId: 'wall' }, 'P2');
  assert.equal(room.state.walls.length, 0);
  assert.equal(room.state.players.P2.cards.includes('BREAK'), false);
});

async function client(port, t) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const messages = [];
  ws.on('message', data => messages.push(JSON.parse(data)));
  t.after(() => ws.terminate());
  await once(ws, 'open');
  return {
    ws, messages,
    send(type, payload = {}) { ws.send(JSON.stringify({ type, payload })); },
    async wait(type) {
      const deadline = Date.now() + 2000;
      while (Date.now() < deadline) {
        const index = messages.findIndex(m => m.type === type);
        if (index >= 0) return messages.splice(index, 1)[0];
        await new Promise(resolve => setTimeout(resolve, 5));
      }
      throw new Error(`Timed out waiting for ${type}`);
    }
  };
}

test('real sockets: disconnect notifies once with departed ID and permits rematch', { timeout: 8000 }, async t => {
  const wss = createServer(0);
  t.after(async () => {
    for (const ws of wss.clients) ws.terminate();
    await new Promise(resolve => wss.close(resolve));
  });
  const port = wss.address().port;
  const a = await client(port, t), b = await client(port, t);
  a.send('ROOM_CREATE', { name: 'Test' });
  const created = await a.wait('ROOM_CREATED');
  b.send('ROOM_JOIN', { roomId: created.payload.roomId });
  const found = await a.wait('GAME_STARTED');
  await b.wait('GAME_STARTED');
  const initial = await b.wait('GAME_STATE');
  assert.equal(initial.payload.roomId, found.payload.roomId);
  assert.equal(initial.payload.turn, 'P1');
  a.ws.close();
  const departed = await b.wait('OPPONENT_DISCONNECTED');
  assert.equal(departed.payload.playerId, found.payload.playerId);
  b.send('ROOM_CREATE');
  const next = await b.wait('ROOM_CREATED');
  assert.equal(b.messages.filter(m => m.type === 'OPPONENT_DISCONNECTED').length, 0);
  const c = await client(port, t);
  c.send('ROOM_JOIN', { roomId: next.payload.roomId });
  assert.notEqual((await b.wait('GAME_STARTED')).payload.roomId, found.payload.roomId);
  b.ws.send('{broken');
  assert.equal((await b.wait('ACTION_REJECTED')).payload.code, 'INVALID_JSON');
  b.send('MOVE', []);
  assert.equal((await b.wait('ACTION_REJECTED')).payload.code, 'INVALID_MESSAGE');
});

test('real sockets: four clients form isolated rooms and synchronize only their own moves', { timeout: 8000 }, async t => {
  const wss = createServer(0);
  t.after(async () => {
    for (const ws of wss.clients) ws.terminate();
    await new Promise(resolve => wss.close(resolve));
  });
  const clients = [];
  for (let i = 0; i < 4; i++) clients.push(await client(wss.address().port, t));
  const [a, b, c, d] = clients;
  for (const [first, second] of [[a, b], [c, d]]) {
    first.send('ROOM_CREATE');
    const created = await first.wait('ROOM_CREATED');
    second.send('ROOM_JOIN', { roomId: created.payload.roomId });
  }
  const matches = await Promise.all(clients.map(c => c.wait('GAME_STARTED')));
  assert.equal(matches[0].payload.roomId, matches[1].payload.roomId);
  assert.equal(matches[2].payload.roomId, matches[3].payload.roomId);
  assert.notEqual(matches[0].payload.roomId, matches[2].payload.roomId);
  await Promise.all(clients.map(c => c.wait('GAME_STATE')));
  a.send('MOVE', { x: 4, y: 1 });
  for (const own of [a, b]) {
    const state = (await own.wait('GAME_STATE')).payload;
    assert.equal(state.players.P1.y, 1);
    assert.equal(state.turn, 'P2');
  }
  // Ordered GET_STATE responses act as a barrier for the other sockets.
  for (const other of [c, d]) {
    other.send('GET_STATE');
    const state = (await other.wait('GAME_STATE')).payload;
    assert.equal(state.roomId, matches[2].payload.roomId);
    assert.equal(state.players.P1.y, 0);
    assert.equal(other.messages.some(m => m.type === 'GAME_STATE'), false);
  }
});
