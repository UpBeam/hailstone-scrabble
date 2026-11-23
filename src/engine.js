/**
 * Hailstone Scrabble — Pure Deterministic Game Engine
 *
 * Core Rules:
 *   - 11x11 crossword board with 2L, 3L, 2W, and center ★ (2W) squares.
 *   - Every valid word placement computes its standard Scrabble score `n`.
 *   - Independent word (not hooking a Hailstone token):
 *       * Even `n` → immediately bank `n / 2` points.
 *       * Odd  `n` → spawn a live Hailstone token valued `3n + 1` on your anchor tile.
 *   - Hooking a live Hailstone token `H`:
 *       * Even `n` → halve `H` (`H -> floor(H/2)`), bank the drop + `n / 2`.
 *                    If `H` hits `1`, it shatters for a +15 Crush Jackpot!
 *       * Odd  `n` → spike `H` (`H -> min(999, 3H + 1)`), daring your opponent!
 *   - Win by reaching 100 points, emptying your rack when the bag is empty,
 *     or leading when 4 consecutive passes occur.
 */

import { isValidWord } from './dict.js';

export const BOARD_SIZE = 11;
export const CENTER = 5;
export const RACK_SIZE = 7;
export const TARGET_SCORE = 100;
export const CRUSH_JACKPOT = 15;

export const LETTER_POINTS = {
  A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1,
  J: 8, K: 5, L: 1, M: 3, N: 1, O: 1, P: 3, Q: 10, R: 1,
  S: 1, T: 1, U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10,
};

const TILE_DISTRIBUTION = {
  A: 9, B: 2, C: 2, D: 4, E: 12, F: 2, G: 3, H: 2, I: 9,
  J: 1, K: 1, L: 4, M: 2, N: 6, O: 8, P: 2, Q: 1, R: 6,
  S: 4, T: 6, U: 4, V: 2, W: 2, X: 1, Y: 2, Z: 1,
};

// Symmetric 11x11 bonus map
const BONUS_COORDS = {
  TW: [],
  DW: [
    [1, 1], [9, 1], [1, 9], [9, 9],
    [2, 2], [8, 2], [2, 8], [8, 8],
    [5, 5], // Center star
  ],
  TL: [
    [0, 3], [0, 7], [10, 3], [10, 7],
    [3, 0], [7, 0], [3, 10], [7, 10],
    [3, 3], [7, 3], [3, 7], [7, 7],
  ],
  DL: [
    [0, 0], [10, 0], [0, 10], [10, 10],
    [5, 1], [5, 9], [1, 5], [9, 5],
    [4, 4], [6, 4], [4, 6], [6, 6],
  ],
};

export const BONUS_GRID = (() => {
  const g = Array.from({ length: BOARD_SIZE }, () => new Array(BOARD_SIZE).fill(null));
  for (const [x, y] of BONUS_COORDS.DL) g[x][y] = '2L';
  for (const [x, y] of BONUS_COORDS.TL) g[x][y] = '3L';
  for (const [x, y] of BONUS_COORDS.DW) g[x][y] = '2W';
  g[CENTER][CENTER] = '★';
  return g;
})();

