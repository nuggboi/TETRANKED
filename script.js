const boardCanvas = document.getElementById('board');
const boardCtx = boardCanvas.getContext('2d');
const nextCanvas = document.getElementById('next');
const nextCtx = nextCanvas.getContext('2d');
const boardCard = document.querySelector('.board-card');

const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const bestEl = document.getElementById('best');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayCopy = document.getElementById('overlay-copy');
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const restartBtn = document.getElementById('restartBtn');

const COLS = 10;
const ROWS = 20;
const BLOCK_SIZE = 30;
const PREVIEW_SIZE = 42;
const CLEAR_ANIMATION_DURATION = 220;
const SHAKE_DURATION = 220;
const COLORS = {
  I: '#61dafb',
  O: '#ffd166',
  T: '#c77dff',
  S: '#4cd964',
  Z: '#ff5f7d',
  J: '#4d9de0',
  L: '#ff9f1c'
};

const SHAPES = {
  I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
  O: [[1, 1], [1, 1]],
  T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
  S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
  Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
  J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
  L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]]
};

let board = createBoard();
let currentPiece = null;
let nextPiece = null;
let score = 0;
let lines = 0;
let level = 1;
let gameOver = false;
let paused = false;
let dropInterval = null;
let bestScore = Number(localStorage.getItem('tetranked-best') || 0);
let clearAnimationRows = [];
let clearAnimationStartTime = 0;
let clearAnimationFrame = null;
let boardShakeTimer = null;
let slamFlashActive = false;
let slamFlashTimer = null;
let slamPiece = null;

bestEl.textContent = bestScore;

// Simple SFX helper: load audio files and play by name.
const sfx = { enabled: true, sounds: {} };
function loadSfx(name, url) {
  try {
    const audio = new Audio(url);
    audio.preload = 'auto';
    if (!sfx.sounds[name]) {
      sfx.sounds[name] = [];
    }
    sfx.sounds[name].push(audio);
  } catch (e) {
    // ignore
  }
}

function playSfx(name) {
  if (!sfx.enabled) return;
  const audioList = sfx.sounds[name];
  if (!audioList || !audioList.length) return;
  const audio = audioList[Math.floor(Math.random() * audioList.length)];
  try {
    audio.currentTime = 0;
    audio.play();
  } catch (e) {
    // play promise may be rejected if user hasn't interacted yet
  }
}

// Example usage (place real files under `sounds/` or change paths):
loadSfx('slam', 'sounds/slam/slam.wav');
loadSfx('slam', 'sounds/slam/slamhigh.wav');
loadSfx('slam', 'sounds/slam/slamlow.wav');
loadSfx('clear', 'sounds/clear/clear.wav');
loadSfx('clear', 'sounds/clear/clearhigh.wav');
loadSfx('clear', 'sounds/clear/clearlow.wav');
loadSfx('restart', 'sounds/restart.wav');
loadSfx('rotate', 'sounds/rotate.wav');

function createBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}

function createPiece(type) {
  const matrix = SHAPES[type].map((row) => [...row]);
  return {
    type,
    matrix,
    x: Math.floor(COLS / 2) - Math.ceil(matrix[0].length / 2),
    y: 0
  };
}

function randomPiece() {
  const types = Object.keys(SHAPES);
  const type = types[Math.floor(Math.random() * types.length)];
  return createPiece(type);
}

function spawnPiece() {
  currentPiece = nextPiece || randomPiece();
  nextPiece = randomPiece();
  currentPiece.x = Math.floor(COLS / 2) - Math.ceil(currentPiece.matrix[0].length / 2);
  currentPiece.y = 0;

  if (collides(currentPiece, currentPiece.x, currentPiece.y)) {
    gameOver = true;
    paused = false;
    updateOverlay('Game Over', 'Press restart to play again.');
    clearInterval(dropInterval);
    dropInterval = null;
  }
}

function collides(piece, x, y) {
  return piece.matrix.some((row, rowIndex) =>
    row.some((value, colIndex) => {
      if (!value) return false;
      const newX = x + colIndex;
      const newY = y + rowIndex;
      return newX < 0 || newX >= COLS || newY >= ROWS || (newY >= 0 && board[newY][newX]);
    })
  );
}

