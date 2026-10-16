// Second guitar: plays against the rhythm part. Per four-bar section it picks a role:
// a melody, a harmony of the riff, an octave melody, clean echoing arpeggios, volume swells,
// a funk single-note line, short licks answering the band, or it sits out for contrast.
// It's a melodic guitar part, not a stand-in for a singer: its phrases leave room.

import type { Genre, RiffStyle } from '../genres';
import type { LickKind } from '../players/lead';
import { LICK_HABITS, type LibLick, licksFor, lickFit, placeLibLick, placedHit } from './licks';
import type { ChordPart, GuitarHit, Song } from '../idea';
import type { Rng } from '../rng';
import { type Bar, groupStarts } from '../rhythm';
import { type Chord, type Mode, QUALITIES, SCALES, chordPc } from '../theory';
import { TUNINGS, type Tuning, powerChord, voicingsInTuning } from '../theory/fretboard';
import { type BarPlan, developCell, pitchCell } from './motif';

export type Guitar2Style = 'lead' | 'harmony' | 'octaves' | 'arp' | 'swell' | 'funk' | 'rhythm' | 'fills' | 'rest'
  // tracks, the lead player: answering the singer at the end of each phrase (or every two bars), and
  // a line climbing through the pre-chorus into the chorus
  | 'answer' | 'answerMore' | 'climb';

export const GUITAR2_LABEL: Record<Guitar2Style, string> = {
  lead: 'melody',
  harmony: 'harmony of the riff',
  octaves: 'octave melody',
  arp: 'clean picked arpeggios with echo',
  swell: 'volume swells',
  funk: 'single-note funk line',
  rhythm: 'rhythm chords under the riff',
  fills: 'short licks answering the band',
  rest: 'sits out',
  answer: 'answers the singer at the end of each phrase',
  answerMore: 'answers the singer every two bars',
  climb: 'a line climbing into the chorus',
};

const mod = (n: number, m: number) => ((n % m) + m) % m;

export function pickStyle(rng: Rng, genre: Genre, section: RiffStyle | null): Guitar2Style {
  // a picked hook wants chords under it; gallops and pedal riffs want a twin harmony
  if (section === 'picked') return rng.weighted([['rhythm', 4], ['swell', 1], ['rest', 1]]);
  // the riff is already a lick: leave it room
  if (section === 'lick') return rng.weighted([['rest', 2], ['fills', 1], ['lead', 1], ['octaves', 1]]);
  if (section === 'gallop') return rng.weighted([['harmony', 4], ['lead', 2], ['fills', 1]]);
  if (section === 'pedal') return rng.weighted([['harmony', 3], ['lead', 2], ['octaves', 1], ['fills', 1]]);
  if (section === 'single') return rng.weighted([['harmony', 4], ['lead', 2], ['octaves', 1], ['fills', 1]]);
  if (section === 'chug') return rng.weighted([['arp', 3], ['octaves', 1], ['fills', 1], ['lead', 2], ['swell', 1]]);
  if (section === 'big') return rng.weighted([['lead', 3], ['octaves', 2], ['swell', 2], ['arp', 1]]);
  if (section === 'arp') return rng.weighted([['swell', 2], ['lead', 2], ['fills', 1], ['rest', 1]]);
  // whole silent runs mostly become short licks: the part still breathes, but isn't just gone
  if (genre === 'rock') return rng.weighted([['lead', 2], ['octaves', 1], ['arp', 1], ['fills', 2], ['rest', 0.5]]);
  if (genre === 'pop') return rng.weighted([['arp', 3], ['swell', 1], ['lead', 2], ['fills', 1]]);
  return rng.weighted([['funk', 3], ['fills', 1]]);
}

export const MINORISH: Mode[] = ['minor', 'dorian', 'phrygian'];

/**
 * Where melodies sit (MIDI notes), above the rhythm guitars and bass: a melody from D4 to A5;
 * an octave melody's lower note from G3 to A4 (its top note an octave higher).
 */
const LEAD_RANGE: [number, number] = [62, 81];
const OCTAVE_RANGE: [number, number] = [55, 69];

/**
 * Pentatonic core plus the odd colour note from the mode (semitones above the key). Guitar riffs
 * and leads live in the pentatonic; a lot of modal colour made lines wander.
 */
export function leadScale(rng: Rng, mode: Mode, w: number): number[] {
  const minor = MINORISH.includes(mode);
  const s = new Set(minor ? [0, 3, 5, 7, 10] : [0, 2, 4, 7, 9]);
  for (const n of SCALES[mode]) if (rng.chance(0.1 + w * 0.3)) s.add(n);
  if (minor && rng.chance(0.15 + w * 0.4)) s.add(6);
  return [...s].sort((a, b) => a - b);
}

/** Lead notes sit around one hand position on the middle/high strings. */
export function leadFret(midi: number, t: Tuning, pos: number): { notes: number[]; strings: number[] } {
  let best = 5, bestCost = Infinity;
  for (let s = 1; s < 6; s++) {
    const fret = midi - t.strings[s];
    if (fret < 0 || fret > 19) continue;
    const cost = Math.abs(fret - pos) + (s === 1 ? 2 : 0);
    if (cost < bestCost) { best = s; bestCost = cost; }
  }
  return { notes: [midi], strings: [best] };
}

export const chordTones = (key: number, c: Chord) => QUALITIES[c.q].map((i) => mod(chordPc(key, c) + i, 12));

type Density = 'slow' | 'medium' | 'busy';

function groupRhythm(rng: Rng, g: number, d: Density): number[] {
  if (g === 4) {
    if (d === 'slow') return rng.pick([[0], [0], [], [0, 2]]);
    if (d === 'medium') return rng.pick([[0], [0, 2], [0, 3], [2], [0, 2, 3], []]);
    return rng.pick([[0, 1, 2, 3], [0, 2, 3], [0, 1, 3], [0, 2], [1, 2, 3]]);
  }
  if (g === 6) {
    if (d === 'slow') return rng.pick([[0], []]);
    if (d === 'medium') return rng.pick([[0, 3], [0, 2, 4], [0], [3]]);
    return rng.pick([[0, 1, 2, 3, 4, 5], [0, 2, 3, 4]]);
  }
  return d === 'busy' ? [0, 2, 4, 6].filter((p) => p < g) : [0];
}

interface NoteEv { step: number; midi: number; len: number; vel: number; slide?: number }

