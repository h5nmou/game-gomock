const Network = (() => {
  let peer = null;        // PeerJS instance
  let conn = null;        // DataConnection to opponent
  let _playerNumber = 0;  // 1 = black (host), 2 = white (guest)
  let _roomId = null;
  let _onMessage = null;
  let _connected = false;

  const ID_PREFIX = 'gomock-';

  function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
  }

  // Create a PeerJS peer and wait for it to be ready
  function createPeer(id) {
    return new Promise((resolve, reject) => {
      const p = new Peer(id, { debug: 0 });

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
        if (err.type === 'unavailable-id') {
          p.destroy();
          reject(new Error('unavailable-id'));
        } else {
          p.destroy();
          reject(err);
        }
      });
    });
  }

  // Wait for a DataConnection to be open (handles already-open case)
  function waitForOpen(dataConn) {
    return new Promise((resolve, reject) => {
      if (dataConn.open) {
        resolve();
        return;
      }
      const timeout = setTimeout(() => {
        reject(new Error('연결 시간 초과'));
      }, 10000);

      dataConn.on('open', () => {
        clearTimeout(timeout);
        resolve();
      });
      dataConn.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  // Wait for the first data message matching a type
  function waitForMessage(dataConn, expectedType) {
    return new Promise((resolve) => {
      function handler(data) {
        if (data && data.type === expectedType) {
          dataConn.off('data', handler);
          resolve(data);
        }
      }
      dataConn.on('data', handler);
    });
  }

  // Bind the permanent connection handlers (game phase)
  function bindConnection(dataConn) {
    conn = dataConn;
    _connected = true;

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

  // ── HOST: create a room and wait for opponent ──

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

      // Notify UI that room is created (show room code)
      if (_onMessage) {
        _onMessage({ type: 'created', roomId: code });
      }

      // Wait for opponent to connect
      peer.on('connection', async (dataConn) => {
        try {
          // 1. Wait for the data channel to be open
          await waitForOpen(dataConn);

          // 2. Wait for opponent's join_info message
          const joinMsg = await waitForMessage(dataConn, 'join_info');

          // 3. Send start message to opponent
          dataConn.send({
            type: 'start',
            playerNumber: 2,
            opponentName: playerName,
            config: { gameType, boardSize },
          });

          // 4. Bind permanent handlers (clears the one-time waitForMessage listener)
          bindConnection(dataConn);

          // 5. Notify host UI that game starts
          if (_onMessage) {
            _onMessage({
              type: 'start',
              playerNumber: 1,
              opponentName: joinMsg.playerName,
              config: { gameType, boardSize },
            });
          }

          resolve();
        } catch (err) {
          reject(err);
        }
      });

      peer.on('disconnected', () => {
        if (peer && !peer.destroyed) peer.reconnect();
      });
    });
  }

  // ── GUEST: join an existing room ──

  function joinRoom(roomCode, playerName) {
    return new Promise(async (resolve, reject) => {
      const code = roomCode.toUpperCase();

      try {
        const guestId = ID_PREFIX + 'g-' + code + '-' + Math.random().toString(36).substr(2, 4);
        peer = await createPeer(guestId);
      } catch (err) {
        reject(new Error('PeerJS 연결 실패'));
        return;
      }

      _roomId = code;
      _playerNumber = 2;

      // Connect to the host peer
      const dataConn = peer.connect(ID_PREFIX + code, { reliable: true });

      try {
        // 1. Wait for the data channel to be open
        await waitForOpen(dataConn);

        // 2. Send our info to host
        dataConn.send({ type: 'join_info', playerName });

        // 3. Wait for host's start message
        const startMsg = await waitForMessage(dataConn, 'start');

        // 4. Bind permanent handlers
        bindConnection(dataConn);

        // 5. Notify guest UI that game starts
        if (_onMessage) {
          _onMessage(startMsg);
        }

        resolve();
      } catch (err) {
        reject(new Error('방을 찾을 수 없습니다'));
      }

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

  function sendMove(row, col) { send({ type: 'move', row, col }); }
  function sendPass() { send({ type: 'pass' }); }
  function sendResign() { send({ type: 'resign' }); }

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
