/**
 * Hailstone Scrabble — Interactive Board, Rack, Keyboard & AI Controller
 */

import {
  BOARD_SIZE,
  BONUS_GRID,
  LETTER_POINTS,
  createInitialState,
  evaluatePlacement,
  playPlacement,
  passTurn,
} from './engine.js';
import { chooseAIMove } from './ai.js';
import { ICONS } from './icons.js';
import { SoundEngine } from './audio.js';

const THEMES = ['arcade', 'wood', 'paper'];
const MODE_LABELS = {
  pvp: '2P Local',
  'ai-easy': 'AI · Easy',
  'ai-medium': 'AI · Medium',
  'ai-hard': 'AI · Hard',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class HailstoneApp {
  constructor() {
    this.sound = new SoundEngine();
    this.themeIdx = 0;
    this.mode = 'ai-medium';
    this.state = createInitialState();
    this.draft = []; // Array<{ x, y, letter, rackIndex }>
    this.selectedRackIdx = null;
    this.cursor = null; // { x, y, horiz }
    this.isBusy = false;

    this.el = {
      boardGrid: document.getElementById('board-grid'),
      rack: document.getElementById('rack'),
      preview: document.getElementById('preview-strip'),
      p1Score: document.getElementById('p1-score'),
      p2Score: document.getElementById('p2-score'),
      pillP1: document.getElementById('pill-p1'),
      pillP2: document.getElementById('pill-p2'),
      bagCount: document.getElementById('bag-count'),
      btnRules: document.getElementById('btn-rules'),
      btnTheme: document.getElementById('btn-theme'),
      btnSound: document.getElementById('btn-sound'),
      btnSettings: document.getElementById('btn-settings'),
      btnRecall: document.getElementById('btn-recall'),
      btnShuffle: document.getElementById('btn-shuffle'),
      btnSwap: document.getElementById('btn-swap'),
      btnPlay: document.getElementById('btn-play'),
      toast: document.getElementById('toast'),
    };

    this.injectIcons();
    this.buildBoardDOM();
    this.bindEvents();
    this.render();
  }

  isAITurn() {
    return this.mode.startsWith('ai-') && this.state.currentPlayer === 2 && this.state.winner === 0;
  }

  injectIcons() {
    this.el.btnRules.innerHTML = ICONS.rules;
    this.el.btnTheme.innerHTML = ICONS.theme;
    this.el.btnSound.innerHTML = ICONS.soundOn;
    this.el.btnSettings.innerHTML = ICONS.settings;
    this.el.btnRecall.innerHTML = ICONS.recall;
    this.el.btnShuffle.innerHTML = ICONS.shuffle;
    this.el.btnSwap.innerHTML = ICONS.swap;
    document.querySelectorAll('[data-close-modal]').forEach((b) => {
      b.innerHTML = ICONS.close;
    });
  }

  buildBoardDOM() {
    this.el.boardGrid.innerHTML = '';
    this.cells = Array.from({ length: BOARD_SIZE }, () => new Array(BOARD_SIZE));
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        const div = document.createElement('div');
        div.className = 'cell';
        const bonus = BONUS_GRID[x][y];
        if (bonus === '2L') div.classList.add('b-2L');
        else if (bonus === '3L') div.classList.add('b-3L');
        else if (bonus === '2W') div.classList.add('b-2W');
        else if (bonus === '★') div.classList.add('b-star');

        div.dataset.x = x;
        div.dataset.y = y;
        div.addEventListener('click', () => this.onCellClick(x, y));
        div.addEventListener('dragover', (e) => e.preventDefault());
        div.addEventListener('drop', (e) => {
          e.preventDefault();
          const rackIndex = Number(e.dataTransfer.getData('text/plain'));
          if (!Number.isNaN(rackIndex)) this.placeRackTileAt(rackIndex, x, y);
        });
        this.el.boardGrid.appendChild(div);
        this.cells[x][y] = div;
      }
    }
  }

  bindEvents() {
    this.el.btnRules.addEventListener('click', () => this.openModal('modal-rules'));
    this.el.btnSettings.addEventListener('click', () => this.openModal('modal-settings'));
    this.el.btnTheme.addEventListener('click', () => {
      this.themeIdx = (this.themeIdx + 1) % THEMES.length;
      this.applyTheme(THEMES[this.themeIdx]);
    });
    this.el.btnSound.addEventListener('click', () => {
      this.sound.enabled = !this.sound.enabled;
      this.el.btnSound.innerHTML = this.sound.enabled ? ICONS.soundOn : ICONS.soundOff;
      this.el.btnSound.setAttribute('data-tip', this.sound.enabled ? 'Sound on' : 'Sound off');
    });

    this.el.btnRecall.addEventListener('click', () => this.recallDraft());
    this.el.btnShuffle.addEventListener('click', () => this.shuffleRack());
    this.el.btnSwap.addEventListener('click', () => this.handleSwapPass());
    this.el.btnPlay.addEventListener('click', () => this.commitDraft());

    document.querySelectorAll('[data-close-modal]').forEach((b) => {
      b.addEventListener('click', () => this.closeModal(b.dataset.closeModal));
    });
    document.querySelectorAll('.modal-backdrop').forEach((m) => {
      m.addEventListener('click', (e) => {
        if (e.target === m) m.classList.add('hidden');
      });
    });

    document.querySelectorAll('#mode-segmented .seg-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.mode = btn.dataset.mode;
        document.querySelectorAll('#mode-segmented .seg-btn').forEach((b) => b.classList.toggle('active', b === btn));
        this.startNewMatch();
      });
    });
    document.querySelectorAll('#theme-segmented .seg-btn').forEach((btn) => {
      btn.addEventListener('click', () => this.applyTheme(btn.dataset.theme));
    });
    document.getElementById('btn-new-game').addEventListener('click', () => {
      this.closeModal('modal-settings');
      this.startNewMatch();
    });
    document.getElementById('btn-rematch').addEventListener('click', () => {
      this.closeModal('modal-victory');
      this.startNewMatch();
    });

    // Keyboard typing directly onto the board!
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
  }

  applyTheme(id) {
    this.themeIdx = Math.max(0, THEMES.indexOf(id));
    document.documentElement.setAttribute('data-theme', id);
    document.querySelectorAll('#theme-segmented .seg-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.theme === id);
    });
  }

  startNewMatch() {
    this.state = createInitialState();
    this.draft = [];
    this.selectedRackIdx = null;
    this.cursor = null;
    this.isBusy = false;
    this.render();
  }

  /* ---------------- Board & Rack Interaction ---------------- */

  onCellClick(x, y) {
    if (this.isBusy || this.isAITurn() || this.state.winner !== 0) return;

    // Clicking a draft tile recalls it
    const draftIdx = this.draft.findIndex((d) => d.x === x && d.y === y);
    if (draftIdx !== -1) {
      this.draft.splice(draftIdx, 1);
      this.sound.recall();
      this.render();
      return;
    }

    if (this.state.board[x][y]) return;

    // If a rack tile is selected, place it here
    if (this.selectedRackIdx !== null) {
      this.placeRackTileAt(this.selectedRackIdx, x, y);
      return;
    }

    // Otherwise set/toggle typing cursor
    if (this.cursor && this.cursor.x === x && this.cursor.y === y) {
      this.cursor.horiz = !this.cursor.horiz;
    } else {
      this.cursor = { x, y, horiz: true };
    }
    this.render();
  }

  placeRackTileAt(rackIndex, x, y) {
    if (this.isBusy || this.isAITurn() || this.state.winner !== 0) return;
    if (this.state.board[x][y]) return;
    if (this.draft.some((d) => d.x === x && d.y === y)) return;
    if (this.draft.some((d) => d.rackIndex === rackIndex)) return;

    const rack = this.state.racks[this.state.currentPlayer - 1];
    const letter = rack[rackIndex];
    if (!letter) return;

    this.draft.push({ x, y, letter, rackIndex });
    this.selectedRackIdx = null;
    this.sound.place();
    this.render();
  }

  onKeyDown(e) {
    if (this.isBusy || this.isAITurn() || this.state.winner !== 0) return;
    if (!document.querySelector('.modal-backdrop:not(.hidden)')) {
      if (e.key === 'Escape') {
        this.recallDraft();
        return;
      }
      if (e.key === 'Enter' && this.draft.length > 0) {
        this.commitDraft();
        return;
      }
      if (e.key === 'Backspace' && this.draft.length > 0) {
        const last = this.draft.pop();
        this.cursor = { x: last.x, y: last.y, horiz: this.cursor?.horiz ?? true };
        this.sound.recall();
        this.render();
        return;
      }
      if (/^[a-zA-Z]$/.test(e.key) && this.cursor) {
        const ch = e.key.toUpperCase();
        const rack = this.state.racks[this.state.currentPlayer - 1];
        const used = new Set(this.draft.map((d) => d.rackIndex));
        const rIdx = rack.findIndex((l, i) => l === ch && !used.has(i));
        if (rIdx !== -1) {
          let { x, y, horiz } = this.cursor;
          while (x < BOARD_SIZE && y < BOARD_SIZE && (this.state.board[x][y] || this.draft.some((d) => d.x === x && d.y === y))) {
            if (horiz) x++; else y++;
          }
          if (x < BOARD_SIZE && y < BOARD_SIZE) {
            this.placeRackTileAt(rIdx, x, y);
            const nx = horiz ? x + 1 : x;
            const ny = horiz ? y : y + 1;
            if (nx < BOARD_SIZE && ny < BOARD_SIZE) this.cursor = { x: nx, y: ny, horiz };
            this.render();
          }
        }
      }
    }
  }

  recallDraft() {
    if (this.draft.length === 0) return;
    this.draft = [];
    this.selectedRackIdx = null;
    this.sound.recall();
    this.render();
  }

  shuffleRack() {
    const rack = this.state.racks[this.state.currentPlayer - 1];
    this.draft = [];
    this.selectedRackIdx = null;
    for (let i = rack.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rack[i], rack[j]] = [rack[j], rack[i]];
    }
    this.sound.recall();
    this.render();
  }

  async handleSwapPass() {
    if (this.isBusy || this.isAITurn() || this.state.winner !== 0) return;
    this.draft = [];
    this.selectedRackIdx = null;
    const canSwap = this.state.bag.length > 0;
    this.state = passTurn(this.state, canSwap);
    this.showToast(canSwap ? 'Swapped rack & passed' : 'Passed turn');
    this.render();
    if (this.state.winner !== 0) {
      this.showVictory();
    } else if (this.isAITurn()) {
      this.runAITurn();
    }
  }

  async commitDraft() {
    if (this.isBusy || this.draft.length === 0) return;
    const ev = evaluatePlacement(this.state, this.draft);
    if (!ev.valid) {
      this.showToast(ev.reason);
      return;
    }

    const { nextState, result } = playPlacement(this.state, this.draft);
    this.state = nextState;
    this.draft = [];
    this.selectedRackIdx = null;
    this.cursor = null;

    this.playActionFeedback(result, 'You');
    this.render();

    if (this.state.winner !== 0) {
      this.showVictory();
      return;
    }

    if (this.isAITurn()) {
      this.runAITurn();
    }
  }

  playActionFeedback(res, actor) {
    if (res.collatzAction === 'crush') {
      this.sound.crush();
      this.showToast(`${actor}: ${res.words[0]} · CRUSHED TO 1 (+${res.bankedPoints})`);
    } else if (res.collatzAction === 'halve') {
      this.sound.halve();
      const ch = res.hailstoneChanges[0];
      this.showToast(`${actor}: ${res.words[0]} · ${ch.from}→${ch.to} (+${res.bankedPoints})`);
    } else if (res.collatzAction === 'spike') {
      this.sound.spike();
      const ch = res.hailstoneChanges[res.hailstoneChanges.length - 1];
      this.showToast(`${actor}: ${res.words[0]} · SPIKED → ${ch.to}!`);
    } else if (res.collatzAction === 'spawn') {
      this.sound.spawn();
      const ch = res.hailstoneChanges[0];
      this.showToast(`${actor}: ${res.words[0]} (${res.rawScore}) → HAILSTONE ${ch.to}`);
    } else {
      this.sound.bank();
      this.showToast(`${actor}: ${res.words[0]} (${res.rawScore}) → +${res.bankedPoints}`);
    }
  }

  async runAITurn() {
    this.isBusy = true;
    this.render();
    await sleep(420);

    const diff = this.mode.replace('ai-', '');
    const move = chooseAIMove(this.state, diff);
    if (move) {
      const { nextState, result } = playPlacement(this.state, move);
      this.state = nextState;
      this.playActionFeedback(result, 'AI');
    } else {
      this.state = passTurn(this.state, this.state.bag.length > 0);
      this.showToast('AI passed');
    }

    this.isBusy = false;
    this.render();

    if (this.state.winner !== 0) {
      this.showVictory();
    }
  }

  /* ---------------- Rendering ---------------- */

  render() {
    // Scoreboard
    this.el.p1Score.textContent = this.state.scores[0];
    this.el.p2Score.textContent = this.state.scores[1];
    this.el.bagCount.textContent = this.state.bag.length;
    this.el.pillP1.classList.toggle('active-turn', this.state.winner === 0 && this.state.currentPlayer === 1);
    this.el.pillP2.classList.toggle('active-turn', this.state.winner === 0 && this.state.currentPlayer === 2);
    this.el.pillP2.setAttribute('data-tip', MODE_LABELS[this.mode]);

    // Board cells
    const draftMap = new Map(this.draft.map((d) => [`${d.x},${d.y}`, d]));
    for (let x = 0; x < BOARD_SIZE; x++) {
      for (let y = 0; y < BOARD_SIZE; y++) {
        const cellEl = this.cells[x][y];
        const placed = this.state.board[x][y];
        const draft = draftMap.get(`${x},${y}`);
        const isCursor = this.cursor && this.cursor.x === x && this.cursor.y === y;
        cellEl.classList.toggle('cursor', Boolean(isCursor && !placed && !draft));

        if (placed) {
          const hs = placed.hailstone
            ? `<span class="hailstone-badge">${placed.hailstone}</span>`
            : '';
          cellEl.innerHTML = `<div class="tile">${placed.letter}<span class="tile-pts">${placed.points}</span>${hs}</div>`;
        } else if (draft) {
          const pts = LETTER_POINTS[draft.letter] ?? 1;
          cellEl.innerHTML = `<div class="tile draft">${draft.letter}<span class="tile-pts">${pts}</span></div>`;
        } else {
          const bonus = BONUS_GRID[x][y];
          const arrow = isCursor ? (this.cursor.horiz ? '→' : '↓') : (bonus || '');
          cellEl.innerHTML = arrow ? `<span class="cell-bonus">${arrow}</span>` : '';
        }
      }
    }

    // Rack (show P1 rack in AI mode, or active player's rack in 2P mode)
    const viewPlayerIdx = this.mode === 'pvp' ? this.state.currentPlayer - 1 : 0;
    const rack = this.state.racks[viewPlayerIdx];
    const usedRack = new Set(this.draft.map((d) => d.rackIndex));

    this.el.rack.innerHTML = '';
    for (let i = 0; i < 7; i++) {
      const slot = document.createElement('div');
      slot.className = 'rack-slot';
      const letter = rack[i];
      if (letter) {
        const tile = document.createElement('button');
        tile.type = 'button';
        tile.className = `rack-tile${this.selectedRackIdx === i ? ' selected' : ''}${usedRack.has(i) ? ' used' : ''}`;
        tile.draggable = !usedRack.has(i);
        tile.innerHTML = `${letter}<span class="tile-pts">${LETTER_POINTS[letter]}</span>`;
        tile.addEventListener('click', () => {
          if (this.isBusy || this.isAITurn()) return;
          this.selectedRackIdx = this.selectedRackIdx === i ? null : i;
          this.render();
        });
        tile.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/plain', String(i));
        });
        slot.appendChild(tile);
      }
      this.el.rack.appendChild(slot);
    }

    // Live Collatz Parity Preview
    this.renderPreview();
  }

  renderPreview() {
    if (this.draft.length === 0) {
      this.el.btnPlay.disabled = true;
      this.el.preview.innerHTML = this.isBusy
        ? '<span class="preview-badge">AI thinking…</span>'
        : '';
      return;
    }

    const ev = evaluatePlacement(this.state, this.draft);
    this.el.btnPlay.disabled = !ev.valid || this.isBusy;

    if (!ev.valid) {
      this.el.preview.innerHTML = `<span class="preview-badge invalid">${ev.reason}</span>`;
      return;
    }

    let actionLabel = '';
    if (ev.collatzAction === 'bank') {
      actionLabel = `EVEN → BANK +${ev.bankedPoints}`;
    } else if (ev.collatzAction === 'spawn') {
      const val = ev.hailstoneChanges[0].to;
      actionLabel = `ODD → SPAWN ${val}`;
    } else if (ev.collatzAction === 'halve') {
      const ch = ev.hailstoneChanges[0];
      actionLabel = `HALVE ${ch.from}→${ch.to} (+${ev.bankedPoints})`;
    } else if (ev.collatzAction === 'crush') {
      actionLabel = `CRUSH TO 1 (+${ev.bankedPoints}!)`;
    } else if (ev.collatzAction === 'spike') {
      const ch = ev.hailstoneChanges[ev.hailstoneChanges.length - 1];
      actionLabel = `SPIKE → ${ch.to}`;
    }

    this.el.preview.innerHTML = `
      <span class="preview-badge ${ev.collatzAction}">
        <span>${ev.words[0]} (${ev.rawScore})</span>
        <span class="preview-tag">${actionLabel}</span>
      </span>
    `;
  }

  showVictory() {
    const w = this.state.winner;
    const title = w === 1 ? 'Player 1 Wins' : w === 2 ? (this.mode === 'pvp' ? 'Player 2 Wins' : 'AI Wins') : 'Draw';
    document.getElementById('victory-title').textContent = title;
    document.getElementById('victory-sub').textContent = `Final score: ${this.state.scores[0]} – ${this.state.scores[1]}`;
    this.sound.crush();
    this.openModal('modal-victory');
  }

  openModal(id) { document.getElementById(id)?.classList.remove('hidden'); }
  closeModal(id) { document.getElementById(id)?.classList.add('hidden'); }

  showToast(msg) {
    this.el.toast.textContent = msg;
    this.el.toast.classList.add('show');
    clearTimeout(this._t);
    this._t = setTimeout(() => this.el.toast.classList.remove('show'), 2200);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.__hailstoneApp = new HailstoneApp();
});
