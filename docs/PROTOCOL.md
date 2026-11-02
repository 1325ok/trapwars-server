# WebSocket API 명세

## 전체 API  목록

| 방향 | type | 용도 |
|---|---|---|
| C→S | PING | 연결 및 서버 시각 확인 |
| C→S | ROOM_LIST | 전체 방 조회 |
| C→S | ROOM_CREATE | 대기방 생성 |
| C→S | ROOM_JOIN | 지정 방 입장 |
| C→S | ROOM_LEAVE | 대기·진행 중 방 퇴장 |
| C→S | GET_STATE | 현재 게임 상태 조회 |
| C→S | MOVE | 말 이동 |
| C→S | PLACE_WALL | 벽 설치 |
| C→S | USE_CARD | 카드 사용 |
| S→C | WELCOME | 연결 초기 정보 |
| S→C | PONG | PING 응답 |
| S→C | ROOM_LIST | 방 목록 스냅샷 |
| S→C | ROOM_CREATED | 생성 확인 및 P1 배정 |
| S→C | ROOM_JOINED | 입장 확인 및 P2 배정 |
| S→C | GAME_STARTED | 각 참가자에게 게임 시작 알림 |
| S→C | ROOM_LEFT | 요청자 퇴장 완료 |
| S→C | ROOM_CLOSED | 상대 명시적 퇴장으로 방 폐쇄 |
| S→C | OPPONENT_DISCONNECTED | 상대 연결 종료로 방 폐쇄 |
| S→C | GAME_STATE | 전체 상태 스냅샷 |
| S→C | PHASE_CHANGED | FPS 진입·BOARD 복귀 |
| S→C | GAME_RESULT | 최종 승자 및 사유 |
| S→C | ACTION_REJECTED | 요청 거절 |

## 연결 및 메시지

- PowerShell: `npm.cmd install`, `npm.cmd start`
- 포트 변경: `$env:PORT=8080; npm.cmd start`
- 로컬: `ws://127.0.0.1:8080`, LAN: `ws://<서버-IP>:8080`
- WELCOME: `{"protocolVersion":2,"boardSize":10}`

```json
{"type":"ROOM_JOIN","requestId":"req-1","payload":{"roomId":"room-..."}}
```

payload는 생략하거나 객체로 전송합니다. null/배열/문자열 등은 INVALID_MESSAGE입니다.
requestId는 선택 문자열입니다. 비어 있지 않은 값은 직접 응답에 포함되며 방송에는 포함되지 않습니다. 빈 문자열은 응답에서 생략됩니다.
서버가 플레이어 ID와 게임 판정을 관리하며 GAME_STATE가 최종 상태입니다.

type은 대소문자를 구분합니다. 추가 필드는 현재 무시됩니다. playerId를 요청에 보내도 행동자는 WebSocket 세션으로 결정합니다.
성공한 MOVE/PLACE_WALL/USE_CARD에는 requestId가 포함된 별도 ACK가 없으며 GAME_STATE로 결과를 확인합니다.
requestId는 중복 실행을 방지하지 않습니다. 같은 요청을 재전송하면 새 행동으로 처리되므로 지연 시 자동 재전송 대신 GET_STATE로 확인하세요.
직접 인증, 별도 HTTP API 및 TLS 설정은 없습니다. 상태는 메모리에 저장되며 서버 재시작 시 소멸합니다.
TCP 포트 확인과 WebSocket 연결은 별개이며 WELCOME 수신으로 실제 연결을 확인합니다.

## 방 요청

| type | payload | 설명 |
|---|---|---|
| ROOM_LIST | `{}` | 방 목록 스냅샷 조회 |
| ROOM_CREATE | `{"name":"같이해요"}` | 방 생성. 이름 생략 시 Trap Wars |
| ROOM_JOIN | `{"roomId":"room-..."}` | 지정 방 입장 |
| ROOM_LEAVE | `{}` | 대기 또는 게임 중 퇴장 |
| PING | `{}` | PONG으로 serverTime 응답 |

