const BadukAI = (() => {
  const ADJ = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  function chooseMove(state) {
    const legal = Baduk.getAllLegalMoves(state);
    const { boardSize } = state.config;
    const aiPlayer = state.currentPlayer;
    const opponent = aiPlayer === 1 ? 2 : 1;

    // Filter out obvious eye-fills (self-filling)
    const nonEyeMoves = legal.filter(([r, c]) => !isSimpleEye(state.board, r, c, aiPlayer, boardSize));

    // Pass when no meaningful moves remain
    if (nonEyeMoves.length < 3) return 'pass';

    // Priority 1: Capture opponent groups in atari (1 liberty)
    for (const [r, c] of shuffled(nonEyeMoves)) {
      const adjOpponent = getAdjacentOfColor(state.board, r, c, opponent, boardSize);
      for (const [nr, nc] of adjOpponent) {
        const { liberties } = Baduk.getGroupInfo(state.board, nr, nc, boardSize);
        if (liberties.size === 1) return [r, c];
      }
    }

    // Priority 2: Save own groups in atari
    for (const [r, c] of shuffled(nonEyeMoves)) {
      const adjOwn = getAdjacentOfColor(state.board, r, c, aiPlayer, boardSize);
      for (const [nr, nc] of adjOwn) {
        const { liberties } = Baduk.getGroupInfo(state.board, nr, nc, boardSize);
        if (liberties.size === 1) return [r, c];
      }
    }

    // Priority 3: Put opponent group in atari (2 liberties → 1)
    for (const [r, c] of shuffled(nonEyeMoves)) {
      const adjOpponent = getAdjacentOfColor(state.board, r, c, opponent, boardSize);
      for (const [nr, nc] of adjOpponent) {
        const { liberties } = Baduk.getGroupInfo(state.board, nr, nc, boardSize);
        if (liberties.size === 2) return [r, c];
      }
    }

    // Priority 4: Extend own groups (play adjacent to own stones)
    const nearOwn = nonEyeMoves.filter(([r, c]) =>
      getAdjacentOfColor(state.board, r, c, aiPlayer, boardSize).length > 0
    );
    if (nearOwn.length > 0) {
      return nearOwn[Math.floor(Math.random() * nearOwn.length)];
    }

    // Priority 5: Play in large empty region
    const bestEmpty = findBestEmptyMove(state.board, nonEyeMoves, boardSize);
    if (bestEmpty) return bestEmpty;

    return nonEyeMoves[Math.floor(Math.random() * nonEyeMoves.length)];
  }

  function isSimpleEye(board, r, c, player, size) {
    const adj = getAdjacent(r, c, size);
    // True eye: all orthogonal neighbors are own stones or walls
    return adj.every(([nr, nc]) => board[nr][nc] === player);
  }

  function getAdjacentOfColor(board, r, c, color, size) {
    return getAdjacent(r, c, size).filter(([nr, nc]) => board[nr][nc] === color);
  }

  function getAdjacent(r, c, size) {
    return ADJ
      .map(([dr, dc]) => [r + dr, c + dc])
      .filter(([nr, nc]) => nr >= 0 && nr < size && nc >= 0 && nc < size);
  }

  function findBestEmptyMove(board, moves, size) {
    // Score each candidate by how many empty cells are reachable from it
    // (prefers playing in larger open areas)
    let best = null, bestScore = -1;
    const sample = shuffled(moves).slice(0, Math.min(30, moves.length));
    for (const [r, c] of sample) {
      const score = countReachableEmpty(board, r, c, size);
      if (score > bestScore) { bestScore = score; best = [r, c]; }
    }
    return best;
  }

  function countReachableEmpty(board, startR, startC, size) {
    const visited = new Set();
    const queue = [[startR, startC]];
    visited.add(startR * size + startC);
    let count = 0;
    while (queue.length > 0 && count < 20) {
      const [r, c] = queue.shift();
      count++;
      for (const [dr, dc] of ADJ) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
        const key = nr * size + nc;
        if (!visited.has(key) && board[nr][nc] === 0) {
          visited.add(key);
          queue.push([nr, nc]);
        }
      }
    }
    return count;
  }

  function shuffled(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  return { chooseMove };
})();