/**
 * How a melody uses a four-bar run: where it plays and where it breathes. Guitar 2 is a melodic
 * instrument part, not a stand-in singer: it can state a hook and leave room, or just answer the band.
 * - answer: a phrase, held, a breath; then an answer to it (same rhythm) ending home
 * - line: one longer phrase over two bars (the motif, then moved), held into the third, then space
 * - riff: a short instrumental hook in each bar with a gap after it, the last one ending home
 * - fills: mostly silent, short licks at the ends of bars 2 and 4 that answer the band
 */
export type Shape = 'answer' | 'line' | 'riff' | 'fills';
const SHAPE_DESC: Record<Shape, string> = {
  answer: 'phrase and answer', line: 'long phrase, then space', riff: 'short repeated hook', fills: 'short licks answering the band',
};

interface Onset { pos: number; strong: boolean }
/** One phrase: onsets from `at` (an absolute step), the last note held until `hold`. */
interface Phrase { at: number; rhythm: Onset[]; hold: number; plan: BarPlan; lick?: boolean }

const groupAt = (b: Bar, i: number) => {
  const st = groupStarts(b.groups);
  return i >= st.length ? b.len : st[Math.max(0, i)];
};

/** Onsets inside one bar, before `until` (a position in the bar). At least two notes. */
function motifRhythm(rng: Rng, b: Bar, d: Density, until: number, busyAt: (pos: number, g: number) => number): Onset[] {
  const st = groupStarts(b.groups);
  const LEVELS: Density[] = ['slow', 'medium', 'busy'];
  const out: Onset[] = [];
  b.groups.forEach((g, gi) => {
    const p0 = st[gi];
    if (p0 >= until) return;
    const level = Math.max(0, Math.min(2, LEVELS.indexOf(d) + busyAt(p0, g)));
    for (const o of groupRhythm(rng, g, LEVELS[level])) if (p0 + o < until) out.push({ pos: p0 + o, strong: o === 0 });
  });
  if (!out.length || out[0].pos > 2) out.unshift({ pos: 0, strong: true });
  // a guitar hook often starts just off the beat
  if (out[0].pos === 0 && out.length > 2 && rng.chance(0.2)) out[0] = { pos: 2, strong: false };
  if (out.length < 2) out.push({ pos: Math.min(until - 1, out[0].pos + (st[1] ?? 4)), strong: true });
  return out.filter((o, i, a) => i === 0 || o.pos > a[i - 1].pos);
}

/** A lick over the last one or two beats of a bar (positions in the bar). */
function lickRhythm(rng: Rng, b: Bar): Onset[] {
  const st = groupStarts(b.groups);
  const from = st[Math.max(0, st.length - 2)];
  const span = b.len - from;
  const t = span >= 8
    ? rng.pick([[0, 2, 4, 6], [2, 3, 4, 6], [0, 2, 3, 4], [4, 5, 6], [1, 2, 4], [0, 3, 6]])
    : span >= 6 ? rng.pick([[0, 2, 4], [0, 1, 2, 4], [2, 3, 4]]) : rng.pick([[0, 1, 2], [0, 2], [1, 2]]);
  return t.filter((p) => from + p < b.len).map((p) => ({ pos: from + p, strong: st.includes(from + p) }));
}

/**
 * A lead player's lick answering the singer, over the end of a bar (positions in the bar), by the
 * kind of licks they play: a couple of sung notes, a bluesy figure, a quick 16th run, one or two
 * plain notes, or short muted funk notes.
 */
function answerRhythm(rng: Rng, b: Bar, lick: LickKind): Onset[] {
  const st = groupStarts(b.groups);
  const n = st.length;
  // most licks live in the bar's last two beats; a run or a sung phrase sometimes starts a beat earlier
  const early = (lick === 'run' || lick === 'sung') && n >= 3 && rng.chance(0.35);
  const from = st[Math.max(0, n - (early ? 3 : 2))];
  let t: number[];
  if (lick === 'sung') t = rng.pick([[0, 4], [0, 2, 4], [2, 4], [0, 3, 4], [0, 6]]);
  else if (lick === 'blues') t = rng.pick([[0, 2, 3, 4], [0, 1, 2, 4], [0, 3, 4, 6], [2, 3, 4, 5, 6], [0, 2, 4, 5]]);
  else if (lick === 'run') {
    const len = rng.int(5, early ? 10 : 8);
    const at = rng.pick([0, 0, 1, 2]);
    t = Array.from({ length: len }, (_, i) => at + i);
  } else if (lick === 'simple') t = rng.pick([[0, 4], [0], [0, 2], [2]]);
  else t = rng.pick([[1, 3, 4, 6], [0, 3, 6], [0, 2, 3, 6], [1, 2, 4, 7]]);
  return t.filter((p) => from + p < b.len).map((p) => ({ pos: from + p, strong: st.includes(from + p) }));
}

/**
 * Blues licks, the way blues players actually phrase them: few notes, bends, the blue third, landing
 * on the root or the 5th. Notes as [position (16ths), semitones above the key's root, length, bend
 * (semitones bent up into it)]. `major`: the minor third bent or slid up to the major third (over
 * major keys); minor keys get their own.
 */
type LickNote = [number, number, number, number?];
const BLUES_LICKS: { notes: LickNote[]; major?: boolean; minor?: boolean }[] = [
  // the 4th bent up to the 5th, held
  { notes: [[0, 7, 8, 2]] },
  // the 7th bent up to the root, back to the 7th, down to the 5th
  { notes: [[0, 12, 4, 2], [4, 10, 2], [6, 7, 6]] },
  // the blue third slid up to the major third, home to the root
  { notes: [[0, 3, 1], [1, 4, 3], [4, 0, 8]], major: true },
  // the 4th, the minor third, home
  { notes: [[0, 5, 2], [2, 3, 2], [4, 0, 8]], minor: true },
  // the same bend twice, then down to the 5th
  { notes: [[0, 12, 2, 2], [3, 12, 3, 2], [6, 7, 6]] },
  // the 5th, the 7th, up to the root with a quarter-tone curl
  { notes: [[0, 7, 3], [3, 10, 3], [6, 12, 6, 1]] },
  // a bent minor third curled toward the major third (blue), then the root
  { notes: [[0, 4, 4, 1], [4, 0, 8]], major: true },
  // the root, the 7th below, the 5th below: a lazy fall
  { notes: [[0, 12, 2], [2, 10, 2], [4, 7, 8]] },
];

/** How a lead player answers the singer: at the end of every four bars or every two, with their kind of lick. */
interface Answer { every: 2 | 4; lick: LickKind }

/**
 * A melody over a run of bars (one or more four-bar runs share one motif, like a hook played twice).
 * Strong beats land on chord tones; every phrase ends on a held note followed by a breath.
 */