방 이름은 공백 제거 후 최대 40자   
한 연결은 한 방에만 참여 ㄱㄴ   
방장이 P1이고 두 번째 플레이어가 입장하면 P2로 넣고 바로 게임 시작 됨   
준비 버튼, 방장 위임, 비밀번호, 관전, 재접속은 음

## 방 응답 및 알림

| type | payload | 설명 |
|---|---|---|
| ROOM_LIST | `rooms` | 전체 방 목록 |
| ROOM_CREATED | `roomId,name,playerId,status` | 생성 완료, WAITING |
| ROOM_JOINED | `roomId,name,playerId,status` | 입장 완료, PLAYING |
| GAME_STARTED | `roomId,playerId,boardSize` | 양쪽에 시작 알림, 이후 GAME_STATE |
| ROOM_LEFT | `roomId` | 퇴장자에게 확인 |
| ROOM_CLOSED | `roomId,playerId,reason,reconnectSupported` | 상대 퇴장으로 방 종료 |
| OPPONENT_DISCONNECTED | `roomId,playerId,reason,reconnectSupported` | 상대 연결 종료 |
| ACTION_REJECTED | `code,message` | 요청 거절 |

```json
{"type":"ROOM_LIST","payload":{"rooms":[{"roomId":"room-...","name":"같이해요","status":"WAITING","playerCount":1,"maxPlayers":2}]}}
```

status는 WAITING 또는 PLAYING입니다. PLAYING 방은 목록에 보이지만 입장할 수 없습니다.
목록은 자동 갱신되지 않습니다. 새로고침 버튼에서 ROOM_LIST를 요청하세요.
목록 조회 후 다른 사람이 먼저 입장할 수 있으므로 입장 실패 시 목록을 다시 조회하세요.

ROOM_LEAVE 시 방과 양쪽 세션을 해제합니다. 상대에게 ROOM_CLOSED(reason=PLAYER_LEFT)를 보냅니다.
연결 종료 시 상대에게 OPPONENT_DISCONNECTED(reason=DISCONNECTED)를 한 번 보냅니다.
playerId는 이탈자의 ID이며 reconnectSupported=false입니다. 남은 클라이언트도 로비로 돌아갑니다.
이후 연결을 유지한 채 새 방 생성/입장이 가능합니다.

오류: ALREADY_IN_ROOM, INVALID_ROOM_NAME, INVALID_ROOM_ID, ROOM_NOT_FOUND, ROOM_FULL, NOT_IN_ROOM.
대기 중 GET_STATE 및 보드 행동은 GAME_NOT_STARTED로 거절합니다.
기존 MATCH_JOIN/MATCH_CANCEL은 MATCHMAKING_REMOVED로 거절합니다. MATCH_FOUND는 GAME_STARTED로 대체됩니다.

## 게임 요청 및 상태

| type | payload |
|---|---|
| GET_STATE | `{}` |
| MOVE | `{"x":4,"y":1}` |
| PLACE_WALL | `{"x":3,"y":2,"orientation":"H"}` |
| USE_CARD | `{"card":"BREAK","wallId":"w-001"}` |

```json
{"type":"GAME_STATE","payload":{"roomId":"room-...","phase":"BOARD","boardSize":10,"turn":"P1","turnNumber":1,"players":{"P1":{"x":4,"y":0,"wallsLeft":10,"cards":["BREAK","PARKOUR","FREEZE","ATTACK","COMEBACK"],"skipTurns":0,"parkourMoves":0},"P2":{"x":5,"y":9,"wallsLeft":10,"cards":["BREAK","PARKOUR","FREEZE","ATTACK","COMEBACK"],"skipTurns":0,"parkourMoves":0}},"walls":[],"fps":null,"winner":null}}
```

10×10 보드, 왼쪽 위 (0,0), x는 오른쪽, y는 아래로 증가합니다.
P1 시작 (4,0), 목표 y=9. P2 시작 (5,9), 목표 y=0. P1부터 시작합니다.
직교 한 칸 이동만 가능하며 상대 칸 이동, 점프 및 대각선 이동은 지원하지 않습니다.
유효하지 않은 행동은 턴과 상태를 변경하지 않습니다.

