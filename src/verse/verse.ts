// Verse melody writer, step 1: one verse (8 bars), built up one rule at a time.
// Rule 1: an 8th note on the 5th of the chord, all the way through.
// Pure and deterministic given the seed (nothing random yet; the seed is here for the next rules).

import { Rng } from '../rng';
import { QUALITIES, SCALES, degreeChord, type Chord, type Mode } from '../theory';

export const BARS = 8;
export const STEPS_PER_BAR = 8; // 8th notes, 4/4

export interface VerseInput {
  key: number; // pitch class of the tonic, 0-11
  mode: Mode;
  /** One chord per bar, 8 of them. */
  chords: Chord[];
  seed: string;
  /** MIDI note the tune sits around. */
  centre?: number;
}

export interface VerseNote {
  /** 8th-note step from the start of the verse (0-63). */
  step: number;
  /** In 8ths. */
  len: number;
  midi: number;
  /** Which bar's chord it's on. */
  bar: number;
}

export interface Verse {
  input: VerseInput;
  notes: VerseNote[];
}

/** Chord progressions as scale degrees (0 = I), by mode. */
export const PROGRESSIONS: Record<Mode, { name: string; degrees: number[] }[]> = {
  major: [
    { name: 'I V vi IV', degrees: [0, 4, 5, 3] },
    { name: 'vi IV I V', degrees: [5, 3, 0, 4] },
    { name: 'I vi IV V', degrees: [0, 5, 3, 4] },
    { name: 'I IV vi V', degrees: [0, 3, 5, 4] },
  ],
  minor: [
    { name: 'i VI III VII', degrees: [0, 5, 2, 6] },
    { name: 'i iv VII III', degrees: [0, 3, 6, 2] },
    { name: 'i VII VI VII', degrees: [0, 6, 5, 6] },
    { name: 'i III VII iv', degrees: [0, 2, 6, 3] },
  ],
  dorian: [{ name: 'i IV i VII', degrees: [0, 3, 0, 6] }, { name: 'i ii IV i', degrees: [0, 1, 3, 0] }],
  mixolydian: [{ name: 'I bVII IV I', degrees: [0, 6, 3, 0] }, { name: 'I IV bVII IV', degrees: [0, 3, 6, 3] }],
  phrygian: [{ name: 'i bII i bVII', degrees: [0, 1, 0, 6] }],
  lydian: [{ name: 'I II I V', degrees: [0, 1, 0, 4] }],
};

/** 8 bars of chords from a progression: each chord held `barsEach` bars, the progression looped to fill. */
export function chordsFor(mode: Mode, degrees: number[], barsEach: number): Chord[] {
  const scale = SCALES[mode];
  const out: Chord[] = [];
  for (let b = 0; b < BARS; b++) out.push(degreeChord(scale, degrees[Math.floor(b / barsEach) % degrees.length]));
  return out;
}

/** Semitones of the chord's 5th above its root (7, or 6 / 8 for dim / aug). */
function fifth(c: Chord): number {
  const iv = QUALITIES[c.q] as readonly number[];
  return iv.find((i) => i === 6 || i === 7 || i === 8) ?? 7;
}

/** Semitones of the chord's 3rd above its root (3 or 4; the 2nd or 4th of a sus chord; the 5th of a bare power chord). */
function third(c: Chord): number {
  const iv = QUALITIES[c.q] as readonly number[];
  return iv.find((i) => i === 3 || i === 4) ?? iv.find((i) => i === 2 || i === 5) ?? 7;
}

/** Which chord note a step sits on. */
export type ChordNote = 'root' | 'third' | 'fifth';

/** The pitch class (0-11) of that chord note. */
function pitchClass(key: number, c: Chord, tone: ChordNote): number {
  return (key + c.root + (tone === 'root' ? 0 : tone === 'third' ? third(c) : fifth(c))) % 12;
}

