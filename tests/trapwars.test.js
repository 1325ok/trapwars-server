import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialGameState, publicState } from '../src/game/GameState.js';
import { validWall, reachable } from '../src/game/Pathfinding.js';
import { advanceTurn, otherPlayer } from '../src/game/TurnManager.js';

test('initial state starts with P1 and valid goal paths', () => {
  const state = createInitialGameState('room-1');
  assert.equal(state.turn, 'P1');
  assert.equal(state.players.P1.x, 4);
  assert.equal(state.players.P2.y, 9);
  assert.equal(reachable(state, 'P1'), true);
  assert.equal(reachable(state, 'P2'), true);
  assert.equal(otherPlayer('P1'), 'P2');
});

test('validWall rejects overlapping and crossing walls', () => {
  const state = createInitialGameState('room-1');
  state.walls.push({ id: 'w-1', x: 3, y: 2, orientation: 'H', owner: 'P1' });
  assert.equal(validWall(state, 3, 2, 'H'), false);
  assert.equal(validWall(state, 3, 2, 'V'), false);
  assert.equal(validWall(state, 2, 2, 'V'), true);
});

test('turn advancement skips frozen opponent', () => {
  const state = createInitialGameState('room-1');
  state.players.P2.skipTurns = 2;
  advanceTurn(state, 'P1');
  assert.equal(state.turn, 'P1');
  assert.equal(state.players.P2.skipTurns, 1);
});

test('publicState removes hidden server fields', () => {
  const state = createInitialGameState('room-1');
  const visibleState = publicState(state);
  assert.equal(visibleState.roomId, 'room-1');
  assert.ok(visibleState.players.P1);
  assert.equal(Object.hasOwn(visibleState.players.P1, 'history'), false);
});
