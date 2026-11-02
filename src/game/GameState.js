import { GAME_CONFIG } from '../config/gameConfig.js';

export function createPlayer(id, x, y) {
  return {
    x,
    y,
    wallsLeft: GAME_CONFIG.wallsPerPlayer,
    cards: [...GAME_CONFIG.cardPool],
    skipTurns: 0,
    parkourMoves: 0,
    history: [{ x, y }],
    id
  };
}

export function createInitialGameState(roomId) {
  return {
    roomId,
    phase: GAME_CONFIG.phases.BOARD,
    boardSize: GAME_CONFIG.boardSize,
    turn: 'P1',
    turnNumber: 1,
    players: {
      P1: createPlayer('P1', GAME_CONFIG.startPositions.P1.x, GAME_CONFIG.startPositions.P1.y),
      P2: createPlayer('P2', GAME_CONFIG.startPositions.P2.x, GAME_CONFIG.startPositions.P2.y)
    },
    walls: [],
    fps: null,
    winner: null
  };
}

export function publicState(state) {
  return {
    ...state,
    players: Object.fromEntries(
      Object.entries(state.players).map(([id, player]) => [
        id,
        {
          x: player.x,
          y: player.y,
          wallsLeft: player.wallsLeft,
          cards: player.cards,
          skipTurns: player.skipTurns,
          parkourMoves: player.parkourMoves
        }
      ])
    )
  };
}
