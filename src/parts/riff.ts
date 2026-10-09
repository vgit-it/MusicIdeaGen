// Riff-based guitar for heavy genres: single-note riffs, chugs with stabs, big chords, clean arpeggios.
// A one-bar "cell" is written per section and repeated (that repetition is what makes it a riff),
// often as a two-bar riff (the second bar answers the first), with a turnaround at the end of each
// section. Cells are realized against the chord at each step.

import { GENRES, type RiffGenre, type RiffStyle } from '../genres';
import type { ChordPart, GuitarHit, Song } from '../idea';
import type { Rng } from '../rng';
import { type Bar, groupStarts } from '../rhythm';
import { type Mode, chordPc } from '../theory';
import { lowestOf, powerChord, riffNote, voicingsInTuning } from '../theory/fretboard';
import { FIGURE_STYLES, figureRun } from './figures';

export interface RiffPart {
  hits: GuitarHit[];
  /** Per step: 1 = heavy hit (stab / chord), 0.5 = riff note on a beat, 0.3 = chug, 0 = nothing. */
  accents: number[];
  /** Per step: is the guitar sounding? (drums stop with it) */
  sounding: boolean[];
  notes: string[];
}

export const RIFF_STYLE_LABEL: Record<RiffStyle, string> = {
  single: 'single-note riff',
  chug: 'palm-muted chugs and power-chord stabs',
  big: 'big open power chords',
  arp: 'clean arpeggios',
  picked: 'picked chord-shape hook',
  lick: 'chord stabs and licks',
  pedal: 'pedal-note riff',
  gallop: 'galloping riff',
};

/** Abstract event in a one-bar cell. */
interface Ev {
  pos: number;
  len: number;
  kind: 'chord' | 'palm' | 'note' | 'dead';
  /** Semitones above the root of the chord sounding at that step. */
  deg: number;
  vel: number;
  slide?: number;
  /** Palm chug on the tonic (open low string) whatever the chord. */
  pedal?: boolean;
}

/** Minor pentatonic plus the colour notes of the mode (and the blues b5 when weird). */
function riffScale(rng: Rng, mode: Mode, w: number): number[] {
  const s = new Set([0, 3, 5, 7, 10, 12]);
  if (mode === 'phrygian') s.add(1);
  if (mode === 'dorian') s.add(9);
  if (mode === 'minor' && rng.chance(0.4)) s.add(8);
  if (rng.chance(0.25 + w * 0.5)) s.add(6);
  return [...s].sort((a, b) => a - b);
}

/** Rhythm options per beat-group length (positions inside the group). */
function groupRhythm(rng: Rng, g: number): number[] {
  if (g === 4) return rng.pick([[0], [0, 2], [0, 3], [0, 2, 3], [0, 1, 2], [2], [0, 1, 2, 3], [0, 2]]);
  if (g === 6) return rng.pick([[0, 3], [0, 2, 4], [0, 4], [0], [0, 2, 3, 4]]);
  if (g === 8) return rng.pick([[0, 4], [0, 2, 4], [0, 3, 6], [0, 4, 6]]);
  return [0];
}

function singleCell(rng: Rng, bar: Bar, scale: number[], R: RiffGenre, w: number): Ev[] {
  const st = groupStarts(bar.groups);
  const pos: number[] = [];
  bar.groups.forEach((g, i) => { for (const o of groupRhythm(rng, g)) pos.push(st[i] + o); });
  if (pos[0] !== 0) pos.unshift(0);
  let idx = 0;
  return pos.map((p, i) => {
    const gap = (pos[i + 1] ?? bar.len) - p;
    if (i > 0) idx = Math.max(0, Math.min(scale.length - 1, idx + rng.pick([-2, -1, -1, 0, 1, 1, 2, 3])));
    // riffs like to land on the b7, b2 or 5 before coming home
    if (i === pos.length - 1 && rng.chance(0.4)) idx = scale.indexOf(rng.pick([10, 7, scale.includes(1) ? 1 : 10]));
    const deg = scale[idx];
    const onBeat = st.includes(p);
    let kind: Ev['kind'] = 'note';
    if (deg === 0 && gap <= 2 && rng.chance(0.6)) kind = 'palm';
    else if (onBeat && rng.chance(0.2 + w * 0.15)) kind = 'chord';
    const slide = kind !== 'palm' && deg !== 0 && gap >= 2 && rng.chance(R.slide) ? -rng.pick([1, 2]) : undefined;
    const len = gap >= 2 && rng.chance(0.25) ? 1 : gap;
    return { pos: p, len, kind, deg, vel: p === 0 ? 0.92 : onBeat ? 0.85 : 0.78, slide };
  });
}

