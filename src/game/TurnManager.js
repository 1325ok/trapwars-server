export function otherPlayer(id) {
  return id === 'P1' ? 'P2' : 'P1';
}

export function advanceTurn(state, actingId) {
  let next = otherPlayer(actingId);
  state.turnNumber += 1;

  while (state.players[next] && state.players[next].skipTurns > 0) {
    state.players[next].skipTurns -= 1;
    state.turnNumber += 1;
    next = otherPlayer(next);
  }

  state.turn = next;
  return next;
}
