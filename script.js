const boardCanvas = document.getElementById('board');
const boardCtx = boardCanvas.getContext('2d');
const nextCanvas = document.getElementById('next');
const nextCtx = nextCanvas.getContext('2d');

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

bestEl.textContent = bestScore;

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
  const originalX = currentPiece.x;

  for (const kick of kicks) {
    if (!collides({ ...currentPiece, matrix: rotated }, currentPiece.x + kick, currentPiece.y)) {
      currentPiece.matrix = rotated;
      currentPiece.x += kick;
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

function hardDrop() {
  if (!currentPiece || gameOver || paused) return;
  let distance = 0;
  while (!collides(currentPiece, currentPiece.x, currentPiece.y + 1)) {
    currentPiece.y += 1;
    distance += 1;
  }
  score += distance * 2;
  lockPiece();
}

function softDrop() {
  if (!currentPiece || gameOver || paused) return;
  if (!collides(currentPiece, currentPiece.x, currentPiece.y + 1)) {
    currentPiece.y += 1;
    score += 1;
  } else {
    lockPiece();
  }
}

function lockPiece() {
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

  clearLines();
  spawnPiece();
  updateStats();
  draw();
}

function clearLines() {
  let cleared = 0;
  const remainingRows = board.filter((row) => row.some((cell) => !cell));
  cleared = ROWS - remainingRows.length;

  if (cleared > 0) {
    const emptyRows = Array.from({ length: cleared }, () => Array(COLS).fill(0));
    board = [...emptyRows, ...remainingRows];
    lines += cleared;
    score += [0, 100, 300, 500, 800][cleared] * level;
    level = Math.floor(lines / 10) + 1;

    if (score > bestScore) {
      bestScore = score;
      localStorage.setItem('tetranked-best', bestScore);
      bestEl.textContent = bestScore;
    }
  }
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
  startGame();
}

function drawCell(ctx, x, y, type) {
  const px = x * BLOCK_SIZE;
  const py = y * BLOCK_SIZE;
  ctx.fillStyle = type ? COLORS[type] : 'rgba(255,255,255,0.02)';
  ctx.fillRect(px + 1, py + 1, BLOCK_SIZE - 2, BLOCK_SIZE - 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.strokeRect(px + 1, py + 1, BLOCK_SIZE - 2, BLOCK_SIZE - 2);
}

function drawBoard() {
  boardCtx.clearRect(0, 0, boardCanvas.width, boardCanvas.height);
  boardCtx.fillStyle = 'rgba(255,255,255,0.03)';
  boardCtx.fillRect(0, 0, boardCanvas.width, boardCanvas.height);

  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      drawCell(boardCtx, x, y, board[y][x]);
    }
  }

  if (currentPiece) {
    boardCtx.globalAlpha = 0.9;
    currentPiece.matrix.forEach((row, rowIndex) => {
      row.forEach((value, colIndex) => {
        if (!value) return;
        drawCell(boardCtx, currentPiece.x + colIndex, currentPiece.y + rowIndex, currentPiece.type);
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
      nextCtx.fillRect(offsetX * PREVIEW_SIZE + colIndex * PREVIEW_SIZE + 2, offsetY * PREVIEW_SIZE + rowIndex * PREVIEW_SIZE + 2, PREVIEW_SIZE - 4, PREVIEW_SIZE - 4);
      nextCtx.strokeStyle = 'rgba(255,255,255,0.12)';
      nextCtx.strokeRect(offsetX * PREVIEW_SIZE + colIndex * PREVIEW_SIZE + 2, offsetY * PREVIEW_SIZE + rowIndex * PREVIEW_SIZE + 2, PREVIEW_SIZE - 4, PREVIEW_SIZE - 4);
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
      event.preventDefault();
      rotatePiece();
      break;
    case ' ':
    case 'Spacebar':
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
