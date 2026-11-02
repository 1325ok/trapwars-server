using System;
using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using UnityEngine;

// Unity 6 Windows/macOS/Linux standalone example.
// Requires Unity Package Manager: com.unity.nuget.newtonsoft-json.
// Attach to a GameObject; subscribe to OnMessage in your Board/UI controllers.
public class TrapWarsNetworkClient : MonoBehaviour
{
    [SerializeField] private string serverUrl = "ws://127.0.0.1:8080";
    private ClientWebSocket socket;
    private CancellationTokenSource cancellation;
    private readonly ConcurrentQueue<JObject> incoming = new();
    public event Action<JObject> OnMessage;
    public bool IsConnected => socket != null && socket.State == WebSocketState.Open;

    private void Update()
    {
        while (incoming.TryDequeue(out JObject msg))
        {
            try { OnMessage?.Invoke(msg); }
            catch (Exception e) { Debug.LogException(e); }
        }
    }

    public async void Connect()
    {
        if (IsConnected) return;
        try
        {
            cancellation = new CancellationTokenSource();
            socket = new ClientWebSocket();
            await socket.ConnectAsync(new Uri(serverUrl), cancellation.Token);
            Debug.Log("Trap Wars connected: " + serverUrl);
            _ = ReceiveLoop(socket, cancellation.Token);
        }
        catch (Exception e) { Debug.LogError("Connection failed: " + e.Message); }
    }

    private async Task ReceiveLoop(ClientWebSocket ws, CancellationToken token)
    {
        var buffer = new byte[8192];
        try
        {
            while (ws.State == WebSocketState.Open && !token.IsCancellationRequested)
            {
                using var stream = new System.IO.MemoryStream();
                WebSocketReceiveResult result;
                do
                {
                    result = await ws.ReceiveAsync(new ArraySegment<byte>(buffer), token);
                    if (result.MessageType == WebSocketMessageType.Close) return;
                    stream.Write(buffer, 0, result.Count);
                } while (!result.EndOfMessage);
                string json = Encoding.UTF8.GetString(stream.ToArray());
                incoming.Enqueue(JObject.Parse(json));
            }
        }
        catch (OperationCanceledException) { }
        catch (Exception e) { Debug.LogWarning("Socket disconnected: " + e.Message); }
    }

    public async void Send(string type, object payload = null)
    {
        if (!IsConnected) { Debug.LogWarning("Not connected"); return; }
        var message = new { type, requestId = Guid.NewGuid().ToString("N"), payload = payload ?? new { } };
        string json = JsonConvert.SerializeObject(message);
        byte[] bytes = Encoding.UTF8.GetBytes(json);
        try
        {
            await socket.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, cancellation.Token);
        }
        catch (Exception e) { Debug.LogError("Send failed: " + e.Message); }
    }

    public void RequestRooms() => Send("ROOM_LIST");
    public void CreateRoom(string name = "Trap Wars") => Send("ROOM_CREATE", new { name });
    public void JoinRoom(string roomId) => Send("ROOM_JOIN", new { roomId });
    public void LeaveRoom() => Send("ROOM_LEAVE");
    public void Move(int x, int y) => Send("MOVE", new { x, y });
    public void PlaceWall(int x, int y, string orientation) => Send("PLACE_WALL", new { x, y, orientation });
    public void UseCard(string card, string wallId = null) => Send("USE_CARD", new { card, wallId });
    public void RequestState() => Send("GET_STATE");

    private async void OnDestroy()
    {
        try
        {
            cancellation?.Cancel();
            if (socket != null)
            {
                if (socket.State == WebSocketState.Open)
                    await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "quit", CancellationToken.None);
                socket.Dispose();
            }
        }
        catch { /* Closing while Unity exits is best-effort. */ }
        finally { cancellation?.Dispose(); }
    }
}
