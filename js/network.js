const Network = (() => {
  let peer = null;        // PeerJS instance
  let conn = null;        // DataConnection to opponent
  let _playerNumber = 0;  // 1 = black (host), 2 = white (guest)
  let _roomId = null;
  let _onMessage = null;
  let _connected = false;

  // Prefix to avoid PeerJS ID collisions with other apps
  const ID_PREFIX = 'gomock-';

  // Generate a 6-char room code
  function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  // Create a PeerJS peer with given ID
  function createPeer(id) {
    return new Promise((resolve, reject) => {
      const p = new Peer(id, {
        debug: 0,
      });

      const timeout = setTimeout(() => {
        p.destroy();
        reject(new Error('PeerJS 서버 연결 시간 초과'));
      }, 10000);

      p.on('open', () => {
        clearTimeout(timeout);
        resolve(p);
      });

      p.on('error', (err) => {
        clearTimeout(timeout);
        // 'unavailable-id' means the room code is already taken
        if (err.type === 'unavailable-id') {
          p.destroy();
          reject(new Error('unavailable-id'));
        } else {
          reject(err);
        }
      });
    });
  }

  // Setup data connection event handlers
  function setupConnection(dataConn) {
    conn = dataConn;

    conn.on('open', () => {
      _connected = true;
    });

    conn.on('data', (data) => {
      if (_onMessage) _onMessage(data);
    });

    conn.on('close', () => {
      _connected = false;
      if (_onMessage) _onMessage({ type: 'opponent_left' });
    });

    conn.on('error', () => {
      _connected = false;
    });
  }

  // HOST: create a room and wait for opponent
  function createRoom(gameType, boardSize, playerName) {
    return new Promise(async (resolve, reject) => {
      // Try up to 5 codes in case of collision
      let code = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        code = generateRoomCode();
        try {
          peer = await createPeer(ID_PREFIX + code);
          break;
        } catch (err) {
          if (err.message === 'unavailable-id') {
            code = null;
            continue;
          }
          reject(err);
          return;
        }
      }

      if (!code) {
        reject(new Error('방 코드 생성 실패'));
        return;
      }

      _roomId = code;
      _playerNumber = 1;

      // Notify caller that room is created (show code to user)
      if (_onMessage) {
        _onMessage({ type: 'created', roomId: code });
      }

      // Wait for opponent to connect
      peer.on('connection', (dataConn) => {
        setupConnection(dataConn);

        dataConn.on('open', () => {
          _connected = true;

          // Opponent sends their info first, we respond with start
          dataConn.on('data', function onJoin(data) {
            if (data.type === 'join_info') {
              // Remove this one-time handler by reassigning
              // Send game config to opponent
              conn.send({
                type: 'start',
                playerNumber: 2,
                opponentName: playerName,
                config: { gameType, boardSize },
              });

              // Notify host that game starts
              if (_onMessage) {
                _onMessage({
                  type: 'start',
                  playerNumber: 1,
                  opponentName: data.playerName,
                  config: { gameType, boardSize },
                });
              }

              // Now switch to normal message handling
              conn.off('data');
              conn.on('data', (msg) => {
                if (_onMessage) _onMessage(msg);
              });

              resolve();
            }
          });
        });
      });

      peer.on('disconnected', () => {
        // Try to reconnect to PeerJS server
        if (peer && !peer.destroyed) peer.reconnect();
      });
    });
  }

  // GUEST: join an existing room
  function joinRoom(roomCode, playerName) {
    return new Promise(async (resolve, reject) => {
      const code = roomCode.toUpperCase();

      try {
        // Create our own peer with a random ID
        peer = await createPeer(ID_PREFIX + 'g-' + code + '-' + Math.random().toString(36).substr(2, 4));
      } catch (err) {
        reject(new Error('PeerJS 연결 실패'));
        return;
      }

      _roomId = code;
      _playerNumber = 2;

      // Connect to the host
      const dataConn = peer.connect(ID_PREFIX + code, { reliable: true });

      const timeout = setTimeout(() => {
        reject(new Error('방을 찾을 수 없습니다'));
      }, 10000);

      dataConn.on('open', () => {
        clearTimeout(timeout);
        setupConnection(dataConn);

        // Replace the data handler to wait for start message
        conn.off('data');
        conn.on('data', function onStart(data) {
          if (data.type === 'start') {
            if (_onMessage) _onMessage(data);

            // Switch to normal message handling
            conn.off('data');
            conn.on('data', (msg) => {
              if (_onMessage) _onMessage(msg);
            });

            resolve();
          }
        });

        // Send our info to host
        dataConn.send({ type: 'join_info', playerName });
      });

      dataConn.on('error', (err) => {
        clearTimeout(timeout);
        reject(new Error('방을 찾을 수 없습니다'));
      });

      peer.on('disconnected', () => {
        if (peer && !peer.destroyed) peer.reconnect();
      });
    });
  }

  function send(msg) {
    if (conn && conn.open) {
      conn.send(msg);
    }
  }

  function sendMove(row, col) {
    send({ type: 'move', row, col });
  }

  function sendPass() {
    send({ type: 'pass' });
  }

  function sendResign() {
    send({ type: 'resign' });
  }

  function disconnect() {
    if (conn) { conn.close(); conn = null; }
    if (peer) { peer.destroy(); peer = null; }
    _connected = false;
    _playerNumber = 0;
    _roomId = null;
  }

  function onMessage(cb) { _onMessage = cb; }
  function setPlayerNumber(n) { _playerNumber = n; }
  function getPlayerNumber() { return _playerNumber; }
  function setRoomId(id) { _roomId = id; }
  function getRoomId() { return _roomId; }
  function isConnected() { return _connected; }
  function isOnline() { return _playerNumber !== 0 && _roomId !== null; }
  function isMyTurn(currentPlayer) { return currentPlayer === _playerNumber; }

  return {
    createRoom, joinRoom, disconnect, send,
    sendMove, sendPass, sendResign,
    onMessage,
    setPlayerNumber, getPlayerNumber,
    setRoomId, getRoomId,
    isConnected, isOnline, isMyTurn,
  };
})();