벽은 `{id,x,y,orientation,owner}` 구조이며 기준 좌표는 0~8입니다.
H(x,y)는 (x,y)↔(x,y+1), (x+1,y)↔(x+1,y+1)을 차단합니다.
V(x,y)는 (x,y)↔(x+1,y), (x,y+1)↔(x+1,y+1)을 차단합니다.
중복·부분 겹침·교차를 금지하고 BFS로 양쪽 목표 경로를 검사합니다. 각자 벽 10개로 시작합니다.

## 카드와 FPS

- BREAK: wallId에 해당하는 벽 제거.
- PARKOUR: 벽을 무시하는 직교 한 칸 이동 기회 1회. 실제 벽 통과 시 소모되고 일반 이동에는 유지.
- FREEZE: 상대의 향후 2턴을 건너뜀.
- COMEBACK: 상대의 최근 이동 2회 되돌림. 벽 설치·카드 사용은 이동 기록에 포함하지 않음. 복귀 칸 점유 시 OCCUPIED, 목표 경로가 사라지면 PATH_BLOCKED. 거절 시 카드·기록·턴을 보존.
- ATTACK: 10초 FPS 후 기존 보드로 복귀하고 다음 턴 진행. 동결 효과 적용.

카드는 각각 한 장 지급되고 사용 시 소모됩니다. 일반 카드 사용도 한 턴을 소비합니다. 지급·밸런스는 임시 규칙입니다.
목표 도달 시 30초 GOAL FPS로 전환합니다. PHASE_CHANGED에 phase 및 FPS 진입 시 fps를 전송합니다.
fps는 attacker, defender, durationSeconds, endsAt(서버 Unix 밀리초), reason(GOAL/CARD)을 포함합니다.
실제 전투 입력·이동·충돌·사격·피격·탄약은 미구현입니다. 현재 GOAL은 항상 30초 후 방어자 승리입니다.
ATTACK 전투 승리의 처리 및 무기 수치는 미확정입니다. 클라이언트가 HIT/KILL/WIN으로 결과를 확정할 수 없습니다.

게임 종료 시 GAME_STATE(phase=FINISHED) 후 GAME_RESULT(`winner,reason`)를 보내고 방과 세션을 해제합니다.
최종 화면은 마지막 상태를 보관하여 표시하세요. 이후 GET_STATE는 NOT_IN_ROOM입니다.

게임 오류: INVALID_JSON, INVALID_MESSAGE, WRONG_PHASE, NOT_YOUR_TURN, INVALID_COORD, OCCUPIED,
INVALID_MOVE, WALL_BLOCKED, NO_WALLS, INVALID_WALL, PATH_BLOCKED, NO_CARD, INVALID_TARGET, NO_HISTORY.

## Unity 연동

TrapWarsNetworkClient의 RequestRooms/CreateRoom/JoinRoom/LeaveRoom을 UI에 연결하세요.
ROOM_CREATED 후 대기 화면, GAME_STARTED 후 게임 화면, ROOM_LEFT/ROOM_CLOSED/OPPONENT_DISCONNECTED 후 방 목록 화면을 표시하세요.
서버 테스트는 `npm.cmd test`입니다. Unity 에디터 컴파일 및 실제 화면 연동은 별도 검증이 필요합니다.

## 요청별 상세 규격과 예시

아래 JSON은 각각 독립적인 WebSocket 메시지입니다. 모든 요청은 공통 봉투 검증에 실패하면 INVALID_JSON 또는 INVALID_MESSAGE로 거절됩니다.

### PING

연결된 언제나 호출할 수 있으며 방 참여 여부와 무관합니다.

```json
{"type":"PING","requestId":"ping-1","payload":{}}
```

```json
{"type":"PONG","requestId":"ping-1","payload":{"serverTime":1793581200000}}
```

serverTime은 서버 Unix 시각(밀리초)입니다. 이 JSON 메시지는 WebSocket 자체 ping/pong 제어 프레임과 별개입니다.

### ROOM_LIST

```json
{"type":"ROOM_LIST","requestId":"list-1","payload":{}}
```

