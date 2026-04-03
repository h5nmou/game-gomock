const Baduk = (() => {
  const ADJ = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  function isValidMove(state, row, col) {
    if (state.gameOver) return false;
    const { boardSize } = state.config;
    if (row < 0 || row >= boardSize || col < 0 || col >= boardSize) return false;
    if (state.board[row][col] !== 0) return false;
    if (state.koPoint && state.koPoint.row === row && state.koPoint.col === col) return false;
    return true;
  }

  function applyMove(state, row, col) {
    if (!isValidMove(state, row, col)) return false;

    const { boardSize } = state.config;
    const player = state.currentPlayer;
    const opponent = player === 1 ? 2 : 1;

    // Place stone
    state.board[row][col] = player;

    // Find and remove opponent groups with no liberties
    const captured = [];
    for (const [dr, dc] of ADJ) {
      const nr = row + dr, nc = col + dc;
      if (nr < 0 || nr >= boardSize || nc < 0 || nc >= boardSize) continue;
      if (state.board[nr][nc] !== opponent) continue;
      const { group, liberties } = getGroupInfo(state.board, nr, nc, boardSize);
      if (liberties.size === 0) {
        for (const [r, c] of group) captured.push([r, c]);
      }
    }

    // Deduplicate captured (multiple adjacencies may find same group)
    const capturedUniq = [];
    const seen = new Set();
    for (const [r, c] of captured) {
      const key = r * boardSize + c;
      if (!seen.has(key)) { seen.add(key); capturedUniq.push([r, c]); }
    }

    // Remove captured stones
    for (const [r, c] of capturedUniq) {
      state.board[r][c] = 0;
    }

    // Check suicide
    const { liberties: ownLiberties } = getGroupInfo(state.board, row, col, boardSize);
    if (ownLiberties.size === 0) {
      // Undo
      state.board[row][col] = 0;
      for (const [r, c] of capturedUniq) state.board[r][c] = opponent;
      return false;
    }

    // Update captured counts
    if (player === 1) state.capturedWhite += capturedUniq.length;
    else state.capturedBlack += capturedUniq.length;

    // Ko detection: if exactly one stone captured and placed stone is also a single-stone group
    if (capturedUniq.length === 1) {
      const { group: ownGroup } = getGroupInfo(state.board, row, col, boardSize);
      if (ownGroup.length === 1) {
        state.koPoint = { row: capturedUniq[0][0], col: capturedUniq[0][1] };
      } else {
        state.koPoint = null;
      }
    } else {
      state.koPoint = null;
    }

    state.lastMove = { row, col };
    state.consecutivePasses = 0;
    state.currentPlayer = opponent;
    return true;
  }

  function pass(state) {
    if (state.gameOver) return false;
    state.consecutivePasses++;
    state.lastMove = null;
    state.koPoint = null;
    if (state.consecutivePasses >= 2) {
      endGame(state);
    } else {
      state.currentPlayer = state.currentPlayer === 1 ? 2 : 1;
    }
    return true;
  }

  function resign(state) {
    state.gameOver = true;
    state.winner = state.currentPlayer === 1 ? 2 : 1;
  }

  function endGame(state) {
    state.gameOver = true;
    const scores = scoreGame(state);
    state.finalScore = scores;
    if (scores.black > scores.white) state.winner = 1;
    else if (scores.white > scores.black) state.winner = 2;
    else state.winner = 'draw';
  }

  function scoreGame(state) {
    const { board, config: { boardSize }, capturedBlack, capturedWhite } = state;
    const KOMI = boardSize === 19 ? 6.5 : 5.5;

    let blackStones = 0, whiteStones = 0;
    for (let r = 0; r < boardSize; r++)
      for (let c = 0; c < boardSize; c++) {
        if (board[r][c] === 1) blackStones++;
        else if (board[r][c] === 2) whiteStones++;
      }

    const territory = countTerritory(board, boardSize);

    return {
      black: territory.black + blackStones + capturedWhite,
      white: territory.white + whiteStones + capturedBlack + KOMI,
      blackTerritory: territory.black,
      whiteTerritory: territory.white,
      blackStones,
      whiteStones,
      capturedBlack,
      capturedWhite,
      komi: KOMI,
    };
  }

  function countTerritory(board, size) {
    const visited = Array.from({ length: size }, () => new Array(size).fill(false));
    let black = 0, white = 0;

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (board[r][c] === 0 && !visited[r][c]) {
          const { region, borders } = floodEmpty(board, r, c, size, visited);
          if (borders.size === 1) {
            const owner = [...borders][0];
            if (owner === 1) black += region.length;
            else white += region.length;
          }
        }
      }
    }
    return { black, white };
  }

  function floodEmpty(board, startR, startC, size, visited) {
    const region = [];
    const borders = new Set();
    const queue = [[startR, startC]];
    visited[startR][startC] = true;

    while (queue.length > 0) {
      const [r, c] = queue.shift();
      region.push([r, c]);
      for (const [dr, dc] of ADJ) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
        if (board[nr][nc] !== 0) {
          borders.add(board[nr][nc]);
        } else if (!visited[nr][nc]) {
          visited[nr][nc] = true;
          queue.push([nr, nc]);
        }
      }
    }
    return { region, borders };
  }

  function getGroupInfo(board, row, col, size) {
    const player = board[row][col];
    const group = [];
    const liberties = new Set();
    const visited = new Set();
    const queue = [[row, col]];
    visited.add(row * size + col);

    while (queue.length > 0) {
      const [r, c] = queue.shift();
      group.push([r, c]);
      for (const [dr, dc] of ADJ) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
        const key = nr * size + nc;
        if (visited.has(key)) continue;
        visited.add(key);
        if (board[nr][nc] === 0) {
          liberties.add(key);
        } else if (board[nr][nc] === player) {
          queue.push([nr, nc]);
        }
      }
    }
    return { group, liberties };
  }

  function getAllLegalMoves(state) {
    const { boardSize } = state.config;
    const moves = [];
    for (let r = 0; r < boardSize; r++)
      for (let c = 0; c < boardSize; c++)
        if (isValidMove(state, r, c)) moves.push([r, c]);
    return moves;
  }

  return { isValidMove, applyMove, pass, resign, endGame, scoreGame, getGroupInfo, getAllLegalMoves };
})();