function chugCell(rng: Rng, bar: Bar, R: RiffGenre, w: number, pedal: boolean): Ev[] {
  const { len, groups } = bar;
  const st = groupStarts(groups);
  const sixteenths = rng.chance(R.sixteenths * (0.6 + w));
  const cands = [...new Set(st.flatMap((s, i) => [s, s + 2, s + 3].filter((p) => p > 0 && p < s + groups[i])))];
  const stabs = [0, ...rng.shuffle(cands).slice(0, rng.int(1, 3))].sort((a, b) => a - b);
  const ev: Ev[] = [];
  stabs.forEach((s, i) => {
    const next = stabs[i + 1] ?? len;
    const ring = Math.min(next - s, rng.pick([2, 3, 4, 6, 8]));
    // the odd chromatic stab: b2, tritone, b7, b3
    const deg = i > 0 && rng.chance(0.12 + w * 0.3) ? rng.pick([1, 6, 10, 3]) : 0;
    ev.push({ pos: s, len: ring, kind: 'chord', deg, vel: 0.95 });
    for (let p = s + ring; p < next; p++) {
      if (!sixteenths && p % 2) continue;
      if (rng.chance(0.12)) continue; // breathe
      const dead = sixteenths && rng.chance(0.06 + w * 0.1);
      ev.push({ pos: p, len: sixteenths ? 1 : 2, kind: dead ? 'dead' : 'palm', deg: 0, vel: p % 4 === 0 ? 0.86 : 0.76, pedal });
    }
  });
  return ev;
}

function bigCell(rng: Rng, bar: Bar): Ev[] {
  const { len, groups } = bar;
  const st = groupStarts(groups);
  const pattern = rng.pick(['whole', 'drive', 'push', 'push']);
  if (pattern === 'whole') return [{ pos: 0, len, kind: 'chord', deg: 0, vel: 0.95 }];
  if (pattern === 'drive') {
    const ev: Ev[] = [];
    for (let p = 0; p < len; p += 2) ev.push({ pos: p, len: 2, kind: 'chord', deg: 0, vel: st.includes(p) ? 0.92 : 0.76 });
    return ev;
  }
  const extra = rng.shuffle([6, 10, 14, 3, 11].filter((p) => p < len)).slice(0, rng.int(1, 2));
  const pos = [0, ...extra].sort((a, b) => a - b);
  return pos.map((p, i) => ({ pos: p, len: (pos[i + 1] ?? len) - p, kind: 'chord' as const, deg: 0, vel: 0.95 }));
}

/**
 * End of a section: a power chord left to ring over the second half of the bar (the riff breathes),
 * stop dead (for a drum fill), walk into the next chord, or build with 16ths.
 */