function melody(
  rng: Rng, song: Song, chords: ChordPart, bars: Bar[], density: Density,
  lo: number, hi: number, scale: number[], slide: number, riff: GuitarHit[] | null, shape: Shape, answer?: Answer, steps = false,
): NoteEv[] {
  const { key, total } = song;
  // riff notes sounding at each step: the melody fills the riff's gaps and avoids clashing with it
  const riffPcs = (g: number) => (riff ?? [])
    .filter((h) => h.step <= g && g < h.step + h.len && h.mute !== 'dead')
    .flatMap((h) => h.notes.map((n) => mod(n, 12)));
  const clashes = (m: number, g: number) => riffPcs(g).some((pc) => [1, 6, 11].includes(mod(m - pc, 12)));
  // a held note a semitone from a chord tone, or a tritone from the root, grinds against the band
  const rubs = (m: number, g: number) => {
    const c = chordAt(g), pc = mod(m, 12);
    return chordTones(key, c).some((t) => [1, 11].includes(mod(pc - t, 12))) || mod(pc - chordPc(key, c), 12) === 6;
  };
  // busier where the riff rests, sparser where it's busy
  const busyAt = (b: Bar) => (pos: number, g: number) => {
    if (!riff) return 0;
    const a = b.start + pos;
    const n = riff.filter((h) => h.step >= a && h.step < a + g).length;
    return n === 0 ? 1 : n >= g * 0.75 ? -1 : 0;
  };
  const pool: number[] = [];
  // (Lines: the key's full scale, so a step is a step, not a pentatonic gap)
  const sc: readonly number[] = steps ? SCALES[song.mode] : scale;
  for (let m = lo; m <= hi; m++) if (sc.includes(mod(m - key, 12))) pool.push(m);
  const clampI = (i: number) => Math.max(0, Math.min(pool.length - 1, i));
  const chordAt = (g: number) => chords.timeline[chords.chordIdx[Math.min(g, total - 1)]].chord;
  const nearest = (idx: number, ok: (pc: number) => boolean) => {
    for (let d = 0; d < pool.length; d++) {
      for (const j of [idx - d, idx + d]) if (j >= 0 && j < pool.length && ok(mod(pool[j], 12))) return j;
    }
    return idx;
  };
  const snap = (idx: number, step: number) => {
    const tones = chordTones(key, chordAt(step));
    const j = nearest(idx, (pc) => tones.includes(pc));
    return Math.abs(j - idx) <= 3 ? j : idx;
  };

  // one motif (rhythm and pitch shape) for the whole melody, so it's recognisable when it comes back
  const b0 = bars[0];
  const detached = rng.chance(0.4); // picked short and separate, rather than legato
  const motifUntil = shape === 'riff' ? groupAt(b0, Math.ceil(b0.groups.length / 2)) : shape === 'line' ? b0.len : groupAt(b0, b0.groups.length - 1);
  const call = motifRhythm(rng, b0, density, motifUntil, busyAt(b0));
  const cell = pitchCell(rng, call.length, 6, steps);
  // a run goes by step, up from below or down from above (with a turn at the end now and then)
  const run = () => {
    const up = rng.chance(0.5);
    const c = Array.from({ length: 10 }, (_, i) => (up ? i - 4 : 4 - i));
    if (rng.chance(0.4)) c[rng.int(5, 9)] += up ? -2 : 2;
    return c;
  };
  const lickCells = answer?.lick === 'run' ? [run(), run()] : [pitchCell(rng, 4, 5, steps), pitchCell(rng, 4, 5, steps)];
  const shift = rng.pick([1, -1, 2]);
  const runs: Bar[][] = [];
  for (let i = 0; i < bars.length; i += 4) runs.push(bars.slice(i, i + 4));

  const phrases: Phrase[] = [];
  const endOf = (b: Bar) => b.start + b.len;
  runs.forEach((B, ri) => {
    const lastRun = ri === runs.length - 1;
    const close: BarPlan['ending'] = lastRun ? 'home' : 'open';
    const n = B.length;
    const fit = (b: Bar) => call.filter((o) => o.pos < b.len);
    const s = shape === 'line' && n < 3 ? 'answer' : shape;
    if (s === 'answer') {
      // the phrase holds through the first beat of the next bar, then breathes
      const first = n >= 2 ? B[1].start + groupAt(B[1], 1) : B[0].start + groupAt(B[0], B[0].groups.length - 1);
      phrases.push({ at: B[0].start, rhythm: fit(B[0]), hold: first, plan: { shift: 0, ending: n >= 3 ? 'open' : close } });
      if (n >= 3) {
        const hold = n >= 4 ? B[3].start + groupAt(B[3], 2) : endOf(B[2]) - 2;
        phrases.push({ at: B[2].start, rhythm: fit(B[2]), hold, plan: { shift: 0, ending: close } });
      }
    } else if (s === 'line') {
      phrases.push({ at: B[0].start, rhythm: fit(B[0]), hold: B[1].start, plan: { shift: 0 } });
      phrases.push({
        at: B[1].start, rhythm: fit(B[1]).filter((o) => o.pos < groupAt(B[1], B[1].groups.length - 1)),
        hold: B[2].start + groupAt(B[2], 2), plan: { shift, ending: close },
      });
      // sometimes a pickup lick leads into what comes next
      if (n >= 4 && rng.chance(0.5)) phrases.push({ at: B[3].start, rhythm: lickRhythm(rng, B[3]), hold: endOf(B[3]), plan: { shift: 0, ending: 'turn' }, lick: true });
    } else if (s === 'riff') {
      // the hook in each bar, a gap after it; the last bar answers and ends home
      const holds = [0.75, 0.6, 0.75, 0.5];
      B.forEach((b, bi) => {
        const lastBar = bi === n - 1 && n > 1;
        const hold = b.start + groupAt(b, Math.round(b.groups.length * holds[bi]));
        const plan: BarPlan = lastBar ? { shift: 0, ending: close } : bi === 1 ? { shift: rng.chance(0.5) ? 0 : shift } : { shift: 0 };
        phrases.push({ at: b.start, rhythm: fit(b).filter((o) => b.start + o.pos < hold), hold, plan });
      });
    } else {
      // answers at the ends of bars 2 and 4 (and sometimes a single held note to start); answering a
      // singer, only in the gaps between their lines: the end of each phrase, or of every two bars
      if (!answer && rng.chance(0.4)) phrases.push({ at: B[0].start, rhythm: [{ pos: 0, strong: true }], hold: B[0].start + groupAt(B[0], 2), plan: { shift: 0 } });
      B.forEach((b, bi) => {
        // (every two bars: the halfway answer only now and then, so the verse doesn't get busy)
        if (n > 1 && (answer?.every === 4 ? bi !== n - 1 : bi % 2 === 0 || (bi !== n - 1 && !rng.chance(0.5)))) return;
        const rhythm = answer ? answerRhythm(rng, b, answer.lick) : lickRhythm(rng, b);
        if (rhythm.length) phrases.push({ at: b.start, rhythm, hold: endOf(b), plan: { shift: 0, ending: bi === n - 1 ? close : 'open' }, lick: true });
      });
    }
  });

  const tonic = mod(key, 12);
  const anchor = clampI(Math.floor(pool.length / 2) - 2);
  const evs: NoteEv[] = [];
  phrases.forEach((ph, pi) => {
    const base = ph.lick ? lickCells[pi % 2] : cell;
    const shaped = developCell(base.length >= ph.rhythm.length ? base.slice(0, ph.rhythm.length) : [...base, ...base].slice(0, ph.rhythm.length), ph.plan);
    // a cut-down phrase still ends where the plan says
    const steps = ph.rhythm.length < base.length && ph.plan.ending ? developCell(shaped, { shift: 0, ending: ph.plan.ending }) : shaped;
    ph.rhythm.forEach((o, i) => {
      const step = ph.at + o.pos;
      if (step >= total) return;
      let j = clampI(anchor + (ph.lick ? 2 : 0) + steps[i]);
      const last = i === ph.rhythm.length - 1;
      if (last && ph.plan.ending === 'home') j = nearest(j, (pc) => pc === tonic);
      else if (last && ph.plan.ending === 'open') {
        const tones = chordTones(key, chordAt(step));
        j = nearest(j, (pc) => pc !== tonic && tones.includes(pc));
      } else if (o.strong || last) j = snap(j, step);
      const nextAt = last ? ph.hold : ph.at + ph.rhythm[i + 1].pos;
      const gap = Math.max(1, nextAt - step);
      // a semitone or tritone against the riff sounds wrong, and so does a held note that rubs against
      // the chord (quick passing notes are fine): move to the nearest note that doesn't
      const held = gap >= 2 || o.strong;
      const bad = (m: number) => clashes(m, step) || (held && rubs(m, step));
      if (bad(pool[j])) {
        const k = [j + 1, j - 1, j + 2, j - 2].find((x) => x >= 0 && x < pool.length && !bad(pool[x]));
        if (k !== undefined) j = k;
        // rich chords (9ths, #9s) leave few safe notes nearby: a held note goes to the nearest chord tone
        else if (held) {
          const tones = chordTones(key, chordAt(step));
          const ok = (x: number) => x >= 0 && x < pool.length && tones.includes(mod(pool[x], 12)) && !bad(pool[x]);
          for (let d = 1; d <= 4; d++) {
            const x = [j - d, j + d].find(ok);
            if (x !== undefined) { j = x; break; }
          }
        }
      }
      const len = last ? gap : detached && gap >= 2 ? gap - 1 : gap;
      const sl = last && len >= 4 && rng.chance(slide) ? -rng.pick([1, 2, 2]) : undefined;
      const vel = last ? 0.84 : i === 0 ? 0.88 : o.strong ? 0.84 : 0.74;
      evs.push({ step, midi: pool[j], len, vel, slide: sl });
    });
  });
  evs.sort((a, b) => a.step - b.step);
  // anticipations (a player's habit): a note that falls on a downbeat comes an 8th early and is tied
  // over the bar line, so the line runs across the bar instead of starting again on each one
  if (rng.chance(0.5)) {
    for (const b of bars.slice(1)) {
      const i = evs.findIndex((e) => e.step === b.start);
      if (i <= 0 || !rng.chance(0.6)) continue;
      const e = evs[i], early = b.start - 2, prev = evs[i - 1];
      if (prev.step >= early || clashes(e.midi, early) || rubs(e.midi, early)) continue;
      prev.len = Math.min(prev.len, early - prev.step);
      evs[i] = { ...e, step: early, len: e.len + 2 };
    }
  }
  // nothing overlaps the next note
  return evs.filter((e, i) => i === 0 || e.step > evs[i - 1].step).map((e, i, a) => ({ ...e, len: Math.max(1, Math.min(e.len, (a[i + 1]?.step ?? Infinity) - e.step)) }));
}

