using Newtonsoft.Json.Linq;
using UnityEngine;

// Example of exactly how the Unity team consumes the server's authoritative state.
// Attach to another GameObject and assign TrapWarsNetworkClient in the Inspector.
public class TrapWarsClientExample : MonoBehaviour
{
    [SerializeField] private TrapWarsNetworkClient network;
    private string myPlayerId;
    private JObject latestState;

    private void OnEnable() { if (network != null) network.OnMessage += HandleMessage; }
    private void OnDisable() { if (network != null) network.OnMessage -= HandleMessage; }

    private void HandleMessage(JObject message)
    {
        string type = message.Value<string>("type");
        JObject payload = message["payload"] as JObject;
        switch (type)
        {
            case "WELCOME":
                Debug.Log("Server protocol v" + payload?["protocolVersion"]);
                break;
            case "ROOM_CREATED":
                myPlayerId = payload?.Value<string>("playerId");
                Debug.Log("Room created; waiting for a second player: " + payload?["roomId"]);
                break;
            case "ROOM_JOINED":
            case "GAME_STARTED":
                myPlayerId = payload?.Value<string>("playerId");
                Debug.Log("Joined as " + myPlayerId);
                break;
            case "ROOM_LIST":
                Debug.Log("Rooms: " + payload?["rooms"]);
                // Populate room buttons; pass the selected roomId to OnJoinRoomClicked.
                break;
            case "ROOM_LEFT":
            case "ROOM_CLOSED":
                myPlayerId = null;
                latestState = null;
                Debug.Log("Return to room list");
                network.RequestRooms();
                break;
            case "GAME_STATE":
                latestState = payload;
                RenderBoardFromState(latestState);
                break;
            case "ACTION_REJECTED":
                Debug.LogWarning($"Action rejected: {payload?["code"]} / {payload?["message"]}");
                break;
            case "PHASE_CHANGED":
                Debug.Log("Phase: " + payload?["phase"]);
                break;
            case "GAME_RESULT":
                Debug.Log("Winner: " + payload?["winner"]);
                break;
            case "OPPONENT_DISCONNECTED":
                Debug.LogWarning("Opponent disconnected; return to lobby");
                break;
        }
    }

    private void RenderBoardFromState(JObject state)
    {
        if (state == null) return;
        JObject p1 = state["players"]?["P1"] as JObject;
        JObject p2 = state["players"]?["P2"] as JObject;
        Debug.Log($"Turn={state["turn"]}, P1=({p1?["x"]},{p1?["y"]}), P2=({p2?["x"]},{p2?["y"]})");
        Debug.Log($"Walls remaining: P1={p1?["wallsLeft"]}, P2={p2?["wallsLeft"]}");
        // Team TODO: use (x,y) to update piece GameObjects, walls array to instantiate wall prefabs,
        // cards to populate UI, phase to show BOARD/FPS/FINISHED screens.
        foreach (JToken wall in state["walls"] ?? new JArray())
            Debug.Log($"Wall {wall["id"]}: {wall["orientation"]} at ({wall["x"]},{wall["y"]})");
    }

    // Wire these methods to UI buttons / board click handlers.
    public void OnRefreshRoomsClicked() => network.RequestRooms();
    public void OnCreateRoomClicked() => network.CreateRoom();
    public void OnJoinRoomClicked(string roomId) => network.JoinRoom(roomId);
    public void OnLeaveRoomClicked() => network.LeaveRoom();
    public void OnTileClicked(int x, int y) => network.Move(x, y);
    public void OnWallClicked(int x, int y, bool horizontal) => network.PlaceWall(x, y, horizontal ? "H" : "V");
    public void OnCardClicked(string card, string wallId = null) => network.UseCard(card, wallId);
}