function rotateMatrix(matrix) {
  return matrix[0].map((_, colIndex) => matrix.map((row) => row[colIndex]).reverse());
}

function rotatePiece() {
  if (!currentPiece || gameOver || paused) return;
  const rotated = rotateMatrix(currentPiece.matrix);
  const kicks = [0, -1, 1, -2, 2];

  for (const kick of kicks) {
    if (!collides({ ...currentPiece, matrix: rotated }, currentPiece.x + kick, currentPiece.y)) {
      currentPiece.matrix = rotated;
      currentPiece.x += kick;
      playSfx('rotate');
      break;
    }
  }
}

function movePiece(dx) {
  if (!currentPiece || gameOver || paused) return;
  if (!collides(currentPiece, currentPiece.x + dx, currentPiece.y)) {
    currentPiece.x += dx;
  }
}

function triggerSlamShake() {
  playSfx('slam');
  if (!boardCard) return;
  boardCard.classList.remove('shake');
  void boardCard.offsetWidth;
  boardCard.classList.add('shake');
  window.clearTimeout(boardShakeTimer);
  boardShakeTimer = window.setTimeout(() => {
    boardCard.classList.remove('shake');
  }, SHAKE_DURATION);

  slamFlashActive = true;
  slamPiece = {
    ...currentPiece,
    matrix: currentPiece.matrix.map((row) => [...row])
  };
  window.clearTimeout(slamFlashTimer);
  slamFlashTimer = window.setTimeout(() => {
    slamFlashActive = false;
    slamPiece = null;
    draw();
  }, 120);
  draw();
}

function hardDrop() {
  if (!currentPiece || gameOver || paused) return;
  let distance = 0;
  while (!collides(currentPiece, currentPiece.x, currentPiece.y + 1)) {
    currentPiece.y += 1;
    distance += 1;
  }

  if (distance > 0) {
    triggerSlamShake();
    score += distance * 2;
  }

  lockPiece(true);
}

function softDrop() {
  if (!currentPiece || gameOver || paused) return;
  if (!collides(currentPiece, currentPiece.x, currentPiece.y + 1)) {
    currentPiece.y += 1;
    score += 1;
    updateStats();
    draw();
  } else {
    lockPiece();
  }
}

function lockPiece(slammed = false) {
  currentPiece.matrix.forEach((row, rowIndex) => {
    row.forEach((value, colIndex) => {
      if (!value) return;
      const x = currentPiece.x + colIndex;
      const y = currentPiece.y + rowIndex;
      if (y >= 0) {
        board[y][x] = currentPiece.type;
      }
    });
  });

  const clearedRows = clearLines();
  if (clearedRows.length > 0) {
    updateStats();
    startClearAnimation(clearedRows);
  } else {
    spawnPiece();
    updateStats();
    draw();
  }

  if (slammed && currentPiece) {
    draw();
  }
}

function clearLines() {
  const rowsToClear = [];
  board.forEach((row, index) => {
    if (row.every(Boolean)) {
      rowsToClear.push(index);
    }
  });

  if (rowsToClear.length === 0) return [];

  lines += rowsToClear.length;
  score += [0, 100, 300, 500, 800][rowsToClear.length] * level;
  level = Math.floor(lines / 10) + 1;

  if (score > bestScore) {
    bestScore = score;
    localStorage.setItem('tetranked-best', bestScore);
    bestEl.textContent = bestScore;
  }

  return rowsToClear;
}

function startClearAnimation(rows) {
  clearAnimationRows = rows;
  clearAnimationStartTime = performance.now();
  if (clearAnimationFrame) {
    cancelAnimationFrame(clearAnimationFrame);
  }

  clearAnimationFrame = requestAnimationFrame(animateClearRows);
}

function animateClearRows(timestamp) {
  if (!clearAnimationRows.length) return;

  const elapsed = timestamp - clearAnimationStartTime;
  const progress = Math.min(elapsed / CLEAR_ANIMATION_DURATION, 1);
  draw();

  if (progress < 1) {
    clearAnimationFrame = requestAnimationFrame(animateClearRows);
  } else {
    finalizeClearAnimation();
  }
}