/** Lines (switch, docs/LEAD-LINES.md): how often each kind of lead player plays a whole line where they'd answer with a lick. */
const LINE_HABIT: Record<LickKind, number> = { sung: 0.8, blues: 0.6, run: 0.8, simple: 0.65, muted: 0.5 };

/**
 * A lead line (Lines, docs/LEAD-LINES.md): real lead guitar phrases run about 9 notes over two bars and
 * move mostly by step (docs/STUDY-LEAD.md), where the answers were 3-note licks with leaps. From `from`
 * to `to` (steps): 8ths with some 16ths and the odd quarter, by beat, ending on a held chord note; the
 * notes walk the key's full scale, mostly a step at a time (now and then the same note or a third, rarely
 * a leap, stepped back from), falling, rising or arching, strong beats and held notes on chord notes
 * where a step allows, turning at the edges of the range. `prev`: the note played before it.
 */
function stepLine(
  rng: Rng, song: Song, chords: ChordPart, from: number, to: number, prev: number, riff: GuitarHit[] | null, lick: LickKind, home: boolean,
): NoteEv[] {
  const { key, mode, total } = song;
  const chordAt = (g: number) => chords.timeline[chords.chordIdx[Math.min(g, total - 1)]].chord;
  const isTone = (m: number, g: number) => chordTones(key, chordAt(g)).includes(mod(m, 12));
  const rubs = (m: number, g: number) => {
    const c = chordAt(g), pc = mod(m, 12);
    return chordTones(key, c).some((t) => [1, 11].includes(mod(pc - t, 12))) || mod(pc - chordPc(key, c), 12) === 6;
  };
  const clashes = (m: number, g: number) => (riff ?? []).some((h) => h.step <= g && g < h.step + h.len && h.mute !== 'dead' && h.notes.some((n) => [1, 6, 11].includes(mod(m - n, 12))));
  // the beats it plays: each beat group's rhythm, by the player (a shredder busier, a funk player choppier)
  const busy = lick === 'run' ? 3 : lick === 'muted' ? 1.5 : 0.6;
  const onsets: { g: number; strong: boolean }[] = [];
  const beats: { g: number; len: number }[] = [];
  for (const b of song.bars) {
    groupStarts(b.groups).forEach((p, i) => { const g = b.start + p; if (g >= from && g < to) beats.push({ g, len: b.groups[i] }); });
  }
  if (beats.length < 3) return [];
  // the last beat (two now and then) holds the line's last note
  const holdBeats = beats.length >= 5 && rng.chance(0.4) ? 2 : 1;
  beats.slice(0, beats.length - holdBeats).forEach(({ g, len }) => {
    const cell = len === 4
      ? rng.weighted<number[]>([[[0, 2], 4], [[0], 1.2], [[0, 2, 3], 1.5], [[0, 1, 2], 1], [[0, 1, 2, 3], busy], [[2], 0.4], [[0, 3], 0.6]])
      : len === 6 ? rng.weighted<number[]>([[[0, 2, 4], 3], [[0], 1], [[0, 3], 1.5], [[0, 1, 2, 3, 4, 5], busy * 0.7]])
        : [0, 2, 4].filter((p) => p < len);
    for (const p of cell) onsets.push({ g: g + p, strong: p === 0 });
  });
  onsets.push({ g: beats[beats.length - holdBeats].g, strong: true });
  // the key's full scale, in the lead's range
  const pool: number[] = [];
  for (let m = LEAD_RANGE[0]; m <= LEAD_RANGE[1]; m++) if ((SCALES[mode] as readonly number[]).includes(mod(m - key, 12))) pool.push(m);
  const near = (m: number) => pool.reduce((bi, x, i) => (Math.abs(x - m) < Math.abs(pool[bi] - m) ? i : bi), 0);
  const contour = rng.weighted<'fall' | 'rise' | 'arch' | 'wave'>([['fall', 3], ['arch', 3], ['rise', 2], ['wave', 2]]);
  let dir = contour === 'rise' || contour === 'arch' ? 1 : -1;
  // a start near the last note played, a little above it for a falling line, below for a rising one
  let j = Math.max(0, Math.min(pool.length - 1, near(prev) + (contour === 'fall' ? rng.int(0, 2) : contour === 'rise' ? -rng.int(0, 2) : rng.int(-1, 1))));
  const out: NoteEv[] = [];
  let backFromLeap = 0;
  onsets.forEach((o, i) => {
    const last = i === onsets.length - 1;
    const len = Math.max(1, (last ? to : onsets[i + 1].g) - o.g);
    if (i > 0) {
      if (contour === 'arch' && i === Math.round(onsets.length * 0.45)) dir = -1;
      if (contour === 'wave' && i % 4 === 0) dir = -dir;
      let mv: number;
      if (backFromLeap) { mv = backFromLeap; backFromLeap = 0; }
      else {
        const r = rng.next();
        mv = r < 0.13 ? 0 : r < 0.75 ? dir : r < 0.84 ? -dir : r < 0.95 ? 2 * dir : rng.int(3, 4) * dir;
        if (Math.abs(mv) >= 3) backFromLeap = -dir;
      }
      if (j + mv < 0 || j + mv >= pool.length) { dir = -dir; mv = -mv; backFromLeap = 0; }
      j = Math.max(0, Math.min(pool.length - 1, j + mv));
    } else if (!isTone(pool[j], o.g)) {
      // a line starts on a chord note
      j = [j, j + 1, j - 1, j + 2, j - 2].find((x) => x >= 0 && x < pool.length && isTone(pool[x], o.g)) ?? j;
    }
    const held = len >= 3 || last;
    // strong beats and held notes on a chord note a step away (the way it's going first); never a held rub, never against the riff
    const ok = (x: number) => x >= 0 && x < pool.length && !clashes(pool[x], o.g) && !(held && rubs(pool[x], o.g));
    if ((o.strong || held) && !isTone(pool[j], o.g)) {
      const k = [j + dir, j - dir].find((x) => ok(x) && isTone(pool[x], o.g));
      if (k !== undefined) j = k;
    }
    if (!ok(j)) j = [j + dir, j - dir, j + 2 * dir, j - 2 * dir].find(ok) ?? j;
    if (last) {
      // ending: home on the root at the end of a phrase, else a chord note, stepped into
      const want = (x: number) => (home ? mod(pool[x] - key, 12) === 0 : isTone(pool[x], o.g)) && ok(x);
      const k = [j, j - 1, j + 1, j - 2, j + 2, j - 3, j + 3].find((x) => x >= 0 && x < pool.length && want(x));
      if (k !== undefined) {
        j = k;
        const p = out[out.length - 1];
        if (p && Math.abs(near(p.midi) - j) > 2) {
          const s = j + (near(p.midi) > j ? 1 : -1);
          if (ok(s)) p.midi = pool[s];
        }
      }
    }
    out.push({ step: o.g, midi: pool[j], len: last ? len : Math.min(len, len >= 2 && rng.chance(0.3) ? len - 1 : len), vel: i === 0 ? 0.86 : last ? 0.84 : o.strong ? 0.8 : 0.72 });
  });
  return out;
}

