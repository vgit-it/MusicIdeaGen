// The chord editor: tap a bar, set its chord (or one per half), hold a chord across bars, or hand a
// bar back to the generator. What you set is pinned; Generate writes everything else around it.

import { GENRES } from '../genres';
import type { ChordSheet, Idea, SheetCell } from '../idea';
import {
  CELLS_PER_BAR, PICK_QUALITIES, canSetChords, cellChord, chordsAtCells, hasPins, keyChords, numeral, suggest,
} from '../parts/sheet';
import { type Chord, NOTE_NAMES, type Quality, chordName } from '../theory';

const QUALITY_NAME: Record<Quality, string> = {
  maj: 'major', min: 'minor', '7': '7', maj7: 'maj7', m7: 'm7', sus2: 'sus2', sus4: 'sus4', add9: 'add9',
  '5': 'power chord (5)', dim: 'diminished', aug: 'augmented', '9': '9', m9: 'm9', m7b5: 'm7b5', '7#9': '7#9',
};

export interface ChordEditor {
  /** The bar being edited (-1: closed). */
  readonly bar: number;
  open(bar: number): void;
  close(): void;
  /** Redraw for the current idea; `inTrack`: track sections can't be edited. */
  refresh(idea: Idea | null, inTrack: boolean): void;
}

