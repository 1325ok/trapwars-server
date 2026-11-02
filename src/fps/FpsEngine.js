import { GAME_CONFIG } from '../config/gameConfig.js';
import { advanceTurn } from '../game/TurnManager.js';

export class FpsEngine {
  constructor(gameEngine) {
    this.gameEngine = gameEngine;
  }

  update(room) {
    const state = room.state;
    if (state.phase !== GAME_CONFIG.phases.FPS || !state.fps || Date.now() < state.fps.endsAt) {
      return;
    }

    const { attacker, defender, reason } = state.fps;
    if (reason === 'GOAL') {
      this.gameEngine.finishGame(room, defender, 'DEFENDER_SURVIVED_30S');
      return;
    }

    state.phase = GAME_CONFIG.phases.BOARD;
    state.fps = null;
    advanceTurn(state, attacker);
    this.gameEngine.broadcast(room, 'PHASE_CHANGED', { phase: 'BOARD' });
    this.gameEngine.broadcastState(room);
  }
}