```json
{
  "type":"ROOM_LIST",
  "requestId":"list-1",
  "payload":{
    "rooms":[
      {"roomId":"room-example","name":"같이해요","status":"WAITING","playerCount":1,"maxPlayers":2},
      {"roomId":"room-playing","name":"게임 중","status":"PLAYING","playerCount":2,"maxPlayers":2}
    ]
  }
}
```

| rooms[] 필드 | 타입 | 의미 |
|---|---|---|
| roomId | string | 서버 발급 ID |
| name | string | 방 이름 |
| status | string | WAITING / PLAYING |
| playerCount | integer | 현재 참가 연결 수, 1 또는 2 |
| maxPlayers | integer | 현재 항상 2 |

방이 없으면 rooms는 빈 배열입니다. 방에 참여한 상태에서도 조회 가능합니다. 검색·필터·페이지네이션 인자는 없고 모든 방을 반환합니다. 자동 구독이나 변경 방송은 없습니다.
PLAYING은 BOARD/FPS 모두 포함하며 입장할 수 없습니다. 조회와 입장 사이에 방이 닫히거나 정원이 찰 수 있으므로 실패하면 목록을 새로고침하세요.

### ROOM_CREATE

```json
{"type":"ROOM_CREATE","requestId":"create-1","payload":{"name":"같이해요"}}
```

```json
{"type":"ROOM_CREATED","requestId":"create-1","payload":{"roomId":"room-example","name":"같이해요","playerId":"P1","status":"WAITING"}}
```

name은 선택 문자열이며 생략하면 Trap Wars입니다. 앞뒤 공백 제거 후 JavaScript UTF-16 코드 단위 기준 1~40자입니다. null·숫자·빈 문자열·공백만 있는 이름은 불가합니다. 같은 이름의 방은 여러 개 생성할 수 있습니다.
이미 방에 참여했다면 먼저 나가야 합니다. 성공 시 생성자는 즉시 P1로 참여하며 GAME_STATE는 아직 없습니다.

오류: ALREADY_IN_ROOM, INVALID_ROOM_NAME.

### ROOM_JOIN

```json
{"type":"ROOM_JOIN","requestId":"join-1","payload":{"roomId":"room-example"}}
```

```json
{"type":"ROOM_JOINED","requestId":"join-1","payload":{"roomId":"room-example","name":"같이해요","playerId":"P2","status":"PLAYING"}}
```

roomId는 필수인 비어 있지 않은 문자열입니다. 서버에서 받은 ID를 그대로 사용하세요.
WAITING 방만 입장할 수 있습니다. 방장 연결이 이미 닫혔다면 해당 방을 제거하고 ROOM_NOT_FOUND로 응답합니다.
성공 시 입장자에게 ROOM_JOINED, 이후 양쪽에 GAME_STARTED와 GAME_STATE를 보냅니다. 방장은 P1, 입장자는 P2이며 P1부터 행동합니다.

오류: ALREADY_IN_ROOM, INVALID_ROOM_ID, ROOM_NOT_FOUND, ROOM_FULL.

### ROOM_LEAVE

```json
{"type":"ROOM_LEAVE","requestId":"leave-1","payload":{}}
```

```json
{"type":"ROOM_LEFT","requestId":"leave-1","payload":{"roomId":"room-example"}}
```

현재 방에서 나가며 roomId 인자는 필요하지 않습니다. 대기방·BOARD·FPS 모두 가능합니다.
서버는 남은 상대에게 ROOM_CLOSED를 보낸 뒤 방과 양쪽 세션을 해제하고 퇴장자에게 ROOM_LEFT를 보냅니다.
혼자 있는 대기방에서 나가면 상대 알림 없이 삭제됩니다. 퇴장으로 몰수승이나 GAME_RESULT를 생성하지 않습니다.

오류: NOT_IN_ROOM.

### GET_STATE

```json
{"type":"GET_STATE","requestId":"state-1","payload":{}}
```

현재 게임의 GAME_STATE를 요청자에게만 보내며 requestId를 포함합니다. BOARD/FPS에서 가능합니다.
대기방에서는 GAME_NOT_STARTED, 정상 종료 후에는 방이 해제되므로 NOT_IN_ROOM입니다.