/** A melody shape for a run, by style and genre. */
function pickShape(rng: Rng, genre: Genre, octaves: boolean, lines = false): Shape {
  // (Lines: the long phrase over two bars far more often, the short hook a bar less)
  const L = lines ? 3 : 1, R = lines ? 0.4 : 1;
  if (octaves) return rng.weighted<Shape>([['answer', 3], ['line', 2 * L], ['riff', 1 * R]]);
  const heavy = genre === 'rock' || genre === 'hardrock' || genre === 'metal' || genre === 'grunge' || genre === 'altmetal';
  return rng.weighted<Shape>(heavy ? [['riff', 3 * R], ['answer', 3], ['line', 2 * L]] : [['answer', 3], ['line', 2 * L], ['riff', 2 * R]]);
}

/**
 * A hook across a whole section: one motif, stated and answered, the same tune carried over each
 * chord. Tracks bring it back in the intro, interludes, last chorus and outro.
 */
export function generateHook(rng: Rng, song: Song, chords: ChordPart, riff: GuitarHit[] | null, o: { lines?: boolean } = {}): GuitarHit[] {
  const { w, mode } = song;
  const t = song.tuning ?? TUNINGS.standard;
  const scale = leadScale(rng, mode, w);
  const pos = rng.int(5, 12);
  const octaves = rng.chance(0.3);
  const [lo, hi] = octaves ? OCTAVE_RANGE : LEAD_RANGE;
  const density: Density = rng.pick(['medium', 'medium', 'slow']);
  const shape = pickShape(rng, song.partGenres.strum, octaves, o.lines);
  return melody(rng, song, chords, song.bars, density, lo, hi, scale, song.tuning ? 0.2 : 0.1, riff, shape === 'fills' ? 'answer' : shape, undefined, o.lines).map((n) => {
    const f = leadFret(n.midi, t, pos);
    if (octaves) { f.notes.push(n.midi + 12); f.strings.push(Math.min(5, f.strings[0] + 2)); }
    return { step: n.step, ...f, len: n.len, vel: n.vel, slide: n.slide };
  });
}

