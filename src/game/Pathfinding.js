import { GAME_CONFIG, SIZE } from '../config/gameConfig.js';
import { blocked, inBounds } from './Movement.js';

export function reachable(state, playerId) {
  const player = state.players[playerId];
  const goalY = GAME_CONFIG.goalRows[playerId];
  const queue = [[player.x, player.y]];
  const visited = new Set([`${player.x},${player.y}`]);

  while (queue.length > 0) {
    const [x, y] = queue.shift();
    if (y === goalY) return true;

    for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
      const nx = x + dx;
      const ny = y + dy;
      const key = `${nx},${ny}`;
      if (!inBounds(nx, ny, SIZE) || visited.has(key)) continue;
      if (blocked(state.walls, x, y, nx, ny)) continue;
      visited.add(key);
      queue.push([nx, ny]);
    }
  }

  return false;
}

export function validWall(state, x, y, orientation) {
  if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
  if (x < 0 || y < 0 || x > SIZE - 2 || y > SIZE - 2) return false;
  if (!['H', 'V'].includes(orientation)) return false;

  for (const wall of state.walls) {
    if (wall.orientation !== orientation && wall.x === x && wall.y === y) return false;
    if (wall.orientation === orientation) {
      if (orientation === 'H' && wall.y === y && Math.abs(wall.x - x) <= 1) return false;
      if (orientation === 'V' && wall.x === x && Math.abs(wall.y - y) <= 1) return false;
    }
  }

  return true;
}
