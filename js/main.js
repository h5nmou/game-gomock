(function () {
  let toastTimer = null;
  let onlineGameType = null;  // track which game type for online lobby

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

  // Online buttons
  document.getElementById('btn-online-omok').addEventListener('click', () => {
    onlineGameType = 'omok';
    Screen.show('lobby', { gameType: 'omok' });
  });
  document.getElementById('btn-online-baduk').addEventListener('click', () => {
    onlineGameType = 'baduk';
    Screen.show('lobby', { gameType: 'baduk' });
  });

  // ── Setup (local play) ───────────────────────────────────────────────────
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

  // ── Lobby (online play) ───────────────────────────────────────────────────
  document.addEventListener('screen:lobby', e => {
    const { gameType } = e.detail;
    onlineGameType = gameType;
    document.getElementById('lobby-title').textContent =
      gameType === 'omok' ? '오목 온라인 대전' : '바둑 온라인 대전';

    const sizeGroup = document.getElementById('online-board-size-group');
    gameType === 'baduk'
      ? sizeGroup.classList.remove('hidden')
      : sizeGroup.classList.add('hidden');

    // Reset lobby state
    document.getElementById('lobby-menu').classList.remove('hidden');
    document.getElementById('lobby-waiting').classList.add('hidden');
    document.getElementById('join-section').classList.add('hidden');
    document.getElementById('online-name').value = '';
    document.getElementById('room-code-input').value = '';
  });

  document.getElementById('btn-lobby-back').addEventListener('click', () => {
    Network.disconnect();
    Screen.show('home');
  });

  document.getElementById('btn-show-join').addEventListener('click', () => {
    document.getElementById('join-section').classList.toggle('hidden');
  });

  // Create room
  document.getElementById('btn-create-room').addEventListener('click', async () => {
    const playerName = document.getElementById('online-name').value.trim() || '플레이어';
    let boardSize = 15;
    if (onlineGameType === 'baduk') {
      const sizeEl = document.querySelector('input[name="online-board-size"]:checked');
      boardSize = sizeEl ? parseInt(sizeEl.value) : 19;
    }

    setupNetworkHandlers();
    Network.createRoom(onlineGameType, boardSize, playerName).catch(err => {
      showToast(err.message || '방 만들기 실패');
    });
  });

  // Join room
  document.getElementById('btn-join-room').addEventListener('click', async () => {
    const playerName = document.getElementById('online-name').value.trim() || '플레이어';
    const roomCode = document.getElementById('room-code-input').value.trim().toUpperCase();
    if (roomCode.length < 4) {
      showToast('방 코드를 입력하세요');
      return;
    }

    setupNetworkHandlers();

    // Show connecting state
    document.getElementById('lobby-menu').classList.add('hidden');
    document.getElementById('lobby-waiting').classList.remove('hidden');
    document.getElementById('room-code-value').textContent = '연결 중...';

    Network.joinRoom(roomCode, playerName).catch(err => {
      showToast(err.message || '방 참가 실패');
      document.getElementById('lobby-menu').classList.remove('hidden');
      document.getElementById('lobby-waiting').classList.add('hidden');
    });
  });

  function setupNetworkHandlers() {
    Network.onMessage(msg => {
      switch (msg.type) {
        case 'created':
          document.getElementById('room-code-value').textContent = msg.roomId;
          document.getElementById('lobby-menu').classList.add('hidden');
          document.getElementById('lobby-waiting').classList.remove('hidden');
          break;

        case 'start':
          startOnlineGame(msg);
          break;

        case 'move':
          handleRemoteMove(msg.row, msg.col);
          break;

        case 'pass':
          handleRemotePass();
          break;

        case 'resign':
          handleRemoteResign();
          break;

        case 'rematch':
          State.reset();
          Screen.show('game', State.get().config);
          break;

        case 'undo_request':
          if (confirm('상대방이 무르기를 요청했습니다. 수락하시겠습니까?')) {
            Network.sendUndoAccept();
            State.undo();
            Board.draw(State.get());
            updateHUD(State.get());
            showToast('무르기 수락');
          } else {
            Network.sendUndoReject();
          }
          break;

        case 'undo_accept':
          State.undo();
          Board.draw(State.get());
          updateHUD(State.get());
          showToast('무르기가 수락되었습니다');
          break;

        case 'undo_reject':
          showToast('무르기가 거절되었습니다');
          break;

        case 'opponent_left':
          showToast('상대방이 나갔습니다');
          const state = State.get();
          if (state && !state.gameOver) {
            state.gameOver = true;
            state.winner = Network.getPlayerNumber();
            Board.draw(state);
            setTimeout(() => Screen.show('result', state), 1000);
          }
          break;

        case 'error':
          showToast(msg.message);
          break;
      }
    });
  }

  function startOnlineGame(msg) {
    Network.setPlayerNumber(msg.playerNumber);
    Network.setRoomId('online');

    const myName = document.getElementById('online-name').value.trim() || '플레이어';
    const opponentName = msg.opponentName || '상대방';

    const config = {
      gameType: msg.config.gameType,
      boardSize: msg.config.gameType === 'omok' ? 15 : msg.config.boardSize,
      players: [
        {
          name: msg.playerNumber === 1 ? myName : opponentName,
          color: 'black',
          isAI: false,
        },
        {
          name: msg.playerNumber === 2 ? myName : opponentName,
          color: 'white',
          isAI: false,
        },
      ],
    };

    State.init(config);
    Screen.show('game', config);
  }

  function handleRemoteMove(row, col) {
    const state = State.get();
    if (!state || state.gameOver) return;

    State.pushHistory();

    let valid;
    if (state.config.gameType === 'omok') {
      valid = Omok.applyMove(state, row, col);
    } else {
      valid = Baduk.applyMove(state, row, col);
    }

    if (valid) {
      Sound.playStone();
      Board.draw(state);
      updateHUD(state);
      if (state.gameOver) {
        setTimeout(() => Screen.show('result', state), 600);
      }
    }
  }

  function handleRemotePass() {
    const state = State.get();
    if (!state || state.gameOver) return;

    Baduk.pass(state);
    Board.draw(state);
    updateHUD(state);
    showToast('상대방이 패스했습니다');

    if (state.gameOver) {
      setTimeout(() => Screen.show('result', state), 600);
    }
  }

  function handleRemoteResign() {
    const state = State.get();
    if (!state || state.gameOver) return;

    if (state.config.gameType === 'baduk') {
      Baduk.resign(state);
    } else {
      state.gameOver = true;
      state.winner = Network.getPlayerNumber();
    }
    Board.draw(state);
    showToast('상대방이 기권했습니다');
    setTimeout(() => Screen.show('result', state), 600);
  }

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
        if (!Network.isOnline() && state.config.players[state.currentPlayer - 1].isAI) {
          setTimeout(triggerAI, 500);
        }
      });
    });
  });

  // ── Canvas click ──────────────────────────────────────────────────────────
  document.getElementById('game-canvas').addEventListener('click', e => {
    const state = State.get();
    if (!state || state.gameOver) return;

    // Online mode: only allow moves on my turn
    if (Network.isOnline()) {
      if (!Network.isMyTurn(state.currentPlayer)) return;
    } else {
      const current = state.config.players[state.currentPlayer - 1];
      if (current.isAI) return;
    }

    const pos = Board.pixelToGrid(e.offsetX, e.offsetY);
    if (!pos) return;
    handlePlayerMove(pos.row, pos.col);
  });

  // ── Pass ──────────────────────────────────────────────────────────────────
  document.getElementById('btn-pass').addEventListener('click', () => {
    const state = State.get();
    if (!state || state.gameOver) return;

    if (Network.isOnline()) {
      if (!Network.isMyTurn(state.currentPlayer)) return;
    } else {
      const current = state.config.players[state.currentPlayer - 1];
      if (current.isAI) return;
    }

    State.pushHistory();
    Baduk.pass(state);
    Board.draw(state);
    updateHUD(state);

    if (Network.isOnline()) {
      Network.sendPass();
    }

    if (state.gameOver) {
      setTimeout(() => Screen.show('result', state), 500);
      return;
    }
    showToast('패스했습니다');

    if (!Network.isOnline()) {
      const next = state.config.players[state.currentPlayer - 1];
      if (next.isAI) setTimeout(triggerAI, 600);
    }
  });

  // ── Undo ──────────────────────────────────────────────────────────────────
  document.getElementById('btn-undo').addEventListener('click', () => {
    const state = State.get();
    if (!state || state.gameOver) return;
    if (!State.canUndo()) { showToast('무를 수 없습니다'); return; }

    if (Network.isOnline()) {
      // 온라인: 상대에게 무르기 요청
      Network.sendUndoRequest();
      showToast('무르기 요청을 보냈습니다');
    } else {
      // 로컬: AI 대전이면 AI 수 + 내 수 둘 다 되돌리기
      const aiPlaying = state.config.players.some(p => p.isAI);
      if (aiPlaying && State.canUndo()) {
        // AI 수 되돌리기
        State.undo();
      }
      if (State.canUndo()) {
        // 내 수 되돌리기
        State.undo();
      }
      Board.draw(State.get());
      updateHUD(State.get());
      showToast('무르기 완료');
    }
  });

  // ── Resign ────────────────────────────────────────────────────────────────
  document.getElementById('btn-resign').addEventListener('click', () => {
    const state = State.get();
    if (!state || state.gameOver) return;

    if (Network.isOnline()) {
      if (!Network.isMyTurn(state.currentPlayer)) return;
      if (!confirm('기권하시겠습니까?')) return;

      if (state.config.gameType === 'baduk') {
        Baduk.resign(state);
      } else {
        state.gameOver = true;
        // The opponent wins
        state.winner = Network.getPlayerNumber() === 1 ? 2 : 1;
      }
      Network.sendResign();
    } else {
      const current = state.config.players[state.currentPlayer - 1];
      if (current.isAI) return;
      if (!confirm(`${current.name}이(가) 기권하시겠습니까?`)) return;

      if (state.config.gameType === 'baduk') {
        Baduk.resign(state);
      } else {
        state.gameOver = true;
        state.winner = state.currentPlayer === 1 ? 2 : 1;
      }
    }

    Board.draw(state);
    setTimeout(() => Screen.show('result', state), 300);
  });

  // ── Home from game ────────────────────────────────────────────────────────
  document.getElementById('btn-home-game').addEventListener('click', () => {
    Network.disconnect();
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
    if (Network.isOnline()) {
      State.reset();
      Network.sendRematch();
      Screen.show('game', State.get().config);
    } else {
      State.reset();
      Screen.show('game', State.get().config);
    }
  });

  document.getElementById('btn-home-result').addEventListener('click', () => {
    Network.disconnect();
    Screen.show('home');
  });

  // ── Core logic ────────────────────────────────────────────────────────────
  function handlePlayerMove(row, col) {
    const state = State.get();
    let valid;

    State.pushHistory();

    if (state.config.gameType === 'omok') {
      valid = Omok.applyMove(state, row, col);
      if (!valid) { State.undo(); showToast('착수 불가'); return; }
    } else {
      valid = Baduk.applyMove(state, row, col);
      if (!valid) {
        State.undo();
        if (state.koPoint && state.koPoint.row === row && state.koPoint.col === col) {
          showToast('패 규칙 위반');
        } else {
          showToast('착수 불가 (자충수)');
        }
        return;
      }
    }

    Sound.playStone();

    // Send move to opponent if online
    if (Network.isOnline()) {
      Network.sendMove(row, col);
    }

    Board.draw(state);
    updateHUD(state);

    if (state.gameOver) {
      setTimeout(() => Screen.show('result', state), 600);
      return;
    }

    if (!Network.isOnline()) {
      const next = state.config.players[state.currentPlayer - 1];
      if (next.isAI) setTimeout(triggerAI, 400);
    }
  }

  function triggerAI() {
    const state = State.get();
    if (!state || state.gameOver) return;

    State.pushHistory();

    if (state.config.gameType === 'omok') {
      const move = OmokAI.chooseMove(state);
      Omok.applyMove(state, move[0], move[1]);
      Sound.playStone();
    } else {
      const move = BadukAI.chooseMove(state);
      if (move === 'pass') {
        showToast('컴퓨터가 패스했습니다');
        Baduk.pass(state);
      } else {
        Baduk.applyMove(state, move[0], move[1]);
        Sound.playStone();
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

    let nameText = current.name;
    if (Network.isOnline() && Network.isMyTurn(state.currentPlayer)) {
      nameText += ' (나)';
    }
    document.getElementById('turn-name').textContent = nameText;

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
