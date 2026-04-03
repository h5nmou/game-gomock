const OmokAI = (() => {
  const SCORE = {
    FIVE:         1000000,
    OPEN_FOUR:     200000,  // 거의 확정 승리
    HALF_FOUR:      50000,
    OPEN_THREE:     15000,  // 이중 위협 핵심
    HALF_THREE:      1500,
    OPEN_TWO:         300,
    HALF_TWO:          80,
    DOUBLE_THREAT: 300000,  // 두 방향 동시 위협 보너스
  };

  const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];
  const MAX_DEPTH = 3;         // 탐색 깊이 (AI 1.5수 + 상대 1.5수)
  const BRANCH = 12;           // 각 노드당 최대 후보 수

  // ── 공개 인터페이스 ────────────────────────────────────────────────────────
  function chooseMove(state) {
    const { board, config: { boardSize: size } } = state;
    const me = state.currentPlayer;
    const opp = me === 1 ? 2 : 1;
    const cands = getCandidates(board, size);

    if (cands.length === 0) {
      const mid = Math.floor(size / 2);
      return [mid, mid];
    }

    // 1순위: 즉시 승리수
    for (const [r, c] of cands) {
      board[r][c] = me;
      const win = Omok.checkWin(board, r, c, me, size);
      board[r][c] = 0;
      if (win) return [r, c];
    }

    // 2순위: 상대 즉시 승리 차단
    for (const [r, c] of cands) {
      board[r][c] = opp;
      const win = Omok.checkWin(board, r, c, opp, size);
      board[r][c] = 0;
      if (win) return [r, c];
    }

    // 3순위: Negamax 탐색
    const ranked = rank(board, cands, me, opp, size);
    const top = ranked.slice(0, BRANCH);

    let bestScore = -Infinity;
    let bestMove = top[0].pos;

    for (const { pos: [r, c] } of top) {
      board[r][c] = me;
      const score = -negamax(board, MAX_DEPTH - 1, -Infinity, Infinity, opp, me, size);
      board[r][c] = 0;
      if (score > bestScore) {
        bestScore = score;
        bestMove = [r, c];
      }
    }

    return bestMove;
  }

  // ── Negamax + Alpha-Beta ───────────────────────────────────────────────────
  function negamax(board, depth, alpha, beta, player, opponent, size) {
    const cands = getCandidates(board, size);
    if (cands.length === 0) return 0;

    // 즉시 승리/패배 체크 (terminal)
    for (const [r, c] of cands) {
      board[r][c] = player;
      if (Omok.checkWin(board, r, c, player, size)) {
        board[r][c] = 0;
        // 깊이가 낮을수록(빠른 승리) 더 높은 점수
        return SCORE.FIVE - (MAX_DEPTH - depth) * 5000;
      }
      board[r][c] = 0;
    }

    if (depth === 0) {
      return staticEval(board, player, opponent, size);
    }

    const top = rank(board, cands, player, opponent, size).slice(0, BRANCH);
    let best = -Infinity;

    for (const { pos: [r, c] } of top) {
      board[r][c] = player;
      const score = -negamax(board, depth - 1, -beta, -alpha, opponent, player, size);
      board[r][c] = 0;
      if (score > best) best = score;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break; // 가지치기
    }
    return best;
  }

  // ── 정적 평가 (리프 노드) ─────────────────────────────────────────────────
  function staticEval(board, player, opponent, size) {
    return boardScore(board, player, size) - boardScore(board, opponent, size);
  }

  function boardScore(board, player, size) {
    let total = 0;
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++)
        if (board[r][c] === player)
          for (const [dr, dc] of DIRS)
            total += dirScore(board, r, c, dr, dc, player, size);
    return total;
  }

  // ── 후보 수 정렬 ─────────────────────────────────────────────────────────
  function rank(board, cands, me, opp, size) {
    return cands
      .filter(([r, c]) => board[r][c] === 0)
      .map(([r, c]) => ({
        pos: [r, c],
        score: cellScore(board, r, c, me, size) + cellScore(board, r, c, opp, size),
      }))
      .sort((a, b) => b.score - a.score);
  }

  // ── 착수점 평가 (공격 또는 방어) ─────────────────────────────────────────
  function cellScore(board, row, col, player, size) {
    board[row][col] = player;
    let total = 0;
    let bigThreats = 0; // OPEN_THREE 이상인 방향 수

    for (const [dr, dc] of DIRS) {
      const s = dirScore(board, row, col, dr, dc, player, size);
      total += s;
      if (s >= SCORE.OPEN_THREE) bigThreats++;
    }

    // 이중 위협 보너스: 두 방향 이상 동시 위협 → 상대가 한 곳밖에 못 막음
    if (bigThreats >= 2) total += SCORE.DOUBLE_THREAT;

    board[row][col] = 0;
    return total;
  }

  // ── 방향별 점수 ───────────────────────────────────────────────────────────
  function dirScore(board, row, col, dr, dc, player, size) {
    const opp = player === 1 ? 2 : 1;

    // 중심(row,col) 기준 ±4칸 수집
    const line = [];
    for (let i = -4; i <= 4; i++) {
      const r = row + dr * i, c = col + dc * i;
      if (r < 0 || r >= size || c < 0 || c >= size) {
        line.push(-1); // 벽
      } else {
        line.push(board[r][c]);
      }
    }

    // 5칸 슬라이딩 윈도우 → 가장 높은 점수 반환
    let best = 0;
    for (let s = 0; s <= 4; s++) {
      const w = line.slice(s, s + 5);
      if (w.includes(opp)) continue;       // 상대에 막힘
      const mine = w.filter(v => v === player).length;
      if (mine === 0) continue;
      const wall = w.includes(-1);
      const sc = wall ? halfScore(mine) : openScore(mine);
      if (sc > best) best = sc;
    }
    return best;
  }

  function openScore(n) {
    if (n >= 5) return SCORE.FIVE;
    if (n === 4) return SCORE.OPEN_FOUR;
    if (n === 3) return SCORE.OPEN_THREE;
    if (n === 2) return SCORE.OPEN_TWO;
    return 0;
  }

  function halfScore(n) {
    if (n >= 5) return SCORE.FIVE;
    if (n === 4) return SCORE.HALF_FOUR;
    if (n === 3) return SCORE.HALF_THREE;
    if (n === 2) return SCORE.HALF_TWO;
    return 0;
  }

  // ── 후보 착수점 생성 (기존 돌 주변 2칸 이내) ─────────────────────────────
  function getCandidates(board, size) {
    const set = new Set();
    let anyStone = false;

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (board[r][c] === 0) continue;
        anyStone = true;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < size && nc >= 0 && nc < size && board[nr][nc] === 0)
              set.add(nr * size + nc);
          }
        }
      }
    }

    if (!anyStone) {
      const mid = Math.floor(size / 2);
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++)
          set.add((mid + dr) * size + (mid + dc));
    }

    return [...set].map(k => [Math.floor(k / size), k % size]);
  }

  return { chooseMove };
})();