export interface Guitar2Part {
  hits: GuitarHit[];
  notes: string[];
}

/**
 * One role per four-bar run. `force` sets the role of each run instead of picking one
 * (used by tracks, where the section's energy decides).
 */
export function generateGuitar2(
  rng: Rng, song: Song, chords: ChordPart, riff: GuitarHit[] | null, force?: Guitar2Style[], lick: LickKind = 'sung',
  o: { lines?: boolean } = {},
): Guitar2Part {
  const { key, w, bars, mode } = song;
  const t = song.tuning ?? TUNINGS.standard;
  const genre = song.partGenres.strum;
  const scale = leadScale(rng, mode, w);
  const hits: GuitarHit[] = [];
  const styles: Guitar2Style[] = [];
  const labels: string[] = [];
  const quietSection = (run: number[]) => song.sections?.[run[0]] === 'arp';
  const center = 60 + key > 66 ? 48 + key : 60 + key; // a register around middle C
  const runs: number[][] = [];
  for (let r = 0; r < bars.length; r += 4) runs.push([r, r + 1, r + 2, r + 3].filter((i) => i < bars.length));

  let lastLick: (typeof BLUES_LICKS)[number] | null = null;
  // the player's own licks (licks.ts) answering the singer: ending on the bar line, up to three beats long
  const fit = lickFit(song, chords, riff);
  let lastLib: LibLick | null = null;
  const libAnswer = (b: Bar, pos: number, clean: boolean): GuitarHit[] | null => {
    const st = groupStarts(b.groups);
    const earliest = b.start + st[Math.max(0, st.length - 3)];
    const end = b.start + b.len;
    const before = hits.filter((h) => h.step < earliest);
    const prev = before.length ? before[before.length - 1].notes[before[before.length - 1].notes.length - 1] : 69;
    const options = rng.shuffle(licksFor(lick, null, fit.chordAt(Math.max(earliest, end - 8)), end - earliest).filter((l) => l !== lastLib));
    for (const l of options.slice(0, 8)) {
      // (now and then cut down: its first notes left off)
      const from = l.notes.length > 3 && rng.chance(0.3) ? rng.int(1, Math.floor(l.notes.length / 2)) : 0;
      const placed = placeLibLick(rng, fit, key, l, end, LEAD_RANGE[0], LEAD_RANGE[1], prev, 'any', lick, 0.8, from);
      if (!placed || placed[0].step < earliest) continue;
      lastLib = l;
      // funk licks are clipped short
      if (lick === 'muted') placed[placed.length - 1].len = Math.min(placed[placed.length - 1].len, 3);
      return placed.map((e) => placedHit(e, t, pos, clean || lick === 'muted'));
    }
    return null;
  };
  /** Replace what's in the answer at the end of bar `b` with one of the player's licks (by their habit). */
  const swapIn = (b: Bar, pos: number, clean: boolean) => {
    if (!rng.chance(LICK_HABITS[lick].verse)) return false;
    const l = libAnswer(b, pos, clean);
    if (!l) return false;
    const from = l[0].step, to = b.start + b.len;
    for (let i = hits.length - 1; i >= 0; i--) if (hits[i].step >= from && hits[i].step < to) hits.splice(i, 1);
    // what came before stops where the lick starts
    for (const h of hits) if (h.step < from && h.step + h.len > from) h.len = Math.max(1, from - h.step);
    hits.push(...l);
    return true;
  };
  /** Lines (switch): a whole line of `beats` beats ending with bar `b` (not before `earliest`), in place of what's there. */
  const lineIn = (b: Bar, beats: number, earliest: number, pos: number, clean: boolean, home: boolean) => {
    const end = b.start + b.len;
    let from = Math.max(earliest, end - beats * 4);
    // (from a beat)
    const fb = bars.find((x) => from >= x.start && from < x.start + x.len) ?? b;
    from = fb.start + Math.max(...groupStarts(fb.groups).filter((p) => fb.start + p <= from));
    const before = hits.filter((h) => h.step < from);
    const prev = before.length ? before[before.length - 1].notes[before[before.length - 1].notes.length - 1] : 69;
    const line = stepLine(rng, song, chords, from, end, prev, riff, lick, home);
    if (line.length < 4) return false;
    for (let i = hits.length - 1; i >= 0; i--) if (hits[i].step >= from && hits[i].step < end) hits.splice(i, 1);
    for (const h of hits) if (h.step < from && h.step + h.len > from) h.len = Math.max(1, from - h.step);
    const muted = lick === 'muted';
    for (const n of line) hits.push({ step: n.step, ...leadFret(n.midi, t, pos), len: muted ? Math.min(n.len, 2) : n.len, vel: n.vel, clean: clean || muted });
    return true;
  };
  // (how long a line is: most of the last two bars at a phrase's end, a bar and a bit halfway)
  const lineBeats = (end: boolean) => (end ? rng.int(6, 9) : rng.int(4, 6));
  runs.forEach((run, ri) => {
    const section = song.sections?.[run[0]] ?? null;
    let style = force?.[ri] ?? pickStyle(rng, genre, section);
    // the second half should usually answer the first; never leave both empty
    if (!force && ri > 0 && styles[ri - 1] === 'rest' && style === 'rest') style = section === 'arp' ? 'swell' : 'lead';
    const runBars = run.map((i) => bars[i]);
    const last = runBars[runBars.length - 1];
    const from = runBars[0].start, to = last.start + last.len;
    // a harmony follows the riff's ringing single notes (not chords, not the pedal, not palm-muted
    // chugs: harmonised chugs turn to mush through distortion)
    const harmonizable = (h: GuitarHit) =>
      h.step >= from && h.step < to && h.notes.length === 1 && !h.mute && !h.clean && !h.pedal;
    if (style === 'harmony' && !riff?.some(harmonizable)) style = 'lead';
    styles.push(style);
    labels.push(GUITAR2_LABEL[style]);
    const clean = quietSection(run) || style === 'arp' || style === 'funk';
    const pos = rng.int(5, 12);

    if ((style === 'answer' || style === 'answerMore') && lick === 'blues') {
      // a blues player: a lick from the blues vocabulary at the end of each phrase (and, later in the
      // song, now and then halfway through it), ending on the bar line
      const major = !MINORISH.includes(mode);
      const root = 57 + mod(key - 57, 12); // the key's root between A3 and G#4: licks reach an octave up
      const licks = BLUES_LICKS.filter((l) => (major ? !l.minor : !l.major));
      runBars.forEach((b, bi) => {
        const n = runBars.length;
        const end = bi === n - 1;
        if (!end && !(style === 'answerMore' && bi === Math.floor(n / 2) - 1 && rng.chance(0.35))) return;
        if (o.lines && rng.chance(LINE_HABIT[lick]) && lineIn(b, lineBeats(end), from, pos, clean, end && ri === runs.length - 1)) return;
        if (swapIn(b, pos, clean)) return;
        // (not the same lick twice running)
        const l = rng.pick(licks.filter((x) => x !== lastLick));
        lastLick = l;
        const span = Math.max(...l.notes.map(([p, , len]) => p + len));
        const start = Math.max(0, Math.floor((b.len - span) / 2) * 2);
        for (const [p, iv, len, bend] of l.notes) {
          if (start + p >= b.len) continue;
          hits.push({ step: b.start + start + p, ...leadFret(root + iv, t, pos), len: Math.min(len, b.len - start - p), vel: p === 0 ? 0.86 : 0.8, bend: bend ?? 0, clean });
        }
      });
    } else if (style === 'answer' || style === 'answerMore') {
      // the lead player answering the singer, in the gaps between their lines; muted funk licks are short
      const answer: Answer = { every: style === 'answer' ? 4 : 2, lick };
      for (const n of melody(rng, song, chords, runBars, 'medium', ...LEAD_RANGE, scale, song.tuning ? 0.2 : 0.1, riff, 'fills', answer, o.lines)) {
        const muted = lick === 'muted';
        hits.push({ step: n.step, ...leadFret(n.midi, t, pos), len: muted ? Math.min(n.len, 2) : n.len, vel: n.vel, slide: n.slide, clean: clean || muted });
      }
      // where they answered, now and then one of their own licks instead
      runBars.forEach((b, bi) => {
        const n = runBars.length;
        const answered = hits.some((h) => h.step >= b.start + b.len / 2 && h.step < b.start + b.len);
        if (!answered || !(bi === n - 1 || (style === 'answerMore' && bi % 2 === 1))) return;
        if (o.lines && rng.chance(LINE_HABIT[lick]) && lineIn(b, lineBeats(bi === n - 1), from, pos, clean, bi === n - 1 && ri === runs.length - 1)) return;
        swapIn(b, pos, clean);
      });
    } else if (style === 'climb') {
      // a line climbing into the chorus: a held chord note each bar, then a scale run up a note a beat
      // in the last bar to its top note. Worked out backwards from that top note, so it always arrives
      const chordAt = (g: number) => chords.timeline[chords.chordIdx[Math.min(g, song.total - 1)]].chord;
      const onsets: { g: number; end: number; run: boolean }[] = [];
      runBars.forEach((b, bi) => {
        const lastBar = bi === runBars.length - 1;
        const at = lastBar ? groupStarts(b.groups) : [0];
        at.forEach((p, i) => onsets.push({ g: b.start + p, end: i + 1 < at.length ? b.start + at[i + 1] : b.start + b.len, run: lastBar }));
      });
      const isTone = (m: number, g: number) => chordTones(key, chordAt(g)).includes(mod(m, 12));
      // a scale note that doesn't rub (a semitone) against the chord
      const smooth = (m: number, g: number) => scale.includes(mod(m - key, 12))
        && !chordTones(key, chordAt(g)).some((c) => [1, 11].includes(mod(m - c, 12)));
      const below = (m: number, ok: (x: number) => boolean, gap: number) => {
        for (let x = m - gap; x > m - 13; x--) if (ok(x)) return x;
        return m - gap;
      };
      const ms: number[] = new Array(onsets.length);
      const lastG = onsets[onsets.length - 1].g;
      ms[ms.length - 1] = below(LEAD_RANGE[1] - 1, (x) => isTone(x, lastG), 0);
      for (let i = onsets.length - 2; i >= 0; i--) {
        const o = onsets[i];
        // the run: the scale note below; a held note: a chord note at least a couple of semitones below
        ms[i] = o.run ? below(ms[i + 1], (x) => smooth(x, o.g), 1)
          : below(ms[i + 1], (x) => isTone(x, o.g), 2);
      }
      onsets.forEach((o, i) => {
        hits.push({ step: o.g, ...leadFret(ms[i], t, pos), len: o.end - o.g, vel: 0.72 + 0.14 * (i / Math.max(1, onsets.length - 1)), clean });
      });
    } else if (style === 'lead' || style === 'octaves' || style === 'fills') {
      const density: Density = section === 'big' || style === 'octaves' ? rng.pick(['slow', 'medium']) : rng.pick(['medium', 'medium', 'slow']);
      const [lo, hi] = style === 'octaves' ? OCTAVE_RANGE : LEAD_RANGE;
      const shape = style === 'fills' ? 'fills' : pickShape(rng, genre, style === 'octaves', o.lines);
      if (style !== 'fills') labels[labels.length - 1] += ` (${SHAPE_DESC[shape]})`;
      if (riff) labels[labels.length - 1] += ' in the gaps of the riff';
      for (const n of melody(rng, song, chords, runBars, density, lo, hi, scale, song.tuning ? 0.2 : 0.1, riff, shape, undefined, o.lines)) {
        const f = leadFret(n.midi, t, pos);
        if (style === 'octaves') { f.notes.push(n.midi + 12); f.strings.push(Math.min(5, f.strings[0] + 2)); }
        hits.push({ step: n.step, ...f, len: n.len, vel: n.vel, slide: n.slide, clean });
      }
      // Lines: some of the short licks answering the band become whole lines
      if (o.lines && style === 'fills') {
        runBars.forEach((b, bi) => {
          const n = runBars.length;
          if (hits.some((h) => h.step >= b.start + b.len / 2 && h.step < b.start + b.len) && rng.chance(0.5)) lineIn(b, lineBeats(bi === n - 1), from, pos, clean, bi === n - 1 && ri === runs.length - 1);
        });
      }
    } else if (style === 'harmony' && riff) {
      // gallops and pedal riffs: the classic twin-guitar third
      const twin = section === 'gallop' || section === 'pedal';
      const interval = twin && rng.chance(0.75) ? 'third' : rng.pick(['third', 'fourth', 'fifth', 'octave'] as const);
      const sc: readonly number[] = SCALES[mode];
      for (const h of riff) {
        if (!harmonizable(h)) continue;
        const m = h.notes[0];
        let up = 12;
        if (interval === 'fourth') up = 5;
        if (interval === 'fifth') up = 7;
        if (interval === 'third') {
          const d = sc.indexOf(mod(m - key, 12));
          up = d < 0 ? 3 : mod(sc[(d + 2) % 7] - sc[d], 12);
        }
        let target = m + up;
        while (target < 55) target += 12;
        hits.push({ step: h.step, ...leadFret(target, t, pos), len: h.len, vel: h.vel * 0.95, slide: h.slide, mute: h.mute });
      }
      labels[labels.length - 1] = `harmony of the riff, a${interval === 'octave' ? 'n' : ''} ${interval} up`;
    } else if (style === 'rhythm') {
      // ringing power chords following the chords (the second guitar under a picked hook):
      // held through the bar, or on beats 1 and 3
      const feel = rng.weighted([['hold', 3], ['half', 2]] as const);
      for (const b of runBars) {
        const gs = groupStarts(b.groups);
        const st = (feel === 'hold' ? [0] : gs.filter((_, i) => i % 2 === 0)).map((p) => b.start + p);
        const changes = chords.timeline.map((e) => e.step).filter((s) => s > b.start && s < b.start + b.len);
        const starts = [...new Set([...st, ...changes])].sort((x, y) => x - y);
        starts.forEach((s, i) => {
          const pc = chordPc(key, chords.timeline[chords.chordIdx[s]].chord);
          const len = (starts[i + 1] ?? b.start + b.len) - s;
          hits.push({ step: s, ...powerChord(pc, t, true), len, vel: s === b.start ? 0.84 : 0.72 });
        });
      }
    } else if (style === 'arp') {
      const vs = voicingsInTuning(key, chords.timeline.map((e) => e.chord), t, { preferOpen: true });
      const dotted = rng.chance(0.55);
      const order = rng.pick(['up', 'down', 'updown'] as const);
      // pick through most of each bar and let the last note ring over the rest; the run's last bar
      // stops halfway, so the pattern breathes at the end of the phrase
      const ringLast = rng.chance(0.65);
      let k = 0, lastTi = -1;
      runBars.forEach((b, bi) => {
        const nG = b.groups.length;
        const breathe = bi === runBars.length - 1 && runBars.length > 1;
        const stopAt = breathe ? groupAt(b, Math.ceil(nG / 2)) : ringLast ? groupAt(b, nG - 1) : b.len;
        // at the end of the phrase everything stops ringing a beat early: a real gap
        const ringEnd = breathe ? b.start + groupAt(b, nG - 1) : Infinity;
        const onsets: number[] = [];
        for (let p = 0; p < stopAt; p += dotted ? 3 : 2) onsets.push(b.start + p);
        onsets.forEach((g, oi) => {
          const ti = chords.chordIdx[g];
          if (ti !== lastTi) { k = 0; lastTi = ti; }
          const v = vs[ti];
          const strings = v.frets.flatMap((f, s) => (f === null ? [] : [s]));
          const top = v.notes.map((n, i) => ({ n, s: strings[i] })).slice(-4);
          const lift = top[top.length - 1].n < 64 ? 12 : 0;
          const seq = order === 'up' ? top : order === 'down' ? [...top].reverse() : [...top, ...top.slice(1, -1).reverse()];
          const x = seq[k++ % seq.length];
          const lastNote = oi === onsets.length - 1;
          hits.push({
            step: g, notes: [x.n + lift], strings: [x.s], len: Math.min(lastNote ? b.start + b.len - g : 8, ringEnd - g),
            vel: (lastNote ? 0.58 : 0.5) + rng.next() * 0.12, clean: true, letRing: true,
          });
        });
      });
    } else if (style === 'swell') {
      runBars.forEach((b, bi) => {
        const starts = [b.start, ...chords.timeline.map((e) => e.step).filter((s) => s > b.start && s < b.start + b.len)];
        // the run's last swell fades two beats early, so the phrase breathes
        const end = bi === runBars.length - 1 && runBars.length > 1 ? b.start + groupAt(b, Math.ceil(b.groups.length / 2)) : b.start + b.len;
        starts.forEach((s, i) => {
          if (s >= end) return;
          const tones = chordTones(key, chords.timeline[chords.chordIdx[s]].chord);
          const pc = tones[Math.min(tones.length - 1, rng.pick([1, 2, 2]))];
          const midi = center + 4 + mod(pc - (center + 4), 12);
          const len = Math.min(starts[i + 1] ?? end, end) - s;
          hits.push({ step: s, ...leadFret(midi, t, pos), len, vel: 0.75, swell: true, clean });
        });
      });
    } else if (style === 'funk') {
      // a one-bar figure with gaps in it (funk lives in the spaces), repeated; the last bar is cut short
      const FIGURES = [[0, 3, 6, 10], [0, 2, 7, 10, 13], [2, 6, 8, 14], [0, 3, 8, 11, 14], [0, 6, 7, 10, 12], [0, 3, 4, 10], [0, 7, 10, 14]];
      // the figure's shape is a position among the chord's own notes (root, 3rd, 5th, 7th, octave...),
      // so the line outlines each chord and never rubs against the band's 9ths and #9s
      const cell = rng.pick(FIGURES).map((p, i) => ({ pos: p, deg: i === 0 ? 0 : rng.int(1, 5), dead: i > 0 && rng.chance(0.3) }));
      runBars.forEach((b, bi) => {
        const cut = bi === runBars.length - 1 && runBars.length > 1 ? b.len / 2 : b.len;
        for (const c of cell) {
          if (c.pos >= cut) continue;
          const g = b.start + c.pos;
          const ch = chords.timeline[chords.chordIdx[g]].chord;
          const root = center + mod(chordPc(key, ch) - center, 12);
          const tones = [...new Set(QUALITIES[ch.q].map((x) => x % 12))].sort((x, y) => x - y);
          const set = [...tones, ...tones.map((x) => x + 12)];
          let m = root + set[c.deg % set.length];
          while (m > 81) m -= 12;
          hits.push({ step: g, ...leadFret(m, t, pos), len: c.dead ? 1 : 2, vel: c.dead ? 0.6 : 0.8, mute: c.dead ? 'dead' : undefined, clean: true });
        }
      });
    }
  });

  hits.sort((a, b) => a.step - b.step);
  const notes = [labels.every((l) => l === labels[0])
    ? `Guitar 2: ${labels[0]} throughout`
    : `Guitar 2: ${labels.map((l, i) => `bars ${i * 4 + 1}–${Math.min(bars.length, i * 4 + 4)} ${l}`).join(' → ')}`];
  return { hits, notes };
}