/** The pitch class nearest to `centre`. */
function nearest(pc: number, centre: number): number {
  let m = Math.round((centre - pc) / 12) * 12 + pc;
  if (m > centre + 6) m -= 12;
  if (m < centre - 6) m += 12;
  return m;
}

export function writeVerse(input: VerseInput): Verse {
  new Rng(input.seed); // reserved for the rules to come
  const centre = input.centre ?? 67;
  const notes: VerseNote[] = [];
  for (let bar = 0; bar < BARS; bar++) {
    const c = input.chords[bar];
    const midi = nearest((input.key + c.root + fifth(c)) % 12, centre);
    for (let s = 0; s < STEPS_PER_BAR; s++) notes.push({ step: bar * STEPS_PER_BAR + s, len: 1, midi, bar });
  }
  return { input, notes };
}

/** A verse note on the band's own grid: `step` in 16ths from the start of the idea, `len` in 16ths. */
export interface BandNote { step: number; len: number; midi: number; /** A neighbour note, one scale step off the bar's core note. */ nb?: boolean; /** One of the stepping notes that walk into the next bar's core note. */ walk?: boolean; /** The core note a walk arrives on. */ land?: boolean; /** One of the three notes of a third-bar shape (fractional step and length). */ third?: boolean; /** A phrase's held ending. */ end?: boolean }

/**
 * Rule 1 over a generated song: an 8th note on the 5th (or, by rule 4, the 3rd) of whatever chord the band is playing.
 * `chordAt[s]`: the chord sounding on 16th step s (the idea's chord timeline, spread per step).
 */
export function verseOverBand(key: number, chordAt: Chord[], tones: ChordNote[] = [], centre = 67): BandNote[] {
  const notes: BandNote[] = [];
  for (let s = 0; s < chordAt.length; s += 2) {
    const c = chordAt[s];
    notes.push({ step: s, len: 2, midi: nearest(pitchClass(key, c, tones[s] ?? 'fifth'), centre) });
  }
  return notes;
}

/** A stretch of the verse: `step` and `len` in 16ths. */
export interface Gap { step: number; len: number }

const overlaps = (a: Gap, b: Gap) => a.step < b.step + b.len && b.step < a.step + a.len;

/**
 * Which quarter of the bar a step is in (0-3). The tendency running through the rules below: more notes in the 1st and 3rd
 * quarters (0, 2: "strong"), longer notes or silence in the 2nd and 4th (1, 3: "weak"). Always a lean, never a rule: each
 * rule that makes a random choice weights it, so a verse can still break it.
 */
export const quarterOf = (step: number, bar: number) => Math.floor((((step % bar) + bar) % bar) / (bar / 4) + 1e-9);
const isStrong = (step: number, bar: number) => quarterOf(step, bar) % 2 === 0;

/**
 * How much the band hits on each 16th step (0-1): a kick, a snare, a chord change, a strum, a bass note. One more factor the
 * rules below weigh (a nudge of a quarter either way, never more): notes lean toward the band's hits, and long notes and
 * new phrases toward its chord changes. Left out, every step counts the same.
 */
export function bandAccents(total: number, band: { kick?: number[]; snare?: number[]; strum?: string[]; bass?: number[]; changes?: number[] }): number[] {
  const acc = new Array<number>(total).fill(0);
  const STRUM: Record<string, number> = { D: 0.25, p: 0.2, U: 0.12, x: 0.1 };
  for (let s = 0; s < total; s++) {
    acc[s] = Math.min(1, ((band.kick?.[s] ?? 0) > 0 ? 0.5 : 0) + ((band.snare?.[s] ?? 0) > 0 ? 0.45 : 0) + (STRUM[band.strum?.[s] ?? '.'] ?? 0) + ((band.bass?.[s] ?? 0) > 0 ? 0.15 : 0));
  }
  for (const c of band.changes ?? []) if (c >= 0 && c < total) acc[c] = Math.min(1, acc[c] + 0.5);
  return acc;
}
/** A step's accent (0.5 when the band's rhythm isn't known); a fractional step takes the one before it. */
const accAt = (acc: number[] | undefined, step: number) => acc?.[Math.max(0, Math.floor(step + 1e-6))] ?? 0.5;
/** The nudge: 0.75 on a step the band leaves alone, up to 1.25 on its biggest hits. */
const nudge = (acc: number[] | undefined, step: number) => 0.75 + 0.5 * accAt(acc, step);

