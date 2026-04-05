const State = (() => {
  let _state = null;
  let _history = [];

  function init(config) {
    const size = config.boardSize;
    const board = Array.from({ length: size }, () => new Array(size).fill(0));
    _state = {
      config,
      board,
      currentPlayer: 1,
      capturedBlack: 0,
      capturedWhite: 0,
      lastMove: null,
      koPoint: null,
      consecutivePasses: 0,
      gameOver: false,
      winner: null,
      finalScore: null,
    };
    _history = [];
    return _state;
  }

  function get() {
    return _state;
  }

  function reset() {
    return init(_state.config);
  }

  function pushHistory() {
    _history.push({
      board: _state.board.map(row => [...row]),
      currentPlayer: _state.currentPlayer,
      capturedBlack: _state.capturedBlack,
      capturedWhite: _state.capturedWhite,
      lastMove: _state.lastMove ? { ..._state.lastMove } : null,
      koPoint: _state.koPoint ? { ..._state.koPoint } : null,
      consecutivePasses: _state.consecutivePasses,
      gameOver: _state.gameOver,
      winner: _state.winner,
    });
  }

  function undo() {
    if (_history.length === 0) return false;
    const snap = _history.pop();
    _state.board = snap.board;
    _state.currentPlayer = snap.currentPlayer;
    _state.capturedBlack = snap.capturedBlack;
    _state.capturedWhite = snap.capturedWhite;
    _state.lastMove = snap.lastMove;
    _state.koPoint = snap.koPoint;
    _state.consecutivePasses = snap.consecutivePasses;
    _state.gameOver = snap.gameOver;
    _state.winner = snap.winner;
    _state.finalScore = null;
    return true;
  }

  function canUndo() {
    return _history.length > 0;
  }

  return { init, get, reset, pushHistory, undo, canUndo };
})();
