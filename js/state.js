const State = (() => {
  let _state = null;

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
    return _state;
  }

  function get() {
    return _state;
  }

  function reset() {
    return init(_state.config);
  }

  return { init, get, reset };
})();
