export const GAME_CONFIG = {
  boardSize: 10,
  size: 10,
  wallsPerPlayer: 10,
  maxWalls: 20,
  playerIds: ['P1', 'P2'],
  cardPool: ['BREAK', 'PARKOUR', 'FREEZE', 'ATTACK', 'COMEBACK'],
  phases: {
    BOARD: 'BOARD',
    FPS: 'FPS',
    FINISHED: 'FINISHED'
  },
  startPositions: {
    P1: { x: 4, y: 0 },
    P2: { x: 5, y: 9 }
  },
  goalRows: { P1: 9, P2: 0 },
  fps: {
    goalDurationSeconds: 30,
    attackDurationSeconds: 10,
    tickMs: 200
  }
};

export const SIZE = GAME_CONFIG.size;
export const BOARD_SIZE = GAME_CONFIG.boardSize;
export const WALLS_PER_PLAYER = GAME_CONFIG.wallsPerPlayer;
export const MAX_WALLS = GAME_CONFIG.maxWalls;
export const PLAYER_IDS = GAME_CONFIG.playerIds;
export const CARDS = [...GAME_CONFIG.cardPool];
