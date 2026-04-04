const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const os = require('os');
const crypto = require('crypto');

// ── Static file server ──────────────────────────────────────────────────────

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  let filePath = req.url === '/' ? '/index.html' : req.url;
  // Prevent directory traversal
  filePath = path.join(__dirname, path.normalize(filePath));
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end();
    return;
  }

  const ext = path.extname(filePath);
  const contentType = MIME[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType + '; charset=utf-8' });
    res.end(data);
  });
});

// ── WebSocket ───────────────────────────────────────────────────────────────

const wss = new WebSocketServer({ server });
const rooms = new Map();

function generateRoomID() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 100; attempt++) {
    let id = '';
    for (let i = 0; i < 4; i++) {
      id += chars[crypto.randomInt(chars.length)];
    }
    if (!rooms.has(id)) return id;
  }
  return null;
}

function sendJSON(ws, msg) {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(msg));
  }
}

wss.on('connection', (ws) => {
  let currentRoom = null;
  let playerIndex = -1;

  ws.on('close', () => {
    if (!currentRoom) return;
    const room = currentRoom;
    room.players[playerIndex] = null;

    // Notify opponent
    const otherIdx = 1 - playerIndex;
    const opponent = room.players[otherIdx];
    if (opponent) {
      sendJSON(opponent, { type: 'opponent_left' });
    }

    // Clean up empty room
    if (!room.players[0] && !room.players[1]) {
      rooms.delete(room.id);
    }
  });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    switch (msg.type) {
      case 'create': {
        const roomId = generateRoomID();
        if (!roomId) {
          sendJSON(ws, { type: 'error', message: '방 생성 실패' });
          return;
        }

        const room = {
          id: roomId,
          config: {
            gameType: msg.gameType,
            boardSize: msg.boardSize,
          },
          players: [ws, null],
          names: [msg.playerName, null],
        };
        rooms.set(roomId, room);
        currentRoom = room;
        playerIndex = 0;

        sendJSON(ws, { type: 'created', roomId });
        break;
      }

      case 'join': {
        const roomId = (msg.roomId || '').toUpperCase();
        const room = rooms.get(roomId);

        if (!room) {
          sendJSON(ws, { type: 'error', message: '방을 찾을 수 없습니다' });
          return;
        }
        if (room.players[1]) {
          sendJSON(ws, { type: 'error', message: '이미 가득 찬 방입니다' });
          return;
        }

        room.players[1] = ws;
        room.names[1] = msg.playerName;
        currentRoom = room;
        playerIndex = 1;

        // Notify both players
        sendJSON(room.players[0], {
          type: 'start',
          playerNumber: 1,
          opponentName: room.names[1],
          config: room.config,
        });
        sendJSON(room.players[1], {
          type: 'start',
          playerNumber: 2,
          opponentName: room.names[0],
          config: room.config,
        });
        break;
      }

      case 'move':
      case 'pass':
      case 'resign': {
        if (!currentRoom) return;
        const otherIdx = 1 - playerIndex;
        const opponent = currentRoom.players[otherIdx];
        if (opponent) {
          sendJSON(opponent, msg);
        }
        break;
      }
    }
  });
});

// ── Start ───────────────────────────────────────────────────────────────────

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const PORT = process.env.PORT || 8080;
server.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIP();
  console.log('');
  console.log('┌─────────────────────────────────────────────┐');
  console.log('│          바둑 / 오목  온라인 서버            │');
  console.log('├─────────────────────────────────────────────┤');
  console.log(`│  로컬:  http://localhost:${PORT}                │`);
  console.log(`│  WiFi:  http://${ip}:${PORT}`);
  console.log('├─────────────────────────────────────────────┤');
  console.log('│  같은 WiFi의 다른 기기에서 위 주소로 접속!  │');
  console.log('└─────────────────────────────────────────────┘');
  console.log('');
});