오류: NOT_IN_ROOM, ROOM_NOT_FOUND, GAME_NOT_STARTED.

### MOVE

```json
{"type":"MOVE","requestId":"move-1","payload":{"x":4,"y":1}}
```

x,y는 필수 정수이며 각각 0~9입니다. BOARD 단계에서 자기 턴에만 가능합니다.
현재 칸·대각선·두 칸 이동은 INVALID_MOVE, 상대 칸은 OCCUPIED입니다. 벽에 막히고 PARKOUR가 없으면 WALL_BLOCKED입니다.
성공하면 좌표와 이동 기록을 갱신하고 다음 턴을 계산하여 양쪽에 GAME_STATE를 전송합니다.
목표 도달 시에는 턴을 넘기지 않고 PHASE_CHANGED(FPS), GAME_STATE(FPS)를 전송합니다.

오류: 공통 게임 오류, INVALID_COORD, OCCUPIED, INVALID_MOVE, WALL_BLOCKED.

### PLACE_WALL

```json
{"type":"PLACE_WALL","requestId":"wall-1","payload":{"x":3,"y":2,"orientation":"H"}}
```

x,y는 필수 정수 0~8, orientation은 대문자 H 또는 V입니다.
성공하면 서버가 id/owner를 부여하고 wallsLeft를 1 줄인 뒤 턴을 진행하여 GAME_STATE를 보냅니다.
거절하면 벽, 재고와 턴을 보존합니다. 클라이언트가 보낸 id/owner는 사용하지 않습니다.

오류: 공통 게임 오류, NO_WALLS, INVALID_WALL, PATH_BLOCKED.

### USE_CARD

| card | 요청 payload | 세부 동작 |
|---|---|---|
| BREAK | `{"card":"BREAK","wallId":"w-example"}` | 소유자와 무관하게 대상 벽 제거. 벽 재고 반환 없음 |
| PARKOUR | `{"card":"PARKOUR"}` | 벽 무시 기회 추가. 즉시 이동하지 않음 |
| FREEZE | `{"card":"FREEZE"}` | 상대 skipTurns에 2 추가 |
| COMEBACK | `{"card":"COMEBACK"}` | 상대 이동 기록 2회 되돌림 |
| ATTACK | `{"card":"ATTACK"}` | 사용자 공격자로 FPS 시작 |

```json
{"type":"USE_CARD","requestId":"card-1","payload":{"card":"BREAK","wallId":"w-example"}}
```

card는 필수 문자열이며 현재 보유한 카드여야 합니다. BREAK의 wallId는 GAME_STATE.walls[].id를 사용합니다. 다른 카드는 wallId를 사용하지 않습니다.
ATTACK 외에는 카드 소모 → 턴 진행 → GAME_STATE입니다. ATTACK은 카드 소모 → PHASE_CHANGED(FPS) → GAME_STATE이며 보드 복귀 시 턴을 넘깁니다.
COMEBACK은 상대가 최소 두 번 이동해야 합니다. 복귀 과정의 중간 경로를 재이동하는 것이 아니라 과거 위치로 복원하며, 성공 시 최근 기록 두 개를 제거합니다.

오류: 공통 게임 오류, NO_CARD, INVALID_TARGET, NO_HISTORY, OCCUPIED, PATH_BLOCKED.
알 수 없는 카드 이름도 현재는 보유 검사에서 NO_CARD로 거절됩니다.

## 서버 이벤트 상세 예시

### WELCOME

연결 직후 해당 클라이언트에 한 번 전송합니다.

```json
{"type":"WELCOME","payload":{"protocolVersion":2,"boardSize":10}}
```

### GAME_STARTED

수신자 자신의 playerId를 포함합니다. 같은 방이어도 P1과 P2가 받는 playerId는 다릅니다.

```json
{"type":"GAME_STARTED","payload":{"roomId":"room-example","playerId":"P1","boardSize":10}}
```

### PHASE_CHANGED

FPS 진입:

```json
{"type":"PHASE_CHANGED","payload":{"phase":"FPS","fps":{"attacker":"P1","defender":"P2","durationSeconds":10,"endsAt":1793581210000,"reason":"CARD"}}}
```

