import { WebSocketServer, WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.PORT || 8080);
const SIZE = 10;
const WALLS_PER_PLAYER = 10;
const CARDS = ['BREAK', 'PARKOUR', 'FREEZE', 'ATTACK', 'COMEBACK'];
const waiting = [];
const rooms = new Map();
const sessions = new Map();

const wss = new WebSocketServer({ port: PORT });
console.log(`Trap Wars WS server: ws://localhost:${PORT}`);

function send(ws, type, payload, requestId = null) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, ...(requestId ? { requestId } : {}), payload }));
  }
}
function fail(ws, requestId, code, message) {
  send(ws, 'ACTION_REJECTED', { code, message }, requestId);
}
function inBounds(x, y) { return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < SIZE && y < SIZE; }
function newPlayer(x, y) { return { x, y, wallsLeft: WALLS_PER_PLAYER, cards: [...CARDS], skipTurns: 0, parkourMoves: 0, history: [{ x, y }] }; }
function newRoom(a, b) {
  const id = `room-${randomUUID().slice(0, 8)}`;
  const room = {
    id, sockets: { P1: a, P2: b },
    state: { roomId: id, phase: 'BOARD', boardSize: SIZE, turn: 'P1', turnNumber: 1,
      players: { P1: newPlayer(4, 0), P2: newPlayer(5, 9) }, walls: [],
      fps: null, winner: null }
  };
  rooms.set(id, room);
  sessions.set(a, { roomId: id, playerId: 'P1' });
  sessions.set(b, { roomId: id, playerId: 'P2' });
  send(a, 'MATCH_FOUND', { roomId: id, playerId: 'P1', boardSize: SIZE });
  send(b, 'MATCH_FOUND', { roomId: id, playerId: 'P2', boardSize: SIZE });
  broadcastState(room);
}
function publicState(s) {
  return {
    ...s,
    players: Object.fromEntries(Object.entries(s.players).map(([id, p]) => [id, {
      x: p.x, y: p.y, wallsLeft: p.wallsLeft, cards: p.cards,
      skipTurns: p.skipTurns, parkourMoves: p.parkourMoves
    }]))
  };
}
function broadcast(room, type, payload) {
  for (const ws of Object.values(room.sockets)) send(ws, type, payload);
}
function broadcastState(room) { broadcast(room, 'GAME_STATE', publicState(room.state)); }
function other(id) { return id === 'P1' ? 'P2' : 'P1'; }