/**
 * Rule 2/7: the phrase system. The verse is cut into phrases of 1 to 4 bars; after each there is a break of at least a
 * quarter bar (a bar's quarter most often; a half, three quarters, or a whole bar less and less often).
 * A phrase starts on a beat, right after the break before it. What is left at the end if under a bar is silence.
 * `bar`: 16ths in a bar. Returns the phrases and the breaks between them.
 */
export function planPhrases(totalSteps: number, bar: number, seed: string, acc?: number[]): { phrases: Gap[]; breaks: Gap[] } {
  const rng = new Rng(seed + '|phrases');
  const beat = bar / 4;
  const phrases: Gap[] = [];
  const breaks: Gap[] = [];
  let pos = 0;
  while (pos < totalSteps) {
    const r = rng.next();
    const len = Math.min(Math.round(bar * (r < 0.15 ? 1 : r < 0.5 ? 2 : r < 0.75 ? 3 : 4)), totalSteps - pos);
    phrases.push({ step: pos, len });
    pos += len;
    if (pos >= totalSteps) break;
    const b = rng.next();
    let gap = Math.round(beat * (b < 0.5 ? 1 : b < 0.8 ? 2 : b < 0.92 ? 3 : 4));
    // (the lean: the next phrase mostly comes in on the 1st or 3rd quarter; so the break mostly covers the 2nd or 4th)
    // (and the band's: a chord change or a big hit counts as a good place to come in too)
    const good = isStrong(pos + gap, bar) || accAt(acc, pos + gap) >= 0.6;
    if (!good && rng.chance(0.6)) gap = gap + beat <= bar ? gap + beat : gap - beat;
    const rest = totalSteps - pos;
    // (under a bar left for another phrase: the rest of the verse is the break)
    if (rest - gap < bar) { breaks.push({ step: pos, len: rest }); break; }
    breaks.push({ step: pos, len: gap });
    pos += gap;
  }
  return { phrases, breaks };
}

/** The line without the notes that start inside a gap. */
export function withGaps(notes: BandNote[], gaps: Gap[]): BandNote[] {
  return notes.filter((n) => !gaps.some((g) => n.step >= g.step && n.step < g.step + g.len));
}

/**
 * Rule 3: stretches of 16th notes, an eighth of a bar, a quarter or a half, at random, in the open spaces between the breaks.
 * The higher the verse's energy (1-5), the fewer.
 */
export function randomRuns(totalSteps: number, bar: number, energy: number, gaps: Gap[], seed: string, acc?: number[]): Gap[] {
  const rng = new Rng(seed + '|runs');
  const runs: Gap[] = [];
  const p = Math.max(0.05, (6 - energy) / 6); // energy 1: 83%, 3: 50%, 5: 17% (of 4 tries every 4 bars)
  const block = bar * 4;
  for (let from = 0; from < totalSteps; from += block) {
    const to = Math.min(totalSteps, from + block);
    for (let k = 0; k < 4; k++) {
      if (!rng.chance(p)) continue;
      const r = rng.next();
      const len = Math.max(2, Math.round(r < 0.5 ? bar / 8 : r < 0.85 ? bar / 4 : bar / 2));
      for (let tries = 0; tries < 20; tries++) {
        const step = from + rng.int(0, Math.floor((to - from) / len) - 1) * len;
        const run = { step, len };
        if (step + len > to || gaps.some((g) => overlaps(g, run)) || runs.some((o) => overlaps(o, run))) continue;
        // (the lean: runs mostly start on the 1st or 3rd quarter)
        // (and on the band's hits)
        if (!rng.chance((isStrong(step, bar) ? 1 : 0.3) * Math.min(1, nudge(acc, step)))) continue;
        runs.push(run);
        break;
      }
    }
  }
  return runs.sort((a, b) => a.step - b.step);
}