ATTACK 종료로 BOARD 복귀:

```json
{"type":"PHASE_CHANGED","payload":{"phase":"BOARD"}}
```

BOARD 복귀 알림에는 fps 필드가 없습니다. 다음 GAME_STATE.fps는 null입니다.
정상 종료 시 별도 PHASE_CHANGED(FINISHED)는 없고 GAME_STATE와 GAME_RESULT를 보냅니다.

### GAME_RESULT

```json
{"type":"GAME_RESULT","payload":{"winner":"P2","reason":"DEFENDER_SURVIVED_30S"}}
```

winner는 P1/P2입니다. 현재 실제 종료 경로는 GOAL 타이머 만료이며 reason은 DEFENDER_SURVIVED_30S입니다.
먼저 GAME_STATE(phase=FINISHED, winner 설정, fps=null)를 전송한 뒤 GAME_RESULT를 보내고 방을 삭제합니다.

### ROOM_CLOSED / OPPONENT_DISCONNECTED

```json
{"type":"ROOM_CLOSED","payload":{"roomId":"room-example","playerId":"P1","reason":"PLAYER_LEFT","reconnectSupported":false}}
```

```json
{"type":"OPPONENT_DISCONNECTED","payload":{"roomId":"room-example","playerId":"P2","reason":"DISCONNECTED","reconnectSupported":false}}
```

playerId는 이탈자입니다. 상대에게만 전송하며 자신에게 이탈 이벤트를 보내지 않습니다.
두 경우 모두 방과 양쪽 세션을 해제하며 GAME_RESULT 없이 로비로 돌아갑니다.
물리적인 네트워크 단절의 감지 시점은 소켓 close/error 감지에 따릅니다. 현재 서버 주도 heartbeat는 없습니다.

### ACTION_REJECTED

```json
{"type":"ACTION_REJECTED","requestId":"move-1","payload":{"code":"NOT_YOUR_TURN","message":"Wait for your turn"}}
```

code로 분기하고 message는 진단용으로 사용하세요. INVALID_JSON에는 requestId가 없습니다.
requestId 타입 자체가 잘못되면 INVALID_MESSAGE 응답에 잘못된 원래 값이 포함될 수 있으므로 이 경우 ID 타입에 의존하지 마세요.

## GAME_STATE 필드 사전

GAME_STATE는 차이분이 아닌 전체 스냅샷입니다. 초기 예시는 위의 게임 요청 및 상태 절을 참고하세요.
게임 시작, 성공한 보드 행동, FPS 진입·복귀, 최종 종료 시 양쪽에 보냅니다. GET_STATE에서는 요청자에게만 보냅니다.

| payload 필드 | 타입 | 의미 |
|---|---|---|
| roomId | string | 게임 방 ID |
| phase | string | BOARD / FPS / FINISHED |
| boardSize | integer | 현재 10 |
| turn | string | P1/P2. BOARD에서만 행동 권한으로 사용 |
| turnNumber | integer | 초기 1. 턴 전환과 건너뛴 턴마다 증가 |
| players | object | P1/P2를 키로 하는 상태 |
| walls | object[] | 현재 설치된 벽 |
| fps | object 또는 null | FPS 단계 정보 |
| winner | string 또는 null | 미종료 null, 종료 시 P1/P2 |

| players.P1 / players.P2 필드 | 타입 | 의미 |
|---|---|---|
| x, y | integer | 현재 좌표, 각각 0~9 |
| wallsLeft | integer | 남은 설치 횟수, 초기 10 |
| cards | string[] | 현재 보유 카드. 상대 카드도 공개 |
| skipTurns | integer | 앞으로 건너뛸 자기 턴 수 |
| parkourMoves | integer | 남은 벽 무시 기회 |

서버 내부의 history 및 player.id는 전송하지 않습니다.

```json
{"id":"w-example","x":3,"y":2,"orientation":"H","owner":"P1"}
```

