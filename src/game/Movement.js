import { SIZE } from '../config/gameConfig.js';

export function inBounds(x, y, size = SIZE) {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < size && y < size;
}

export function blocked(walls, ax, ay, bx, by) {
  for (const wall of walls) {
    if (wall.orientation === 'H' && ax === bx && Math.abs(ay - by) === 1) {
      const minY = Math.min(ay, by);
      if (minY === wall.y && (ax === wall.x || ax === wall.x + 1)) return true;
    }
    if (wall.orientation === 'V' && ay === by && Math.abs(ax - bx) === 1) {
      const minX = Math.min(ax, bx);
      if (minX === wall.x && (ay === wall.y || ay === wall.y + 1)) return true;
    }
  }
  return false;
}
