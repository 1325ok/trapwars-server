import { randomUUID } from 'node:crypto';

import { GAME_CONFIG } from '../config/gameConfig.js';
import { send, fail } from '../network/protocol.js';
import { publicState } from './GameState.js';
import { blocked, inBounds } from './Movement.js';
import { reachable, validWall } from './Pathfinding.js';
import { advanceTurn, otherPlayer } from './TurnManager.js';

export class GameEngine {
  constructor(roomManager) {
    this.roomManager = roomManager;
  }

  broadcast(room, type, payload) {
    for (const ws of Object.values(room.sockets)) {
      send(ws, type, payload);
    }
  }

  broadcastState(room) {
    this.broadcast(room, 'GAME_STATE', publicState(room.state));
  }

  finishGame(room, winner, reason) {
    room.state.phase = GAME_CONFIG.phases.FINISHED;
    room.state.winner = winner;
    room.state.fps = null;
    this.broadcastState(room);
    this.broadcast(room, 'GAME_RESULT', { winner, reason });
    this.roomManager.destroyRoom(room.id);
  }

  startFps(room, attacker, durationSeconds, reason) {
    const s = room.state;
    s.phase = GAME_CONFIG.phases.FPS;
    s.fps = {
      attacker,
      defender: otherPlayer(attacker),
      durationSeconds,
      endsAt: Date.now() + durationSeconds * 1000,
      reason
    };
    this.broadcast(room, 'PHASE_CHANGED', { phase: 'FPS', fps: s.fps });
    this.broadcastState(room);
  }

  handleAction(room, playerId, msg, ws) {
    const s = room.state;
    const p = s.players[playerId];
    const target = msg.payload ?? {};

    if (s.phase !== GAME_CONFIG.phases.BOARD) {
      return fail(ws, msg.requestId, 'WRONG_PHASE', 'Not in board phase');
    }
    if (s.turn !== playerId) {
      return fail(ws, msg.requestId, 'NOT_YOUR_TURN', 'Wait for your turn');
    }

    if (msg.type === 'MOVE') {
      const { x, y } = target;
      const opponent = s.players[otherPlayer(playerId)];

      if (!inBounds(x, y)) {
        return fail(ws, msg.requestId, 'INVALID_COORD', 'Invalid tile');
      }
      if (x === opponent.x && y === opponent.y) {
        return fail(ws, msg.requestId, 'OCCUPIED', 'Tile occupied');
      }

      const distance = Math.abs(x - p.x) + Math.abs(y - p.y);
      if (distance !== 1) {
        return fail(ws, msg.requestId, 'INVALID_MOVE', 'Only one orthogonal step is allowed');
      }

      const wallBlocked = blocked(s.walls, p.x, p.y, x, y);
      if (wallBlocked && p.parkourMoves <= 0) {
        return fail(ws, msg.requestId, 'WALL_BLOCKED', 'A wall blocks the move');
      }
      if (wallBlocked) {
        p.parkourMoves = Math.max(0, p.parkourMoves - 1);
      }

      p.x = x;
      p.y = y;
      p.history.push({ x, y });

      if ((playerId === 'P1' && y === GAME_CONFIG.goalRows.P1) || (playerId === 'P2' && y === GAME_CONFIG.goalRows.P2)) {
        this.startFps(room, playerId, GAME_CONFIG.fps.goalDurationSeconds, 'GOAL');
        return;
      }

      advanceTurn(s, playerId);
      this.broadcastState(room);
      return;
    }

    if (msg.type === 'PLACE_WALL') {
      const { x, y, orientation } = target;

      if (p.wallsLeft <= 0) {
        return fail(ws, msg.requestId, 'NO_WALLS', 'No walls remaining');
      }
      if (!validWall(s, x, y, orientation)) {
        return fail(ws, msg.requestId, 'INVALID_WALL', 'Invalid, overlapping, or crossing wall');
      }

      const wall = { id: `w-${randomUUID().slice(0, 8)}`, x, y, orientation, owner: playerId };
      s.walls.push(wall);
      if (!reachable(s, 'P1') || !reachable(s, 'P2')) {
        s.walls.pop();
        return fail(ws, msg.requestId, 'PATH_BLOCKED', 'Both players must retain a path');
      }

      p.wallsLeft -= 1;
      advanceTurn(s, playerId);
      this.broadcastState(room);
      return;
    }

    if (msg.type === 'USE_CARD') {
      const { card, wallId } = target;
      const cardIndex = p.cards.indexOf(card);
      const opponent = s.players[otherPlayer(playerId)];

      if (cardIndex < 0) {
        return fail(ws, msg.requestId, 'NO_CARD', 'Card not owned');
      }

      if (card === 'BREAK') {
        const wallIndex = s.walls.findIndex((wall) => wall.id === wallId);
        if (wallIndex < 0) {
          return fail(ws, msg.requestId, 'INVALID_TARGET', 'Wall not found');
        }
        s.walls.splice(wallIndex, 1);
      } else if (card === 'PARKOUR') {
        p.parkourMoves += 1;
      } else if (card === 'FREEZE') {
        opponent.skipTurns += 2;
      } else if (card === 'COMEBACK') {
        if (opponent.history.length < 3) {
          return fail(ws, msg.requestId, 'NO_HISTORY', 'Opponent has fewer than 2 prior moves');
        }
        const previous = opponent.history.at(-3);
        if (previous.x === p.x && previous.y === p.y) {
          return fail(ws, msg.requestId, 'OCCUPIED', 'Return tile occupied');
        }
        // Validate a candidate state before consuming the card or movement history.
        const candidate = {
          ...s,
          players: { ...s.players, [otherPlayer(playerId)]: { ...opponent, ...previous } }
        };
        if (!reachable(candidate, 'P1') || !reachable(candidate, 'P2')) {
          return fail(ws, msg.requestId, 'PATH_BLOCKED', 'Return tile must retain a goal path');
        }
        opponent.history.splice(-2);
        opponent.x = previous.x;
        opponent.y = previous.y;
      } else if (card === 'ATTACK') {
        p.cards.splice(cardIndex, 1);
        this.startFps(room, playerId, GAME_CONFIG.fps.attackDurationSeconds, 'CARD');
        return;
      } else {
        return fail(ws, msg.requestId, 'INVALID_CARD', 'Unknown card');
      }

      p.cards.splice(cardIndex, 1);
      advanceTurn(s, playerId);
      this.broadcastState(room);
      return;
    }

    return fail(ws, msg.requestId, 'UNKNOWN_ACTION', 'Unsupported action');
  }
}
