import { WebSocketServer } from "ws";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const PORT = Number(process.env.WS_PORT || 5174);
const wss = new WebSocketServer({ port: PORT });
const clients = new Map();
const rooms = new Map();
const accounts = new Map();
let nextId = 1;
let nextRoomId = 1;
let nextAccountId = 1;
const ARENA_KEYS = new Set(["forge", "rift", "spire", "dunes", "city"]);
const DATA_FILE = process.env.ACCOUNTS_FILE || fileURLToPath(new URL("./data/accounts.json", import.meta.url));
const CHARACTERS = ["vanguard", "sunbreaker", "riftwalker", "ironchant", "voidsinger"];

function cleanName(value, fallback) {
  return String(value || fallback)
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 20) || fallback;
}

function cleanAccountName(value) {
  return cleanName(value, "").replace(/[<>{}[\]\\/"'`]/g, "").slice(0, 20);
}

function createDefaultProfile() {
  return {
    essence: 0,
    cores: 0,
    selectedCharacter: "vanguard",
    unlocked: { vanguard: true },
    characterXp: Object.fromEntries(CHARACTERS.map((key) => [key, 0])),
    stats: { kills: 0, deaths: 0, bestCombatLevel: 1, bestWave: 1 }
  };
}

function sanitizeProfile(value) {
  const base = createDefaultProfile();
  const source = value && typeof value === "object" ? value : {};
  const profile = {
    ...base,
    essence: Math.max(0, Math.min(99999999, Math.floor(Number(source.essence) || 0))),
    cores: Math.max(0, Math.min(999999, Math.floor(Number(source.cores) || 0))),
    unlocked: { ...base.unlocked },
    characterXp: { ...base.characterXp }
  };
  for (const key of CHARACTERS) {
    profile.unlocked[key] = Boolean(source.unlocked?.[key] || profile.unlocked[key]);
    profile.characterXp[key] = Math.max(0, Math.min(99999999, Math.floor(Number(source.characterXp?.[key]) || 0)));
  }
  profile.selectedCharacter = profile.unlocked[source.selectedCharacter] ? source.selectedCharacter : base.selectedCharacter;
  profile.stats = {
    kills: Math.max(0, Math.floor(Number(source.stats?.kills) || 0)),
    deaths: Math.max(0, Math.floor(Number(source.stats?.deaths) || 0)),
    bestCombatLevel: Math.max(1, Math.floor(Number(source.stats?.bestCombatLevel) || 1)),
    bestWave: Math.max(1, Math.floor(Number(source.stats?.bestWave) || 1))
  };
  return profile;
}

function getCharacterLevel(profile, key) {
  return 1 + Math.floor(Math.sqrt((profile.characterXp?.[key] ?? 0) / 130));
}

function getAccountLevel(profile) {
  return Math.max(...CHARACTERS.map((key) => getCharacterLevel(profile, key)));
}

function getTotalXp(profile) {
  return CHARACTERS.reduce((sum, key) => sum + (profile.characterXp?.[key] ?? 0), 0);
}

function getUnlockedCount(profile) {
  return CHARACTERS.filter((key) => profile.unlocked?.[key]).length;
}

function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const hash = scryptSync(String(password), salt, 64).toString("hex");
  return { salt, hash };
}

function verifyPassword(password, account) {
  const candidate = Buffer.from(hashPassword(password, account.salt).hash, "hex");
  const stored = Buffer.from(account.passwordHash, "hex");
  return candidate.length === stored.length && timingSafeEqual(candidate, stored);
}

function createAccountStats(profile) {
  return {
    kills: 0,
    deaths: 0,
    bestCombatLevel: 1,
    bestWave: 1,
    accountLevel: getAccountLevel(profile),
    totalXp: getTotalXp(profile),
    essence: profile.essence,
    cores: profile.cores,
    unlocked: getUnlockedCount(profile),
    updatedAt: Date.now()
  };
}

function updateAccountStats(account, stats = {}) {
  const profile = sanitizeProfile(account.profile);
  const profileStats = profile.stats ?? {};
  account.stats = {
    ...createAccountStats(profile),
    ...(account.stats ?? {}),
    kills: Math.max(account.stats?.kills ?? 0, profileStats.kills ?? 0, Math.floor(Number(stats.kills ?? stats.sessionKills) || 0)),
    deaths: Math.max(account.stats?.deaths ?? 0, profileStats.deaths ?? 0, Math.floor(Number(stats.deaths) || 0)),
    bestCombatLevel: Math.max(account.stats?.bestCombatLevel ?? 1, profileStats.bestCombatLevel ?? 1, Math.floor(Number(stats.bestCombatLevel) || 1)),
    bestWave: Math.max(account.stats?.bestWave ?? 1, profileStats.bestWave ?? 1, Math.floor(Number(stats.bestWave) || 1)),
    accountLevel: getAccountLevel(profile),
    totalXp: getTotalXp(profile),
    essence: profile.essence,
    cores: profile.cores,
    unlocked: getUnlockedCount(profile),
    updatedAt: Date.now()
  };
}

async function loadAccounts() {
  try {
    const raw = await readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    nextAccountId = Math.max(1, Number(parsed.nextAccountId) || 1);
    for (const account of parsed.accounts ?? []) {
      const normalized = {
        id: String(account.id),
        username: cleanAccountName(account.username),
        usernameKey: String(account.usernameKey || account.username || "").toLowerCase(),
        passwordHash: account.passwordHash,
        salt: account.salt,
        token: account.token || randomBytes(24).toString("hex"),
        profile: sanitizeProfile(account.profile),
        stats: account.stats ?? null,
        createdAt: Number(account.createdAt) || Date.now(),
        updatedAt: Number(account.updatedAt) || Date.now()
      };
      if (!normalized.usernameKey || !normalized.passwordHash || !normalized.salt) continue;
      updateAccountStats(normalized, normalized.stats);
      accounts.set(normalized.usernameKey, normalized);
      nextAccountId = Math.max(nextAccountId, Number(normalized.id) + 1 || nextAccountId);
    }
    console.log(`[ws] loaded ${accounts.size} accounts`);
  } catch {
    console.log("[ws] account storage is empty");
  }
}

let saveAccountsTimer = null;

function scheduleAccountsSave() {
  if (saveAccountsTimer) return;
  saveAccountsTimer = setTimeout(() => {
    saveAccountsTimer = null;
    saveAccounts().catch((error) => console.error("[ws] account save failed", error));
  }, 250);
}

async function saveAccounts() {
  await mkdir(dirname(DATA_FILE), { recursive: true });
  const payload = {
    nextAccountId,
    accounts: [...accounts.values()].map((account) => ({
      id: account.id,
      username: account.username,
      usernameKey: account.usernameKey,
      passwordHash: account.passwordHash,
      salt: account.salt,
      token: account.token,
      profile: sanitizeProfile(account.profile),
      stats: account.stats,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt
    }))
  };
  await writeFile(DATA_FILE, `${JSON.stringify(payload, null, 2)}\n`);
}

function accountPayload(account) {
  const profile = sanitizeProfile(account.profile);
  profile.stats = {
    kills: account.stats?.kills ?? profile.stats.kills,
    deaths: account.stats?.deaths ?? profile.stats.deaths,
    bestCombatLevel: account.stats?.bestCombatLevel ?? profile.stats.bestCombatLevel,
    bestWave: account.stats?.bestWave ?? profile.stats.bestWave
  };
  return {
    id: account.id,
    username: account.username,
    profile,
    token: account.token
  };
}

function sendAuthOk(socket, account) {
  socket.accountId = account.id;
  socket.accountName = account.username;
  send(socket, { type: "auth-ok", ...accountPayload(account) });
}

function getLeaderboardEntries() {
  return [...accounts.values()].map((account) => {
    const profile = sanitizeProfile(account.profile);
    updateAccountStats(account, account.stats);
    return {
      username: account.username,
      accountLevel: account.stats.accountLevel,
      totalXp: account.stats.totalXp,
      kills: account.stats.kills,
      deaths: account.stats.deaths,
      bestCombatLevel: account.stats.bestCombatLevel,
      bestWave: account.stats.bestWave,
      essence: profile.essence,
      cores: profile.cores,
      unlocked: account.stats.unlocked,
      updatedAt: account.stats.updatedAt
    };
  }).sort((a, b) => b.accountLevel - a.accountLevel || b.totalXp - a.totalXp).slice(0, 50);
}

function isNameTakenInRoom(room, requesterId, playerName) {
  const key = playerName.toLowerCase();
  for (const id of room.players) {
    if (id === requesterId) continue;
    if ((clients.get(id)?.playerName || "").toLowerCase() === key) return true;
  }
  return false;
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
  if (isNameTakenInRoom(room, id, socket.playerName)) {
    send(socket, { type: "room-error", message: "Nickname is already taken in this room" });
    socket.roomId = null;
    return;
  }
  socket.roomId = roomId;
  if (!room.hostId || !room.players.has(room.hostId)) room.hostId = id;
  room.players.add(id);
  send(socket, { type: "room-joined", room: roomSummary(room), playerName: socket.playerName });
  roomBroadcast(roomId, id, { type: "peer-join", id, playerName: socket.playerName });
  broadcastRoomList();
  console.log(`[ws] player ${id} (${socket.playerName}) joined room ${room.name} (${room.id})`);
}

await loadAccounts();

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

      if (message.type === "auth-register") {
        const username = cleanAccountName(message.username);
        if (username.length < 3) {
          send(socket, { type: "auth-error", message: "Login needs at least 3 characters" });
          return;
        }
        if (String(message.password || "").length < 4) {
          send(socket, { type: "auth-error", message: "Password needs at least 4 characters" });
          return;
        }
        const usernameKey = username.toLowerCase();
        if (accounts.has(usernameKey)) {
          send(socket, { type: "auth-error", message: "Account name is already taken" });
          return;
        }
        const password = hashPassword(message.password);
        const profile = sanitizeProfile(message.profile);
        const account = {
          id: String(nextAccountId++),
          username,
          usernameKey,
          passwordHash: password.hash,
          salt: password.salt,
          token: randomBytes(24).toString("hex"),
          profile,
          stats: createAccountStats(profile),
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        accounts.set(usernameKey, account);
        socket.playerName = username;
        scheduleAccountsSave();
        sendAuthOk(socket, account);
        return;
      }

      if (message.type === "auth-login") {
        const username = cleanAccountName(message.username);
        const account = accounts.get(username.toLowerCase());
        if (!account || !verifyPassword(message.password || "", account)) {
          send(socket, { type: "auth-error", message: "Wrong login or password" });
          return;
        }
        account.token = randomBytes(24).toString("hex");
        account.updatedAt = Date.now();
        socket.playerName = account.username;
        scheduleAccountsSave();
        sendAuthOk(socket, account);
        return;
      }

      if (message.type === "auth-resume") {
        const username = cleanAccountName(message.username);
        const account = accounts.get(username.toLowerCase());
        if (!account || account.token !== message.token) {
          send(socket, { type: "auth-error", message: "Saved login expired" });
          return;
        }
        socket.playerName = account.username;
        sendAuthOk(socket, account);
        return;
      }

      if (message.type === "auth-logout") {
        socket.accountId = null;
        socket.accountName = "";
        return;
      }

      if (message.type === "profile-save") {
        const account = [...accounts.values()].find((candidate) => candidate.id === socket.accountId);
        if (!account) {
          send(socket, { type: "auth-error", message: "Login again to sync progress" });
          return;
        }
        account.profile = sanitizeProfile(message.profile);
        updateAccountStats(account, message.stats);
        account.updatedAt = Date.now();
        scheduleAccountsSave();
        send(socket, { type: "profile-saved" });
        return;
      }

      if (message.type === "leaderboard-request") {
        send(socket, { type: "leaderboard", entries: getLeaderboardEntries() });
        return;
      }

      if (message.type === "ping") {
        send(socket, { type: "pong", seq: message.seq });
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

      if ((message.type === "enemy-state" || message.type === "kill-credit") && rooms.get(socket.roomId)?.hostId !== id) {
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
