const Board = (() => {
  let canvas, ctx;
  let boardSize = 15;
  let cellSize = 0;
  let dim = 0;
  const MARGIN = 36;
  let hoverPos = null;

  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseleave', onMouseLeave);
    window.addEventListener('resize', () => {
      const state = State.get();
      if (state) resize(state.config.boardSize);
    });
  }

  function resize(size) {
    boardSize = size;
    const wrapper = document.getElementById('canvas-wrapper');
    const available = Math.min(wrapper.clientWidth - 32, wrapper.clientHeight - 32);
    dim = Math.max(available, 200);

    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = dim + 'px';
    canvas.style.height = dim + 'px';
    canvas.width = Math.round(dim * dpr);
    canvas.height = Math.round(dim * dpr);

    ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    cellSize = (dim - MARGIN * 2) / (boardSize - 1);
  }

  function pixelToGrid(px, py) {
    const col = Math.round((px - MARGIN) / cellSize);
    const row = Math.round((py - MARGIN) / cellSize);
    if (col < 0 || col >= boardSize || row < 0 || row >= boardSize) return null;
    return { row, col };
  }

  function gridToPixel(row, col) {
    return {
      x: MARGIN + col * cellSize,
      y: MARGIN + row * cellSize,
    };
  }

  function draw(state) {
    ctx.clearRect(0, 0, dim, dim);
    drawBackground();
    drawGrid();
    drawStarPoints();
    drawCoordinates();
    drawStones(state.board);
    if (state.lastMove) drawLastMoveMark(state.lastMove, state.board);
    if (hoverPos && !state.gameOver) drawHoverMark(state);
  }

  function drawBackground() {
    const grad = ctx.createLinearGradient(0, 0, dim, dim);
    grad.addColorStop(0, '#dcb968');
    grad.addColorStop(1, '#c4a040');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, dim, dim);

    // Subtle wood grain lines
    ctx.strokeStyle = 'rgba(0,0,0,0.03)';
    ctx.lineWidth = 1;
    for (let i = 0; i < dim; i += 10) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(dim, i + 6);
      ctx.stroke();
    }
  }

  function drawGrid() {
    ctx.strokeStyle = '#7a5c1e';
    ctx.lineWidth = 0.8;
    for (let i = 0; i < boardSize; i++) {
      const { x: x0, y: y0 } = gridToPixel(i, 0);
      const { x: x1, y: y1 } = gridToPixel(i, boardSize - 1);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();

      const { x: x2, y: y2 } = gridToPixel(0, i);
      const { x: x3, y: y3 } = gridToPixel(boardSize - 1, i);
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x3, y3);
      ctx.stroke();
    }
    // Thicker border
    ctx.strokeStyle = '#5a3c0e';
    ctx.lineWidth = 1.8;
    ctx.strokeRect(
      MARGIN, MARGIN,
      (boardSize - 1) * cellSize,
      (boardSize - 1) * cellSize
    );
  }

  function drawStarPoints() {
    const stars = getStarPoints(boardSize);
    ctx.fillStyle = '#5a3c0e';
    for (const [r, c] of stars) {
      const { x, y } = gridToPixel(r, c);
      ctx.beginPath();
      ctx.arc(x, y, Math.max(2.5, cellSize * 0.1), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function getStarPoints(size) {
    if (size === 19) {
      return [[3,3],[3,9],[3,15],[9,3],[9,9],[9,15],[15,3],[15,9],[15,15]];
    } else if (size === 13) {
      return [[3,3],[3,9],[6,6],[9,3],[9,9]];
    } else if (size === 9) {
      return [[2,2],[2,6],[4,4],[6,2],[6,6]];
    } else {
      // 15x15 (omok)
      return [[3,3],[3,7],[3,11],[7,3],[7,7],[7,11],[11,3],[11,7],[11,11]];
    }
  }

  function drawCoordinates() {
    const cols = 'ABCDEFGHJKLMNOPQRST';
    const fontSize = Math.max(9, Math.min(13, cellSize * 0.32));
    ctx.fillStyle = '#5a3c0e';
    ctx.font = `${fontSize}px sans-serif`;
    ctx.textBaseline = 'middle';

    for (let i = 0; i < boardSize; i++) {
      const { x } = gridToPixel(0, i);
      const { y } = gridToPixel(i, 0);

      ctx.textAlign = 'center';
      ctx.fillText(cols[i], x, MARGIN - 17);
      ctx.fillText(cols[i], x, MARGIN + (boardSize - 1) * cellSize + 17);

      ctx.textAlign = 'right';
      ctx.fillText(boardSize - i, MARGIN - 8, y);
      ctx.textAlign = 'left';
      ctx.fillText(boardSize - i, MARGIN + (boardSize - 1) * cellSize + 8, y);
    }
  }

  function drawStones(board) {
    const r = cellSize * 0.46;
    for (let row = 0; row < boardSize; row++) {
      for (let col = 0; col < boardSize; col++) {
        if (!board[row][col]) continue;
        const { x, y } = gridToPixel(row, col);
        drawStone(x, y, r, board[row][col]);
      }
    }
  }

  function drawStone(x, y, r, player, alpha) {
    ctx.save();
    if (alpha !== undefined) ctx.globalAlpha = alpha;
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = r * 0.7;
    ctx.shadowOffsetX = r * 0.15;
    ctx.shadowOffsetY = r * 0.2;

    const grad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.05, x, y, r);
    if (player === 1) {
      grad.addColorStop(0, '#555');
      grad.addColorStop(0.6, '#111');
      grad.addColorStop(1, '#000');
    } else {
      grad.addColorStop(0, '#fff');
      grad.addColorStop(0.5, '#e8e8e8');
      grad.addColorStop(1, '#ccc');
    }

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawLastMoveMark(lastMove, board) {
    const { row, col } = lastMove;
    const { x, y } = gridToPixel(row, col);
    const player = board[row][col];
    if (!player) return;
    ctx.fillStyle = player === 1 ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.arc(x, y, cellSize * 0.11, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawHoverMark(state) {
    if (!hoverPos) return;
    const { row, col } = hoverPos;
    if (state.board[row][col] !== 0) return;
    const { x, y } = gridToPixel(row, col);
    drawStone(x, y, cellSize * 0.46, state.currentPlayer, 0.35);
  }

  function onMouseMove(e) {
    hoverPos = pixelToGrid(e.offsetX, e.offsetY);
    const state = State.get();
    if (state && !state.gameOver) draw(state);
  }

  function onMouseLeave() {
    hoverPos = null;
    const state = State.get();
    if (state) draw(state);
  }

  return { init, resize, draw, pixelToGrid };
})();
