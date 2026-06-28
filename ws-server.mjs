import { WebSocketServer } from "ws";

const PORT = Number(process.env.WS_PORT || 5174);
const wss = new WebSocketServer({ port: PORT });
const clients = new Map();
const rooms = new Map();
let nextId = 1;
let nextRoomId = 1;
const ARENA_KEYS = new Set(["forge", "rift", "spire", "dunes", "city"]);

function cleanName(value, fallback) {
  return String(value || fallback)
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 20) || fallback;
}

function send(socket, payload) {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function roomSummary(room) {
  return {
    id: room.id,
    name: room.name,
    arena: room.arena,
    players: room.players.size,
    hostId: room.hostId,
    seed: room.seed,
    createdAt: room.createdAt
  };
}

function sendRoomList(socket) {
  send(socket, {
    type: "room-list",
    rooms: [...rooms.values()].map(roomSummary).sort((a, b) => b.createdAt - a.createdAt)
  });
}

function broadcastRoomList() {
  for (const socket of clients.values()) sendRoomList(socket);
}

function roomBroadcast(roomId, senderId, payload) {
  const room = rooms.get(roomId);
  if (!room) return;
  for (const id of room.players) {
    if (id === senderId) continue;
    const socket = clients.get(id);
    if (socket) send(socket, payload);
  }
}

function roomBroadcastAll(roomId, payload) {
  const room = rooms.get(roomId);
  if (!room) return;
  for (const id of room.players) {
    const socket = clients.get(id);
    if (socket) send(socket, payload);
  }
}

function transferHost(room, previousHostId) {
  const nextHostId = [...room.players].find((id) => id !== previousHostId);
  if (!nextHostId) return false;
  room.hostId = nextHostId;
  roomBroadcastAll(room.id, { type: "host-changed", hostId: room.hostId });
  broadcastRoomList();
  return true;
}

function leaveRoom(id) {
  const socket = clients.get(id);
  const roomId = socket?.roomId;
  if (!roomId) return;

  const room = rooms.get(roomId);
  if (room) {
    const wasHost = room.hostId === id;
    room.players.delete(id);
    roomBroadcast(roomId, id, { type: "peer-leave", id });
    if (room.players.size === 0) {
      rooms.delete(roomId);
    } else if (wasHost) {
      transferHost(room, id);
    }
  }
  socket.roomId = null;
  broadcastRoomList();
}

function joinRoom(id, roomId, playerName) {
  const socket = clients.get(id);
  const room = rooms.get(roomId);
  if (!socket || !room) {
    if (socket) send(socket, { type: "room-error", message: "Room not found" });
    return;
  }

  leaveRoom(id);
  socket.playerName = cleanName(playerName, socket.playerName || `P${id}`);
  socket.roomId = roomId;
  if (!room.hostId || !room.players.has(room.hostId)) room.hostId = id;
  room.players.add(id);
  send(socket, { type: "room-joined", room: roomSummary(room), playerName: socket.playerName });
  roomBroadcast(roomId, id, { type: "peer-join", id, playerName: socket.playerName });
  broadcastRoomList();
  console.log(`[ws] player ${id} (${socket.playerName}) joined room ${room.name} (${room.id})`);
}

wss.on("connection", (socket) => {
  const id = String(nextId++);
  clients.set(id, socket);
  socket.roomId = null;
  socket.playerName = `P${id}`;
  send(socket, { type: "welcome", id });
  sendRoomList(socket);
  console.log(`[ws] player ${id} connected`);

  socket.on("message", (raw) => {
    try {
      const message = JSON.parse(raw.toString());
      if (!message || typeof message.type !== "string") return;

      if (message.type === "list-rooms") {
        sendRoomList(socket);
        return;
      }

      if (message.type === "create-room") {
        socket.playerName = cleanName(message.playerName, socket.playerName);
        const name = String(message.name || `Game ${nextRoomId}`).trim().slice(0, 32) || `Game ${nextRoomId}`;
        const room = {
          id: String(nextRoomId++),
          name,
          arena: ARENA_KEYS.has(message.arena) ? message.arena : "forge",
          hostId: id,
          seed: Math.floor(Math.random() * 2147483647),
          players: new Set(),
          createdAt: Date.now()
        };
        rooms.set(room.id, room);
        joinRoom(id, room.id, socket.playerName);
        return;
      }

      if (message.type === "join-room") {
        joinRoom(id, String(message.roomId || ""), message.playerName);
        return;
      }

      if (message.type === "leave-room") {
        leaveRoom(id);
        send(socket, { type: "room-left" });
        return;
      }

      if (message.type === "host-dead") {
        const room = rooms.get(socket.roomId);
        if (room?.hostId === id) transferHost(room, id);
        return;
      }

      if (!socket.roomId) {
        send(socket, { type: "room-error", message: "Create or join a room first" });
        return;
      }

      if (message.type === "enemy-state" && rooms.get(socket.roomId)?.hostId !== id) {
        return;
      }

      roomBroadcast(socket.roomId, id, { ...message, id, playerName: socket.playerName, roomId: socket.roomId });
    } catch {
      send(socket, { type: "error", message: "bad json" });
    }
  });

  socket.on("close", () => {
    leaveRoom(id);
    clients.delete(id);
    console.log(`[ws] player ${id} disconnected`);
  });
});

console.log(`[ws] Iron Citadel multiplayer server listening on ws://127.0.0.1:${PORT}`);