/** `apply`: the new sheet (undefined: no chords set), and a short status message. */
export function buildChordEditor(root: HTMLElement, apply: (sheet: ChordSheet | undefined, msg: string) => void, onBar: () => void): ChordEditor {
  let idea: Idea | null = null;
  let bar = -1;
  let split = false;
  let half = 0;

  const cellsOf = (i: Idea): SheetCell[] => {
    const n = i.song.bars.length * CELLS_PER_BAR;
    const s = i.opts.chords ?? [];
    return Array.from({ length: n }, (_, k) => s[k] ?? null);
  };
  const name = (c: Chord) => chordName(idea!.song.key, c);
  const chip = (c: Chord, act: string, extra = '', cur = false) =>
    `<button class="chip${cur ? ' cur' : ''}" data-act="${act}" data-r="${c.root}" data-q="${c.q}"${extra}>` +
    `<b>${name(c)}</b><i>${numeral(c, idea!.song.mode)}</i></button>`;

  function commit(cells: SheetCell[], msg: string) {
    // a '-' with nothing pinned before it still means "carry on": keep it; a sheet with nothing set is no sheet
    apply(hasPins(cells) ? cells : undefined, msg);
  }

  function draw() {
    if (!idea || bar < 0) { root.hidden = true; root.innerHTML = ''; return; }
    root.hidden = false;
    const { song } = idea;
    const cells = cellsOf(idea);
    const sounding = chordsAtCells(song, idea.chords);
    const a = bar * CELLS_PER_BAR;
    const ci = a + (split ? half : 0);
    const now = sounding[ci];
    const pinned = cells[ci] !== null;
    const prev = ci > 0 ? sounding[ci - 1] : null;
    const after = split && half === 0 ? ci + 1 : a + CELLS_PER_BAR;
    const next = after < sounding.length ? sounding[after] : null;
    const genre = GENRES[song.genre];
    const inKey = keyChords(song.mode, genre.seventh).filter((c) => c.q !== 'dim' && c.q !== 'aug');
    const fits = suggest(song.mode, now, prev, next);
    const last = bar === song.bars.length - 1;
    const keyRoot = (song.key + now.root) % 12;
    const half2 = (k: number) => `${k ? '2nd' : '1st'} half: ${name(sounding[a + k])}`;

    root.innerHTML = `
      <div class="cehead">
        <button class="small" data-act="prevbar" aria-label="Previous bar"${bar === 0 ? ' disabled' : ''}>‹</button>
        <b>Bar ${bar + 1}</b>
        <button class="small" data-act="nextbar" aria-label="Next bar"${last ? ' disabled' : ''}>›</button>
        <span class="cenow">${name(now)} <i>${numeral(now, song.mode)}</i> · ${pinned ? (cells[ci] === '-' ? 'held from before' : 'set by you') : 'written by the generator'}</span>
        <button class="small" data-act="close">Done</button>
      </div>
      <div class="seg">
        <button data-act="whole" class="${split ? '' : 'on'}">Whole bar</button>
        <button data-act="split" class="${split ? 'on' : ''}">Split in half</button>
      </div>
      ${split ? `<div class="seg">${[0, 1].map((k) => `<button data-act="half" data-k="${k}" class="${half === k ? 'on' : ''}">${half2(k)}</button>`).join('')}</div>` : ''}
      <div class="celabel">In the key</div>
      <div class="chips">${inKey.map((c) => chip(c, 'set', '', c.root === now.root && c.q === now.q)).join('')}</div>
      <div class="celabel">Ideas that fit here</div>
      <div class="chips">${fits.map((f) => chip(f.chord, 'set', ` title="${f.why}"`).replace('</button>', `<small>${f.why}</small></button>`)).join('')}</div>
      <div class="celabel">Any chord</div>
      <div class="anyrow">
        <select data-any="root" aria-label="Root">${NOTE_NAMES.map((n, k) => `<option value="${k}"${k === keyRoot ? ' selected' : ''}>${n}</option>`).join('')}</select>
        <select data-any="q" aria-label="Chord type">${PICK_QUALITIES.map((q) => `<option value="${q}"${q === now.q ? ' selected' : ''}>${QUALITY_NAME[q]}</option>`).join('')}</select>
        <button class="small" data-act="any">Use</button>
      </div>
      <div class="ceacts">
        <button class="small" data-act="holdprev"${ci === 0 ? ' disabled' : ''}>Keep the chord before</button>
        <button class="small" data-act="holdnext"${last ? ' disabled' : ''}>Hold into next bar</button>
        <button class="small" data-act="free"${pinned || (!split && cells[a + 1] !== null) ? '' : ' disabled'}>Let it generate</button>
      </div>`;
  }

  root.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!t || !idea || bar < 0) return;
    const cells = cellsOf(idea);
    const sounding = chordsAtCells(idea.song, idea.chords);
    const a = bar * CELLS_PER_BAR;
    const ci = a + (split ? half : 0);
    const where = split ? `bar ${bar + 1}, ${half ? '2nd' : '1st'} half` : `bar ${bar + 1}`;
    const setChord = (c: Chord) => {
      const cell: SheetCell = [c.root, c.q];
      if (split) cells[ci] = cell;
      else { cells[a] = cell; cells[a + 1] = '-'; }
      commit(cells, `${name(c)} on ${where}. Everything else follows it.`);
    };
    switch (t.dataset.act) {
      case 'close': bar = -1; draw(); onBar(); return;
      case 'prevbar': open(bar - 1); return;
      case 'nextbar': open(bar + 1); return;
      case 'whole': split = false; draw(); return;
      case 'split': split = true; half = 0; draw(); return;
      case 'half': half = Number(t.dataset.k); draw(); return;
      case 'set': setChord({ root: Number(t.dataset.r), q: t.dataset.q as Quality }); return;
      case 'any': {
        const r = Number(root.querySelector<HTMLSelectElement>('[data-any="root"]')!.value);
        const q = root.querySelector<HTMLSelectElement>('[data-any="q"]')!.value as Quality;
        setChord({ root: (r - idea.song.key + 12) % 12, q });
        return;
      }
      case 'holdprev':
        if (split) cells[ci] = '-';
        else { cells[a] = '-'; cells[a + 1] = '-'; }
        commit(cells, `The chord before carries on through ${where}.`);
        return;
      case 'holdnext': {
        // pin what this bar ends on, then carry it through the next bar
        const end = a + 1;
        if (cells[a] === null) { const c = sounding[a]; cells[a] = [c.root, c.q]; }
        if (cells[end] === null) cells[end] = sounding[end].root === sounding[a].root && sounding[end].q === sounding[a].q ? '-' : [sounding[end].root, sounding[end].q];
        cells[end + 1] = '-';
        cells[end + 2] = '-';
        commit(cells, `${name(sounding[end])} held into bar ${bar + 2}.`);
        open(bar + 1);
        return;
      }
      case 'free':
        if (split) cells[ci] = null;
        else { cells[a] = null; cells[a + 1] = null; }
        commit(cells, `${where[0].toUpperCase()}${where.slice(1)} is back to the generator's ideas: Generate or reroll Chords for new ones.`);
        return;
    }
  });

  function open(b: number) {
    if (!idea) return;
    bar = Math.max(0, Math.min(b, idea.song.bars.length - 1));
    // start split where the bar has (or plays) two chords
    const cells = cellsOf(idea);
    const s = chordsAtCells(idea.song, idea.chords);
    const a = bar * CELLS_PER_BAR;
    const two = cellChord(cells[a + 1]) !== null || (cells[a + 1] === null && (s[a].root !== s[a + 1].root || s[a].q !== s[a + 1].q));
    split = two;
    half = 0;
    draw();
    onBar();
  }

  return {
    get bar() { return bar; },
    open,
    close() { bar = -1; draw(); },
    refresh(next, inTrack) {
      idea = next;
      if (!idea || inTrack || !canSetChords(idea.song)) bar = -1;
      draw();
    },
  };
}