function getClearCellFlash(x, y) {
  if (!clearAnimationRows.includes(y)) return 0;

  const elapsed = performance.now() - clearAnimationStartTime;
  const rowOffset = clearAnimationRows.indexOf(y) * 48;
  const head = Math.floor((elapsed - rowOffset) / 30);
  const activeDistance = head - x;

  if (activeDistance >= 0 && activeDistance < 3) {
    return 1 - activeDistance / 3;
  }

  return 0;
}

function finalizeClearAnimation() {
  const rowsToClear = clearAnimationRows;
  clearAnimationRows = [];
  clearAnimationFrame = null;

  playSfx('clear');

  if (rowsToClear.length > 0) {
    const remainingRows = board.filter((_, index) => !rowsToClear.includes(index));
    const emptyRows = Array.from({ length: rowsToClear.length }, () => Array(COLS).fill(0));
    board = [...emptyRows, ...remainingRows];
  }

  spawnPiece();
  updateStats();
  draw();
}

function updateStats() {
  scoreEl.textContent = score;
  linesEl.textContent = lines;
  levelEl.textContent = level;
  bestEl.textContent = bestScore;
}

function updateOverlay(title, copy) {
  overlayTitle.textContent = title;
  overlayCopy.textContent = copy;
  overlay.classList.add('visible');
}

function hideOverlay() {
  overlay.classList.remove('visible');
}

function updateDropSpeed() {
  if (dropInterval) {
    clearInterval(dropInterval);
  }

  dropInterval = setInterval(() => {
    if (!paused && !gameOver) {
      softDrop();
    }
  }, Math.max(120, 700 - (level - 1) * 60));
}

function startGame() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  gameOver = false;
  paused = false;
  currentPiece = null;
  nextPiece = null;
  clearAnimationRows = [];
  if (clearAnimationFrame) {
    cancelAnimationFrame(clearAnimationFrame);
    clearAnimationFrame = null;
  }
  if (boardCard) {
    boardCard.classList.remove('shake');
  }
  slamFlashActive = false;
  slamPiece = null;
  window.clearTimeout(slamFlashTimer);
  updateStats();
  hideOverlay();
  spawnPiece();
  updateDropSpeed();
  draw();
}

function pauseGame() {
  if (gameOver) return;
  paused = !paused;
  if (paused) {
    updateOverlay('Paused', 'Press pause again to continue.');
  } else {
    hideOverlay();
  }
}

function restartGame() {
  playSfx('restart');
  startGame();
}

function drawCell(ctx, x, y, type, options = {}) {
  const px = x * BLOCK_SIZE;
  const py = y * BLOCK_SIZE;
  const { isClearing = false, flash = 0, baseGlow = 0, slam = false } = options;

  const inset = 1;
  const radius = 3;

  ctx.fillStyle = type ? COLORS[type] : 'rgba(255,255,255,0.02)';
  ctx.beginPath();
  ctx.roundRect(px + inset, py + inset, BLOCK_SIZE - inset * 2, BLOCK_SIZE - inset * 2, radius);
  ctx.fill();

  if (baseGlow > 0) {
    ctx.fillStyle = `rgba(255,255,255,${0.14 + 0.24 * baseGlow})`;
    ctx.beginPath();
    ctx.roundRect(px + inset + 1, py + inset + 1, BLOCK_SIZE - inset * 2 - 2, BLOCK_SIZE - inset * 2 - 2, radius - 1);
    ctx.fill();
  }

  if (isClearing) {
    ctx.fillStyle = `rgba(255,255,255,${0.25 + 1.05 * flash})`;
    ctx.beginPath();
    ctx.roundRect(px + inset + 1, py + inset + 1, BLOCK_SIZE - inset * 2 - 2, BLOCK_SIZE - inset * 2 - 2, radius - 1);
    ctx.fill();
  }

  if (slam) {
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(px + inset, py + inset);
    ctx.lineTo(px + inset - 3, py + inset - 3);
    ctx.moveTo(px + inset, py + BLOCK_SIZE - inset);
    ctx.lineTo(px + inset - 3, py + BLOCK_SIZE - inset + 3);
    ctx.moveTo(px + BLOCK_SIZE - inset, py + inset);
    ctx.lineTo(px + BLOCK_SIZE - inset + 3, py + inset - 3);
    ctx.moveTo(px + BLOCK_SIZE - inset, py + BLOCK_SIZE - inset);
    ctx.lineTo(px + BLOCK_SIZE - inset + 3, py + BLOCK_SIZE - inset + 3);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(px + inset, py + inset, BLOCK_SIZE - inset * 2, BLOCK_SIZE - inset * 2, radius);
  ctx.stroke();
}

function drawBoard() {
  boardCtx.clearRect(0, 0, boardCanvas.width, boardCanvas.height);
  boardCtx.fillStyle = 'rgba(255,255,255,0.03)';
  boardCtx.fillRect(0, 0, boardCanvas.width, boardCanvas.height);

  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      const flash = getClearCellFlash(x, y);
      const isClearingRow = clearAnimationRows.includes(y);
      drawCell(boardCtx, x, y, board[y][x], {
        isClearing: flash > 0,
        flash,
        baseGlow: isClearingRow ? 0.9 : 0
      });
    }
  }

  if (!clearAnimationRows.length && currentPiece) {
    boardCtx.globalAlpha = 0.9;
    const pieceToDraw = slamFlashActive && slamPiece ? slamPiece : currentPiece;
    pieceToDraw.matrix.forEach((row, rowIndex) => {
      row.forEach((value, colIndex) => {
        if (!value) return;
        drawCell(boardCtx, pieceToDraw.x + colIndex, pieceToDraw.y + rowIndex, pieceToDraw.type, { slam: slamFlashActive && slamPiece });
      });
    });
    boardCtx.globalAlpha = 1;
  }
}