/** The 8th notes inside each run swapped for 16ths on the 5th of the chord at each step. */
export function withRuns(notes: BandNote[], runs: Gap[], key: number, chordAt: Chord[], tones: ChordNote[] = [], centre = 67): BandNote[] {
  const inRun = (s: number) => runs.some((r) => s >= r.step && s < r.step + r.len);
  const out = notes.filter((n) => !inRun(n.step));
  for (const r of runs) {
    for (let s = r.step; s < r.step + r.len && s < chordAt.length; s++) {
      const c = chordAt[s];
      out.push({ step: s, len: 1, midi: nearest(pitchClass(key, c, tones[s] ?? 'fifth'), centre) });
    }
  }
  return out.sort((a, b) => a.step - b.step);
}

/** What a bar does: sits on the root (1), 3rd or 5th, or moves from one to another part way through ("3→5"). */
export type BarTone = string;

const NAMES: Record<ChordNote, string> = { root: '1', third: '3', fifth: '5' };
const NOTES: ChordNote[] = ['root', 'third', 'fifth'];

/**
 * Rule 4: each bar picks the root, 3rd or 5th to sit on, and now and then (3 bars in 10) moves from one chord note to
 * another part way through, at the half bar or the third beat.
 * Returns the chord note for every 16th step, and each bar's choice.
 */
export function randomTones(totalSteps: number, bar: number, seed: string, acc?: number[]): { tones: ChordNote[]; bars: BarTone[] } {
  const rng = new Rng(seed + '|tones');
  const tones: ChordNote[] = [];
  const bars: BarTone[] = [];
  for (let from = 0; from < totalSteps; from += bar) {
    const first = rng.pick(NOTES);
    const moves = rng.chance(0.3);
    const then = moves ? rng.pick(NOTES.filter((n) => n !== first)) : first;
    bars.push(moves ? `${NAMES[first]}→${NAMES[then]}` : NAMES[first]);
    // (the move comes at the half bar or the third beat: a bit more often where the band hits harder)
    const half = 0.65 * nudge(acc, from + bar / 2), late = 0.35 * nudge(acc, from + (bar * 3) / 4);
    const at = from + Math.round(rng.chance(half / (half + late)) ? bar / 2 : (bar * 3) / 4);
    for (let s = from; s < Math.min(totalSteps, from + bar); s++) tones.push(s < at ? first : then);
  }
  return { tones, bars };
}

/**
 * Rule 5: longer notes. About 4 bars in 10 hold one note for a beat, a beat and a half, two beats or a whole bar,
 * starting on a beat, only where the line is plain 8ths on one chord note over one chord.
 */
export function randomHolds(totalSteps: number, bar: number, gaps: Gap[], runs: Gap[], tones: ChordNote[], chordAt: Chord[], seed: string, acc?: number[]): Gap[] {
  const rng = new Rng(seed + '|holds');
  const holds: Gap[] = [];
  const beat = bar / 4;
  for (let from = 0; from < totalSteps; from += bar) {
    if (!rng.chance(0.4)) continue;
    // (a few tries for a clear spot: gaps and runs take up much of a bar)
    for (let tries = 0; tries < 6; tries++) {
      const r = rng.next();
      const len = Math.round(beat * (r < 0.4 ? 1 : r < 0.6 ? 1.5 : r < 0.9 ? 2 : 4));
      // (the lean: long notes mostly start on the 2nd or 4th quarter)
      // (and toward the band's chord changes and hits)
      const w = [1, 2.1, 1, 1.9].map((x, k) => x * nudge(acc, from + k * beat));
      let q = rng.next() * (w[0] + w[1] + w[2] + w[3]), k0 = 0;
      while (k0 < 3 && q >= w[k0]) q -= w[k0++];
      const step = from + Math.round(k0 * beat);
      const span = { step, len };
      if (step + len > Math.min(totalSteps, from + bar)) continue;
      if (gaps.some((g) => overlaps(g, span)) || runs.some((o) => overlaps(o, span))) continue;
      let same = true;
      for (let k = step; k < step + len; k++) {
        if (tones[k] !== tones[step] || chordAt[k].root !== chordAt[step].root || chordAt[k].q !== chordAt[step].q) same = false;
      }
      if (same) { holds.push(span); break; }
    }
  }
  return holds;
}

