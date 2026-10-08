// Extra layers you can add on top of the band: a piano part and a sustained synth pad.
//
// Both are written from the finished idea (or track section): its chords, bars, energy, and how it
// ends (a band stop, hits, the final held chord), so they follow every arrangement change.
// Pure and deterministic: the same idea and seed give the same part.

import { GENRES, type Genre } from '../genres';
import type { Idea } from '../idea';
import { groupStarts } from '../rhythm';
import { type Chord, QUALITIES, SCALES, chordPc } from '../theory';
import { Rng } from '../rng';

/** One chord or note: start step, MIDI notes, length in 16ths, velocity 0–1. */
export interface LayerNote { step: number; notes: number[]; len: number; vel: number }

export type KeysStyle = 'chords' | 'pulse' | 'arp' | 'stabs';
export type KeysChoice = KeysStyle | 'auto';
export const KEYS_STYLES: { id: KeysChoice; label: string }[] = [
  { id: 'auto', label: 'Auto (by section)' },
  { id: 'chords', label: 'Held chords' },
  { id: 'pulse', label: 'Rhythmic chords' },
  { id: 'arp', label: 'Arpeggios' },
  { id: 'stabs', label: 'Off-beat stabs' },
];
const KEYS_DESC: Record<KeysStyle, string> = {
  chords: 'held chords', pulse: 'rhythmic chords', arp: 'arpeggios', stabs: 'off-beat stabs',
};

export interface Layer { notes: LayerNote[]; desc: string }

/** Pitch classes of a chord (absolute). Power chords get the scale's third, so a pad or piano sounds full. */
function chordTones(idea: Idea, c: Chord): number[] {
  const { key, mode } = idea.song;
  const root = chordPc(key, c);
  if (c.q === '5') {
    const sc = SCALES[mode];
    const d = sc.indexOf(c.root as never);
    if (d < 0) return [root, (root + 7) % 12];
    const third = (sc[(d + 2) % 7] - c.root + 12) % 12;
    return [root, (root + third) % 12, (root + 7) % 12];
  }
  // ninths fold down to the second; at most four notes
  const pcs = [...new Set(QUALITIES[c.q].map((i) => (root + i) % 12))];
  return pcs.length > 4 ? pcs.filter((_, i) => i !== 2) : pcs; // drop the fifth first
}

/**
 * A close voicing of the pitch classes near `center`, moving as little as possible from `prev`
 * (voice leading), so chord changes glide instead of jumping around.
 */
function voice(pcs: number[], center: number, prev: number[] | null): number[] {
  let best: number[] = [], bestScore = Infinity;
  for (let bottom = center - 10; bottom <= center + 2; bottom++) {
    if (!pcs.includes(((bottom % 12) + 12) % 12)) continue;
    const notes = [bottom];
    for (const pc of rotateFrom(pcs, ((bottom % 12) + 12) % 12).slice(1)) {
      let n = notes[notes.length - 1] + 1;
      while (((n % 12) + 12) % 12 !== pc) n++;
      notes.push(n);
    }
    const mean = notes.reduce((a, b) => a + b, 0) / notes.length;
    let score = Math.abs(mean - center) * (prev ? 0.35 : 1);
    if (prev) score += notes.reduce((a, n) => a + Math.min(...prev.map((p) => Math.abs(p - n))), 0);
    if (score < bestScore) { bestScore = score; best = notes; }
  }
  return best;
}
const rotateFrom = (pcs: number[], first: number) => {
  const i = pcs.indexOf(first);
  return [...pcs.slice(i), ...pcs.slice(0, i)];
};

/** What a section is, for the layers: energy, how it ends, where the band comes in. */
function shape(idea: Idea) {
  const s = idea.section;
  const { bars, total } = idea.song;
  const last = bars[bars.length - 1];
  const tail = s?.tail;
  return {
    energy: s?.energy ?? 4,
    kind: s?.kind ?? 'chorus',
    /** Everything stops here (band stop, or the end of the section). */
    end: tail && 'stop' in tail ? tail.stop : s?.ending ? last.start : total,
    hits: tail && 'hits' in tail ? tail.hits : null,
    hitsFrom: tail && 'hits' in tail ? last.start : total,
    /** The band pushes the next section's chord early, or strikes one chord and lets it ring. */
    push: tail && 'push' in tail ? tail.push : null,
    ring: tail && 'ring' in tail ? tail.ring : null,
    /** The previous section pushed this one's first chord: the downbeat isn't struck again. */
    pushedIn: !!s?.pushedIn,
    /** The final held chord. */
    ending: s?.ending ? last.start : null,
    bandFrom: s?.bandFrom ?? 0,
    total,
    /** Every section of a kind shares its picks (all choruses alike); the energy band still changes the options. */
    seedTag: s ? s.kind : 'idea',
  };
}