function turnaround(rng: Rng, cell: Ev[], bar: Bar, style: RiffStyle): Ev[] {
  const lastG = bar.groups[bar.groups.length - 1];
  const from = bar.len - lastG;
  const keep = cell.filter((e) => e.pos < from).map((e) => ({ ...e, len: Math.min(e.len, from - e.pos) }));
  const kind = rng.weighted<'ring' | 'stop' | 'walk' | 'notes' | 'build'>(style === 'single'
    ? [['ring', 3], ['stop', 2], ['walk', 2], ['notes', 1]]
    : [['ring', 3], ['stop', 2], ['walk', 2], ['build', 1]]);
  if (kind === 'ring') {
    const half = groupStarts(bar.groups)[Math.ceil(bar.groups.length / 2)] ?? from;
    const before = cell.filter((e) => e.pos < half).map((e) => ({ ...e, len: Math.min(e.len, half - e.pos) }));
    return [...before, { pos: half, len: bar.len - half, kind: 'chord' as const, deg: 0, vel: 0.95 }];
  }
  if (kind === 'stop') return keep;
  if (kind === 'walk') {
    const degs = rng.pick([[3, 1], [5, 3], [10, 11], [6, 5], [1, 0]]);
    return [...keep, ...degs.map((deg, i) => ({ pos: from + (i * lastG) / 2, len: lastG / 2, kind: 'chord' as const, deg, vel: 0.92 }))];
  }
  if (kind === 'notes') {
    const degs = rng.pick([[0, 3, 5, 6], [12, 10, 7, 5], [0, 1, 0, 10], [7, 6, 5, 3]]);
    return [...keep, ...Array.from({ length: lastG }, (_, i) => ({ pos: from + i, len: 1, kind: 'note' as const, deg: degs[i % degs.length], vel: 0.82 }))];
  }
  return [...keep, ...Array.from({ length: lastG }, (_, i) => ({ pos: from + i, len: 1, kind: 'palm' as const, deg: 0, vel: 0.72 + i * 0.05 }))];
}

/**
 * The second bar of a two-bar riff: the first half as in the first bar, then an answer: new notes,
 * a note or chord held to the end of the bar, or (big chords, when the chord carries on) nothing at
 * all, the first bar's chord ringing on across the bar line (`tie`).
 */
function answerCell(rng: Rng, cell: Ev[], bar: Bar, style: RiffStyle, fresh: () => Ev[], canTie: boolean): { cell: Ev[]; tie: boolean } {
  const half = groupStarts(bar.groups)[Math.ceil(bar.groups.length / 2)] ?? Math.floor(bar.len / 2);
  const first = cell.filter((e) => e.pos < half).map((e) => ({ ...e, len: Math.min(e.len, half - e.pos) }));
  const kind = rng.weighted<'new' | 'hold' | 'tie'>(style === 'big'
    ? [['tie', canTie ? 3 : 0], ['new', 2], ['hold', 1]]
    : [['new', 3], ['hold', 2]]);
  if (kind === 'tie') return { cell: [], tie: true };
  if (kind === 'hold') {
    // single-note riffs hold the 5th or b7; the others let a power chord ring
    const held: Ev = style === 'single'
      ? { pos: half, len: bar.len - half, kind: 'note', deg: rng.pick([7, 10, 0, 12]), vel: 0.9 }
      : { pos: half, len: bar.len - half, kind: 'chord', deg: rng.pick([0, 0, 10, 5]), vel: 0.95 };
    return { cell: [...first, held], tie: false };
  }
  // new notes for the second half, in the same style
  const second = fresh().filter((e) => e.pos >= half);
  return { cell: [...first, ...(second.length ? second : [{ pos: half, len: bar.len - half, kind: 'chord' as const, deg: 0, vel: 0.92 }])], tie: false };
}

const ARP_PATTERNS = [
  [0, 0.6, 0.8, 1, 0.8, 0.6, 0.8, 1],
  [0, 0.8, 0.6, 1, 0.3, 0.8, 0.6, 1],
  [0, 0.4, 0.6, 0.8, 1, 0.8, 0.6, 0.4],
  [0, 1, 0.6, 1, 0.3, 1, 0.6, 1],
  [0, 0.6, 1, 0.6, 0.3, 0.6, 1, 0.8],
];