/** Each hold's 8th notes joined into one long note. */
export function withHolds(notes: BandNote[], holds: Gap[]): BandNote[] {
  const out: BandNote[] = [];
  for (const n of notes) {
    const h = holds.find((x) => n.step >= x.step && n.step < x.step + x.len);
    if (!h) out.push(n);
    else if (n.step === h.step) out.push({ ...n, len: h.len });
  }
  return out;
}

/** The pitch range (MIDI): the line lives between `lo` and `hi`, and may stray out to `xlo` / `xhi` but no further. */
export interface Range { lo: number; hi: number; xlo: number; xhi: number }
export const DEFAULT_RANGE: Range = { lo: 58, hi: 76, xlo: 53, xhi: 81 };

/**
 * Rule 6: smooth steps. Each note takes the octave nearest the one before, so the line moves by the smallest jump.
 * Notes in the extended zone (past the top or bottom, up to the extended limits) cost 4 semitones extra, so the line
 * only strays there when it saves a real leap.
 */
export function voiceLead(notes: BandNote[], r: Range = DEFAULT_RANGE): BandNote[] {
  let prev = Math.round((r.lo + r.hi) / 2);
  return notes.map((n) => {
    const pc = ((n.midi % 12) + 12) % 12;
    let best = Math.round((prev - pc) / 12) * 12 + pc, score = Infinity;
    for (let m = pc + 12 * Math.ceil((r.xlo - pc) / 12); m <= r.xhi; m += 12) {
      const sc = Math.abs(m - prev) + (m < r.lo || m > r.hi ? 4 : 0);
      if (sc < score) { best = m; score = sc; }
    }
    prev = best;
    return { ...n, midi: best };
  });
}

/** Any note the later rules pushed past the extended limits goes back in by an octave. */
export function foldIntoRange(notes: BandNote[], r: Range = DEFAULT_RANGE): BandNote[] {
  return notes.map((n) => {
    let m = n.midi;
    while (m > r.xhi) m -= 12;
    while (m < r.xlo) m += 12;
    return m === n.midi ? n : { ...n, midi: m };
  });
}

/**
 * Rule 8: neighbour notes. Each bar has its core note (the chord note it sits on); a note that follows a core note in the
 * same bar now and then (3 in 10) goes one scale step up or down from it, and the next note is back on the core.
 * Only 8ths and 16ths; the first note of a bar stays on the core.
 */
export function addNeighbours(notes: BandNote[], key: number, mode: Mode, bar: number, seed: string): BandNote[] {
  const rng = new Rng(seed + '|neighbours');
  const scale = new Set(SCALES[mode].map((i) => (key + i) % 12));
  const out: BandNote[] = [];
  for (const n of notes) {
    const prev = out[out.length - 1];
    const sameBar = prev && Math.floor(prev.step / bar) === Math.floor(n.step / bar);
    if (sameBar && !prev.nb && n.len <= 2 && rng.chance(0.3)) {
      const dir = rng.chance(0.5) ? 1 : -1;
      const k = [1, 2].find((x) => scale.has((((n.midi + dir * x) % 12) + 12) % 12));
      if (k) { out.push({ ...n, midi: n.midi + dir * k, nb: true }); continue; }
    }
    out.push(n);
  }
  return out;
}

