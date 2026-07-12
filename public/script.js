const boardCanvas = document.getElementById("board");
const boardCtx = boardCanvas.getContext("2d");
const nextCanvas = document.getElementById("next");
const nextCtx = nextCanvas.getContext("2d");
const boardCard = document.querySelector(".board-card");

const scoreEl = document.getElementById("score");
const linesEl = document.getElementById("lines");
const levelEl = document.getElementById("level");
const bestEl = document.getElementById("best");
const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlay-title");
const overlayCopy = document.getElementById("overlay-copy");
const startBtn = document.getElementById("startBtn");
const pauseBtn = document.getElementById("pauseBtn");
const restartBtn = document.getElementById("restartBtn");
const modeButtons = Array.from(document.querySelectorAll(".mode-btn"));
const playerNameInput = document.getElementById("playerName");
const leaderboardList = document.getElementById("leaderboardList");
const leaderboardStatus = document.getElementById("leaderboardStatus");

const SCORE_DB_PATH = "scores";
const LEADERBOARD_LIMIT = 10;
const SCORE_NAME_STORAGE_KEY = "tetranked-player-name";
let scoreSubmittedForRun = false;
let leaderboardLoading = false;
let db = null;

if (window.firebase && window.firebase.database) {
  try {
    db = window.firebase.database();
  } catch (error) {
    console.warn("Firebase database unavailable", error);
    db = null;
  }
} else {
  console.warn("Firebase database SDK not available");
}

const SHAPES = {
  I: [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  O: [
    [1, 1],
    [1, 1],
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
    [0, 0, 0],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
    [0, 0, 0],
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 0],
  ],
};

const COLORS = {
  I: "#4dd0ff",
  O: "#ffd84d",
  T: "#c06cff",
  S: "#4dff88",
  Z: "#ff5f7d",
  J: "#4f7cff",
  L: "#ff9d3d",
};

const MODE_CONFIG = {
  classic: { cols: 10, rows: 20, blockSize: 30, previewSize: 42 },
  dig: { cols: 10, rows: 20, blockSize: 30, previewSize: 42 },
  mini: { cols: 8, rows: 16, blockSize: 32, previewSize: 40 },
};

let gameMode = "classic";
let score = 0;
let lines = 0;
let level = 1;
let bestScore = Number(localStorage.getItem("tetranked-best")) || 0;
let board = [];
let currentPiece = null;
let nextPiece = null;
let gameOver = false;
let paused = false;
let clearAnimationRows = [];
let clearAnimationStartTime = 0;
let clearAnimationFrame = null;
let boardShakeTimer = null;
let slamFlashActive = false;
let slamPiece = null;
let digRubbleRemaining = 0;
let dropInterval = null;
let SHAKE_DURATION = 180;

let COLS = 10;
let ROWS = 20;
let BLOCK_SIZE = 30;
let PREVIEW_SIZE = 42;
const CLEAR_ANIMATION_DURATION = 220;
// --- Mobile gesture support (swipe & tap) ---
// Prevent default touch gestures on the canvas
if (boardCanvas) {
  boardCanvas.style.touchAction = "none";
}

let _ptrDown = false;
let _startX = 0;
let _startY = 0;
let _startTime = 0;
let _moved = false;

const SWIPE_MIN_DIST = 30; // pixels
const TAP_MAX_TIME = 250; // ms

function onPointerDown(ev) {
  if (gameOver) return;
  _ptrDown = true;
  _moved = false;
  _startX = ev.clientX;
  _startY = ev.clientY;
  _startTime = Date.now();
  try {
    ev.target.setPointerCapture(ev.pointerId);
  } catch (e) {}
}

function onPointerMove(ev) {
  if (!_ptrDown) return;
  const dx = ev.clientX - _startX;
  const dy = ev.clientY - _startY;
  if (Math.hypot(dx, dy) > 10) _moved = true;
}