| walls[] 필드 | 타입 | 의미 |
|---|---|---|
| id | string | 서버 발급 ID, BREAK 대상으로 사용 |
| x, y | integer | 기준 좌표 0~8 |
| orientation | string | H/V |
| owner | string | 설치자 P1/P2 |

| fps 필드 | 타입 | 의미 |
|---|---|---|
| attacker | string | 공격자 P1/P2 |
| defender | string | 방어자 P1/P2 |
| durationSeconds | number | 기본 GOAL 30 / CARD 10, 서버 설정값 |
| endsAt | number | 종료 예정 Unix 시각, 밀리초 |
| reason | string | GOAL / CARD |

남은 시간 표시는 서버 시각을 고려하여 계산하되 실제 단계 종료는 서버 이벤트를 따릅니다.
타이머 검사는 현재 200ms 간격이며 이벤트 루프 지연으로 더 늦어질 수 있습니다. 시간 표시를 위한 주기적 GAME_STATE 방송은 없습니다.
현재 FPS에는 별도 플레이어 위치, 체력, 탄약, 무기, 장애물 스키마가 없습니다.

## 전체 오류 코드

| code | 조건 | 권장 처리 |
|---|---|---|
| INVALID_JSON | JSON 파싱 실패 | 직렬화 확인 |
| INVALID_MESSAGE | 공통 봉투의 필수 필드 또는 타입 오류 | 메시지 수정 |
| ALREADY_IN_ROOM | 방 참여 중 생성·입장 | 먼저 퇴장 |
| INVALID_ROOM_NAME | 방 이름 타입·길이 오류 | 이름 수정 |
| INVALID_ROOM_ID | roomId 누락·타입 오류·빈 값 | 목록에서 받은 ID 사용 |
| ROOM_NOT_FOUND | 방이 없거나 방장 연결 종료 | 목록 갱신 |
| ROOM_FULL | WAITING이 아닌 방 입장 | 다른 방 선택 |
| NOT_IN_ROOM | 방 없이 퇴장·게임 요청 | 생성 또는 입장 |
| GAME_NOT_STARTED | 대기방에서 게임 요청 | 두 번째 참가자 대기 |
| MATCHMAKING_REMOVED | MATCH_JOIN/MATCH_CANCEL 요청 | 방 API 사용 |
| WRONG_PHASE | BOARD 외 단계에서 보드 행동 | 단계 전환 대기 |
| NOT_YOUR_TURN | 자기 턴이 아님 | 내 턴 대기 |
| INVALID_COORD | MOVE 좌표가 정수 0~9가 아님 | 좌표 수정 |
| OCCUPIED | 이동·복귀 칸에 상대 말 | 다른 행동 선택 |
| INVALID_MOVE | 직교 한 칸 이동이 아님 | 인접 칸 선택 |
| WALL_BLOCKED | 벽 차단 및 PARKOUR 없음 | 다른 경로 선택 |
| NO_WALLS | 벽 재고 없음 | 다른 행동 선택 |
| INVALID_WALL | 벽 좌표·방향 오류 또는 겹침·교차 | 배치 수정 |
| PATH_BLOCKED | 설치·복귀 후 목표 경로 없음 | 다른 행동 선택 |
| NO_CARD | 카드 누락·알 수 없는 카드·미보유·소모됨 | 최신 cards 확인 |
| INVALID_TARGET | BREAK 대상 벽 없음 | 최신 walls 확인 |
| NO_HISTORY | COMEBACK 대상 이동 두 번 미만 | 다른 행동 선택 |
| NOT_IMPLEMENTED | 시작된 게임에서 미지원 type | 지원 API 확인 |
| INVALID_CARD | 엔진 내부 미지원 카드 분기 | 기본 카드 구성에서는 도달하지 않음 |
| UNKNOWN_ACTION | 엔진 내부 미지원 행동 분기 | 현재 WebSocket 라우팅으로는 도달하지 않음 |

공통 게임 오류는 NOT_IN_ROOM, ROOM_NOT_FOUND, GAME_NOT_STARTED, WRONG_PHASE, NOT_YOUR_TURN입니다.
GET_STATE에는 WRONG_PHASE/NOT_YOUR_TURN 검사를 적용하지 않습니다.