/**
 * Rule 9: walking into the next bar. Inside a phrase, where the next bar's core note is a different note, the last
 * 1 or 2 8ths of the bar (8 times in 10) step along the scale toward it, from the side the line is coming from, so the
 * next core lands on the downbeat: C C C D E | F. The walk makes room: a long note is trimmed to end before it and
 * anything else in those two slots (16ths, a break, a neighbour note) is replaced.
 * If the cores are further apart than the walk covers, the line leaps first, then walks in.
 */
export function walkToNext(notes: BandNote[], phrases: Gap[], key: number, mode: Mode, bar: number, seed: string): BandNote[] {
  const rng = new Rng(seed + '|walk');
  const scale = new Set(SCALES[mode].map((i) => (key + i) % 12));
  const ladder: number[] = [];
  for (let m = 24; m <= 108; m++) if (scale.has(m % 12)) ladder.push(m);
  const nearest = (m: number) => ladder.reduce((best, x, i) => (Math.abs(x - m) < Math.abs(ladder[best] - m) ? i : best), 0);
  let out = notes.map((n) => ({ ...n }));
  const total = Math.max(0, ...out.map((n) => n.step + n.len));
  for (let B = bar; B < total; B += bar) {
    if (!phrases.some((p) => p.step < B && B < p.step + p.len)) continue;
    const next = out.find((n) => n.step === B);
    const core = [...out].reverse().find((n) => n.step < B && n.step >= B - bar && !n.nb && !n.walk);
    if (!next || !core || next.midi === core.midi) continue;
    const dir = next.midi > core.midi ? 1 : -1;
    const iNext = nearest(next.midi), d = Math.abs(iNext - nearest(core.midi));
    const m = Math.min(rng.int(1, 2), d - 1);
    if (!rng.chance(0.8) || m < 1) continue;
    const from = B - 2 * m;
    const phrase = phrases.find((p) => p.step < B && B < p.step + p.len)!;
    if (from < phrase.step) continue;
    // (make room: trim a long note that runs into the walk, drop what starts inside it)
    out = out
      .filter((n) => !(n.step >= from && n.step < B))
      .map((n) => (n.step < from && n.step + n.len > from ? { ...n, len: from - n.step } : n));
    for (let j = m; j >= 1; j--) out.push({ step: B - 2 * j, len: 2, midi: ladder[iNext - dir * j], walk: true });
    next.land = true;
    out.sort((a, b) => a.step - b.step);
  }
  return out;
}

/**
 * Rule 7: small breaks inside a phrase, an 8th or a 16th long: now and then a note drops out (8th: 4% on the 1st and 3rd
 * quarter, 16% on the 2nd and 4th; 16th: 5% and 20%).
 * The first and last note of each phrase always stay.
 */
export function smallBreaks(notes: BandNote[], phrases: Gap[], bar: number, seed: string, acc?: number[]): BandNote[] {
  const rng = new Rng(seed + '|small');
  const out: BandNote[] = [];
  for (const ph of phrases) {
    const inside = notes.filter((n) => n.step >= ph.step && n.step < ph.step + ph.len);
    inside.forEach((n, i) => {
      // (the note a walk arrives on stays too)
      const edge = i === 0 || i === inside.length - 1 || inside[i - 1].walk;
      // (the lean: a note drops out about four times as often in the 2nd or 4th quarter)
      // (and a note on a band hit stays more often: half as likely to drop on the biggest hits, one and a half times on quiet steps)
      const drop = (n.len === 1 ? 0.1 : 0.08) * (isStrong(n.step, bar) ? 0.5 : 2) * (1.5 - accAt(acc, n.step));
      if (!edge && !n.walk && n.len <= 2 && rng.chance(drop)) return;
      out.push(n);
    });
  }
  return out;
}

export const MAX_SAME = 4;

/** What kind of element a note is: a 16th, an 8th, or a long note. */
const kind = (n: BandNote) => (n.len <= 1 ? 'sixteenth' : n.len === 2 ? 'eighth' : 'long');