// Wall coordinates: H(x,y) blocks edges (x,y)-(x,y+1) and (x+1,y)-(x+1,y+1).
// V(x,y) blocks edges (x,y)-(x+1,y) and (x,y+1)-(x+1,y+1).
// Both x,y are integers in 0..8. A wall occupies a 2-cell segment.
function blocked(walls, ax, ay, bx, by) {
  for (const w of walls) {
    if (w.orientation === 'H' && ax === bx && Math.abs(ay - by) === 1) {
      const minY = Math.min(ay, by);
      if (minY === w.y && (ax === w.x || ax === w.x + 1)) return true;
    }
    if (w.orientation === 'V' && ay === by && Math.abs(ax - bx) === 1) {
      const minX = Math.min(ax, bx);
      if (minX === w.x && (ay === w.y || ay === w.y + 1)) return true;
    }
  }
  return false;
}
function reachable(s, id) {
  const p = s.players[id];
  const goalY = id === 'P1' ? SIZE - 1 : 0;
  const queue = [[p.x, p.y]];
  const visited = new Set([`${p.x},${p.y}`]);
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i];
    if (y === goalY) return true;
    for (const [dx, dy] of [[0,1],[1,0],[0,-1],[-1,0]]) {
      const nx = x + dx, ny = y + dy, key = `${nx},${ny}`;
      if (!inBounds(nx, ny) || visited.has(key) || blocked(s.walls, x, y, nx, ny)) continue;
      visited.add(key); queue.push([nx, ny]);
    }
  }
  return false;
}
function validWall(s, x, y, orientation) {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x > 8 || y > 8 || !['H','V'].includes(orientation)) return false;
  // No overlap of same orientation; crossing perpendicular walls at same anchor forbidden.
  for (const w of s.walls) {
    if (w.orientation !== orientation && w.x === x && w.y === y) return false;
    if (w.orientation === orientation) {
      if (orientation === 'H' && w.y === y && Math.abs(w.x - x) <= 1) return false;
      if (orientation === 'V' && w.x === x && Math.abs(w.y - y) <= 1) return false;
    }
  }
  return true;
}
function advanceTurn(s, actingId) {
  let next = other(actingId);
  s.turnNumber++;
  // A frozen player loses the specified number of future turns.
  while (s.players[next].skipTurns > 0) {
    s.players[next].skipTurns--;
    s.turnNumber++;
    next = other(next);
  }
  s.turn = next;
}
function finish(room, winner, reason) {
  room.state.phase = 'FINISHED';
  room.state.winner = winner;
  room.state.fps = null;
  broadcastState(room);
  broadcast(room, 'GAME_RESULT', { winner, reason });
}
function startFps(room, attacker, durationSeconds, reason) {
  const s = room.state;
  s.phase = 'FPS';
  s.fps = { attacker, defender: other(attacker), durationSeconds, endsAt: Date.now() + durationSeconds * 1000, reason };
  broadcast(room, 'PHASE_CHANGED', { phase: 'FPS', fps: s.fps });
  broadcastState(room);
}
function handleAction(room, playerId, msg, ws) {
  const s = room.state, p = s.players[playerId], target = msg.payload ?? {};
  if (s.phase !== 'BOARD') return fail(ws, msg.requestId, 'WRONG_PHASE', 'Not in board phase');
  if (s.turn !== playerId) return fail(ws, msg.requestId, 'NOT_YOUR_TURN', 'Wait for your turn');
  if (msg.type === 'MOVE') {
    const { x, y } = target;
    if (!inBounds(x, y)) return fail(ws, msg.requestId, 'INVALID_COORD', 'Invalid tile');
    if (x === s.players[other(playerId)].x && y === s.players[other(playerId)].y) return fail(ws, msg.requestId, 'OCCUPIED', 'Tile occupied');
    const distance = Math.abs(x - p.x) + Math.abs(y - p.y);
    if (distance !== 1) return fail(ws, msg.requestId, 'INVALID_MOVE', 'MVP: only one orthogonal step');
    if (blocked(s.walls, p.x, p.y, x, y) && p.parkourMoves <= 0) return fail(ws, msg.requestId, 'WALL_BLOCKED', 'A wall blocks the move');
    if (blocked(s.walls, p.x, p.y, x, y)) p.parkourMoves--;
    p.x = x; p.y = y; p.history.push({ x, y });
    if ((playerId === 'P1' && y === 9) || (playerId === 'P2' && y === 0)) {
      startFps(room, playerId, 30, 'GOAL'); return;
    }
    advanceTurn(s, playerId);
  } else if (msg.type === 'PLACE_WALL') {
    const { x, y, orientation } = target;
    if (p.wallsLeft <= 0) return fail(ws, msg.requestId, 'NO_WALLS', 'No walls remaining');
    if (!validWall(s, x, y, orientation)) return fail(ws, msg.requestId, 'INVALID_WALL', 'Invalid, overlapping, or crossing wall');
    const wall = { id: `w-${randomUUID().slice(0, 8)}`, x, y, orientation, owner: playerId };
    s.walls.push(wall);
    if (!reachable(s, 'P1') || !reachable(s, 'P2')) {
      s.walls.pop(); return fail(ws, msg.requestId, 'PATH_BLOCKED', 'Both players must retain a path');
    }
    p.wallsLeft--;
    advanceTurn(s, playerId);
  } else if (msg.type === 'USE_CARD') {
    const { card, wallId } = target;
    if (!p.cards.includes(card)) return fail(ws, msg.requestId, 'NO_CARD', 'Card not owned');
    const opponent = s.players[other(playerId)];
    if (card === 'BREAK') {
      const index = s.walls.findIndex(w => w.id === wallId);
      if (index < 0) return fail(ws, msg.requestId, 'INVALID_TARGET', 'Wall not found');
      s.walls.splice(index, 1);
    } else if (card === 'PARKOUR') {
      p.parkourMoves++;
    } else if (card === 'FREEZE') {
      opponent.skipTurns += 2;
    } else if (card === 'COMEBACK') {
      if (opponent.history.length < 3) return fail(ws, msg.requestId, 'NO_HISTORY', 'Opponent has fewer than 2 prior moves');
      opponent.history.splice(-2);
      const previous = opponent.history.at(-1);
      opponent.x = previous.x; opponent.y = previous.y;
    } else if (card === 'ATTACK') {
      p.cards.splice(p.cards.indexOf(card), 1);
      startFps(room, playerId, 10, 'CARD'); return;
    } else return fail(ws, msg.requestId, 'INVALID_CARD', 'Unknown card');
    p.cards.splice(p.cards.indexOf(card), 1);
    advanceTurn(s, playerId);
  } else return fail(ws, msg.requestId, 'UNKNOWN_ACTION', 'Unsupported action');
  broadcastState(room);
}
function removeWaiting(ws) {
  const i = waiting.indexOf(ws);
  if (i >= 0) waiting.splice(i, 1);
}
function disconnect(ws) {
  removeWaiting(ws);
  const session = sessions.get(ws);
  if (!session) return;
  sessions.delete(ws);
  const room = rooms.get(session.roomId);
  if (!room) return;
  const opponentWs = room.sockets[other(session.playerId)];
  send(opponentWs, 'OPPONENT_DISCONNECTED', { roomId: room.id, playerId: session.playerId, reconnectSupported: false });
  sessions.delete(opponentWs);
  rooms.delete(room.id);
}
wss.on('connection', ws => {
  send(ws, 'WELCOME', { protocolVersion: 1, boardSize: SIZE });
  ws.on('message', data => {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return fail(ws, null, 'INVALID_JSON', 'Invalid JSON'); }
    if (!msg || typeof msg.type !== 'string') return fail(ws, msg?.requestId, 'INVALID_MESSAGE', 'Missing type');
    if (msg.type === 'PING') return send(ws, 'PONG', { serverTime: Date.now() }, msg.requestId);
    if (msg.type === 'MATCH_CANCEL') { removeWaiting(ws); return send(ws, 'MATCH_CANCELLED', {}, msg.requestId); }
    if (msg.type === 'MATCH_JOIN') {
      if (sessions.has(ws)) return fail(ws, msg.requestId, 'ALREADY_IN_GAME', 'Already in room');
      if (waiting.includes(ws)) return fail(ws, msg.requestId, 'ALREADY_WAITING', 'Already queued');
      let otherWs;
      while (waiting.length && !otherWs) {
        const candidate = waiting.shift();
        if (candidate !== ws && candidate.readyState === WebSocket.OPEN && !sessions.has(candidate)) otherWs = candidate;
      }
      if (otherWs) newRoom(otherWs, ws);
      else { waiting.push(ws); send(ws, 'MATCH_WAITING', { queuePosition: waiting.length }, msg.requestId); }
      return;
    }
    const session = sessions.get(ws);
    if (!session) return fail(ws, msg.requestId, 'NOT_IN_ROOM', 'Join matchmaking first');
    const room = rooms.get(session.roomId);
    if (!room) return fail(ws, msg.requestId, 'ROOM_NOT_FOUND', 'Room no longer exists');
    if (['MOVE', 'PLACE_WALL', 'USE_CARD'].includes(msg.type)) return handleAction(room, session.playerId, msg, ws);
    if (msg.type === 'GET_STATE') return send(ws, 'GAME_STATE', publicState(room.state), msg.requestId);
    // FPS movement/hit validation and reconnect are NOT implemented in this starter.
    return fail(ws, msg.requestId, 'NOT_IMPLEMENTED', 'This message is not implemented in v0.1');
  });
  ws.on('close', () => disconnect(ws));
  ws.on('error', () => disconnect(ws));
});

setInterval(() => {
  for (const room of rooms.values()) {
    const s = room.state;
    if (s.phase !== 'FPS' || !s.fps || Date.now() < s.fps.endsAt) continue;
    const { attacker, defender, reason } = s.fps;
    if (reason === 'GOAL') finish(room, defender, 'DEFENDER_SURVIVED_30S');
    else {
      // Temporary ATTACK card FPS phase ends without a hit: return to board.
      s.phase = 'BOARD'; s.fps = null;
      advanceTurn(s, attacker);
      broadcast(room, 'PHASE_CHANGED', { phase: 'BOARD' });
      broadcastState(room);
    }
  }
}, 200);
