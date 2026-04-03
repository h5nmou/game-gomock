const Omok = (() => {
  const DIRECTIONS = [[0, 1], [1, 0], [1, 1], [1, -1]];

  function isValidMove(state, row, col) {
    if (state.gameOver) return false;
    const size = state.config.boardSize;
    if (row < 0 || row >= size || col < 0 || col >= size) return false;
    return state.board[row][col] === 0;
  }

  function applyMove(state, row, col) {
    if (!isValidMove(state, row, col)) return false;

    const player = state.currentPlayer;
    state.board[row][col] = player;
    state.lastMove = { row, col };

    if (checkWin(state.board, row, col, player, state.config.boardSize)) {
      state.gameOver = true;
      state.winner = player;
    } else if (isBoardFull(state.board, state.config.boardSize)) {
      state.gameOver = true;
      state.winner = 'draw';
    } else {
      state.currentPlayer = player === 1 ? 2 : 1;
    }
    return true;
  }

  function checkWin(board, row, col, player, size) {
    for (const [dr, dc] of DIRECTIONS) {
      let count = 1;
      for (let i = 1; i <= 4; i++) {
        const r = row + dr * i, c = col + dc * i;
        if (r < 0 || r >= size || c < 0 || c >= size || board[r][c] !== player) break;
        count++;
      }
      for (let i = 1; i <= 4; i++) {
        const r = row - dr * i, c = col - dc * i;
        if (r < 0 || r >= size || c < 0 || c >= size || board[r][c] !== player) break;
        count++;
      }
      if (count >= 5) return true;
    }
    return false;
  }

  function isBoardFull(board, size) {
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++)
        if (board[r][c] === 0) return false;
    return true;
  }

  return { isValidMove, applyMove, checkWin };
})();