function onPointerUp(ev) {
  if (!_ptrDown) return;
  _ptrDown = false;
  try {
    ev.target.releasePointerCapture &&
      ev.target.releasePointerCapture(ev.pointerId);
  } catch (e) {}

  const dx = ev.clientX - _startX;
  const dy = ev.clientY - _startY;
  const dt = Date.now() - _startTime;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);

  // Tap: small movement and quick
  if (!_moved && dt < TAP_MAX_TIME && Math.hypot(dx, dy) < SWIPE_MIN_DIST) {
    // Tap = move one (soft drop one row)
    softDrop();
    draw();
    return;
  }

  // Horizontal swipe
  if (absX > absY && absX > SWIPE_MIN_DIST) {
    if (dx > 0) movePiece(1);
    else movePiece(-1);
    draw();
    return;
  }

  // Vertical swipe
  if (absY > absX && absY > SWIPE_MIN_DIST) {
    if (dy < 0) {
      // swipe up = rotate
      rotatePiece();
    } else {
      // swipe down = slam (hard drop)
      hardDrop();
    }
    draw();
    return;
  }
}

// Attach to the game canvas for focused gestures
boardCanvas.addEventListener("pointerdown", onPointerDown);
boardCanvas.addEventListener("pointermove", onPointerMove);
boardCanvas.addEventListener("pointerup", onPointerUp);
boardCanvas.addEventListener("pointercancel", onPointerUp);
window.addEventListener("blur", () => {
  _ptrDown = false;
});

const sfx = {
  enabled: true,
  sounds: {},
};

function loadSfx(name, url) {
  try {
    const audio = new Audio(url);
    audio.preload = "auto";
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
loadSfx("slam", "sounds/slam/slam.wav");
loadSfx("slam", "sounds/slam/slamhigh.wav");
loadSfx("slam", "sounds/slam/slamlow.wav");
loadSfx("clear", "sounds/clear/clear.wav");
loadSfx("clear", "sounds/clear/clearhigh.wav");
loadSfx("clear", "sounds/clear/clearlow.wav");
loadSfx("restart", "sounds/restart.wav");
loadSfx("rotate", "sounds/rotate.wav");

function applyModeConfig(mode) {
  const config = MODE_CONFIG[mode] || MODE_CONFIG.classic;
  COLS = config.cols;
  ROWS = config.rows;
  BLOCK_SIZE = config.blockSize;
  PREVIEW_SIZE = config.previewSize;
  boardCanvas.width = COLS * BLOCK_SIZE;
  boardCanvas.height = ROWS * BLOCK_SIZE;
  nextCanvas.width = 180;
  nextCanvas.height = 180;
  boardCanvas.style.width = `${COLS * BLOCK_SIZE}px`;
  boardCanvas.style.height = `${ROWS * BLOCK_SIZE}px`;
}

function selectMode(mode) {
  gameMode = mode;
  applyModeConfig(mode);
  modeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === mode);
  });
  if (!currentPiece && !gameOver && !paused) {
    draw();
  }
}

function setupBoardForMode() {
  board = createBoard();
  digRubbleRemaining = 0;

  if (gameMode !== "dig") return;

  const startRow = Math.max(0, ROWS - 8);
  for (let y = startRow; y < ROWS; y += 1) {
    const gap = (y - startRow + 1) % COLS;
    for (let x = 0; x < COLS; x += 1) {
      if (x !== gap) {
        board[y][x] = "G";
        digRubbleRemaining += 1;
      }
    }
  }
}

function createBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}

