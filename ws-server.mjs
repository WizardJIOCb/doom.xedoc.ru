import { WebSocketServer } from "ws";

const PORT = Number(process.env.WS_PORT || 5174);
const wss = new WebSocketServer({ port: PORT });
const clients = new Map();
const rooms = new Map();
let nextId = 1;
let nextRoomId = 1;

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
    players: room.players.size,
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

function leaveRoom(id) {
  const socket = clients.get(id);
  const roomId = socket?.roomId;
  if (!roomId) return;

  const room = rooms.get(roomId);
  if (room) {
    room.players.delete(id);
    roomBroadcast(roomId, id, { type: "peer-leave", id });
    if (room.players.size === 0) rooms.delete(roomId);
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

      if (!socket.roomId) {
        send(socket, { type: "room-error", message: "Create or join a room first" });
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
