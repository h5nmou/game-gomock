(function () {
  let toastTimer = null;

  // ── Init ──────────────────────────────────────────────────────────────────
  Screen.init();
  Board.init(document.getElementById('game-canvas'));

  // ── Home ──────────────────────────────────────────────────────────────────
  document.getElementById('btn-omok').addEventListener('click', () => {
    Screen.show('setup', { gameType: 'omok' });
  });
  document.getElementById('btn-baduk').addEventListener('click', () => {
    Screen.show('setup', { gameType: 'baduk' });
  });

  // ── Setup ─────────────────────────────────────────────────────────────────
  document.addEventListener('screen:setup', e => {
    const { gameType } = e.detail;
    document.getElementById('setup-title').textContent =
      gameType === 'omok' ? '오목 설정' : '바둑 설정';
    const sizeGroup = document.getElementById('board-size-group');
    gameType === 'baduk'
      ? sizeGroup.classList.remove('hidden')
      : sizeGroup.classList.add('hidden');
    document.getElementById('player1-name').value = '';
    document.getElementById('player2-name').value = '';
  });

  document.getElementById('btn-back').addEventListener('click', () => {
    Screen.show('home');
  });

  document.getElementById('btn-start').addEventListener('click', () => {
    const titleText = document.getElementById('setup-title').textContent;
    const gameType = titleText === '오목 설정' ? 'omok' : 'baduk';

    const p1name = document.getElementById('player1-name').value.trim() || '플레이어 1';
    const p2raw  = document.getElementById('player2-name').value.trim();
    const p2name = p2raw || '컴퓨터';
    const p2isAI = !p2raw;

    let boardSize = 15;
    if (gameType === 'baduk') {
      const sizeEl = document.querySelector('input[name="board-size"]:checked');
      boardSize = sizeEl ? parseInt(sizeEl.value) : 19;
    }

    const config = {
      gameType,
      boardSize,
      players: [
        { name: p1name, color: 'black', isAI: false },
        { name: p2name, color: 'white', isAI: p2isAI },
      ],
    };

    State.init(config);
    Screen.show('game', config);
  });

  // ── Game init ─────────────────────────────────────────────────────────────
  document.addEventListener('screen:game', () => {
    const state = State.get();

    const passBtn = document.getElementById('btn-pass');
    const captureInfo = document.getElementById('capture-info');

    if (state.config.gameType === 'baduk') {
      passBtn.classList.remove('hidden');
      captureInfo.style.display = 'flex';
    } else {
      passBtn.classList.add('hidden');
      captureInfo.style.display = 'none';
    }

    // Resize and draw after the screen is visible (layout must be calculated)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        Board.resize(state.config.boardSize);
        Board.draw(state);
        updateHUD(state);
        if (state.config.players[state.currentPlayer - 1].isAI) {
          setTimeout(triggerAI, 500);
        }
      });
    });
  });

  // ── Canvas click ──────────────────────────────────────────────────────────
  document.getElementById('game-canvas').addEventListener('click', e => {
    const state = State.get();
    if (!state || state.gameOver) return;
    const current = state.config.players[state.currentPlayer - 1];
    if (current.isAI) return;

    const pos = Board.pixelToGrid(e.offsetX, e.offsetY);
    if (!pos) return;
    handlePlayerMove(pos.row, pos.col);
  });

  // ── Pass ──────────────────────────────────────────────────────────────────
  document.getElementById('btn-pass').addEventListener('click', () => {
    const state = State.get();
    if (!state || state.gameOver) return;
    const current = state.config.players[state.currentPlayer - 1];
    if (current.isAI) return;

    Baduk.pass(state);
    Board.draw(state);
    updateHUD(state);

    if (state.gameOver) {
      setTimeout(() => Screen.show('result', state), 500);
      return;
    }
    showToast('패스했습니다');
    const next = state.config.players[state.currentPlayer - 1];
    if (next.isAI) setTimeout(triggerAI, 600);
  });

  // ── Resign ────────────────────────────────────────────────────────────────
  document.getElementById('btn-resign').addEventListener('click', () => {
    const state = State.get();
    if (!state || state.gameOver) return;
    const current = state.config.players[state.currentPlayer - 1];
    if (current.isAI) return;

    if (!confirm(`${current.name}이(가) 기권하시겠습니까?`)) return;

    if (state.config.gameType === 'baduk') {
      Baduk.resign(state);
    } else {
      state.gameOver = true;
      state.winner = state.currentPlayer === 1 ? 2 : 1;
    }
    Board.draw(state);
    setTimeout(() => Screen.show('result', state), 300);
  });

  // ── Home from game ────────────────────────────────────────────────────────
  document.getElementById('btn-home-game').addEventListener('click', () => {
    Screen.show('home');
  });

  // ── Result ────────────────────────────────────────────────────────────────
  document.addEventListener('screen:result', e => {
    const state = e.detail;
    const players = state.config.players;

    let icon, title, subtitle;

    if (state.winner === 'draw') {
      icon = '🤝';
      title = '무승부!';
      subtitle = '두 플레이어가 동점입니다';
    } else {
      const w = players[state.winner - 1];
      icon = state.winner === 1 ? '⚫' : '⚪';
      title = `${w.name} 승리!`;
      subtitle = `${state.winner === 1 ? '흑' : '백'}돌 승리`;
    }

    document.getElementById('result-icon').textContent = icon;
    document.getElementById('result-title').textContent = title;
    document.getElementById('result-subtitle').textContent = subtitle;

    const scoreDiv = document.getElementById('result-score');
    if (state.config.gameType === 'baduk' && state.finalScore) {
      const s = state.finalScore;
      scoreDiv.classList.remove('hidden');
      scoreDiv.innerHTML = `
        <div class="score-row">
          <span class="score-label">⚫ ${players[0].name}</span>
          <span class="score-value">${s.black}점</span>
        </div>
        <div class="score-detail">영역 ${s.blackTerritory} + 돌 ${s.blackStones} + 포획 ${s.capturedWhite}</div>
        <div class="score-row">
          <span class="score-label">⚪ ${players[1].name}</span>
          <span class="score-value">${s.white}점</span>
        </div>
        <div class="score-detail">영역 ${s.whiteTerritory} + 돌 ${s.whiteStones} + 포획 ${s.capturedBlack} + 덤 ${s.komi}</div>
      `;
    } else {
      scoreDiv.classList.add('hidden');
    }
  });

  document.getElementById('btn-restart').addEventListener('click', () => {
    State.reset();
    Screen.show('game', State.get().config);
  });

  document.getElementById('btn-home-result').addEventListener('click', () => {
    Screen.show('home');
  });

  // ── Core logic ────────────────────────────────────────────────────────────
  function handlePlayerMove(row, col) {
    const state = State.get();
    let valid;

    if (state.config.gameType === 'omok') {
      valid = Omok.applyMove(state, row, col);
      if (!valid) { showToast('착수 불가'); return; }
    } else {
      valid = Baduk.applyMove(state, row, col);
      if (!valid) {
        if (state.koPoint && state.koPoint.row === row && state.koPoint.col === col) {
          showToast('패 규칙 위반');
        } else {
          showToast('착수 불가 (자충수)');
        }
        return;
      }
    }

    Board.draw(state);
    updateHUD(state);

    if (state.gameOver) {
      setTimeout(() => Screen.show('result', state), 600);
      return;
    }

    const next = state.config.players[state.currentPlayer - 1];
    if (next.isAI) setTimeout(triggerAI, 400);
  }

  function triggerAI() {
    const state = State.get();
    if (!state || state.gameOver) return;

    if (state.config.gameType === 'omok') {
      const move = OmokAI.chooseMove(state);
      Omok.applyMove(state, move[0], move[1]);
    } else {
      const move = BadukAI.chooseMove(state);
      if (move === 'pass') {
        showToast('컴퓨터가 패스했습니다');
        Baduk.pass(state);
      } else {
        Baduk.applyMove(state, move[0], move[1]);
      }
    }

    Board.draw(state);
    updateHUD(state);

    if (state.gameOver) {
      setTimeout(() => Screen.show('result', state), 600);
      return;
    }

    // If both players are AI (shouldn't happen with current setup, but guard it)
    const next = state.config.players[state.currentPlayer - 1];
    if (next.isAI) setTimeout(triggerAI, 400);
  }

  function updateHUD(state) {
    const current = state.config.players[state.currentPlayer - 1];

    const stone = document.getElementById('turn-stone');
    if (state.currentPlayer === 1) {
      stone.style.background = '#111';
      stone.style.border = '2px solid #444';
    } else {
      stone.style.background = '#eee';
      stone.style.border = '2px solid #aaa';
    }

    document.getElementById('turn-name').textContent = current.name;

    if (state.config.gameType === 'baduk') {
      document.getElementById('capture-black').textContent = `흑 포획: ${state.capturedWhite}`;
      document.getElementById('capture-white').textContent = `백 포획: ${state.capturedBlack}`;
    }
  }

  function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.remove('hidden');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add('hidden'), 1800);
  }
})();