const chordAt = (idea: Idea, g: number) => idea.chords.timeline[idea.chords.chordIdx[g]].chord;
/** Steps where the chord changes (and the start), up to `end`. */
function changes(idea: Idea, from: number, end: number): number[] {
  const out = [from];
  for (const e of idea.chords.timeline) if (e.step > from && e.step < end) out.push(e.step);
  return out;
}

/* ---------------------------------------------------------------- piano */

/**
 * Comping rhythms for a 16-step bar as [position, length]: chords with space between them, the way a
 * player comps, not a constant stream. Other bar lengths use the beat groups instead.
 */
const COMP: [number, number][][] = [
  [[0, 5], [6, 5], [12, 3]], // 3+3+2
  [[0, 3], [4, 3], [8, 3], [12, 3]], // detached quarters
  [[0, 7], [10, 2], [12, 4]], // hold, then a push into beat 4
  [[0, 4], [6, 2], [8, 4], [14, 2]], // the "and" of 2 and 4 pushed
  [[0, 6], [6, 2], [8, 8]], // long-short-long
];
/** Loud pop choruses: the classic driving 8th-note piano, accents on the beat. */
const EIGHTHS: [number, number][] = [0, 2, 4, 6, 8, 10, 12, 14].map((p) => [p, 2]);
/** Funk stabs: short chords with gaps, a few per bar. */
const STABS: number[][] = [[2, 10], [3, 6, 14], [2, 7, 10], [6, 14], [0, 3, 10], [3, 10, 13]];

function autoKeys(rng: Rng, genre: Genre, energy: number): KeysStyle {
  const quiet = energy <= 2, mid = energy === 3;
  const riff = !!GENRES[genre].riff;
  if (genre === 'funk') return rng.weighted<KeysStyle>(quiet ? [['chords', 2], ['stabs', 1]] : [['stabs', 3], ['pulse', 1]]);
  if (genre === 'pop') return rng.weighted<KeysStyle>(quiet ? [['arp', 3], ['chords', 2]] : mid ? [['arp', 2], ['pulse', 2], ['chords', 1]] : [['pulse', 3], ['chords', 1]]);
  if (riff || genre === 'grunge') return rng.weighted<KeysStyle>(quiet ? [['arp', 3], ['chords', 1]] : mid ? [['arp', 2], ['chords', 1]] : [['chords', 3], ['arp', 1]]);
  return rng.weighted<KeysStyle>(quiet ? [['arp', 2], ['chords', 2]] : mid ? [['chords', 2], ['pulse', 1]] : [['pulse', 2], ['chords', 2]]);
}