/**
 * Rule 7: never more than `MAX_SAME` of the same kind of note back to back with nothing between them.
 * The one that would be the fifth drops out, leaving a break of its own length (an 8th or a 16th).
 * Stepping notes and the note they arrive on (rule 9) are never the one dropped: the nearest other note before them in the run goes instead.
 */
export function limitSame(notes: BandNote[], max = MAX_SAME): BandNote[] {
  const out: BandNote[] = [];
  const joined = (a: BandNote, b: BandNote) => b.step === a.step + a.len && kind(a) === kind(b);
  const trailing = () => {
    let c = out.length ? 1 : 0;
    for (let i = out.length - 1; i > 0 && joined(out[i - 1], out[i]); i--) c++;
    return c;
  };
  for (const n of notes) {
    const last = out[out.length - 1];
    if (last && joined(last, n) && trailing() >= max) {
      if (!n.walk && !n.land) continue;
      let i = out.length - 1;
      while (i >= 0 && (out[i].walk || out[i].land)) i--;
      if (i >= out.length - trailing()) out.splice(i, 1);
    }
    out.push(n);
  }
  return out;
}

/**
 * Rule 11: held phrase endings. Not every phrase: the verse draws its own chance (35-85%) and each phrase rolls it. A phrase
 * that ends this way finishes on one long note, on the core note of its last bar, held for a beat, a beat and a half, two or
 * three beats, or the whole bar (its length drawn each time; at least a beat of the phrase is left before it).
 */
export function phraseEndings(notes: BandNote[], phrases: Gap[], bar: number, seed: string): BandNote[] {
  const rng = new Rng(seed + '|endings');
  const chance = 0.35 + rng.next() * 0.5;
  const beat = bar / 4;
  let out = notes;
  for (const ph of phrases) {
    const end = ph.step + ph.len;
    const r = rng.next();
    const len = Math.round(beat * (r < 0.3 ? 1 : r < 0.5 ? 1.5 : r < 0.75 ? 2 : r < 0.9 ? 3 : 4));
    if (!rng.chance(chance) || len > ph.len - beat) continue;
    const from = end - len;
    const inside = out.filter((n) => n.step >= ph.step && n.step < end);
    const core = [...inside].reverse().find((n) => n.step < from && !n.nb && !n.walk) ?? inside.find((n) => n.step < from) ?? inside[0];
    if (!core) continue;
    out = [
      ...out.filter((n) => n.step < from || n.step >= end).map((n) => (n.step < from && n.step + n.len > from ? { ...n, len: from - n.step } : n)),
      { step: from, len, midi: core.midi, end: true },
    ].sort((a, b) => a.step - b.step);
  }
  return out;
}

/**
 * Rule 10: the third-bar shape. About 15 bars in 100 (inside a phrase, with no walk at their end) are three equal notes of a
 * third of a bar each, on the bar's core note: three even notes across the bar, like a triplet of half notes.
 * They sit between the usual steps, so steps and lengths are fractions (5⅓ sixteenths in 4/4).
 * Done last, so nothing else has to know about them.
 */
export function thirdBars(notes: BandNote[], phrases: Gap[], bar: number, seed: string): BandNote[] {
  const rng = new Rng(seed + '|thirds');
  const total = Math.max(0, ...notes.map((n) => n.step + n.len));
  let out = notes;
  for (let b0 = 0; b0 + bar <= total; b0 += bar) {
    if (!phrases.some((p) => p.step <= b0 && b0 + bar <= p.step + p.len)) continue;
    const inside = out.filter((n) => n.step >= b0 && n.step < b0 + bar);
    if (!inside.length || inside.some((n) => n.walk || n.end) || !rng.chance(0.15)) continue;
    const core = inside.find((n) => !n.nb) ?? inside[0];
    out = [
      ...out.filter((n) => n.step < b0 || n.step >= b0 + bar),
      ...[0, 1, 2].map((k) => ({ step: b0 + (k * bar) / 3, len: bar / 3, midi: core.midi, third: true })),
    ].sort((a, b) => a.step - b.step);
  }
  return out;
}