function drawPreview() {
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  nextCtx.fillStyle = 'rgba(255,255,255,0.03)';
  nextCtx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);

  const piece = nextPiece || currentPiece;
  if (!piece) return;
  const matrix = piece.matrix;
  const offsetX = Math.floor((nextCanvas.width / PREVIEW_SIZE - matrix[0].length) / 2);
  const offsetY = Math.floor((nextCanvas.height / PREVIEW_SIZE - matrix.length) / 2);

  matrix.forEach((row, rowIndex) => {
    row.forEach((value, colIndex) => {
      if (!value) return;
      nextCtx.fillStyle = COLORS[piece.type];
      nextCtx.beginPath();
      nextCtx.roundRect(offsetX * PREVIEW_SIZE + colIndex * PREVIEW_SIZE + 2, offsetY * PREVIEW_SIZE + rowIndex * PREVIEW_SIZE + 2, PREVIEW_SIZE - 4, PREVIEW_SIZE - 4, 8);
      nextCtx.fill();
      nextCtx.strokeStyle = 'rgba(255,255,255,0.12)';
      nextCtx.beginPath();
      nextCtx.roundRect(offsetX * PREVIEW_SIZE + colIndex * PREVIEW_SIZE + 2, offsetY * PREVIEW_SIZE + rowIndex * PREVIEW_SIZE + 2, PREVIEW_SIZE - 4, PREVIEW_SIZE - 4, 8);
      nextCtx.stroke();
    });
  });
}

function draw() {
  drawBoard();
  drawPreview();
}

window.addEventListener('keydown', (event) => {
  const key = event.key;
  if (key === 'p' || key === 'P') {
    event.preventDefault();
    pauseGame();
    return;
  }

  if (key === 'r' || key === 'R') {
    event.preventDefault();
    restartGame();
    return;
  }

  if (gameOver || paused) {
    if (key === 'Enter') {
      startGame();
    }
    return;
  }

  switch (key) {
    case 'ArrowLeft':
      event.preventDefault();
      movePiece(-1);
      break;
    case 'ArrowRight':
      event.preventDefault();
      movePiece(1);
      break;
    case 'ArrowDown':
      event.preventDefault();
      softDrop();
      break;
    case 'ArrowUp':
    case 'z':
    case 'Z':
      event.preventDefault();
      rotatePiece();
      break;
    case ' ':
    case 'Spacebar':
    case 'x':
    case 'X':
      event.preventDefault();
      hardDrop();
      break;
    default:
      break;
  }

  draw();
});

startBtn.addEventListener('click', startGame);
pauseBtn.addEventListener('click', pauseGame);
restartBtn.addEventListener('click', restartGame);

updateStats();
draw();
startGame();
