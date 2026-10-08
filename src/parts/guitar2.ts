// Second guitar: plays against the rhythm part. Per four-bar section it picks a role:
// a melody, a harmony of the riff, an octave melody, clean echoing arpeggios, volume swells,
// a funk single-note line, short licks answering the band, or it sits out for contrast.
// It's a melodic guitar part, not a stand-in for a singer: its phrases leave room.

import type { Genre, RiffStyle } from '../genres';
import type { ChordPart, GuitarHit, Song } from '../idea';
import type { Rng } from '../rng';
import { type Bar, groupStarts } from '../rhythm';
import { type Chord, type Mode, QUALITIES, SCALES, chordPc } from '../theory';
import { TUNINGS, type Tuning, powerChord, voicingsInTuning } from '../theory/fretboard';
import { type BarPlan, developCell, pitchCell } from './motif';

export type Guitar2Style = 'lead' | 'harmony' | 'octaves' | 'arp' | 'swell' | 'funk' | 'rhythm' | 'fills' | 'rest';

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

const MINORISH: Mode[] = ['minor', 'dorian', 'phrygian'];

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
function leadScale(rng: Rng, mode: Mode, w: number): number[] {
  const minor = MINORISH.includes(mode);
  const s = new Set(minor ? [0, 3, 5, 7, 10] : [0, 2, 4, 7, 9]);
  for (const n of SCALES[mode]) if (rng.chance(0.1 + w * 0.3)) s.add(n);
  if (minor && rng.chance(0.15 + w * 0.4)) s.add(6);
  return [...s].sort((a, b) => a - b);
}

/** Lead notes sit around one hand position on the middle/high strings. */
function leadFret(midi: number, t: Tuning, pos: number): { notes: number[]; strings: number[] } {
  let best = 5, bestCost = Infinity;
  for (let s = 1; s < 6; s++) {
    const fret = midi - t.strings[s];
    if (fret < 0 || fret > 19) continue;
    const cost = Math.abs(fret - pos) + (s === 1 ? 2 : 0);
    if (cost < bestCost) { best = s; bestCost = cost; }
  }
  return { notes: [midi], strings: [best] };
}

const chordTones = (key: number, c: Chord) => QUALITIES[c.q].map((i) => mod(chordPc(key, c) + i, 12));

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
 * A melody over a run of bars (one or more four-bar runs share one motif, like a hook played twice).
 * Strong beats land on chord tones; every phrase ends on a held note followed by a breath.
 */
function melody(
  rng: Rng, song: Song, chords: ChordPart, bars: Bar[], density: Density,
  lo: number, hi: number, scale: number[], slide: number, riff: GuitarHit[] | null, shape: Shape,
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
  for (let m = lo; m <= hi; m++) if (scale.includes(mod(m - key, 12))) pool.push(m);
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
  const cell = pitchCell(rng, call.length, 6);
  const lickCells = [pitchCell(rng, 4, 5), pitchCell(rng, 4, 5)];
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
      // answers at the ends of bars 2 and 4 (and sometimes a single held note to start)
      if (rng.chance(0.4)) phrases.push({ at: B[0].start, rhythm: [{ pos: 0, strong: true }], hold: B[0].start + groupAt(B[0], 2), plan: { shift: 0 } });
      B.forEach((b, bi) => {
        if (bi % 2 === 0 && n > 1) return;
        phrases.push({ at: b.start, rhythm: lickRhythm(rng, b), hold: endOf(b), plan: { shift: 0, ending: bi === n - 1 ? close : 'open' }, lick: true });
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
  // nothing overlaps the next note
  return evs.filter((e, i) => i === 0 || e.step > evs[i - 1].step).map((e, i, a) => ({ ...e, len: Math.max(1, Math.min(e.len, (a[i + 1]?.step ?? Infinity) - e.step)) }));
}

/** A melody shape for a run, by style and genre. */
function pickShape(rng: Rng, genre: Genre, octaves: boolean): Shape {
  if (octaves) return rng.weighted<Shape>([['answer', 3], ['line', 2], ['riff', 1]]);
  const heavy = genre === 'rock' || genre === 'hardrock' || genre === 'metal' || genre === 'grunge' || genre === 'altmetal';
  return rng.weighted<Shape>(heavy ? [['riff', 3], ['answer', 3], ['line', 2]] : [['answer', 3], ['line', 2], ['riff', 2]]);
}

/**
 * A hook across a whole section: one motif, stated and answered, the same tune carried over each
 * chord. Tracks bring it back in the intro, interludes, last chorus and outro.
 */
export function generateHook(rng: Rng, song: Song, chords: ChordPart, riff: GuitarHit[] | null): GuitarHit[] {
  const { w, mode } = song;
  const t = song.tuning ?? TUNINGS.standard;
  const scale = leadScale(rng, mode, w);
  const pos = rng.int(5, 12);
  const octaves = rng.chance(0.3);
  const [lo, hi] = octaves ? OCTAVE_RANGE : LEAD_RANGE;
  const density: Density = rng.pick(['medium', 'medium', 'slow']);
  const shape = pickShape(rng, song.partGenres.strum, octaves);
  return melody(rng, song, chords, song.bars, density, lo, hi, scale, song.tuning ? 0.4 : 0.2, riff, shape === 'fills' ? 'answer' : shape).map((n) => {
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
  rng: Rng, song: Song, chords: ChordPart, riff: GuitarHit[] | null, force?: Guitar2Style[],
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

    if (style === 'lead' || style === 'octaves' || style === 'fills') {
      const density: Density = section === 'big' || style === 'octaves' ? rng.pick(['slow', 'medium']) : rng.pick(['medium', 'medium', 'slow']);
      const [lo, hi] = style === 'octaves' ? OCTAVE_RANGE : LEAD_RANGE;
      const shape = style === 'fills' ? 'fills' : pickShape(rng, genre, style === 'octaves');
      if (style !== 'fills') labels[labels.length - 1] += ` (${SHAPE_DESC[shape]})`;
      if (riff) labels[labels.length - 1] += ' in the gaps of the riff';
      for (const n of melody(rng, song, chords, runBars, density, lo, hi, scale, song.tuning ? 0.4 : 0.2, riff, shape)) {
        const f = leadFret(n.midi, t, pos);
        if (style === 'octaves') { f.notes.push(n.midi + 12); f.strings.push(Math.min(5, f.strings[0] + 2)); }
        hits.push({ step: n.step, ...f, len: n.len, vel: n.vel, slide: n.slide, clean });
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
          hits.push({ step: g, ...leadFret(root + set[c.deg], t, pos), len: c.dead ? 1 : 2, vel: c.dead ? 0.6 : 0.8, mute: c.dead ? 'dead' : undefined, clean: true });
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