/** The piano layer for an idea or track section. */
export function writeKeys(idea: Idea, choice: KeysChoice, seed: string): Layer {
  const sh = shape(idea);
  const rng = new Rng(`${seed}-${sh.seedTag}`);
  const style = choice === 'auto' ? autoKeys(rng, idea.song.partGenres.strum, sh.energy) : choice;
  // the player's habits stay the same all song
  const habits = new Rng(seed);
  const heavy = !!GENRES[idea.song.genre].riff || idea.song.genre === 'grunge';
  // loud heavy sections: up high, above the guitars; funk stabs sit high and bright too
  const center = style === 'stabs' ? 68 : heavy && sh.energy >= 4 ? 74 : style === 'arp' ? 64 : 66;
  const base = 0.38 + sh.energy * 0.07;
  // left hand: a low root on chord changes when it's quiet (the bass is light or out)
  const leftHand = sh.energy <= 2 && style !== 'stabs';
  const out: LayerNote[] = [];
  let prev: number[] | null = null;
  const voiced = new Map<number, number[]>();
  const rh = (g: number) => {
    const ti = idea.chords.chordIdx[g];
    let v = voiced.get(ti);
    if (!v) { v = voice(chordTones(idea, chordAt(idea, g)), center, prev); voiced.set(ti, v); prev = v; }
    return v;
  };
  const lh = (g: number) => {
    let n = chordPc(idea.song.key, chordAt(idea, g)) + 36;
    while (n < 40) n += 12;
    return n;
  };
  const start = sh.bandFrom;
  const stop = Math.min(sh.end, sh.hitsFrom, sh.push ?? sh.total, sh.ring ?? sh.total);
  // one comping rhythm and stab figure per section (so it grooves), driving 8ths only in loud pop
  const comp = sh.energy >= 5 && idea.song.partGenres.strum === 'pop' && rng.chance(0.6) ? EIGHTHS : rng.pick(COMP);
  const stabs = rng.pick(STABS);

  idea.song.bars.forEach((bar, bi) => {
    const a = Math.max(bar.start, start), b = Math.min(bar.start + bar.len, stop);
    if (a >= b) return;
    const beats = groupStarts(bar.groups).map((p) => bar.start + p);
    const strikes = new Set(changes(idea, a, b));
    // the last bar of each four-bar phrase: one chord, held (or a short figure and a gap), so the part breathes
    const phraseEnd = bi % 4 === 3;
    if (phraseEnd && style !== 'chords') {
      const half = bar.start + (groupStarts(bar.groups)[Math.ceil(bar.groups.length / 2)] ?? bar.len);
      if (style === 'stabs') {
        for (const p of stabs) if (bar.start + p >= a && bar.start + p < Math.min(b, half)) out.push({ step: bar.start + p, notes: rh(bar.start + p), len: 1, vel: base });
      } else {
        out.push({ step: a, notes: rh(a), len: Math.min(b, half + 2) - a, vel: base + 0.04 });
        if (leftHand) out.push({ step: a, notes: [lh(a)], len: Math.min(b, half + 2) - a, vel: base * 0.85 });
      }
      return;
    }
    if (style === 'chords') {
      // on the bar and each chord change, again halfway through long held chords
      const half = beats[Math.floor(beats.length / 2)];
      if (sh.energy >= 3 && !phraseEnd && half > a && half < b && ![...strikes].some((g) => g > a && g <= half)) strikes.add(half);
      const list = [...strikes].sort((x, y) => x - y);
      list.forEach((g, i) => {
        const len = (list[i + 1] ?? b) - g;
        out.push({ step: g, notes: rh(g), len, vel: base + (g === bar.start ? 0.06 : 0) });
        if (leftHand) out.push({ step: g, notes: [lh(g)], len, vel: base * 0.85 });
      });
    } else if (style === 'pulse') {
      // the section's comping rhythm (beat groups in odd meters), plus any chord change between hits
      const hits: [number, number][] = bar.len === 16 ? comp : groupStarts(bar.groups).map((p, i) => [p, Math.max(1, bar.groups[i] - 1)]);
      const at = new Map<number, number>(hits.map(([p, l]) => [bar.start + p, l]));
      for (const g of strikes) if (!at.has(g)) at.set(g, 2);
      for (const [g, l] of [...at].sort((x, y) => x[0] - y[0])) {
        if (g < a || g >= b) continue;
        out.push({ step: g, notes: rh(g), len: Math.min(l, b - g), vel: base * (beats.includes(g) ? 1.05 : 0.85) });
      }
      if (leftHand) for (const g of strikes) out.push({ step: g, notes: [lh(g)], len: b - g, vel: base * 0.85 });
    } else if (style === 'arp') {
      // up and back down the chord, an 8th each, letting the notes ring like a held pedal; the last
      // beat of the bar is left to ring
      const up = habits.chance(0.5);
      const ringFrom = bar.start + (groupStarts(bar.groups)[bar.groups.length - 1] ?? bar.len);
      let k = 0;
      for (let g = a; g < Math.min(b, ringFrom); g += 2) {
        if (strikes.has(g) || strikes.has(g - 1)) k = 0;
        const v = rh(g);
        const seq = up ? [...v, v[0] + 12, ...v.slice(1).reverse()] : [v[0], v[v.length - 1], v[1], v[v.length - 1]];
        const nextChange = [...strikes].filter((x) => x > g).sort((x, y) => x - y)[0] ?? b;
        out.push({ step: g, notes: [seq[k % seq.length]], len: Math.max(2, nextChange - g), vel: base * (k === 0 ? 1 : 0.8) });
        k++;
      }
      if (leftHand || sh.energy <= 3) for (const g of strikes) out.push({ step: g, notes: [lh(g)], len: b - g, vel: base * 0.8 });
    } else {
      // stabs: the section's figure (off-beats of the groups in odd meters), plus chord changes pushed early
      const pos = bar.len === 16 ? stabs : beats.map((beat, i) => beat - bar.start + (bar.groups[i] >= 4 ? Math.floor(bar.groups[i] / 2) : bar.groups[i] - 1)).filter((_, i) => i % 2 === 1 || bar.groups.length <= 2);
      for (const p of pos) {
        const g = bar.start + p;
        if (g >= a && g < b) out.push({ step: g, notes: rh(g), len: 1, vel: base * 0.95 });
      }
      for (const g of strikes) if (!beats.includes(g) && g % 2 === 1 && !pos.includes(g - bar.start)) out.push({ step: g, notes: rh(g), len: 1, vel: base });
    }
  });
  // nothing rings into a band stop or the hits
  for (const n of out) n.len = Math.min(n.len, stop - n.step);
  punctuate(sh, out, rh, base);
  // the chord pushed early from the section before is still ringing
  if (sh.pushedIn) out.splice(0, out.length, ...out.filter((n) => n.step > 0));
  const desc = start >= idea.song.total ? 'sits out until the band comes in'
    : `${KEYS_DESC[style]}${leftHand ? ' with a low left hand' : ''}${start > 0 ? ' (comes in with the band)' : ''}`;
  return { notes: out, desc: `Piano: ${desc}` };
}

