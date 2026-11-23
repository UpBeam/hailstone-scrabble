import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CENTER,
  CRUSH_JACKPOT,
  createInitialState,
  evaluatePlacement,
  playPlacement,
  passTurn,
} from '../src/engine.js';
import { chooseAIMove } from '../src/ai.js';

test('even first word banks n/2 points immediately with no Hailstone', () => {
  const state = createInitialState();
  // "AT" = A(1) + T(1) = 2, on center star (2W) => rawScore = 4 (EVEN) -> banks 2 pts
  state.racks[0] = ['A', 'T', 'E', 'R', 'S', 'O', 'N'];
  const placements = [
    { x: CENTER, y: CENTER, letter: 'A' },
    { x: CENTER + 1, y: CENTER, letter: 'T' },
  ];
  const { nextState, result } = playPlacement(state, placements);
  assert.equal(result.rawScore, 4);
  assert.equal(result.collatzAction, 'bank');
  assert.equal(result.bankedPoints, 2);
  assert.equal(nextState.scores[0], 2);
  assert.equal(nextState.board[CENTER + 1][CENTER].hailstone, null);
});

test('odd word spawns a 3n+1 Hailstone token and even hook halves it to Crush Jackpot', () => {
  const state = createInitialState();
  // Force an odd word on non-2W? First word hits ★ (2W), so rawScore is always even on Turn 1.
  // Play "AT" first (4 pts, banks 2), then P2 plays "CAT" vertically using A? C(3)+A(1)+T(1)=5 (ODD!)
  state.racks[0] = ['A', 'T', 'E', 'R', 'S', 'O', 'N'];
  state.racks[1] = ['C', 'T', 'A', 'E', 'I', 'O', 'U'];

  const { nextState: s1 } = playPlacement(state, [
    { x: CENTER, y: CENTER, letter: 'A' },
    { x: CENTER + 1, y: CENTER, letter: 'T' },
  ]);

  // P2 plays C at (5,4) and T at (5,6) vertically through A at (5,5) -> "CAT" = 3+1+1 = 5 (ODD!)
  // Neither (5,4) nor (5,6) is a bonus square!
  const { nextState: s2, result: r2 } = playPlacement(s1, [
    { x: CENTER, y: CENTER - 1, letter: 'C' },
    { x: CENTER, y: CENTER + 1, letter: 'T' },
  ]);
  assert.equal(r2.rawScore, 5);
  assert.equal(r2.collatzAction, 'spawn');
  assert.equal(r2.bankedPoints, 0);
  assert.equal(s2.board[CENTER][CENTER + 1].hailstone, 16, '3*5+1 = 16 Hailstone should spawn on T');

  // Now P1 hooks the 16 Hailstone at (5,6) with "TO" -> T(1)+O(1) = 2 (EVEN!)
  // Wait: (6,6) is a 2L! So O(1)*2 + T(1) = 3 (ODD) -> that SPIKES 16 -> 49!
  // Let's test hooking left with "AT" at (4,6) -> (4,6) is 2L: A(1)*2 + T(1) = 3 (ODD) -> SPIKE!
  // Let's test spiking explicitly first:
  s2.racks[0] = ['O', 'E', 'R', 'S', 'N', 'A', 'I'];
  const { nextState: s3, result: r3 } = playPlacement(s2, [
    { x: CENTER + 1, y: CENTER + 1, letter: 'O' }, // forms "TO" horizontally AND "TO" vertically!
  ]);
  // Horizontal "TO": T(1)+O(1)*2 = 3; Vertical "TO" from (6,5)T + (6,6)O: T(1)+O(1)*2 = 3 -> rawScore = 6 (EVEN!)
  assert.equal(r3.rawScore, 6);
  assert.equal(r3.collatzAction, 'halve');
  assert.equal(s3.board[CENTER][CENTER + 1].hailstone, 8, '16 halved to 8');
  assert.equal(r3.bankedPoints, 3 + 8, 'banks n/2 (3) + drop (8) = 11');
});

test('crushing a Hailstone of value 2 to 1 awards the Crush Jackpot', () => {
  const state = createInitialState();
  state.board[5][5] = { letter: 'A', points: 1, owner: 1, hailstone: 2 };
  state.racks[0] = ['T', 'E', 'R', 'S', 'O', 'N', 'I'];
  // Place T at (6,5) -> "AT" = 1+1 = 2 (EVEN) -> halves 2 -> 1 => CRUSH JACKPOT!
  const { nextState, result } = playPlacement(state, [{ x: 6, y: 5, letter: 'T' }]);
  assert.equal(result.collatzAction, 'crush');
  assert.equal(result.bankedPoints, 1 + 1 + CRUSH_JACKPOT);
  assert.equal(nextState.board[5][5].hailstone, null);
});

test('AI finds valid opening and follow-up moves quickly', () => {
  const state = createInitialState();
  const m1 = chooseAIMove(state, 'medium');
  assert.ok(m1 && m1.length >= 2, 'AI should find an opening word');
  const { nextState: s1 } = playPlacement(state, m1);

  const m2 = chooseAIMove(s1, 'medium');
  assert.ok(m2 && m2.length >= 1, 'AI should find a follow-up word');
  const { nextState: s2 } = playPlacement(s1, m2);
  assert.equal(s2.turnNumber, 3);
});

test('4 consecutive passes end the game', () => {
  let s = createInitialState();
  s.scores = [24, 12];
  for (let i = 0; i < 4; i++) s = passTurn(s);
  assert.equal(s.winner, 1);
});
