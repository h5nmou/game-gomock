const Network = (() => {
  let ws = null;
  let _playerNumber = 0;   // 1 = black (host), 2 = white (guest)
  let _roomId = null;
  let _onMessage = null;    // callback set by main.js
  let _connected = false;

  function connect() {
    return new Promise((resolve, reject) => {
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${protocol}//${location.host}/ws`);

      ws.onopen = () => {
        _connected = true;
        resolve();
      };

      ws.onerror = () => {
        _connected = false;
        reject(new Error('연결 실패'));
      };

      ws.onclose = () => {
        _connected = false;
      };

      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (_onMessage) _onMessage(msg);
      };
    });
  }

  function disconnect() {
    if (ws) {
      ws.close();
      ws = null;
    }
    _connected = false;
    _playerNumber = 0;
    _roomId = null;
  }

  function send(msg) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  function createRoom(gameType, boardSize, playerName) {
    send({ type: 'create', gameType, boardSize, playerName });
  }

  function joinRoom(roomId, playerName) {
    send({ type: 'join', roomId: roomId.toUpperCase(), playerName });
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

  function onMessage(cb) {
    _onMessage = cb;
  }

  function setPlayerNumber(n) { _playerNumber = n; }
  function getPlayerNumber() { return _playerNumber; }
  function setRoomId(id) { _roomId = id; }
  function getRoomId() { return _roomId; }
  function isConnected() { return _connected; }
  function isOnline() { return _connected && _roomId !== null; }
  function isMyTurn(currentPlayer) { return currentPlayer === _playerNumber; }

  return {
    connect, disconnect, send,
    createRoom, joinRoom,
    sendMove, sendPass, sendResign,
    onMessage,
    setPlayerNumber, getPlayerNumber,
    setRoomId, getRoomId,
    isConnected, isOnline, isMyTurn,
  };
})();
