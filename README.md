"# Trap Wars Server

Node.js WebSocket multiplayer server for the Trap Wars board game.

## Quick start

```bash
cd server
npm install
npm start
```

## Test

```bash
cd server
npm test
```

## Runtime notes

- Default port: 8080
- PowerShell override: `$env:PORT=8080; npm.cmd start`
- If PowerShell blocks `npm.ps1`, use `npm.cmd install`, `npm.cmd start`, and `npm.cmd test`.
- Local Unity client: `ws://127.0.0.1:8080`
- LAN client: `ws://<server-ip>:8080`

## Included modules

- `src/server.js` — entry point and WebSocket lifecycle
- `src/config/gameConfig.js` — board constants and game settings
- `src/rooms/RoomManager.js` — room and session state
- `src/game/GameEngine.js` — move/wall/card validation and state updates
- `src/game/Pathfinding.js` — BFS path validation
- `src/game/TurnManager.js` — turn and freeze logic
- `src/fps/FpsEngine.js` — timer-based FPS phase resolution
- `tests/trapwars.test.js` — automated logic and websocket tests

## Implemented in this build

- 2-player rooms: list, create, join and leave; automatically start when full
- `ROOM_LIST`, `ROOM_CREATE`, `ROOM_JOIN`, `ROOM_LEAVE`, `PING`, `GET_STATE`
- `MOVE`, `PLACE_WALL`, `USE_CARD`
- Wall overlap and path-blocking validation
- Turn enforcement and freeze skip logic
- Card effects for `BREAK`, `PARKOUR`, `FREEZE`, `ATTACK`, `COMEBACK`
- FPS phase timer transition and return to the existing board after ATTACK
- Room/session cleanup on disconnect and game completion; play again using `ROOM_CREATE` or `ROOM_JOIN`
- COMEBACK rejects occupied or unreachable return positions without consuming the card

## Known limitations

- FPS combat hit, shot, and kill resolution is not yet implemented
- GOAL currently always ends in defender victory after 30 seconds; attacker victory requires combat implementation
- Reconnect flow is deliberately disabled (`reconnectSupported: false`)
- Card balancing and full gameplay tuning are still pending
- This server is authoritative: all final state decisions are made on the server

## Compatibility

Protocol v2 replaces queue matchmaking with rooms. The JSON envelope and game state schema remain unchanged. Main messages include:

- `WELCOME`
- `GAME_STARTED`
- `GAME_STATE`
- `ACTION_REJECTED`
- `PHASE_CHANGED`
- `GAME_RESULT`
- `OPPONENT_DISCONNECTED`

For the complete request/response schema, see [docs/PROTOCOL.md](docs/PROTOCOL.md).
" 