export function generateRiff(rng: Rng, song: Song, chords: ChordPart): RiffPart {
  const R = GENRES[song.genre].riff!;
  const t = song.tuning!;
  const sections = song.sections!;
  const { key, w, bars, total } = song;
  const { timeline, chordIdx } = chords;
  const scale = riffScale(rng, song.mode, w);
  const pedal = rng.chance(0.5);
  const chordAt = (g: number) => timeline[chordIdx[Math.min(g, total - 1)]].chord;

  // clean arpeggio voicings: open-position shapes ring nicely
  const arpV = sections.includes('arp') ? voicingsInTuning(key, timeline.map((e) => e.chord), t, { preferOpen: true }) : [];
  const arpPattern = rng.pick(ARP_PATTERNS);
  const arp16 = rng.chance(0.2 + w * 0.3);

  const hits: GuitarHit[] = [];

  const realize = (cell: Ev[], bar: Bar, style: RiffStyle) => {
    const out: GuitarHit[] = [];
    for (const e of cell) {
      const step = bar.start + Math.round(e.pos);
      // single-note riffs stay in position on the tonic; the harmony comes from power-chord hits below
      const rootPc = style === 'single' ? key : chordPc(key, chordAt(step));
      const base = { step, len: Math.max(1, Math.round(e.len)), vel: e.vel };
      if (e.kind === 'note') {
        out.push({ ...base, ...riffNote(lowestOf(rootPc, t) + e.deg, t), slide: e.slide });
      } else if (e.kind === 'palm') {
        const pc = e.pedal ? key : (rootPc + e.deg) % 12;
        const f = style === 'single' ? riffNote(lowestOf(pc, t), t) : powerChord(pc, t, false);
        out.push({ ...base, ...f, mute: 'palm' });
      } else if (e.kind === 'dead') {
        out.push({ ...base, ...powerChord(rootPc, t), mute: 'dead', vel: 0.7 });
      } else {
        out.push({ ...base, ...powerChord((rootPc + e.deg) % 12, t, true), slide: e.slide });
      }
    }
    // single-note riffs: when the chord isn't the tonic, hit it as a power chord where it starts
    if (style === 'single') {
      const starts = [bar.start, ...timeline.map((te) => te.step).filter((s) => s > bar.start && s < bar.start + bar.len)];
      for (const s of starts) {
        const pc = chordPc(key, chordAt(s));
        if (pc === key) continue;
        const f = powerChord(pc, t, true);
        const at = out.find((h) => h.step === s);
        if (at) Object.assign(at, f, { mute: undefined, slide: undefined, len: Math.max(at.len, 2), vel: 0.92 });
        else out.push({ step: s, len: 2, vel: 0.92, ...f });
        // give the chord room to ring
        for (let i = out.length - 1; i >= 0; i--) if (out[i].step > s && out[i].step < s + 2) out.splice(i, 1);
      }
      out.sort((a, b) => a.step - b.step);
    }
    // every chord change gets hit in chordal styles
    if (style !== 'single') {
      for (const te of timeline) {
        if (te.step <= bar.start || te.step >= bar.start + bar.len || out.some((h) => h.step === te.step)) continue;
        out.push({ step: te.step, len: 4, vel: 0.92, ...powerChord(chordPc(key, te.chord), t, true) });
      }
      out.sort((a, b) => a.step - b.step);
    }
    // a hit never rings past the next one
    out.forEach((h, i) => { if (out[i + 1]) h.len = Math.max(1, Math.min(h.len, out[i + 1].step - h.step)); });
    return out;
  };

  // the arpeggio carries on across the bar line while the chord does (a pattern can span two bars)
  let k = 0;
  const arpBar = (bar: Bar) => {
    const step = arp16 ? 1 : 2;
    for (let p = 0; p < bar.len; p += step) {
      const g = bar.start + p;
      const ti = chordIdx[g];
      if (timeline[ti].step === g) k = 0; // restart the pattern on a chord change
      const v = arpV[ti];
      const strings = v.frets.flatMap((f, s) => (f === null ? [] : [s]));
      const idx = Math.round(arpPattern[k % arpPattern.length] * (v.notes.length - 1));
      k++;
      if (k > 1 && rng.chance(0.08)) continue; // a little air
      hits.push({
        step: g, notes: [v.notes[idx]], strings: [strings[idx]], len: 8,
        vel: idx === 0 ? 0.66 : 0.52 + rng.next() * 0.1, clean: true, letRing: true,
      });
    }
  };

  // two sections of four bars; a repeated section style usually keeps its riff
  let prevStyle: RiffStyle | null = null;
  let cells: Record<string, Ev[]> = {};
  let motifs: Record<string, unknown> = {};
  const figureNotes = new Set<string>();
  const pairNotes = new Set<'answer' | 'tie'>();
  for (const run of [[0, 1, 2, 3], [4, 5, 6, 7]]) {
    const style = sections[run[0]];
    if (style !== prevStyle || rng.chance(0.25 + w * 0.4)) { cells = {}; motifs = {}; }
    if (FIGURE_STYLES.includes(style)) {
      // motif-built styles develop the riff over the whole run themselves
      const f = figureRun(rng, song, chords, R, style, run.map((bi) => bars[bi]), motifs);
      hits.push(...f.hits);
      figureNotes.add(f.note);
      prevStyle = style;
      continue;
    }
    // a two-bar riff (the second bar answers the first) or the same bar over and over
    const pairs = style !== 'arp' && rng.chance(0.55);
    const answers: Record<string, { cell: Ev[]; tie: boolean }> = {};
    for (const bi of run) {
      const bar = bars[bi];
      if (style === 'arp') { arpBar(bar); continue; }
      const make = () => (style === 'single' ? singleCell(rng, bar, scale, R, w) : style === 'chug' ? chugCell(rng, bar, R, w, pedal) : bigCell(rng, bar));
      const cell = cells[bar.meter] ??= make();
      const last = bi === run[run.length - 1];
      if (last && rng.chance(0.7)) { hits.push(...realize(turnaround(rng, cell, bar, style), bar, style)); continue; }
      if (pairs && (bi - run[0]) % 2 === 1) {
        // the answer is written once and comes back each time round; a tie needs the chord to carry on
        const carries = chordIdx[bar.start] === chordIdx[bar.start - 1];
        const ans = answers[bar.meter] ??= answerCell(rng, cell, bar, style, make, carries);
        if (ans.tie && carries) {
          const ring = hits.filter((h) => h.step < bar.start).reduce((m, h) => (h.step > (m?.step ?? -1) ? h : m), undefined as GuitarHit | undefined);
          if (ring && !ring.mute) { ring.len = bar.start + bar.len - ring.step; pairNotes.add('tie'); continue; }
        }
        if (!ans.tie) { hits.push(...realize(ans.cell, bar, style)); pairNotes.add('answer'); continue; }
      }
      hits.push(...realize(cell, bar, style));
    }
    prevStyle = style;
  }

  const accents = new Array<number>(total).fill(0);
  const sounding = new Array<boolean>(total).fill(false);
  const beatStarts = new Set(bars.flatMap((b) => groupStarts(b.groups).map((p) => b.start + p)));
  for (const h of hits) {
    if (h.clean) continue;
    const a = h.mute === 'palm' ? 0.3 : h.mute === 'dead' ? 0 : h.notes.length > 1 ? 1 : beatStarts.has(h.step) ? 0.5 : 0.2;
    accents[h.step] = Math.max(accents[h.step], a);
    for (let g = h.step; g < Math.min(total, h.step + h.len); g++) sounding[g] = true;
  }

  const [a, b] = [sections[0], sections[4]];
  const notes = [
    a === b
      ? `Guitar in ${t.name}: ${RIFF_STYLE_LABEL[a]} throughout`
      : `Guitar in ${t.name}: bars 1–4 ${RIFF_STYLE_LABEL[a]} → bars 5–8 ${RIFF_STYLE_LABEL[b]}`,
  ];
  notes.push(...figureNotes);
  if (pairNotes.has('tie')) notes.push('Two-bar riff: the chord rings on through the second bar');
  else if (pairNotes.has('answer')) notes.push('Two-bar riff: the second bar answers the first');
  if (hits.some((h) => h.slide)) notes.push('Slides into some riff notes');
  return { hits, accents, sounding, notes };
}