/** Band hits: short chords with the band. The final held chord: one long chord. `accents`: pushes and left-ringing chords too (the pad just follows the chords). */
function punctuate(sh: ReturnType<typeof shape>, out: LayerNote[], rh: (g: number) => number[], base: number, accents = true) {
  for (const g of sh.hits ?? []) out.push({ step: g, notes: rh(g), len: 2, vel: base + 0.1 });
  if (sh.ending !== null) out.push({ step: sh.ending, notes: rh(sh.ending), len: 32, vel: base + 0.05 });
  if (!accents) return;
  // pushed and left-ringing chords sound on into the next section
  if (sh.push !== null) out.push({ step: sh.push, notes: rh(sh.push), len: sh.total - sh.push + 6, vel: base + 0.1 });
  if (sh.ring !== null) out.push({ step: sh.ring, notes: rh(sh.ring), len: sh.total - sh.ring + 4, vel: base + 0.05 });
}

/* ---------------------------------------------------------------- pad */

/** The pad layer: sustained chords that glide from one to the next. */
export function writePad(idea: Idea, seed: string): Layer {
  const sh = shape(idea);
  // one voicing habit for the whole song
  const rng = new Rng(seed);
  const open = rng.chance(0.5);
  // quieter and lower in quiet sections; loud ones add the top note an octave up
  const center = sh.energy <= 2 ? 58 : 62;
  const octave = rng.chance(0.7) && sh.energy >= 4;
  const vel = 0.32 + sh.energy * 0.09;
  const out: LayerNote[] = [];
  let prev: number[] | null = null;
  const voiced = new Map<number, number[]>();
  const chordNotes = (g: number) => {
    const ti = idea.chords.chordIdx[g];
    let v = voiced.get(ti);
    if (!v) {
      v = voice(chordTones(idea, chordAt(idea, g)), center, prev);
      prev = v;
      // open voicing: the second note from the top drops an octave (wider, warmer)
      if (open && v.length >= 3) v = [v[v.length - 2] - 12, ...v.filter((_, i) => i !== v!.length - 2)].sort((x, y) => x - y);
      if (octave) v = [...v, v[v.length - 1] + 12];
      voiced.set(ti, v);
    }
    return v;
  };
  const stop = Math.min(sh.end, sh.hitsFrom);
  const list = changes(idea, 0, stop);
  list.forEach((g, i) => out.push({ step: g, notes: chordNotes(g), len: (list[i + 1] ?? stop) - g, vel }));
  punctuate(sh, out, chordNotes, vel, false);
  const how = [open ? 'open voicing' : 'close voicing', ...(octave ? ['top note doubled an octave up'] : [])];
  return { notes: out, desc: `Pad: sustained chords, ${how.join(', ')}` };
}

/** Index layer notes by step, for playback. */
export function byStep(notes: LayerNote[], total: number): LayerNote[][] {
  const at = Array.from({ length: total }, () => [] as LayerNote[]);
  for (const n of notes) at[n.step]?.push(n);
  return at;
}