function createPiece(type) {
  const matrix = SHAPES[type].map((row) => [...row]);
  return {
    type,
    matrix,
    x: Math.floor(COLS / 2) - Math.ceil(matrix[0].length / 2),
    y: 0,
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
  currentPiece.x =
    Math.floor(COLS / 2) - Math.ceil(currentPiece.matrix[0].length / 2);
  currentPiece.y = 0;

  if (collides(currentPiece, currentPiece.x, currentPiece.y)) {
    gameOver = true;
    paused = false;
    updateOverlay("Game Over", "Press restart to play again.");
    clearInterval(dropInterval);
    dropInterval = null;
    handleGameOver();
  }
}

function collides(piece, x, y) {
  return piece.matrix.some((row, rowIndex) =>
    row.some((value, colIndex) => {
      if (!value) return false;
      const newX = x + colIndex;
      const newY = y + rowIndex;
      return (
        newX < 0 ||
        newX >= COLS ||
        newY >= ROWS ||
        (newY >= 0 && board[newY][newX])
      );
    }),
  );
}

function rotateMatrix(matrix) {
  return matrix[0].map((_, colIndex) =>
    matrix.map((row) => row[colIndex]).reverse(),
  );
}

function rotatePiece() {
  if (!currentPiece || gameOver || paused) return;
  const rotated = rotateMatrix(currentPiece.matrix);
  const kicks = [0, -1, 1, -2, 2];

  for (const kick of kicks) {
    if (
      !collides(
        { ...currentPiece, matrix: rotated },
        currentPiece.x + kick,
        currentPiece.y,
      )
    ) {
      currentPiece.matrix = rotated;
      currentPiece.x += kick;
      playSfx("rotate");
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
  playSfx("slam");
  if (!boardCard) return;
  boardCard.classList.remove("shake");
  void boardCard.offsetWidth;
  boardCard.classList.add("shake");
  window.clearTimeout(boardShakeTimer);
  boardShakeTimer = window.setTimeout(() => {
    boardCard.classList.remove("shake");
  }, SHAKE_DURATION);

  slamFlashActive = true;
  slamPiece = {
    ...currentPiece,
    matrix: currentPiece.matrix.map((row) => [...row]),
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

  let rubbleCleared = 0;
  if (gameMode === "dig") {
    rubbleCleared = rowsToClear.reduce(
      (count, rowIndex) =>
        count + board[rowIndex].filter((cell) => cell === "G").length,
      0,
    );
    digRubbleRemaining = Math.max(0, digRubbleRemaining - rubbleCleared);
  }

  lines += rowsToClear.length;
  score += [0, 100, 300, 500, 800][rowsToClear.length] * level;
  level = Math.floor(lines / 10) + 1;

  if (score > bestScore) {
    bestScore = score;
    localStorage.setItem("tetranked-best", bestScore);
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

  playSfx("clear");

  if (rowsToClear.length > 0) {
    const remainingRows = board.filter(
      (_, index) => !rowsToClear.includes(index),
    );
    const emptyRows = Array.from({ length: rowsToClear.length }, () =>
      Array(COLS).fill(0),
    );
    board = [...emptyRows, ...remainingRows];
  }

  if (gameMode === "dig" && digRubbleRemaining <= 0) {
    gameOver = true;
    paused = false;
    updateOverlay("Dig Complete", "You cleared all the rubble.");
    updateStats();
    draw();
    handleGameOver();
    return;
  }

  spawnPiece();
  updateStats();
  draw();
}

function getPlayerName() {
  const value = (playerNameInput?.value || "").trim();
  if (value) {
    localStorage.setItem(SCORE_NAME_STORAGE_KEY, value);
    return value;
  }

  const savedName = localStorage.getItem(SCORE_NAME_STORAGE_KEY);
  if (savedName) {
    if (playerNameInput) playerNameInput.value = savedName;
    return savedName;
  }

  if (playerNameInput) playerNameInput.value = "Player";
  return "Player";
}

function setLeaderboardStatus(message, isError = false) {
  if (!leaderboardStatus) return;
  leaderboardStatus.textContent = message;
  leaderboardStatus.classList.toggle("error", isError);
}

function renderLeaderboard(entries) {
  if (!leaderboardList) return;

  leaderboardList.innerHTML = "";
  if (!entries.length) {
    const emptyItem = document.createElement("li");
    emptyItem.className = "empty";
    emptyItem.textContent = "No scores yet";
    leaderboardList.appendChild(emptyItem);
    return;
  }

  entries.forEach((entry, index) => {
    const item = document.createElement("li");
    item.className = "leaderboard-item";

    const rank = document.createElement("span");
    rank.className = "rank";
    rank.textContent = `#${index + 1}`;

    const details = document.createElement("div");
    details.className = "leaderboard-details";

    const name = document.createElement("strong");
    name.textContent = entry.playerName || "Player";

    const scoreLine = document.createElement("span");
    scoreLine.textContent = entry.score || 0;

    details.appendChild(name);
    details.appendChild(scoreLine);
    item.appendChild(rank);
    item.appendChild(details);
    leaderboardList.appendChild(item);
  });
}

function loadLeaderboard() {
  if (!db) {
    setLeaderboardStatus("Leaderboard unavailable", true);
    renderLeaderboard([]);
    return Promise.resolve();
  }

  if (leaderboardLoading) return Promise.resolve();

  leaderboardLoading = true;
  setLeaderboardStatus("Loading leaderboard…");

  const timeoutId = window.setTimeout(() => {
    if (leaderboardLoading) {
      leaderboardLoading = false;
      setLeaderboardStatus("Leaderboard unavailable", true);
      renderLeaderboard([]);
    }
  }, 5000);

  return db
    .ref(SCORE_DB_PATH)
    .orderByChild("score")
    .limitToLast(LEADERBOARD_LIMIT)
    .once("value")
    .then((snapshot) => {
      const entries = [];
      snapshot.forEach((child) => {
        entries.push({ id: child.key, ...child.val() });
      });

      entries.sort((a, b) => (b.score || 0) - (a.score || 0));
      renderLeaderboard(entries.slice(0, LEADERBOARD_LIMIT));

      if (!entries.length) {
        setLeaderboardStatus("No scores yet — be first!");
      } else {
        setLeaderboardStatus("");
      }
    })
    .catch((error) => {
      console.error("Unable to load scores", error);
      setLeaderboardStatus("Leaderboard unavailable", true);
      renderLeaderboard([]);
    })
    .finally(() => {
      window.clearTimeout(timeoutId);
      leaderboardLoading = false;
    });
}

function saveScore() {
  if (!db || scoreSubmittedForRun || !score) return Promise.resolve(false);

  scoreSubmittedForRun = true;
  const name = getPlayerName();
  setLeaderboardStatus("Saving score…");

  return db
    .ref(SCORE_DB_PATH)
    .push({
      playerName: name,
      score,
      mode: gameMode,
      createdAt: Date.now(),
    })
    .then(() => loadLeaderboard())
    .then(() => true)
    .catch((error) => {
      console.error("Unable to save score", error);
      scoreSubmittedForRun = false;
      setLeaderboardStatus("Could not save score", true);
      return false;
    });
}

function handleGameOver() {
  if (!gameOver || scoreSubmittedForRun || !score) return;
  saveScore();
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
  overlay.classList.add("visible");
}

function hideOverlay() {
  overlay.classList.remove("visible");
}

function updateDropSpeed() {
  if (dropInterval) {
    clearInterval(dropInterval);
  }

  dropInterval = setInterval(
    () => {
      if (!paused && !gameOver) {
        softDrop();
      }
    },
    Math.max(120, 700 - (level - 1) * 60),
  );
}

function startGame() {
  applyModeConfig(gameMode);
  setupBoardForMode();
  score = 0;
  lines = 0;
  level = 1;
  scoreSubmittedForRun = false;
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
    boardCard.classList.remove("shake");
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
    updateOverlay("Paused", "Press pause again to continue.");
  } else {
    hideOverlay();
  }
}

function restartGame() {
  playSfx("restart");
  startGame();
}

function drawCell(ctx, x, y, type, options = {}) {
  const px = x * BLOCK_SIZE;
  const py = y * BLOCK_SIZE;
  const { isClearing = false, flash = 0, baseGlow = 0, slam = false } = options;

  const inset = 1;
  const radius = 3;

  ctx.fillStyle = type ? COLORS[type] : "rgba(255,255,255,0.02)";
  ctx.beginPath();
  ctx.roundRect(
    px + inset,
    py + inset,
    BLOCK_SIZE - inset * 2,
    BLOCK_SIZE - inset * 2,
    radius,
  );
  ctx.fill();

  if (baseGlow > 0) {
    ctx.fillStyle = `rgba(255,255,255,${0.14 + 0.24 * baseGlow})`;
    ctx.beginPath();
    ctx.roundRect(
      px + inset + 1,
      py + inset + 1,
      BLOCK_SIZE - inset * 2 - 2,
      BLOCK_SIZE - inset * 2 - 2,
      radius - 1,
    );
    ctx.fill();
  }

  if (isClearing) {
    ctx.fillStyle = `rgba(255,255,255,${0.25 + 1.05 * flash})`;
    ctx.beginPath();
    ctx.roundRect(
      px + inset + 1,
      py + inset + 1,
      BLOCK_SIZE - inset * 2 - 2,
      BLOCK_SIZE - inset * 2 - 2,
      radius - 1,
    );
    ctx.fill();
  }

  if (slam) {
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
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

  ctx.strokeStyle = "rgba(255,255,255,0.16)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(
    px + inset,
    py + inset,
    BLOCK_SIZE - inset * 2,
    BLOCK_SIZE - inset * 2,
    radius,
  );
  ctx.stroke();
}

function drawBoard() {
  boardCtx.clearRect(0, 0, boardCanvas.width, boardCanvas.height);
  boardCtx.fillStyle = "rgba(255,255,255,0.03)";
  boardCtx.fillRect(0, 0, boardCanvas.width, boardCanvas.height);

  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      const flash = getClearCellFlash(x, y);
      const isClearingRow = clearAnimationRows.includes(y);
      drawCell(boardCtx, x, y, board[y][x], {
        isClearing: flash > 0,
        flash,
        baseGlow: isClearingRow ? 0.9 : 0,
      });
    }
  }

  if (!clearAnimationRows.length && currentPiece) {
    boardCtx.globalAlpha = 0.9;
    const pieceToDraw = slamFlashActive && slamPiece ? slamPiece : currentPiece;
    pieceToDraw.matrix.forEach((row, rowIndex) => {
      row.forEach((value, colIndex) => {
        if (!value) return;
        drawCell(
          boardCtx,
          pieceToDraw.x + colIndex,
          pieceToDraw.y + rowIndex,
          pieceToDraw.type,
          { slam: slamFlashActive && slamPiece },
        );
      });
    });
    boardCtx.globalAlpha = 1;
  }
}

function drawPreview() {
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  nextCtx.fillStyle = "rgba(255,255,255,0.03)";
  nextCtx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);

  const piece = nextPiece || currentPiece;
  if (!piece) return;
  const matrix = piece.matrix;
  const offsetX = Math.floor(
    (nextCanvas.width / PREVIEW_SIZE - matrix[0].length) / 2,
  );
  const offsetY = Math.floor(
    (nextCanvas.height / PREVIEW_SIZE - matrix.length) / 2,
  );

  matrix.forEach((row, rowIndex) => {
    row.forEach((value, colIndex) => {
      if (!value) return;
      nextCtx.fillStyle = COLORS[piece.type];
      nextCtx.beginPath();
      nextCtx.roundRect(
        offsetX * PREVIEW_SIZE + colIndex * PREVIEW_SIZE + 2,
        offsetY * PREVIEW_SIZE + rowIndex * PREVIEW_SIZE + 2,
        PREVIEW_SIZE - 4,
        PREVIEW_SIZE - 4,
        8,
      );
      nextCtx.fill();
      nextCtx.strokeStyle = "rgba(255,255,255,0.12)";
      nextCtx.beginPath();
      nextCtx.roundRect(
        offsetX * PREVIEW_SIZE + colIndex * PREVIEW_SIZE + 2,
        offsetY * PREVIEW_SIZE + rowIndex * PREVIEW_SIZE + 2,
        PREVIEW_SIZE - 4,
        PREVIEW_SIZE - 4,
        8,
      );
      nextCtx.stroke();
    });
  });
}

function draw() {
  drawBoard();
  drawPreview();
}

window.addEventListener("keydown", (event) => {
  const key = event.key;
  if (key === "p" || key === "P") {
    event.preventDefault();
    pauseGame();
    return;
  }

  if (key === "r" || key === "R") {
    event.preventDefault();
    restartGame();
    return;
  }

  if (gameOver || paused || !currentPiece) {
    if (key === "Enter") {
      startGame();
    }
    return;
  }

  switch (key) {
    case "ArrowLeft":
      event.preventDefault();
      movePiece(-1);
      break;
    case "ArrowRight":
      event.preventDefault();
      movePiece(1);
      break;
    case "ArrowDown":
      event.preventDefault();
      softDrop();
      break;
    case "ArrowUp":
    case "z":
    case "Z":
      event.preventDefault();
      rotatePiece();
      break;
    case " ":
    case "Spacebar":
    case "x":
    case "X":
      event.preventDefault();
      hardDrop();
      break;
    default:
      break;
  }

  draw();
});

startBtn.addEventListener("click", startGame);
pauseBtn.addEventListener("click", pauseGame);
restartBtn.addEventListener("click", restartGame);
modeButtons.forEach((button) => {
  button.addEventListener("click", () => selectMode(button.dataset.mode));
});

applyModeConfig(gameMode);
setupBoardForMode();
updateStats();
draw();

if (playerNameInput) {
  const savedName = localStorage.getItem(SCORE_NAME_STORAGE_KEY);
  if (savedName) {
    playerNameInput.value = savedName;
  }

  playerNameInput.addEventListener("input", () => {
    const trimmed = playerNameInput.value.trim().slice(0, 16);
    playerNameInput.value = trimmed;
    localStorage.setItem(SCORE_NAME_STORAGE_KEY, trimmed);
  });
}

loadLeaderboard();

// --- Mobile D-pad support ---
let dpadRepeatTimer = null;
let dpadRepeatAction = null;

function clearDpadRepeat() {
  if (dpadRepeatTimer) {
    clearInterval(dpadRepeatTimer);
    dpadRepeatTimer = null;
    dpadRepeatAction = null;
  }
}

function dpadActionOnce(action) {
  switch (action) {
    case "left":
      movePiece(-1);
      break;
    case "right":
      movePiece(1);
      break;
    case "down":
      softDrop();
      break;
    case "up":
      rotatePiece();
      break;
    case "slam":
      hardDrop();
      break;
    default:
      break;
  }
  draw();
}

function dpadActionStart(action) {
  // Immediate action
  dpadActionOnce(action);

  // Start repeating for continuous actions (left/right/down)
  if (action === "left" || action === "right") {
    dpadRepeatAction = action;
    dpadRepeatTimer = setInterval(() => {
      dpadActionOnce(action);
    }, 120);
  } else if (action === "down") {
    dpadRepeatAction = action;
    dpadRepeatTimer = setInterval(() => {
      softDrop();
      draw();
    }, 120);
  }
}

function setupDpadControls() {
  const dpad = document.querySelector(".dpad");
  if (!dpad) return;
  const buttons = Array.from(dpad.querySelectorAll(".dpad-button"));

  buttons.forEach((btn) => {
    const action = btn.dataset.action;

    // Use pointer events for broad device support
    btn.addEventListener("pointerdown", (ev) => {
      ev.preventDefault();
      // capture pointer to ensure we receive up/cancel
      try {
        btn.setPointerCapture(ev.pointerId);
      } catch (e) {}
      dpadActionStart(action);
    });

    btn.addEventListener("pointerup", (ev) => {
      ev.preventDefault();
      try {
        btn.releasePointerCapture && btn.releasePointerCapture(ev.pointerId);
      } catch (e) {}
      clearDpadRepeat();
    });

    btn.addEventListener("pointercancel", () => clearDpadRepeat());
    btn.addEventListener("pointerleave", () => clearDpadRepeat());
  });

  // Clear on window pointer up as well (in case pointer moves off the button)
  window.addEventListener("pointerup", clearDpadRepeat);
  window.addEventListener("blur", clearDpadRepeat);
}

setupDpadControls();
