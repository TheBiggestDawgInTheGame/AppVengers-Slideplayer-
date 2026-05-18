const WebSocket = require('ws');

const PORT = Number(process.env.PORT || 8081);
const wss = new WebSocket.Server({ port: PORT });

const rooms = new Map();

function getOrCreateRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Map());
  }
  return rooms.get(roomId);
}

function toSafeString(value, fallback) {
  const v = String(value || '').trim();
  return v || fallback;
}

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

function sendJSON(ws, payload) {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(payload));
}

function broadcast(room, payload, exceptPlayerId) {
  room.forEach((peerWs, peerId) => {
    if (peerId === exceptPlayerId) return;
    sendJSON(peerWs, payload);
  });
}

function leaveRoom(ws) {
  if (!ws.roomId || !ws.playerId) return;
  const room = rooms.get(ws.roomId);
  if (!room) return;

  room.delete(ws.playerId);
  broadcast(room, { type: 'peer-left', id: ws.playerId }, ws.playerId);

  if (room.size === 0) {
    rooms.delete(ws.roomId);
  }

  ws.roomId = null;
  ws.playerId = null;
  ws.playerName = null;
}

wss.on('connection', (ws) => {
  ws.roomId = null;
  ws.playerId = null;
  ws.playerName = null;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch (err) {
      sendJSON(ws, { type: 'error', message: 'Invalid JSON payload.' });
      return;
    }

    if (msg.type === 'join') {
      if (ws.roomId && ws.playerId) leaveRoom(ws);

      const roomId = toSafeString(msg.room, 'room-14b');
      const name = toSafeString(msg.name, 'Player');
      const requestedId = toSafeString(msg.id, makeId());
      const room = getOrCreateRoom(roomId);

      // Avoid collisions inside room.
      let playerId = requestedId;
      while (room.has(playerId)) playerId = makeId();

      ws.roomId = roomId;
      ws.playerId = playerId;
      ws.playerName = name;
      room.set(playerId, ws);

      sendJSON(ws, { type: 'welcome', id: playerId, room: roomId, name });
      broadcast(room, { type: 'state', id: playerId, name, x: 0, y: 0, z: 0, rotY: 0 }, playerId);
      return;
    }

    if (msg.type === 'state') {
      if (!ws.roomId || !ws.playerId) return;
      const room = rooms.get(ws.roomId);
      if (!room) return;

      const x = Number(msg.x) || 0;
      const y = Number(msg.y) || 0;
      const z = Number(msg.z) || 0;
      const rotY = Number(msg.rotY) || 0;

      broadcast(room, {
        type: 'state',
        id: ws.playerId,
        name: ws.playerName || 'Player',
        x,
        y,
        z,
        rotY
      }, ws.playerId);
      return;
    }

    if (msg.type === 'leave') {
      leaveRoom(ws);
      return;
    }

    sendJSON(ws, { type: 'error', message: `Unsupported message type: ${msg.type}` });
  });

  ws.on('close', () => {
    leaveRoom(ws);
  });

  ws.on('error', () => {
    // Avoid noisy process crashes from socket errors.
  });
});

console.log(`[multiplayer] WebSocket server running on ws://localhost:${PORT}`);
