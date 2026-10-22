// Verse melody writer, step 1: one verse (8 bars), built up one rule at a time.
// Rule 1: an 8th note on the 5th of the chord, all the way through.
// Pure and deterministic given the seed (nothing random yet; the seed is here for the next rules).

import { Rng } from '../rng';
import { QUALITIES, SCALES, degreeChord, type Chord, type Mode } from '../theory';
import { END_STYLES, VERSE, cumulative, energyEdge, type Dials, type EndStyle } from './profile';
import { gridOf, type BarArg } from './grid';

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
export function fifth(c: Chord): number {
  const iv = QUALITIES[c.q] as readonly number[];
  return iv.find((i) => i === 6 || i === 7 || i === 8) ?? 7;
}

/** Semitones of the chord's 3rd above its root (3 or 4; the 2nd or 4th of a sus chord; the 5th of a bare power chord). */
export function third(c: Chord): number {
  const iv = QUALITIES[c.q] as readonly number[];
  return iv.find((i) => i === 3 || i === 4) ?? iv.find((i) => i === 2 || i === 5) ?? 7;
}

/** Which chord note a step sits on. */
export type ChordNote = 'root' | 'third' | 'fifth';

/** The pitch class (0-11) of that chord note. */
function pitchClass(key: number, c: Chord, tone: ChordNote): number {
  return (key + c.root + (tone === 'root' ? 0 : tone === 'third' ? third(c) : fifth(c))) % 12;
}

/** The key's pentatonic scale as pitch classes: the major pentatonic (1 2 3 5 6) for a mode with a major 3rd, else the minor (1 b3 4 5 b7). */
export function pentatonic(key: number, mode: Mode): Set<number> {
  const major = SCALES[mode][2] === 4;
  return new Set((major ? [0, 2, 4, 7, 9] : [0, 3, 5, 7, 10]).map((i) => (key + i) % 12));
}

/**
 * The pitch class of a chord note; with a pentatonic, one inside it: the chord's other notes (the 5th, 3rd, root, nearest in that
 * order of the one asked for) if one is in the scale, else the nearest pentatonic note (a semitone down before a semitone up).
 */
function pickPc(key: number, c: Chord, tone: ChordNote, pent?: ReadonlySet<number>): number {
  const pc = pitchClass(key, c, tone);
  if (!pent || pent.has(pc)) return pc;
  const order: ChordNote[] = tone === 'root' ? ['fifth', 'third'] : tone === 'third' ? ['fifth', 'root'] : ['third', 'root'];
  for (const t of order) { const q = pitchClass(key, c, t); if (pent.has(q)) return q; }
  for (const k of [1, 2, 3]) for (const sgn of [-1, 1]) { const q = (((pc + sgn * k) % 12) + 12) % 12; if (pent.has(q)) return q; }
  return pc;
}

/** What the core-note draws are checked against: the section's own key and mode, and the chord sounding on each step. */
export interface KeyFit { key: number; mode: Mode; chordAt: Chord[] }