export function createBag(rng = Math.random) {
  const bag = [];
  for (const [letter, count] of Object.entries(TILE_DISTRIBUTION)) {
    for (let i = 0; i < count; i++) bag.push(letter);
  }
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

export function createEmptyBoard() {
  return Array.from({ length: BOARD_SIZE }, () => new Array(BOARD_SIZE).fill(null));
}

export function cloneBoard(board) {
  return board.map((col) => col.map((cell) => (cell ? { ...cell } : null)));
}

export function drawTiles(bag, count) {
  const drawn = [];
  const nextBag = [...bag];
  for (let i = 0; i < count && nextBag.length > 0; i++) {
    drawn.push(nextBag.pop());
  }
  return { drawn, bag: nextBag };
}

export function createInitialState(rng = Math.random) {
  let bag = createBag(rng);
  const d1 = drawTiles(bag, RACK_SIZE);
  bag = d1.bag;
  const d2 = drawTiles(bag, RACK_SIZE);
  bag = d2.bag;

  return {
    board: createEmptyBoard(),
    bag,
    racks: [d1.drawn, d2.drawn],
    scores: [0, 0],
    currentPlayer: 1, // 1 or 2
    turnNumber: 1,
    consecutivePasses: 0,
    winner: 0, // 0 = ongoing, 1 = P1, 2 = P2, 3 = draw
    lastMove: null,
  };
}

export function isBoardEmpty(board) {
  for (let x = 0; x < BOARD_SIZE; x++) {
    for (let y = 0; y < BOARD_SIZE; y++) {
      if (board[x][y]) return false;
    }
  }
  return true;
}

function getWordSpan(board, x, y, dx, dy) {
  let sx = x;
  let sy = y;
  while (sx - dx >= 0 && sx - dx < BOARD_SIZE && sy - dy >= 0 && sy - dy < BOARD_SIZE && board[sx - dx][sy - dy]) {
    sx -= dx;
    sy -= dy;
  }
  const cells = [];
  let cx = sx;
  let cy = sy;
  while (cx >= 0 && cx < BOARD_SIZE && cy >= 0 && cy < BOARD_SIZE && board[cx][cy]) {
    cells.push({ x: cx, y: cy, tile: board[cx][cy] });
    cx += dx;
    cy += dy;
  }
  return cells;
}

/**
 * Validates placements and computes exact Scrabble score + Collatz Hailstone outcome.
 * placements: Array<{ x, y, letter }>
 */
export function evaluatePlacement(state, placements) {
  if (!placements || placements.length === 0) {
    return { valid: false, reason: 'Place at least one tile' };
  }

  // Check bounds, empty cells, no duplicate coords
  const placedMap = new Map();
  for (const p of placements) {
    if (p.x < 0 || p.x >= BOARD_SIZE || p.y < 0 || p.y >= BOARD_SIZE) {
      return { valid: false, reason: 'Out of bounds' };
    }
    if (state.board[p.x][p.y]) {
      return { valid: false, reason: 'Square occupied' };
    }
    const key = `${p.x},${p.y}`;
    if (placedMap.has(key)) {
      return { valid: false, reason: 'Duplicate square' };
    }
    placedMap.set(key, p);
  }

  // Check collinearity
  const sameRow = placements.every((p) => p.y === placements[0].y);
  const sameCol = placements.every((p) => p.x === placements[0].x);
  if (!sameRow && !sameCol) {
    return { valid: false, reason: 'Tiles must be in one row or column' };
  }

  // Build temp board
  const temp = cloneBoard(state.board);
  for (const p of placements) {
    const letter = p.letter.toUpperCase();
    temp[p.x][p.y] = {
      letter,
      points: LETTER_POINTS[letter] ?? 1,
      owner: state.currentPlayer,
      hailstone: null,
      isNew: true,
    };
  }

  const emptyStart = isBoardEmpty(state.board);

  // Determine orientation
  let horiz = sameRow;
  if (placements.length === 1) {
    const p = placements[0];
    const hasHoriz = (p.x > 0 && temp[p.x - 1][p.y]) || (p.x < BOARD_SIZE - 1 && temp[p.x + 1][p.y]);
    const hasVert = (p.y > 0 && temp[p.x][p.y - 1]) || (p.y < BOARD_SIZE - 1 && temp[p.x][p.y + 1]);
    horiz = hasHoriz || !hasVert;
  }

  const dx = horiz ? 1 : 0;
  const dy = horiz ? 0 : 1;

  // Check contiguity along main axis
  if (placements.length > 1) {
    const sorted = [...placements].sort((a, b) => (horiz ? a.x - b.x : a.y - b.y));
    const start = horiz ? sorted[0].x : sorted[0].y;
    const end = horiz ? sorted[sorted.length - 1].x : sorted[sorted.length - 1].y;
    for (let v = start; v <= end; v++) {
      const cx = horiz ? v : sorted[0].x;
      const cy = horiz ? sorted[0].y : v;
      if (!temp[cx][cy]) {
        return { valid: false, reason: 'Tiles must form a continuous line' };
      }
    }
  }

  // Connectivity check
  if (emptyStart) {
    if (!placedMap.has(`${CENTER},${CENTER}`)) {
      return { valid: false, reason: 'First word must cover the center star' };
    }
    if (placements.length < 2) {
      return { valid: false, reason: 'First word must be at least 2 letters' };
    }
  } else {
    let touchesExisting = false;
    for (const p of placements) {
      const neighbors = [
        [p.x - 1, p.y], [p.x + 1, p.y],
        [p.x, p.y - 1], [p.x, p.y + 1],
      ];
      if (neighbors.some(([nx, ny]) => nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE && state.board[nx][ny])) {
        touchesExisting = true;
        break;
      }
    }
    if (!touchesExisting) {
      return { valid: false, reason: 'Word must connect to existing tiles' };
    }
  }

  // Collect main word + perpendicular cross-words
  const words = [];
  const mainSpan = getWordSpan(temp, placements[0].x, placements[0].y, dx, dy);
  if (mainSpan.length >= 2) {
    words.push(mainSpan);
  }
  for (const p of placements) {
    const crossSpan = getWordSpan(temp, p.x, p.y, dy, dx);
    if (crossSpan.length >= 2) {
      words.push(crossSpan);
    }
  }

  if (words.length === 0) {
    return { valid: false, reason: 'Form a word of at least 2 letters' };
  }

  // Validate every formed word against English dictionary
  const wordStrings = [];
  const invalidWords = [];
  for (const span of words) {
    const str = span.map((c) => c.tile.letter).join('');
    wordStrings.push(str);
    if (!isValidWord(str)) {
      invalidWords.push(str);
    }
  }

  if (invalidWords.length > 0) {
    return {
      valid: false,
      reason: `Not in dictionary: ${invalidWords.join(', ')}`,
      words: wordStrings,
    };
  }

  // Calculate standard Scrabble score `n`
  let rawScore = 0;
  const hookedHailstones = new Map();

  for (const span of words) {
    let wordPts = 0;
    let wordMult = 1;
    for (const cell of span) {
      let lp = cell.tile.points;
      if (cell.tile.isNew) {
        const bonus = BONUS_GRID[cell.x][cell.y];
        if (bonus === '2L') lp *= 2;
        else if (bonus === '3L') lp *= 3;
        else if (bonus === '2W' || bonus === '★') wordMult *= 2;
      } else if (cell.tile.hailstone && cell.tile.hailstone > 0) {
        hookedHailstones.set(`${cell.x},${cell.y}`, {
          x: cell.x,
          y: cell.y,
          value: cell.tile.hailstone,
        });
      }
      wordPts += lp;
    }
    rawScore += wordPts * wordMult;
  }

  if (placements.length === RACK_SIZE) {
    rawScore += 20; // Full-rack bonus
  }

  // Anchor tile for spawning/spiking a Hailstone: last placed tile along the word
  const sortedPlacements = [...placements].sort((a, b) => (horiz ? a.x - b.x : a.y - b.y));
  const anchor = sortedPlacements[sortedPlacements.length - 1];

  // Apply Collatz Parity Rule!
  const isEven = rawScore % 2 === 0;
  const hookedList = [...hookedHailstones.values()].sort((a, b) => b.value - a.value);

  let bankedPoints = 0;
  let collatzAction = null; // 'bank' | 'spawn' | 'halve' | 'crush' | 'spike'
  let hailstoneChanges = []; // { x, y, from, to, crushed }

  if (hookedList.length === 0) {
    if (isEven) {
      bankedPoints = rawScore / 2;
      collatzAction = 'bank';
    } else {
      const spawnedVal = Math.min(999, 3 * rawScore + 1);
      bankedPoints = 0;
      collatzAction = 'spawn';
      hailstoneChanges.push({ x: anchor.x, y: anchor.y, from: 0, to: spawnedVal, crushed: false });
    }
  } else {
    if (isEven) {
      bankedPoints = rawScore / 2;
      collatzAction = 'halve';
      for (const h of hookedList) {
        const nextVal = Math.floor(h.value / 2);
        const drop = h.value - nextVal;
        bankedPoints += drop;
        if (nextVal <= 1) {
          bankedPoints += CRUSH_JACKPOT;
          collatzAction = 'crush';
          hailstoneChanges.push({ x: h.x, y: h.y, from: h.value, to: 0, crushed: true });
        } else {
          hailstoneChanges.push({ x: h.x, y: h.y, from: h.value, to: nextVal, crushed: false });
        }
      }
    } else {
      // Odd word hooking a Hailstone -> SPIKE 3H + 1!
      bankedPoints = 0;
      collatzAction = 'spike';
      const primary = hookedList[0];
      const spikedVal = Math.min(999, 3 * primary.value + 1);
      // Clear old hooked token(s) and move spiked token to anchor
      for (const h of hookedList) {
        hailstoneChanges.push({ x: h.x, y: h.y, from: h.value, to: 0, crushed: false, moved: true });
      }
      hailstoneChanges.push({ x: anchor.x, y: anchor.y, from: primary.value, to: spikedVal, crushed: false });
    }
  }

  return {
    valid: true,
    words: wordStrings,
    rawScore,
    isEven,
    bankedPoints,
    collatzAction,
    hailstoneChanges,
    anchor,
  };
}

export function playPlacement(state, placements) {
  if (state.winner !== 0) throw new Error('Game is already over');

  const evalRes = evaluatePlacement(state, placements);
  if (!evalRes.valid) {
    throw new Error(evalRes.reason);
  }

  const pIdx = state.currentPlayer - 1;
  const rack = [...state.racks[pIdx]];

  // Remove played letters from current player's rack
  for (const p of placements) {
    const idx = rack.indexOf(p.letter.toUpperCase());
    if (idx === -1) throw new Error(`Letter ${p.letter} not in rack`);
    rack.splice(idx, 1);
  }

  // Apply tiles to board
  const nextBoard = cloneBoard(state.board);
  for (const p of placements) {
    const letter = p.letter.toUpperCase();
    nextBoard[p.x][p.y] = {
      letter,
      points: LETTER_POINTS[letter] ?? 1,
      owner: state.currentPlayer,
      hailstone: null,
    };
  }

  // Apply Hailstone mutations
  for (const ch of evalRes.hailstoneChanges) {
    if (nextBoard[ch.x][ch.y]) {
      nextBoard[ch.x][ch.y].hailstone = ch.to > 0 ? ch.to : null;
    }
  }

  // Draw replacement tiles
  const { drawn, bag: nextBag } = drawTiles(state.bag, RACK_SIZE - rack.length);
  const nextRack = [...rack, ...drawn];
  const nextRacks = state.racks.map((r, i) => (i === pIdx ? nextRack : [...r]));

  const nextScores = [...state.scores];
  nextScores[pIdx] += evalRes.bankedPoints;

  let winner = 0;
  if (nextScores[pIdx] >= TARGET_SCORE) {
    winner = state.currentPlayer;
  } else if (nextBag.length === 0 && nextRack.length === 0) {
    winner = nextScores[0] > nextScores[1] ? 1 : nextScores[1] > nextScores[0] ? 2 : 3;
  }

  const nextState = {
    board: nextBoard,
    bag: nextBag,
    racks: nextRacks,
    scores: nextScores,
    currentPlayer: winner === 0 ? (state.currentPlayer === 1 ? 2 : 1) : state.currentPlayer,
    turnNumber: state.turnNumber + 1,
    consecutivePasses: 0,
    winner,
    lastMove: {
      player: state.currentPlayer,
      words: evalRes.words,
      rawScore: evalRes.rawScore,
      bankedPoints: evalRes.bankedPoints,
      collatzAction: evalRes.collatzAction,
      hailstoneChanges: evalRes.hailstoneChanges,
      placements: placements.map((p) => ({ x: p.x, y: p.y, letter: p.letter.toUpperCase() })),
    },
  };

  return { nextState, result: evalRes };
}

export function passTurn(state, swapAll = false, rng = Math.random) {
  if (state.winner !== 0) return state;
  const pIdx = state.currentPlayer - 1;
  let nextBag = [...state.bag];
  const nextRacks = state.racks.map((r) => [...r]);

  if (swapAll && nextBag.length >= 1) {
    const oldRack = nextRacks[pIdx];
    const drawCount = Math.min(oldRack.length, nextBag.length);
    const { drawn, bag } = drawTiles(nextBag, drawCount);
    nextBag = [...bag, ...oldRack.slice(0, drawCount)];
    for (let i = nextBag.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [nextBag[i], nextBag[j]] = [nextBag[j], nextBag[i]];
    }
    nextRacks[pIdx] = [...oldRack.slice(drawCount), ...drawn];
  }

  const passes = state.consecutivePasses + 1;
  let winner = 0;
  if (passes >= 4) {
    winner = state.scores[0] > state.scores[1] ? 1 : state.scores[1] > state.scores[0] ? 2 : 3;
  }

  return {
    ...state,
    board: cloneBoard(state.board),
    bag: nextBag,
    racks: nextRacks,
    currentPlayer: winner === 0 ? (state.currentPlayer === 1 ? 2 : 1) : state.currentPlayer,
    turnNumber: state.turnNumber + 1,
    consecutivePasses: passes,
    winner,
    lastMove: {
      player: state.currentPlayer,
      passed: true,
      swapped: swapAll,
    },
  };
}
