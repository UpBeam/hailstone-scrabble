/**
 * Hailstone Scrabble — Fast Dictionary-Powered AI Opponent
 *
 * Scans anchor squares (prioritizing active Hailstone tokens!) and constructs
 * legal words from the AI's rack, evaluating both banked points and Collatz
 * push-your-luck value (hunting Crushes & Halvings, or spiking low pots!).
 */

import {
  BOARD_SIZE,
  CENTER,
  evaluatePlacement,
  isBoardEmpty,
} from './engine.js';
import { WORD_SET } from './dict.js';

// Pre-group short common words (length 2..6) for instant mobile-friendly AI search
const WORDS_BY_LEN = [[], [], [], [], [], [], []];
for (const w of WORD_SET) {
  if (w.length >= 2 && w.length <= 6) {
    WORDS_BY_LEN[w.length].push(w);
  }
}

function canFormWithRack(word, fixedMap, rackCounts) {
  const needed = Object.create(null);
  let usedFromRack = 0;
  for (let i = 0; i < word.length; i++) {
    const fixed = fixedMap[i];
    const ch = word[i];
    if (fixed) {
      if (fixed !== ch) return false;
    } else {
      needed[ch] = (needed[ch] || 0) + 1;
      if (needed[ch] > (rackCounts[ch] || 0)) return false;
      usedFromRack++;
    }
  }
  return usedFromRack > 0;
}

function countRack(rack) {
  const map = Object.create(null);
  for (const ch of rack) map[ch] = (map[ch] || 0) + 1;
  return map;
}

/**
 * Finds a strong move for `state.currentPlayer` within a tight latency budget (<150ms).
 * difficulty: 'easy' | 'medium' | 'hard'
 */
export function chooseAIMove(state, difficulty = 'medium') {
  const pIdx = state.currentPlayer - 1;
  const rack = state.racks[pIdx];
  const rackCounts = countRack(rack);
  const candidates = [];
  const deadline = performance.now() + (difficulty === 'hard' ? 160 : 90);

  // First move on empty board: play across center (5, 5)
  if (isBoardEmpty(state.board)) {
    const fixed = {};
    for (let len = 5; len >= 2; len--) {
      for (const w of WORDS_BY_LEN[len]) {
        if (!canFormWithRack(w, fixed, rackCounts)) continue;
        const startX = CENTER - Math.floor(len / 2);
        const placements = [];
        for (let i = 0; i < len; i++) {
          placements.push({ x: startX + i, y: CENTER, letter: w[i] });
        }
        const ev = evaluatePlacement(state, placements);
        if (ev.valid) {
          candidates.push({ placements, ev, score: scoreOutcome(ev, difficulty) });
          if (candidates.length >= 40) break;
        }
      }
      if (candidates.length >= 40) break;
    }
    return pickFromCandidates(candidates, difficulty);
  }

  // Collect existing board tiles as anchors — prioritize Hailstone tokens first!
  const anchors = [];
  for (let x = 0; x < BOARD_SIZE; x++) {
    for (let y = 0; y < BOARD_SIZE; y++) {
      const cell = state.board[x][y];
      if (cell) {
        anchors.push({ x, y, letter: cell.letter, hailstone: cell.hailstone || 0 });
      }
    }
  }
  anchors.sort((a, b) => b.hailstone - a.hailstone);

  for (const anchor of anchors) {
    if (performance.now() > deadline && candidates.length >= 12) break;

    for (const horiz of [true, false]) {
      const dx = horiz ? 1 : 0;
      const dy = horiz ? 0 : 1;

      for (let len = 2; len <= 5; len++) {
        if (performance.now() > deadline && candidates.length >= 12) break;

        for (let offset = 0; offset < len; offset++) {
          const sx = anchor.x - dx * offset;
          const sy = anchor.y - dy * offset;
          const ex = sx + dx * (len - 1);
          const ey = sy + dy * (len - 1);
          if (sx < 0 || sy < 0 || ex >= BOARD_SIZE || ey >= BOARD_SIZE) continue;

          // Ensure boundaries before/after span are empty (don't accidentally extend)
          const bx = sx - dx;
          const by = sy - dy;
          if (bx >= 0 && by >= 0 && state.board[bx][by]) continue;
          const ax = ex + dx;
          const ay = ey + dy;
          if (ax < BOARD_SIZE && ay < BOARD_SIZE && state.board[ax][ay]) continue;

          const fixedMap = Object.create(null);
          let hasEmpty = false;
          for (let i = 0; i < len; i++) {
            const c = state.board[sx + dx * i][sy + dy * i];
            if (c) fixedMap[i] = c.letter;
            else hasEmpty = true;
          }
          if (!hasEmpty) continue;

          const list = WORDS_BY_LEN[len];
          // Sample stride if list is large on easy/medium so search stays snappy
          const stride = difficulty === 'hard' ? 1 : len >= 5 ? 4 : 2;
          for (let wi = 0; wi < list.length; wi += stride) {
            const w = list[wi];
            if (w[offset] !== anchor.letter) continue;
            if (!canFormWithRack(w, fixedMap, rackCounts)) continue;

            const placements = [];
            for (let i = 0; i < len; i++) {
              if (!fixedMap[i]) {
                placements.push({ x: sx + dx * i, y: sy + dy * i, letter: w[i] });
              }
            }

            const ev = evaluatePlacement(state, placements);
            if (ev.valid) {
              candidates.push({ placements, ev, score: scoreOutcome(ev, difficulty) });
              if (candidates.length >= 120) break;
            }
          }
        }
      }
    }
  }

  return pickFromCandidates(candidates, difficulty);
}

function scoreOutcome(ev, difficulty) {
  let s = ev.bankedPoints * 2.2;
  if (ev.collatzAction === 'crush') s += 30;
  else if (ev.collatzAction === 'halve') s += 12;
  else if (ev.collatzAction === 'spawn') {
    // Spawning a medium Hailstone is fun pressure
    s += difficulty === 'hard' ? 6 : 9;
  } else if (ev.collatzAction === 'spike') {
    // Spiking a small Hailstone (4 or 2) denies opponent the crush jackpot!
    const fromVal = ev.hailstoneChanges[0]?.from || 0;
    s += fromVal <= 4 ? 14 : 4;
  }
  return s;
}

function pickFromCandidates(candidates, difficulty) {
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  if (difficulty === 'hard') return candidates[0].placements;
  if (difficulty === 'medium') {
    const pool = candidates.slice(0, Math.min(3, candidates.length));
    return pool[Math.floor(Math.random() * pool.length)].placements;
  }
  const pool = candidates.slice(0, Math.min(8, candidates.length));
  return pool[Math.floor(Math.random() * pool.length)].placements;
}