### 검증 및 오류 우선순위

첫 실패만 응답합니다. 여러 조건을 위반하면 아래 순서에 따라 코드가 달라집니다.

1. JSON 파싱 → 공통 봉투 검증.
2. PING, 방 API, 제거된 매칭 API 처리. 이 단계는 게임 세션 검사 전입니다.
3. 나머지는 세션 → 방 존재 → 게임 시작 여부 검사.
4. MOVE/PLACE_WALL/USE_CARD는 BOARD 여부 → 자기 턴 여부 → 개별 검증.
5. MOVE: 좌표 → 점유 → 거리 → 벽. PLACE_WALL: 재고 → 형식·충돌 → 경로. USE_CARD: 보유 → 카드별 대상 검사.
6. 그 밖의 type은 시작된 게임에서 NOT_IMPLEMENTED. 로비에서는 NOT_IN_ROOM, 대기방에서는 GAME_NOT_STARTED.

따라서 FPS_INPUT, HIT, KILL, WIN도 지원되지 않으며 성공 응답이나 승패 확정 기능이 없습니다.

## 상태 전이와 수신 순서

```text
연결 → WELCOME → 로비

ROOM_CREATE → ROOM_CREATED(P1) → WAITING
ROOM_JOIN   → 입장자 ROOM_JOINED(P2)
            → 양쪽 GAME_STARTED(각자 자신의 ID)
            → 양쪽 GAME_STATE(BOARD)

일반 보드 행동 성공 → 다음 턴 계산 → 양쪽 GAME_STATE
목표 도달 / ATTACK  → PHASE_CHANGED(FPS) → GAME_STATE(FPS)
ATTACK 시간 만료   → 다음 턴 계산 → PHASE_CHANGED(BOARD) → GAME_STATE(BOARD)
GOAL 시간 만료     → GAME_STATE(FINISHED) → GAME_RESULT → 방·세션 해제

ROOM_LEAVE         → 상대 ROOM_CLOSED → 방 해제 → 요청자 ROOM_LEFT
소켓 close/error   → 상대 OPPONENT_DISCONNECTED → 방 해제
```

위 순서는 각 연결 내부 기준입니다. 서로 다른 연결의 실제 수신 시점은 다를 수 있습니다.
FREEZE 적용으로 다음 차례가 건너뛰어지면 같은 플레이어가 연속 행동할 수 있습니다. skipTurns 감소는 턴 계산 시 즉시 반영됩니다.
벽 BFS는 벽만 고려하고 상대 말 점유나 PARKOUR 보유는 고려하지 않습니다.
종료·퇴장 후 같은 방 재시작이나 자동 재매칭은 없으며 다시 생성·입장해야 합니다.

## Unity 메서드 대응 및 지원 범위

| TrapWarsNetworkClient 메서드 | 요청 |
|---|---|
| Connect() | WebSocket 연결 |
| RequestRooms() | ROOM_LIST |
| CreateRoom(name) | ROOM_CREATE |
| JoinRoom(roomId) | ROOM_JOIN |
| LeaveRoom() | ROOM_LEAVE |
| RequestState() | GET_STATE |
| Move(x,y) | MOVE |
| PlaceWall(x,y,orientation) | PLACE_WALL |
| UseCard(card,wallId) | USE_CARD |
| Send(type,payload) | 지원 메시지 직접 전송, PING 등 |

OnMessage를 구독하여 처리하며 예제 클라이언트는 메인 스레드 Update에서 수신 이벤트를 전달합니다.
방 목록 화면은 Unity에서 구현해야 합니다. ROOM_LEFT/ROOM_CLOSED/OPPONENT_DISCONNECTED에서는 방과 플레이어 ID를 지우고 로비로 돌아가세요.

현재 미지원: 인증, 비밀번호, 방 이름 변경, 강제 추방, 준비/시작 버튼, 방장 위임, 관전, 재접속, 저장·통계, 실제 FPS 전투 및 FPS 입력 API.
카드 지급·밸런스, ATTACK 전투 승리 시 전체 게임 종료 여부는 임시 또는 미확정 규칙입니다.