/** The chord notes (of those asked about) that are in the key's scale on every step from `from` to `to`. */
function inKeyTones(fit: KeyFit, from: number, to: number, among: readonly ChordNote[]): ChordNote[] {
  const scale = new Set(SCALES[fit.mode].map((i) => (fit.key + i) % 12));
  return among.filter((t) => {
    for (let s = from; s < to; s++) {
      const c = fit.chordAt[s];
      if (c && !scale.has(pitchClass(fit.key, c, t))) return false;
    }
    return true;
  });
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
export interface BandNote { step: number; len: number; midi: number; /** A neighbour note, one scale step off the bar's core note. */ nb?: boolean; /** One of the stepping notes that walk into the next bar's core note. */ walk?: boolean; /** The core note a walk arrives on. */ land?: boolean; /** One of the three notes of a third-bar shape (fractional step and length). */ third?: boolean; /** A phrase's held ending. */ end?: boolean; /** Sung with a bend: a scoop up into the note from this many semitones below (never from above)... */ slide?: number; /** ...or a fall off its end in volume: it dies away over its last half, by this many dB (the pitch stays). */ fadeBy?: number; /** Why it bends (for the card). */ bend?: string; /** A bend inside the note: it holds, then glides to this pitch (`bendAt` steps in, over `bendLen` steps) and holds that. */ bendTo?: number; bendAt?: number; bendLen?: number; /** Why it bends inside (for the card). */ inner?: string; /** The long note a phrase opens on (rule 19). */ opener?: boolean; /** The held note a section leads into the next on (rule 23): sung strongly, no fall. */ lead?: boolean; /** How the phrase ended on this note. */ style?: EndStyle; /** A long hold (rule 28): a note of 1 to 2 bars. */ longHold?: boolean; /** Further pitch moves inside a long hold, after the first (`bendTo`...): each glides (over `len` steps, `at` steps in) to a new pitch. */ more?: { at: number; to: number; len: number }[]; /** Mood notes (docs/VOCAL-EMOTION.md): a colour note (its name: 7, b6, #4, b2, 6)... */ colour?: string; /** ...a phrase end set to a degree by its role (home, open, hang)... */ endRole?: string; endDeg?: string; /** ...a surprise (what). */ surprise?: string }

/**
 * Rule 1 over a generated song: an 8th note on the 5th (or, by rule 4, the 3rd) of whatever chord the band is playing.
 * `chordAt[s]`: the chord sounding on 16th step s (the idea's chord timeline, spread per step).
 */
export function verseOverBand(key: number, chordAt: Chord[], tones: ChordNote[] = [], centre = 67, pent?: ReadonlySet<number>): BandNote[] {
  const notes: BandNote[] = [];
  for (let s = 0; s < chordAt.length; s += 2) {
    const c = chordAt[s];
    notes.push({ step: s, len: 2, midi: nearest(pickPc(key, c, tones[s] ?? 'fifth', pent), centre) });
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
export const quarterOf = (step: number, bar: BarArg) => gridOf(bar).quarterOf(step);
/** A strong place: the lean's 1st and 3rd beat (a beat group of the real bar; see grid.ts). */
const isStrong = (step: number, bar: BarArg) => gridOf(bar).isStrong(step);

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
 * A random number (0-1) for one place in the line, drawn from the seed and the step alone (not from a running stream), so a
 * leaf that repeats another one's seed makes the same choice at the same step even where the notes before it differ.
 */
export const roll = (seed: string, tag: string, step: number) => new Rng(`${seed}|${tag}|${Math.round(step * 100)}`).next();

/**
 * Rule 2/7: the phrase system. The verse is cut into phrases of 1 to 4 bars; after each there is a break of at least a
 * quarter bar (a bar's quarter most often; a half, three quarters, or a whole bar less and less often).
 * A phrase starts on a beat, right after the break before it. What is left at the end if under a bar is silence.
 * `bar`: 16ths in a bar. Returns the phrases and the breaks between them.
 */
export function planPhrases(totalSteps: number, barArg: BarArg, seed: string, acc?: number[], d: Dials = VERSE): { phrases: Gap[]; breaks: Gap[] } {
  const rng = new Rng(seed + '|phrases');
  const G = gridOf(barArg), bar = G.bar;
  const beat = G.beat;
  const phrases: Gap[] = [];
  const breaks: Gap[] = [];
  let pos = 0;
  while (pos < totalSteps) {
    // (whole bars on: the phrase ends at the same place in a bar as it began, whatever the bars' lengths)
    const len = Math.min(G.span(pos, cumulative(d.phraseLen, rng.next()) + 1), totalSteps - pos);
    phrases.push({ step: pos, len });
    pos += len;
    if (pos >= totalSteps) break;
    // (a break of that many beats, then on to the beat nearest: the next phrase comes in on a beat of the real bar, not a half step
    // off it in 7/8, 5/8, 9/8... or off the beat groups)
    const snap = (g: number) => G.snapBeat(pos + Math.round(g), pos) - pos;
    let gap = snap(beat * (cumulative(d.breakBeats, rng.next()) + 1));
    // (the lean: the next phrase mostly comes in on the 1st or 3rd quarter; so the break mostly covers the 2nd or 4th)
    // (and the band's: a chord change or a big hit counts as a good place to come in too)
    const good = G.isStrong(pos + gap) || accAt(acc, pos + gap) >= 0.6;
    if (!good && rng.chance(0.6)) gap = snap(gap + beat <= bar ? gap + beat : gap - beat);
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
 * Most at the middle energy (3), fewer toward both ends (1 and 5).
 */
export function randomRuns(totalSteps: number, barArg: BarArg, energy: number, gaps: Gap[], seed: string, acc?: number[], d: Dials = VERSE): Gap[] {
  const rng = new Rng(seed + '|runs');
  const G = gridOf(barArg), bar = G.bar;
  const runs: Gap[] = [];
  const p = Math.min(1, Math.max(0.05, 0.5 - 0.33 * energyEdge(energy)) * d.runs); // energy 3: 50%, 2 and 4: 33%, 1 and 5: 17% (of 4 tries every 4 bars)
  // (blocks of 4 bars, from bar line to bar line)
  for (let b = 0, from = 0; from < totalSteps; b += 4, from = G.start(b)) {
    const to = Math.min(totalSteps, G.start(b + 4));
    for (let k = 0; k < 4; k++) {
      if (!rng.chance(p)) continue;
      const len = Math.max(2, Math.round(bar / [8, 4, 2][cumulative(d.runLen, rng.next())]));
      for (let tries = 0; tries < 20; tries++) {
        const step = from + rng.int(0, Math.floor((to - from) / len) - 1) * len;
        const run = { step, len };
        if (step + len > to || gaps.some((g) => overlaps(g, run)) || runs.some((o) => overlaps(o, run))) continue;
        // (the lean: runs mostly start on the 1st or 3rd quarter)
        // (and on the band's hits)
        if (!rng.chance((G.isStrong(step) ? 1 : 0.3) * Math.min(1, nudge(acc, step)))) continue;
        runs.push(run);
        break;
      }
    }
  }
  return runs.sort((a, b) => a.step - b.step);
}

/** The 8th notes inside each run swapped for 16ths on the 5th of the chord at each step. */
export function withRuns(notes: BandNote[], runs: Gap[], key: number, chordAt: Chord[], tones: ChordNote[] = [], centre = 67, pent?: ReadonlySet<number>): BandNote[] {
  const inRun = (s: number) => runs.some((r) => s >= r.step && s < r.step + r.len);
  const out = notes.filter((n) => !inRun(n.step));
  for (const r of runs) {
    for (let s = r.step; s < r.step + r.len && s < chordAt.length; s++) {
      const c = chordAt[s];
      out.push({ step: s, len: 1, midi: nearest(pickPc(key, c, tones[s] ?? 'fifth', pent), centre) });
    }
  }
  return out.sort((a, b) => a.step - b.step);
}

/** What a bar does: sits on the root (1), 3rd or 5th, or moves from one to another part way through ("3→5"). */
export type BarTone = string;

const NAMES: Record<ChordNote, string> = { root: '1', third: '3', fifth: '5' };
const NOTES: ChordNote[] = ['root', 'third', 'fifth'];

/** Times the weight of a chord note at a step: the mood notes' lean on which chord note a bar or a phrase sits on (docs/VOCAL-EMOTION.md). */
export type ToneBias = (step: number, tone: ChordNote) => number;

/**
 * Rule 4: each bar picks the root, 3rd or 5th to sit on, and now and then (3 bars in 10) moves from one chord note to
 * another part way through, at the half bar or the third beat.
 * Returns the chord note for every 16th step, and each bar's choice.
 */
export function randomTones(totalSteps: number, barArg: BarArg, seed: string, acc?: number[], d: Dials = VERSE, whole?: { from: number; total: number }, fit?: KeyFit, bias?: ToneBias): { tones: ChordNote[]; bars: BarTone[] } {
  const rng = new Rng(seed + '|tones');
  const G = gridOf(barArg), bar = G.bar;
  // (the key check draws on its own dice, so a draw that was already in the key stays as it was)
  const rk = new Rng(seed + '|tones-key');
  const tones: ChordNote[] = [];
  const bars: BarTone[] = [];
  for (let bi = 0, from = 0; from < totalSteps; from = G.start(++bi)) {
    const L = G.len(bi);
    // (rule 22: a climbing section leans from the root toward the 5th, bar by bar)
    const pr = d.climb ? Math.min(1, ((whole?.from ?? 0) + from) / Math.max(1, (whole?.total ?? totalSteps) - bar)) : 0;
    const baseW: [number, number, number] = d.climb ? [1.6 - pr, 1, 0.6 + pr] : d.toneW;
    // (the mood notes lean the pick toward the chord notes that suit the mood, the phrase's contour: `bias` times the weight)
    const toneW: [number, number, number] = bias ? (baseW.map((w, i) => w * bias(from, NOTES[i])) as [number, number, number]) : baseW;
    const uniform = !bias && toneW.every((x) => x === toneW[0]);
    const first0 = uniform ? rng.pick(NOTES) : NOTES[cumulative(toneW, rng.next())];
    let moves = rng.chance(d.moves);
    let first = first0;
    let then = moves ? (uniform ? rng.pick(NOTES.filter((n) => n !== first)) : rng.weighted(NOTES.filter((n) => n !== first).map((n) => [n, toneW[NOTES.indexOf(n)]] as const))) : first;
    // (the move comes at the half bar or the third beat: a bit more often where the band hits harder)
    const half = 0.65 * nudge(acc, from + L / 2), late = 0.35 * nudge(acc, from + (L * 3) / 4);
    const at = from + G.beatNear(bi, rng.chance(half / (half + late)) ? 0.5 : 0.75);
    if (fit) {
      // (a core note out of the key is drawn again, from the chord notes that are in it, by the same weights; a chord with
      // none in the key keeps what was drawn)
      const end = Math.min(totalSteps, from + L);
      const redraw = (among: readonly ChordNote[], a: number, b: number, now: ChordNote): ChordNote => {
        if (inKeyTones(fit, a, b, [now]).length) return now;
        const ok = inKeyTones(fit, a, b, among);
        return ok.length ? rk.weighted(ok.map((n) => [n, uniform ? 1 : toneW[NOTES.indexOf(n)]] as const)) : now;
      };
      first = redraw(NOTES, from, moves ? at : end, first);
      if (moves) {
        // (the first may have landed on the second's note: that one is drawn again from the others)
        const nt = redraw(NOTES.filter((n) => n !== first), at, end, then === first ? NOTES.find((n) => n !== first)! : then);
        // (no other chord note in the key for the second half: the bar stays on the first, if that one is in)
        if (!inKeyTones(fit, at, end, [nt]).length && inKeyTones(fit, at, end, [first]).length) { moves = false; then = first; }
        else then = nt;
      } else then = first;
    }
    bars.push(moves ? `${NAMES[first]}→${NAMES[then]}` : NAMES[first]);
    for (let s = from; s < Math.min(totalSteps, from + L); s++) tones.push(s < at ? first : then);
  }
  return { tones, bars };
}

/**
 * Rule 21: a new phrase starts on a fresh core note, if the shift would last at least an 8th of a bar (it holds to the bar's end
 * or the next change). At every such phrase start the chord note to sit on is drawn again (the same
 * weights as rule 4), and holds from there to the next change in the bar's picks or the bar's end. The earlier part of the bar
 * (the end of the last phrase, or the break) keeps its pick. The draw is by step, so a leaf that repeats a seed repeats it.
 */
export function rerollTones(tones: ChordNote[], bars: BarTone[], phrases: Gap[], barArg: BarArg, seed: string, d: Dials = VERSE, fit?: KeyFit, bias?: ToneBias): { tones: ChordNote[]; bars: BarTone[] } {
  const G = gridOf(barArg), bar = G.bar;
  const out = tones.slice();
  const uniform = !bias && d.toneW.every((x) => x === d.toneW[0]);
  for (const ph of phrases) {
    const u = roll(seed, 'reroll', ph.step);
    const toneW = bias ? d.toneW.map((w, i) => w * bias(ph.step, NOTES[i])) : d.toneW;
    let pick = uniform ? NOTES[Math.min(2, Math.floor(u * 3))] : NOTES[cumulative(toneW, u)];
    let end = ph.step + 1;
    while (end < out.length && !G.isLine(end) && tones[end] === tones[ph.step]) end++;
    // (a core note shift has to last at least an 8th of a bar: a phrase starting closer than that to the bar's end or to the next
    // change keeps the note it is on)
    if (end - ph.step < bar / 8 - 1e-9) continue;
    // (a pick out of the key is drawn again from the chord notes that are in it, by the same weights; none in the key: it stays)
    if (fit && !inKeyTones(fit, ph.step, end, [pick]).length) {
      const ok = inKeyTones(fit, ph.step, end, NOTES);
      if (ok.length) pick = ok[cumulative(ok.map((n) => (uniform ? 1 : toneW[NOTES.indexOf(n)])), roll(seed, 'reroll-key', ph.step))];
    }
    for (let s = ph.step; s < end && s < out.length; s++) out[s] = pick;
  }
  // (each bar's label again: its picks in order, "1", or "1→3" and so on)
  const labels = bars.map((_, b) => {
    const seq: ChordNote[] = [];
    for (let s = G.start(b); s < Math.min(out.length, G.start(b + 1)); s++) if (seq[seq.length - 1] !== out[s]) seq.push(out[s]);
    return seq.map((t) => NAMES[t]).join('→');
  });
  return { tones: out, bars: labels };
}

/**
 * Rule 5: longer notes. About 4 bars in 10 hold one note for a beat, a beat and a half, two beats or a whole bar,
 * starting on a beat, only where the line is plain 8ths on one chord note over one chord.
 */
export function randomHolds(totalSteps: number, barArg: BarArg, gaps: Gap[], runs: Gap[], tones: ChordNote[], chordAt: Chord[], seed: string, acc?: number[], d: Dials = VERSE): Gap[] {
  const rng = new Rng(seed + '|holds');
  const G = gridOf(barArg);
  const holds: Gap[] = [];
  for (let bi = 0, from = 0; from < totalSteps; from = G.start(++bi)) {
    // (the bar's own beats: four quarters, or a 7/8 bar's three)
    const beats = G.beats(bi);
    if (!rng.chance(d.holdBar)) continue;
    // (a section that holds more than one note a bar tries twice)
    for (let pass = 0; pass < 2; pass++) {
      if (pass === 1 && (d.holdTwice <= 0 || !rng.chance(d.holdTwice))) break;
      // (a few tries for a clear spot: gaps and runs take up much of a bar)
      for (let tries = 0; tries < 6; tries++) {
        const mult = [1, 1.5, 2, 4][cumulative(d.holdLen, rng.next())];
        // (the lean: long notes mostly start on the 2nd or 4th quarter)
        // (and toward the band's chord changes and hits)
        const w = beats.map((b, k) => [1, 2.1, 1, 1.9][k % 4] * nudge(acc, from + b));
        // (a beat, a beat and a half, two beats or the whole bar, counted along the bar's own beats)
        let q = rng.next() * w.reduce((x, y) => x + y, 0), k0 = 0;
        while (k0 < w.length - 1 && q >= w[k0]) q -= w[k0++];
        const step = from + Math.round(beats[k0]);
        const len = mult >= 4 ? G.len(bi) : G.forwardLen(step, mult);
        const span = { step, len };
        if (step + len > Math.min(totalSteps, from + G.len(bi))) continue;
        if (gaps.some((g) => overlaps(g, span)) || runs.some((o) => overlaps(o, span)) || holds.some((o) => overlaps(o, span))) continue;
        let same = true;
        for (let k = step; k < step + len; k++) {
          if (tones[k] !== tones[step] || chordAt[k].root !== chordAt[step].root || chordAt[k].q !== chordAt[step].q) same = false;
        }
        if (same) { holds.push(span); break; }
      }
    }
  }
  return holds.sort((a, b) => a.step - b.step);
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

/**
 * Rule 17: stretched notes (the chorus; the verse has none). A plain 8th is held through the next one, when both sit on the same
 * chord note over the same chord: two 8ths become one note a beat long, and now and then a third joins (a beat and a half).
 * Fewer, longer notes, mostly starting on the beat or where the band hits.
 */
export function withStretch(notes: BandNote[], tones: ChordNote[], chordAt: Chord[], bar: BarArg, seed: string, acc?: number[], d: Dials = VERSE, skip: Gap[] = []): BandNote[] {
  if (d.stretch <= 0) return notes;
  const same = (a: number, b: number) => tones[a] === tones[b] && chordAt[a].root === chordAt[b].root && chordAt[a].q === chordAt[b].q;
  const out: BandNote[] = [];
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i];
    let len = n.len, k = i;
    if (n.len === 2 && !skip.some((g) => n.step >= g.step && n.step < g.step + g.len)) {
      const p = d.stretch * (isStrong(n.step, bar) ? 1 : 0.6) * nudge(acc, n.step);
      while (len < 6 && roll(seed, `stretch${len}`, n.step) < p * (len === 2 ? 1 : 0.5)) {
        const nx = notes[k + 1];
        if (!nx || nx.len !== 2 || nx.step !== n.step + len || nx.step >= chordAt.length || !same(n.step, nx.step)) break;
        len += 2;
        k++;
      }
    }
    out.push(len === n.len ? n : { ...n, len });
    i = k;
  }
  return out;
}

/** The pitch range (MIDI): the line lives between `lo` and `hi`, and may stray out to `xlo` / `xhi` but no further. */
export interface Range { lo: number; hi: number; xlo: number; xhi: number }
/** A2 to G4, dipping out of it (down to F#2, up to D6) only rarely, when a note there saves a big leap. */
export const DEFAULT_RANGE: Range = { lo: 45, hi: 67, xlo: 42, xhi: 86 };

/**
 * Rule 6: smooth steps. Each note takes the octave nearest the one before, so the line moves by the smallest jump.
 * Notes in the extended zone (past the top or bottom, up to the extended limits) cost 4 semitones extra, so the line
 * only strays there when it saves a real leap.
 * Rule 25: octave choice. At every core note (the first note of a bar, or where the chord note or the chord changes part way
 * through) there is a chance (`chance`) it is sung in the other octave of the main range instead of the nearest, up or down
 * (`up`: the share going up when both ways are open). The notes after it, on the same core note, stay there.
 */
export function voiceLead(
  notes: BandNote[], r: Range = DEFAULT_RANGE, target?: (step: number) => number | undefined,
  oct?: { tones: ChordNote[]; chordAt: Chord[]; bar: BarArg; chance: number; up: number; seed: string },
  /** How hard a target pulls against the smoothest step (the climb and the dwell pull hard; the mood notes' contour leans). */
  pull = { leap: 0.3, w: 2 },
): BandNote[] {
  let prev = Math.round((r.lo + r.hi) / 2);
  let lock: number | undefined;
  const G = oct && gridOf(oct.bar);
  return notes.map((n, i) => {
    const pc = ((n.midi % 12) + 12) % 12;
    let best = Math.round((prev - pc) / 12) * 12 + pc, score = Infinity;
    const tg = target?.(n.step);
    for (let m = pc + 12 * Math.ceil((r.xlo - pc) / 12); m <= r.xhi; m += 12) {
      // (rule 22: a climbing section pulls toward a register that rises across it)
      const sc = (tg !== undefined ? pull.leap : 1) * Math.abs(m - prev) + (m < r.lo || m > r.hi ? 4 : 0) + (tg !== undefined ? pull.w * Math.abs(m - tg) : 0);
      if (sc < score) { best = m; score = sc; }
    }
    if (oct && oct.chance > 0) {
      const at = (s: number) => Math.max(0, Math.min(oct.chordAt.length - 1, Math.floor(s + 1e-6)));
      const a = at(n.step), b = i ? at(notes[i - 1].step) : -1;
      const core = i === 0 || G!.index(a) !== G!.index(b) || oct.tones[a] !== oct.tones[b] || oct.chordAt[a].root !== oct.chordAt[b].root || oct.chordAt[a].q !== oct.chordAt[b].q;
      if (core) {
        lock = undefined;
        if (roll(oct.seed, 'oct', n.step) < oct.chance) {
          const others: number[] = [];
          for (let m = pc + 12 * Math.ceil((r.lo - pc) / 12); m <= r.hi; m += 12) if (m !== best) others.push(m);
          const ups = others.filter((m) => m > best), downs = others.filter((m) => m < best);
          const goUp = ups.length && downs.length ? roll(oct.seed, 'octdir', n.step) < oct.up : ups.length > 0;
          const pick = goUp ? ups[0] : downs[downs.length - 1];
          if (pick !== undefined) { best = pick; lock = pick; }
        }
      } else if (lock !== undefined && lock % 12 === pc) best = lock;
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
export function addNeighbours(notes: BandNote[], key: number, mode: Mode, barArg: BarArg, seed: string, d: Dials = VERSE): BandNote[] {
  const G = gridOf(barArg);
  const scale = d.pent ?? new Set(SCALES[mode].map((i) => (key + i) % 12));
  const out: BandNote[] = [];
  for (const n of notes) {
    const prev = out[out.length - 1];
    const sameBar = prev && G.index(prev.step) === G.index(n.step);
    if (sameBar && !prev.nb && n.len <= 2 && roll(seed, 'nb', n.step) < d.neighbour) {
      const dir = roll(seed, 'nbd', n.step) < 0.5 ? 1 : -1;
      // (a step of the scale: in the pentatonic, 2 or 3 semitones)
      const k = (d.pent ? [1, 2, 3] : [1, 2]).find((x) => scale.has((((n.midi + dir * x) % 12) + 12) % 12));
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
export function walkToNext(notes: BandNote[], phrases: Gap[], key: number, mode: Mode, barArg: BarArg, seed: string, dials: Dials = VERSE): BandNote[] {
  const G = gridOf(barArg);
  const scale = dials.pent ?? new Set(SCALES[mode].map((i) => (key + i) % 12));
  const ladder: number[] = [];
  for (let m = 24; m <= 108; m++) if (scale.has(m % 12)) ladder.push(m);
  const nearest = (m: number) => ladder.reduce((best, x, i) => (Math.abs(x - m) < Math.abs(ladder[best] - m) ? i : best), 0);
  let out = notes.map((n) => ({ ...n }));
  const total = Math.max(0, ...out.map((n) => n.step + n.len));
  for (let bi = 1, B = G.start(1); B < total; B = G.start(++bi)) {
    if (!phrases.some((p) => p.step < B && B < p.step + p.len)) continue;
    const next = out.find((n) => n.step === B);
    const core = [...out].reverse().find((n) => n.step < B && n.step >= G.start(bi - 1) && !n.nb && !n.walk);
    if (!next || !core || next.midi === core.midi) continue;
    const dir = next.midi > core.midi ? 1 : -1;
    const iNext = nearest(next.midi), d = Math.abs(iNext - nearest(core.midi));
    const m = Math.min(1 + Math.floor(roll(seed, 'walkm', B) * 2), d - 1);
    if (roll(seed, 'walk', B) >= dials.walk || m < 1) continue;
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
export function smallBreaks(notes: BandNote[], phrases: Gap[], bar: BarArg, seed: string, acc?: number[], d: Dials = VERSE): BandNote[] {
  const out: BandNote[] = [];
  for (const ph of phrases) {
    const inside = notes.filter((n) => n.step >= ph.step && n.step < ph.step + ph.len);
    inside.forEach((n, i) => {
      // (the note a walk arrives on stays too)
      const edge = i === 0 || i === inside.length - 1 || inside[i - 1].walk;
      // (the lean: a note drops out about four times as often in the 2nd or 4th quarter)
      // (and a note on a band hit stays more often: half as likely to drop on the biggest hits, one and a half times on quiet steps)
      const drop = (n.len === 1 ? 0.1 : 0.08) * (isStrong(n.step, bar) ? 0.5 : 2) * (1.5 - accAt(acc, n.step)) * d.small;
      if (!edge && !n.walk && n.len <= 2 && roll(seed, 'small', n.step) < drop) return;
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
 * Rule 11: phrase endings. Not every phrase: the section draws its own chance (`d.end`, 35-85% for a verse) and each phrase
 * rolls it. A phrase that ends this way draws how, by the section's weights (`d.endStyle`):
 *   - held: one long note on the core note of its last bar, held for a beat, a beat and a half, two or three beats, or the
 *     whole bar (its length drawn each time; at least a beat of the phrase is left before it);
 *   - open: the same, on the chord's 3rd or 5th instead of the core note: it lands but doesn't feel home;
 *   - hang: the same, on a scale note outside the chord (the 2nd, 4th, 6th or 7th): it hangs, wanting to go on;
 *   - sync: the same, but it comes in an 8th early, on the "and" of a beat;
 *   - punch: the phrase stops on one short note (an 8th or a beat) on the last bar's downbeat or half bar, and the rest is silence;
 *   - plain: nothing is done; the phrase stops where the line does.
 */
export function phraseEndings(
  notes: BandNote[], phrases: Gap[], barArg: BarArg, seed: string, d: Dials = VERSE,
  ctx?: { key: number; mode: Mode; chordAt: Chord[]; range?: Range },
): BandNote[] {
  const G = gridOf(barArg);
  const rng = new Rng(seed + '|endings');
  const chance = d.end[0] + rng.next() * (d.end[1] - d.end[0]);
  const beat = G.beat;
  const styles = END_STYLES.filter((x) => d.endStyle[x] > 0);
  let out = notes;
  for (const ph of phrases) {
    const end = ph.step + ph.len;
    // (a beat, a beat and a half, two... counted back along the real beats from the phrase's end)
    const len = G.backLen(end, [1, 1.5, 2, 3, 4][cumulative(d.endLen, roll(seed, 'endlen', ph.step))]);
    if (roll(seed, 'end', ph.step) >= chance) continue;
    const style: EndStyle = styles.length === 1 ? styles[0] : styles[cumulative(styles.map((x) => d.endStyle[x]), roll(seed, 'endstyle', ph.step))] ?? 'held';
    if (style === 'plain') continue;
    const inside = out.filter((n) => n.step >= ph.step && n.step < end);
    const coreBefore = (from: number) => [...inside].reverse().find((n) => n.step < from && !n.nb && !n.walk) ?? inside.find((n) => n.step < from) ?? inside[0];
    const put = (from: number, l: number, midi: number, st: EndStyle) => {
      out = [
        ...out.filter((n) => n.step < from || n.step >= end).map((n) => (n.step < from && n.step + n.len > from ? { ...n, len: from - n.step } : n)),
        { step: from, len: l, midi, end: true, style: st },
      ].sort((a, b) => a.step - b.step);
    };
    if (style === 'punch') {
      // (the last bar's downbeat or half bar: whatever length that bar is)
      const L = G.lenAt(end - 1e-6);
      const pos = [end - L, end - (L - G.beatNear(G.index(end - 1e-6), 0.5))].filter((x) => x >= ph.step + beat);
      if (!pos.length) continue;
      const at = pos.length === 1 || roll(seed, 'punchat', ph.step) < 0.5 ? pos[0] : pos[1];
      const core = coreBefore(at);
      if (core) put(at, roll(seed, 'punchlen', ph.step) < 0.5 ? 2 : G.forwardLen(at, 1), core.midi, 'punch');
      continue;
    }
    const from = end - len - (style === 'sync' ? 2 : 0);
    if (from < ph.step + beat || len > ph.len - beat) continue;
    const core = coreBefore(from);
    if (!core) continue;
    let midi = core.midi;
    const c = ctx?.chordAt[Math.min(ctx.chordAt.length - 1, Math.floor(from))];
    if (ctx && c && (style === 'open' || style === 'hang')) {
      const pcs = [0, third(c), fifth(c)].map((x) => (ctx.key + c.root + x) % 12);
      const scale = d.pent ?? new Set(SCALES[ctx.mode].map((i) => (ctx.key + i) % 12));
      const want = (pc: number) => (style === 'open' ? pcs.slice(1).includes(pc) && pc !== (((core.midi % 12) + 12) % 12) && (!d.pent || d.pent.has(pc)) : scale.has(pc) && !pcs.includes(pc));
      const up = roll(seed, 'enddir', ph.step) < 0.6;
      // (in the main range if it can be, else the extended zone, never past the extended limits)
      const ks = [1, 2, 3, 4, 5, -1, -2, -3, -4, -5].map((k) => (up ? k : -k)).filter((k) => want((((core.midi + k) % 12) + 12) % 12));
      const r = ctx.range;
      const found = r ? ks.find((k) => core.midi + k >= r.lo && core.midi + k <= r.hi) ?? ks.find((k) => core.midi + k >= r.xlo && core.midi + k <= r.xhi) : ks[0];
      if (found === undefined) { if (style === 'hang') continue; } else midi = core.midi + found;
    }
    put(from, len + (style === 'sync' ? 2 : 0), midi, style);
  }
  return out;
}

/**
 * Rule 23: lead-in. A section that leads into another (a pre-chorus into the chorus) now and then ends its last phrase on one long
 * note, open (the 3rd or 5th) or hanging, held on to the end of the section and sung strongly (no fall), so the next section lands.
 * Run after the phrase endings: it overrides the last phrase's own ending.
 */
export function withLeadIn(
  notes: BandNote[], phrases: Gap[], barArg: BarArg, total: number, seed: string, d: Dials,
  ctx: { key: number; mode: Mode; chordAt: Chord[]; range?: Range },
): BandNote[] {
  const bar = gridOf(barArg).bar;
  const last = phrases[phrases.length - 1];
  if (!d.leadIn || !last || roll(seed, 'leadin', last.step) >= d.leadIn) return notes;
  const forced: Dials = { ...d, end: [1, 1], endStyle: { held: 0, open: 3, hang: 1, punch: 0, sync: 0, plain: 0 }, endLen: [0, 0.2, 0.4, 0.3, 0.1] };
  const out = phraseEndings(notes, [last], barArg, `${seed}|lead`, forced, ctx);
  const end = last.step + last.len;
  const i = out.findIndex((n) => n.end && n.step + n.len === end);
  if (i < 0) return notes;
  // (held on into the break that follows, by up to half a bar, but not to the section's very end)
  const len = Math.max(out[i].len, Math.min(total - 1 - out[i].step, out[i].len + Math.floor(bar / 2)));
  return out.map((n, k) => (k === i ? { ...n, len, lead: true } : n));
}

/**
 * Rule 16 (push): a note on a beat now and then comes a 16th early, so the line leans ahead of the band. Not the first note
 * of a phrase, and only where the 16th before it is free. More where the band hits hard.
 */
export function pushNotes(notes: BandNote[], phrases: Gap[], barArg: BarArg, seed: string, acc?: number[], d: Dials = VERSE): BandNote[] {
  if (d.push <= 0) return notes;
  const G = gridOf(barArg);
  return notes.map((n, i) => {
    const prev = notes[i - 1];
    const onBeat = G.isBeat(n.step);
    if (!onBeat || n.len < 2 || n.walk || n.land || n.nb || n.third || n.end || phrases.some((p) => Math.abs(p.step - n.step) < 1e-6)) return n;
    if (prev && prev.step + prev.len > n.step - 1 + 1e-6) return n;
    if (roll(seed, 'push', n.step) >= d.push * nudge(acc, n.step)) return n;
    return { ...n, step: n.step - 1, len: n.len + 1 };
  });
}

/**
 * Rule 10: the third-bar shape. About 15 bars in 100 (inside a phrase, with no walk at their end) are three equal notes of a
 * third of a bar each, on the bar's core note: three even notes across the bar, like a triplet of half notes.
 * They sit between the usual steps, so steps and lengths are fractions (5⅓ sixteenths in 4/4).
 * Done last, so nothing else has to know about them.
 */
export function thirdBars(notes: BandNote[], phrases: Gap[], barArg: BarArg, seed: string, d: Dials = VERSE): BandNote[] {
  const G = gridOf(barArg);
  const total = Math.max(0, ...notes.map((n) => n.step + n.len));
  let out = notes;
  for (let bi = 0, b0 = 0; b0 + G.len(bi) <= total; b0 = G.start(++bi)) {
    const bar = G.len(bi);
    // (only a bar where a third of it is whole 16ths: 3/4, 6/8, 9/8...; not 4/4, 7/8...)
    if (Math.abs(bar / 3 - Math.round(bar / 3)) > 1e-6) continue;
    if (!phrases.some((p) => p.step <= b0 && b0 + bar <= p.step + p.len)) continue;
    const inside = out.filter((n) => n.step >= b0 && n.step < b0 + bar);
    if (!inside.length || inside.some((n) => n.walk || n.end) || roll(seed, 'third', b0) >= d.third) continue;
    const core = inside.find((n) => !n.nb) ?? inside[0];
    out = [
      ...out.filter((n) => n.step < b0 || n.step >= b0 + bar),
      ...[0, 1, 2].map((k) => ({ step: b0 + (k * bar) / 3, len: bar / 3, midi: core.midi, third: true })),
    ].sort((a, b) => a.step - b.step);
  }
  return out;
}

export type BendAmount = 'off' | 'some' | 'lots';

/** Times the chance of a bend for a single long note (a beat and a half or more) that has a scale note a semitone or a whole tone away. */
const SINGLE_BOOST = 2.2;

/** The widest a bend inside a note goes, in semitones (a major 3rd). */
const MAX_BEND = 4;

/** How much each genre leans on the blue 3rd (the major 3rd scooped up from the minor). */
const BLUE: Record<string, number> = { rock: 1, hardrock: 1, grunge: 1, funk: 1, altmetal: 0.8, metal: 0.5, pop: 0.35 };

/**
 * Rule 13: bends. The voice scoops up into a note from below (`slide`, never down onto it) and falls off a note's end in volume (`fadeBy`).
 * Where the rules above leave a good spot, a bend gets a chance:
 *   - a held phrase ending falls off its end in volume (10, 16 or 24 dB, over its last half; the pitch stays);
 *   - the first note of a phrase is scooped into, more the longer the break before it;
 *   - the note a walk arrives on, if the walk climbed, glides up from the walk's last note;
 *   - a note that climbs 3-5 semitones from the one before glides up from it;
 *   - a long major 3rd is scooped up from the minor 3rd, by genre (the blue 3rd);
 *   - a long note landing on a chord change is scooped into.
 * Each spot rolls its own chance, raised at the lowest and highest energies (fewest at 3) and by the Bends amount; the ones that win are thinned so no two
 * bends are closer than 2 bars (Some) or 1 bar (Lots), keeping the ones listed first.
 */
export function addBends(
  notes: BandNote[], phrases: Gap[], barArg: BarArg,
  ctx: { amount: BendAmount; energy: number; genre: string; chordAt: Chord[]; tones: ChordNote[]; changes: number[]; mult?: number },
  seed: string,
): BandNote[] {
  if (ctx.amount === 'off') return notes;
  const G = gridOf(barArg), bar = G.bar;
  const out = notes.map((n) => ({ ...n }));
  const lift = (ctx.amount === 'lots' ? 1.6 : 1) * (0.7 + 0.6 * energyEdge(ctx.energy)) * (ctx.mult ?? 1);
  const gap = (ctx.amount === 'lots' ? 1 : 2) * bar;
  const beat = G.beat, eighth = bar / 8;
  const cand: { i: number; pri: number; p: number; slide?: number; fade?: number; kind: string }[] = [];
  const firsts = new Map<number, number>(); // note index -> break before its phrase, in beats
  phrases.forEach((ph, k) => {
    const i = out.findIndex((n) => n.step >= ph.step - 1e-6 && n.step < ph.step + ph.len);
    if (i >= 0) firsts.set(i, k === 0 ? 1 : (ph.step - (phrases[k - 1].step + phrases[k - 1].len)) / beat);
  });
  const changes = new Set(ctx.changes);
  out.forEach((n, i) => {
    const prev = out[i - 1];
    const joined = !!prev && Math.abs(n.step - (prev.step + prev.len)) < 1e-6;
    const at = (tag: string) => new Rng(`${seed}|bsz|${tag}|${Math.round(n.step * 100)}`);
    if (n.end && !n.lead && n.len >= 4) cand.push({ i, pri: 1, p: n.len >= 8 ? 0.7 : 0.55, fade: at('fall').weighted([[10, 2], [16, 2], [24, 1]]), kind: 'fall' });
    if (firsts.has(i) && n.len > eighth + 1e-6) cand.push({ i, pri: 2, p: Math.min(0.75, 0.2 + 0.15 * (firsts.get(i)! - 1) + (n.opener ? 0.15 : 0)), slide: at('ps').weighted([[1, 3], [2, 3], [3, 1]]), kind: 'phrase start' });
    if (n.land && prev?.walk && n.len > eighth + 1e-6 && n.midi > prev.midi) cand.push({ i, pri: 3, p: 0.4, slide: Math.min(3, n.midi - prev.midi), kind: 'walk arrival' });
    const step = Math.floor(n.step + 1e-6);
    const c = ctx.chordAt[step];
    if (c && ctx.tones[step] === 'third' && third(c) === 4 && n.len >= 4 && !n.nb) cand.push({ i, pri: 4, p: 0.5 * (BLUE[ctx.genre] ?? 0.7), slide: 1, kind: 'blue 3rd' });
    if (joined && n.len > eighth + 1e-6 && !n.walk && !n.land && !n.nb && !n.third && !prev.walk) {
      const d = n.midi - prev.midi;
      if (d === 3) cand.push({ i, pri: 5, p: 0.3, slide: d, kind: 'glide' });
    }
    if (changes.has(step) && n.len >= 4) cand.push({ i, pri: 6, p: 0.35, slide: at('cc').weighted([[1, 3], [2, 2]]), kind: 'chord change' });
  });
  const won = cand.filter((c) => roll(seed, `bend-${c.kind}`, out[c.i].step) < c.p * lift).sort((a, b) => a.pri - b.pri || out[a.i].step - out[b.i].step);
  const kept: typeof won = [];
  for (const c of won) {
    if (kept.some((k) => k.i === c.i || Math.abs(out[k.i].step - out[c.i].step) < gap)) continue;
    kept.push(c);
    if (c.slide !== undefined) out[c.i].slide = c.slide;
    if (c.fade !== undefined) out[c.i].fadeBy = c.fade;
    out[c.i].bend = c.kind;
  }
  return out;
}

/**
 * Rule 19: openers (the chorus; the verse has none). A phrase now and then opens on one long note, a beat to three beats, that
 * takes the 8ths under it; the shorter notes follow. It stops at a chord change or at a long note already there, and leaves at
 * least a beat of phrase for the notes after. An opener is scooped into and bent more often than other notes (rules 13, 15).
 * Returns the notes and the phrases that opened this way (so the stretch rule leaves their short notes short).
 */
export function withOpeners(notes: BandNote[], phrases: Gap[], chordAt: Chord[], barArg: BarArg, seed: string, acc?: number[], d: Dials = VERSE): { notes: BandNote[]; opened: Gap[] } {
  if (d.opener <= 0) return { notes, opened: [] };
  const G = gridOf(barArg), beat = G.beat;
  const opened: Gap[] = [];
  let out = notes;
  for (const ph of phrases) {
    const inside = out.filter((n) => n.step >= ph.step && n.step < ph.step + ph.len);
    const first = inside[0];
    if (!first || first.len > 2 || first.step !== ph.step || first.third || roll(seed, 'opener', ph.step) >= d.opener * nudge(acc, ph.step)) continue;
    // (a beat, a beat and a half, two or three beats along the real beats)
    const want = G.forwardLen(ph.step, [1, 1.5, 2, 3][cumulative(d.openLen, roll(seed, 'openlen', ph.step))]);
    let end = Math.min(ph.step + want, ph.step + ph.len - beat);
    for (const n of inside.slice(1)) if (n.step < end && (n.len > 2 || n.third)) { end = n.step; break; }
    for (let s = ph.step + 1; s < end; s++) if (chordAt[s].root !== chordAt[ph.step].root || chordAt[s].q !== chordAt[ph.step].q) { end = s; break; }
    // (on a beat, and at least a beat long)
    const onBeat = G.floorBeat(end);
    if (onBeat === undefined || onBeat <= ph.step) continue;
    end = onBeat;
    if (end - ph.step < beat) continue;
    out = out.filter((n) => n === first || n.step < ph.step || n.step >= end).map((n) => (n === first ? { ...n, len: end - ph.step, opener: true } : n));
    opened.push(ph);
  }
  return { notes: out, opened };
}

/**
 * Rule 28: long holds. A phrase now and then (`d.holdLong`) holds one note for 1 to 2 bars, in half-beat steps, rarer the longer
 * (weight e^(-0.4 per half beat over a bar): a 2-bar note is about 1 in 75 of the draws, a 1-bar one a third). It starts on a beat
 * where the phrase opens, ends it, or sits in the middle (leaving 0 or at least a beat of phrase either side), takes the notes under
 * it, and may run past the phrase's end by up to half a bar, never into the beat before the next phrase. Not in the phrase a
 * lead-in ends, and not in two phrases running.
 * Its pitch is a chord note of the chord it starts on. Where the chord changes under it and the pitch isn't in the new chord, it
 * moves to the nearest chord note there (a quick glide across the change); where the pitch fits, it stays. It may also move on its
 * own now and then, to the next chord note up (mostly) or down, at a beat. At most 2 moves (the first as a bend inside the note,
 * rule 15's; the second in `more`). A hold that can't be made to fit is left out and a shorter one drawn.
 * Run before the silence fit, which leaves it as it is. `total`: steps in the leaf; `moreLeaves`: a leaf follows (a beat of silence at the end).
 */
export function withLongHolds(
  notes: BandNote[], phrases: Gap[], chordAt: Chord[], barArg: BarArg, total: number,
  ctx: { key: number; range: Range; moreLeaves: boolean }, seed: string, acc?: number[], d: Dials = VERSE,
): BandNote[] {
  if (d.holdLong <= 0 || !chordAt.length) return notes;
  const G = gridOf(barArg), bar = G.bar;
  const beat = G.beat;
  const pent = d.pent;
  const at = (g: number) => chordAt[Math.max(0, Math.min(chordAt.length - 1, Math.floor(g + 1e-6)))];
  const pcsOf = (c: Chord) => [0, third(c), fifth(c)].map((x) => (ctx.key + c.root + x) % 12);
  const isTone = (m: number, c: Chord) => pcsOf(c).includes(((m % 12) + 12) % 12);
  const same = (a: Chord, b: Chord) => a.root === b.root && a.q === b.q;
  /** A chord note of `c` within 5 semitones of `m` (not `m` itself), in the main range and the pentatonic if one is set: the nearest, or (with `dir`) the nearest that way first. */
  const near = (c: Chord, m: number, dir: 1 | -1 | 0, max = 5): number | null => {
    const pcs = pcsOf(c);
    const ok = (x: number) => x >= ctx.range.lo && x <= ctx.range.hi && pcs.includes(((x % 12) + 12) % 12) && (!pent || pent.has(((x % 12) + 12) % 12));
    if (dir) {
      for (const sgn of [dir, -dir]) for (let k = 1; k <= max; k++) if (ok(m + sgn * k)) return m + sgn * k;
      return null;
    }
    for (let k = 1; k <= 5; k++) for (const sgn of [1, -1]) if (ok(m + sgn * k)) return m + sgn * k;
    return null;
  };
  let out = notes;
  let prevHeld = false;
  phrases.forEach((ph, pi) => {
    const phEnd = ph.step + ph.len;
    const inside = out.filter((n) => n.step >= ph.step - 1e-6 && n.step < phEnd - 1e-6);
    if (!inside.length || inside.some((n) => n.lead)) { prevHeld = false; return; }
    if (prevHeld || roll(seed, 'longhold', ph.step) >= d.holdLong) { prevHeld = false; return; }
    prevHeld = false;
    const rng = new Rng(`${seed}|long|${Math.round(ph.step * 100)}`);
    const next = phrases[pi + 1];
    const limit = Math.min(phEnd + bar / 2, next ? next.step - G.backLen(next.step, 1) : total - (ctx.moreLeaves ? G.backLen(total, 1) : 1));
    for (let k = cumulative(Array.from({ length: 9 }, (_, i) => Math.exp(-0.4 * i)), rng.next()); k >= 0; k--) {
      const L = Math.round(bar * (1 + k / 8));
      const cands: { s: number; e: number; w: number }[] = [];
      for (const s of G.beatSteps(ph.step, phEnd - 1e-6)) {
        // (it ends on a beat or a half beat of the real bar)
        const e = G.snapHalf(s + L, s);
        if (s < ph.step || e > limit + 1e-6) continue;
        // (nothing between a beat and nothing is left either side of it inside the phrase)
        if (s > ph.step + 1e-6 && s - ph.step < beat - 1e-6) continue;
        if (e < phEnd - 1e-6 && phEnd - e < beat - 1e-6) continue;
        if (inside.some((n) => n.third && n.step < e && n.step + n.len > s)) continue;
        const edge = s <= ph.step + 1e-6 || e >= phEnd - 1e-6;
        cands.push({ s, e, w: (edge ? 3 : 1) * nudge(acc, s) * Math.exp(-Math.max(0, e - phEnd) / beat) });
      }
      while (cands.length) {
        const c = cands.splice(cumulative(cands.map((x) => x.w), rng.next()), 1)[0];
        const { s, e } = c;
        const base = inside.find((n) => n.step >= s - 1e-6 && n.step < s + beat - 1e-6) ?? inside.find((n) => n.step < s && n.step + n.len > s + 1e-6) ?? inside.find((n) => n.step >= s - 1e-6 && n.step < e - 1e-6);
        if (!base) continue;
        let p0 = base.midi;
        if (!isTone(p0, at(s))) { const m = near(at(s), p0, 0); if (m === null) continue; p0 = m; }
        // (the changes under the hold, and on its own now and then a move at a beat, each to a note of the chord then sounding)
        const xFree = k / 8 <= 0.25 ? [0.55, 0.45, 0] : k / 8 <= 0.75 ? [0.4, 0.45, 0.15] : [0.3, 0.45, 0.25];
        const nFree = cumulative(xFree, rng.next());
        const changes: number[] = [];
        for (let g = Math.ceil(s + 1e-6); g < e - 1e-6; g++) if (!same(at(g), at(g - 1))) changes.push(g);
        const slots: number[] = [];
        for (const t of G.beatSteps(s + beat, e - beat + 1e-6)) {
          if (!changes.some((g) => Math.abs(g - t) < beat / 2)) slots.push(t);
        }
        const free: number[] = [];
        for (let f = 0; f < nFree && slots.length; f++) {
          const t = slots.splice(Math.floor(rng.next() * slots.length), 1)[0];
          if (!free.some((x) => Math.abs(x - t) < beat)) free.push(t);
        }
        const run = (withFree: boolean) => {
          const evs = [...changes.map((t) => ({ t, free: false })), ...(withFree ? free.map((t) => ({ t, free: true })) : [])].sort((a, b) => a.t - b.t);
          let cur = p0;
          const moves: { t: number; to: number; kind: string }[] = [];
          for (const ev of evs) {
            const ch = at(ev.t);
            let m: number | null;
            if (ev.free) m = near(ch, cur, rng.chance(0.6) ? 1 : -1, MAX_BEND);
            else if (isTone(cur, ch)) continue;
            else m = near(ch, cur, 0);
            if (m === null) { if (ev.free) continue; return null; }
            if (moves.length && ev.t - moves[moves.length - 1].t < 2) { if (ev.free) continue; return null; }
            moves.push({ t: ev.t, to: m, kind: ev.free ? 'bend' : 'chord change' });
            cur = m;
          }
          return moves.length > 2 ? null : moves;
        };
        const moves = run(true) ?? run(false);
        if (!moves) continue;
        const note: BandNote = {
          step: s, len: e - s, midi: p0, longHold: true,
          ...(s <= ph.step + 1e-6 ? { opener: true } : {}),
          ...(e >= phEnd - 1e-6 ? { end: true, style: 'held' as EndStyle } : {}),
        };
        moves.forEach((m, i) => {
          const mv = { at: m.t - s - 0.5, to: m.to, len: 1 };
          if (i === 0) { note.bendTo = mv.to; note.bendAt = mv.at; note.bendLen = mv.len; note.inner = `long hold: ${m.kind}`; } else (note.more ??= []).push(mv);
        });
        out = [
          ...out.filter((n) => n.step < s - 1e-6 || n.step >= e - 1e-6).map((n) => {
            if (!(n.step < s && n.step + n.len > s + 1e-6)) return n;
            const t = { ...n, len: s - n.step };
            if (t.bendTo !== undefined && t.bendAt! + t.bendLen! > t.len) { delete t.bendTo; delete t.bendAt; delete t.bendLen; delete t.inner; delete t.more; }
            return t;
          }),
          note,
        ].sort((a, b) => a.step - b.step);
        prevHeld = true;
        return;
      }
    }
  });
  return out;
}

/**
 * Rule 18: the share of silence (the chorus: about a third to a half of it without vocals, drawn for the song). The line is
 * fitted to `target` (within `tol`, 3 points unless a section takes it looser): too full, the weakest notes drop out (short, off the band's hits, off the beat; never a
 * phrase's first or last note, a walk, a long note or a third-bar note); too empty, notes are held into the gaps inside their phrase.
 * `total`: steps in the section.
 */
export function fitSilence(notes: BandNote[], phrases: Gap[], barArg: BarArg, total: number, target: number, seed: string, acc?: number[], tol = 0.03): BandNote[] {
  const G = gridOf(barArg), bar = G.bar;
  const out = notes.map((n) => ({ ...n }));
  let cover = out.reduce((a, n) => a + n.len, 0);
  const sil = () => 1 - cover / total;
  if (sil() < target - tol) {
    const edge = new Set<BandNote>();
    for (const ph of phrases) {
      const inside = out.filter((n) => n.step >= ph.step && n.step < ph.step + ph.len);
      if (inside.length) { edge.add(inside[0]); edge.add(inside[inside.length - 1]); }
    }
    const cand = out.filter((n) => !edge.has(n) && !n.walk && !n.land && !n.third && !n.end && n.len < 4);
    const score = (n: BandNote) => n.len + 1.5 * accAt(acc, n.step) + (G.isStrong(n.step) ? 0.7 : 0) - (n.nb ? 1 : 0) + roll(seed, 'fit', n.step) * 0.6;
    cand.sort((a, b) => score(a) - score(b));
    const drop = new Set<BandNote>();
    for (const n of cand) {
      if (sil() >= target - tol) break;
      if (1 - (cover - n.len) / total > target + tol) continue;
      drop.add(n);
      cover -= n.len;
    }
    const kept = out.filter((n) => !drop.has(n));
    // (still too full: the long notes let go of their last 8th, the longest first)
    if (sil() < target - tol) {
      const longs = kept.filter((n) => n.len >= 4 && !n.third && !n.opener && !n.longHold).sort((x, y) => y.len - x.len || roll(seed, 'fit', x.step) - roll(seed, 'fit', y.step));
      for (let pass = 0; pass < 3 && sil() < target - tol; pass++) {
        for (const n of longs) {
          if (sil() >= target - tol) break;
          if (n.len - 2 < 2 || n.len < 4 || 1 - (cover - 2) / total > target + tol) continue;
          n.len -= 2;
          cover -= 2;
        }
      }
    }
    return kept;
  }
  if (sil() > target + tol) {
    const order = out.map((_, i) => i).filter((i) => !out[i].third).sort((a, b) => out[b].len - out[a].len || roll(seed, 'fit', out[a].step) - roll(seed, 'fit', out[b].step));
    for (const i of order) {
      if (sil() <= target + tol) break;
      const n = out[i], nx = out[i + 1];
      const ph = phrases.find((p) => n.step >= p.step && n.step < p.step + p.len);
      if (!nx || !ph || nx.step >= ph.step + ph.len) continue;
      const gap = nx.step - (n.step + n.len);
      if (gap < 1) continue;
      const by = Math.min(gap, 4, Math.ceil((sil() - target) * total));
      n.len += by;
      cover += by;
    }
    // (still too empty: a phrase's last note held on into the break after it, up to half a bar, leaving a beat of silence)
    const beat = G.beat;
    const lasts = phrases.map((ph) => {
      const idx = out.map((n, i) => (n.step >= ph.step && n.step < ph.step + ph.len ? i : -1)).filter((i) => i >= 0);
      return idx.length ? idx[idx.length - 1] : -1;
    }).filter((i) => i >= 0);
    for (const i of lasts.sort((a, b) => roll(seed, 'fit', out[a].step) - roll(seed, 'fit', out[b].step))) {
      if (sil() <= target + tol) break;
      const n = out[i];
      if (n.third || n.longHold) continue;
      const room = (out[i + 1] ? out[i + 1].step : total) - (n.step + n.len) - beat;
      const by = Math.min(Math.floor(room), Math.floor(bar / 2), Math.ceil((sil() - target) * total));
      if (by < 1) continue;
      n.len += by;
      cover += by;
    }
  }
  return out;
}

/**
 * Rule 20 (a constraint, not a chance): no unit shorter than a quarter bar with silence on both sides. A unit is one note or
 * several touching; a phrase's start and end count as silence. A short unit is held out to a beat when the phrase has room
 * before the next note (a hold never crosses a chord change); one that reaches the next note joins it. `ok` is false when a
 * unit can't be fixed that way: the caller writes the leaf again (new dice) until it is. With `drop`, such a unit is removed
 * instead (the last resort).
 */
export function fixUnits(notes: BandNote[], phrases: Gap[], chordAt: Chord[], barArg: BarArg, drop = false): { notes: BandNote[]; ok: boolean } {
  const beat = gridOf(barArg).beat;
  let out = notes.map((n) => ({ ...n }));
  let ok = true;
  let i = 0;
  while (i < out.length) {
    let j = i;
    while (j + 1 < out.length && out[j + 1].step <= out[j].step + out[j].len + 1e-6) j++;
    const start = out[i].step, end = out[j].step + out[j].len;
    if (end - start >= beat - 1e-6) { i = j + 1; continue; }
    const ph = phrases.find((p) => out[j].step >= p.step - 1e-6 && out[j].step < p.step + p.len);
    const nx = out[j + 1];
    const sameNext = !!nx && !!ph && nx.step < ph.step + ph.len - 1e-6;
    const limit = sameNext ? nx.step : ph ? ph.step + ph.len : end;
    const to = Math.min(start + beat, limit);
    const steady = (a: number, b: number) => { for (let s = Math.floor(a + 1e-6); s < Math.ceil(b - 1e-6); s++) if (chordAt[s] && (chordAt[s].root !== chordAt[Math.floor(a + 1e-6)].root || chordAt[s].q !== chordAt[Math.floor(a + 1e-6)].q)) return false; return true; };
    if (to > end + 1e-6 && steady(end - 1e-6, to) && !out[j].third) {
      out[j].len = to - out[j].step;
      // (reached the next note: the two units are one now; look again)
      continue;
    }
    ok = false;
    if (!drop) break;
    out = out.filter((_, k) => k < i || k > j);
  }
  return { notes: out, ok };
}

/**
 * Rule 15: bends inside a note. A held note is two pitches: the first for its first half, the second for its second half, with a
 * quick glide (a 16th at most) across the middle between them. Where it can:
 *   - to the next chord note up (now and then down) from the note, in the chord sounding when the glide starts;
 *   - to the next bar's core note, when that is also a note of the chord sounding now;
 * On a single long note a bend is held at least an 8th of a bar before and a quarter bar after (one too short doesn't bend). The longer the note, the better its chance (a single long note, a beat and a half or more, 2.2x, a semitone above or below it in the scale: bends to that, or now and then there and back, slower; only a whole tone: mostly there and back in the middle, less often from-to); a note coming after two or more of the same pitch gets a bigger one (the bend
 * breaks the repeating). Raised at the lowest and highest energies (fewest at 3) and by the Bends amount. Notes scooped into, walks, neighbours and
 * third-bar notes and long holds (rule 28 moves those itself) are left alone (a long held ending that fades out may bend first, and then fades half as far), and no two inner bends are closer than a bar (Some) or ¾ bar (Lots), nor an inner and an outer bend closer than half that.
 */
export function addNoteBends(
  notes: BandNote[], barArg: BarArg,
  ctx: { amount: BendAmount; energy: number; key: number; mode?: Mode; chordAt: Chord[]; range: Range; mult?: number; pent?: ReadonlySet<number> },
  seed: string,
): BandNote[] {
  if (ctx.amount === 'off') return notes;
  const G = gridOf(barArg), bar = G.bar;
  const out = notes.map((n) => ({ ...n }));
  const lift = (ctx.amount === 'lots' ? 1 : 0.5) * (0.75 + 0.48 * energyEdge(ctx.energy)) * (ctx.mult ?? 1);
  const gap = (ctx.amount === 'lots' ? 0.75 : 1) * bar;
  const cand: { i: number; p: number; to: number; at: number; glide: number; kind: string; back?: { at: number; len: number }; boost?: number }[] = [];
  const beat = G.beat, eighth = bar / 8;
  const scale = ctx.mode ? new Set(SCALES[ctx.mode].map((i) => (ctx.key + i) % 12)) : undefined;
  out.forEach((n, i) => {
    // (a phrase end set to home or hanging by the mood notes keeps its degree: a bend away would undo it)
    if (n.len < 2 || n.slide || (n.fadeBy && n.len < 6) || n.walk || n.nb || n.third || n.longHold || n.endRole === 'home' || n.endRole === 'hang') return;
    const r = (tag: string) => roll(seed, `ib-${tag}`, n.step);
    // (how many of the same pitch came just before)
    let same = 0;
    for (let k = i - 1; k >= 1 && out[k].midi === out[k - 1].midi && n.step - out[k].step <= bar; k--) same++;
    const p0 = (n.len >= 4 ? Math.min(0.7, 0.06 * n.len) : 0.02 * n.len) + (same >= 2 ? 0.3 : 0) + (n.opener && n.len >= 4 ? 0.12 : 0);
    // (a single long note, a beat and a half or more, bends more often)
    const single = n.len >= 1.5 * beat - 1e-6;
    const p = p0;
    // (the first note is held for the first half, a quick glide (a 16th at most) across the middle, the new note for the second half;
    // on a single long note the first is held at least an 8th of a bar before the glide and the new note at least a quarter bar after
    // it: one too short for that doesn't bend)
    const glide = Math.min(1, n.len / 4);
    const at = Math.min(n.len / 2 - glide / 2, n.len - glide - (single ? beat : 0));
    if (single && at < eighth - 1e-6) return;
    const end = n.step + n.len;
    // (an 8th note bends at most 3 semitones)
    const maxBend = n.len <= eighth + 1e-6 ? 3 : MAX_BEND;
    const nx = out[i + 1];
    const barLine = G.isLine(end);
    const ok = (m: number) => m >= ctx.range.xlo && m <= ctx.range.xhi;
    const c = ctx.chordAt[Math.min(ctx.chordAt.length - 1, Math.floor(n.step + at + 1e-6))];
    const pcs = c ? [0, third(c), fifth(c)].map((x) => (ctx.key + c.root + x) % 12) : [];
    // to the next bar's core note: only when it is also a note of the chord sounding now (the end note is held before the bar turns)
    if (barLine && nx && nx.step - end <= bar / 4 && !nx.nb && !nx.third && pcs.includes(((nx.midi % 12) + 12) % 12)) {
      const d = nx.midi - n.midi;
      if (Math.abs(d) >= 1 && Math.abs(d) <= maxBend && ok(nx.midi)) cand.push({ i, p: (p + 0.2) * 1.5 * (nx.step - end > 1 ? 0.5 : 1), to: nx.midi, at, glide, kind: 'next bar' });
    }
    // a single long note: if the scale has a note a semitone above or below it, it bends to that one (from-to), or now and then there
    // and back, slower; else if the nearest scale note is a whole tone away, it mostly bends there and back, in the middle, and less
    // often from-to
    let scaled = false;
    if (single && scale) {
      const inScale = (d: number) => { const m = n.midi + d, pc = ((m % 12) + 12) % 12; return m >= ctx.range.lo && m <= ctx.range.hi && scale.has(pc) && (!ctx.pent || ctx.pent.has(pc)); };
      const dist = [1, 2].find((k) => inScale(k) || inScale(-k));
      if (dist) {
        const dirs = [1, -1].filter((sg) => inScale(sg * dist));
        const sg = dirs.length === 2 ? (r('sdir') < 0.6 ? 1 : -1) : dirs[0];
        const wantBack = r('shape') < (dist === 1 ? 0.3 : 0.7);
        const g = wantBack && dist === 1 ? 2 : 1;
        // (and back: the new pitch for an 8th of a bar to a beat, the first and the last held as above)
        const avail = n.len - eighth - beat - 2 * g;
        let back: { at: number; len: number } | undefined, a1 = Math.min(n.len / 2 - g / 2, n.len - g - beat);
        if (wantBack && avail >= eighth - 1e-6) {
          const dwell = Math.max(eighth, Math.min(beat, avail * 0.6));
          a1 = Math.max(eighth, Math.min((n.len - 2 * g - dwell) / 2, n.len - 2 * g - dwell - beat));
          back = { at: a1 + g + dwell, len: g };
        }
        a1 = back ? a1 : Math.min(n.len / 2 - 0.5, n.len - 1 - beat);
        if (back || a1 >= eighth - 1e-6) {
          // (a whole tone away, from-to is the less likely shape)
          cand.push({ i, p: dist === 2 && !back ? p * 0.5 : p, boost: SINGLE_BOOST, to: n.midi + sg * dist, at: a1, glide: back ? g : 1, back, kind: `${dist === 1 ? 'half' : 'whole'} step ${sg > 0 ? 'up' : 'down'}${back ? ' and back' : ''}` });
          scaled = true;
        }
      }
    }
    // to a chord note or a step of the scale, up to a major 3rd either way: any of them, not just the nearest (the 5th to the root
    // and back, a 4th, was most of the bends)
    if (c && !scaled) {
      const opts: { d: number; w: number; chord: boolean }[] = [];
      for (let d = -maxBend; d <= maxBend; d++) {
        const m = n.midi + d, pc = ((m % 12) + 12) % 12;
        if (!d || m < ctx.range.lo || m > ctx.range.hi || (ctx.pent && !ctx.pent.has(pc))) continue;
        const dir = d > 0 ? 0.6 : 0.4;
        // (a bend to a chord note stays in the main range; the extended zone is for a note that saves a leap)
        if (pcs.includes(pc)) opts.push({ d, w: (Math.abs(d) >= 3 ? 3 : 1.5) * dir, chord: true });
        else if (scale?.has(pc) && Math.abs(d) <= 2) opts.push({ d, w: 0.25 * dir, chord: false });
      }
      if (opts.length) {
        const o = opts[cumulative(opts.map((x) => x.w), r('pick'))];
        cand.push({ i, p, to: n.midi + o.d, at, glide, kind: `${o.chord ? 'chord note' : 'scale step'} ${o.d > 0 ? 'up' : 'down'}` });
      }
    }
  });
  const won = cand.filter((c) => roll(seed, `ib-${c.kind}`, out[c.i].step) < Math.min(0.9, c.p * lift * (c.boost ?? 1))).sort((a, b) => b.p - a.p || out[a.i].step - out[b.i].step);
  const spots = out.filter((n) => n.bend).map((n) => n.step);
  for (const c of won) {
    const n = out[c.i];
    if (n.bendTo !== undefined || spots.some((s) => s !== n.step && Math.abs(s - n.step) < gap / 2) || out.some((o) => o.bendTo !== undefined && Math.abs(o.step - n.step) < gap)) continue;
    spots.push(n.step);
    n.bendTo = c.to;
    n.bendAt = c.at;
    n.bendLen = c.glide;
    n.inner = c.kind;
    if (c.back) n.more = [{ at: c.back.at, to: n.midi, len: c.back.len }];
    // (an ending that bends and fades out fades half as far: the bend is already doing the work)
    if (n.fadeBy) n.fadeBy = Math.round(n.fadeBy / 2);
  }
  return out;
}

/**
 * The line with no note running into the next one: a note that does is cut where the next begins (a bend inside it that no longer
 * fits is dropped). The last word before the bends, so they see the line as it will sound.
 */
export function trimOverlaps(notes: BandNote[]): BandNote[] {
  const out = notes.map((n) => ({ ...n }));
  for (let i = 0; i + 1 < out.length; i++) {
    const n = out[i], room = out[i + 1].step - n.step;
    if (n.len <= room + 1e-6) continue;
    n.len = room;
    if (n.more) { n.more = n.more.filter((m) => m.at + m.len <= n.len); if (!n.more.length) delete n.more; }
    if (n.bendTo !== undefined && n.bendAt! + n.bendLen! > n.len) { delete n.bendTo; delete n.bendAt; delete n.bendLen; delete n.inner; delete n.more; }
  }
  return out.filter((n) => n.len > 1e-6);
}
