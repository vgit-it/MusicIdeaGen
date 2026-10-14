// The Guide line (experiment, docs/GUIDE.md): one note line through the whole song, in its key, shaped
// by the mood. Kept apart from the vocals on purpose: once it sounds right it can feed them.
//
// How it moves (Paul's rules, and what melody research finds in real tunes):
// - it starts on a note picked for the mood and moves now and then, mostly by small amounts
//   (a step, sometimes a 3rd), holding notes for as long as the mood likes
// - a big leap only after a pause, and after a leap it steps back the other way (gap-fill)
// - it stays in the scale, except a few out-of-key notes a mood is known for
// - it rises and falls with the song's tension curve, settles on stable notes at section ends and
//   ends the song on home
// - with the chords: lean in (strong beats on the chord's notes) or out (the key only)

import type { Idea } from '../idea';
import { groupStarts } from '../rhythm';
import { Rng } from '../rng';
import { type Mood, MOOD_LABEL, autoMood } from '../tension';
import { SCALES, chordPc } from '../theory';
import { chordTones } from '../parts/guitar2';
import { HIGH_VOICES, type HighVoice } from '../parts/singers';

const mod = (n: number, m: number) => ((n % m) + m) % m;

export type Lean = 'in' | 'out';
/** Quick notes on the long ones: how many. */
export type Flicks = 'off' | 'sparse' | 'some' | 'lots';
export const FLICK_LEVELS: [Flicks, string][] = [['off', 'Off'], ['sparse', 'Sparse'], ['some', 'Some'], ['lots', 'Lots']];

/** A quick note on a held one: `at` steps into it, `len` steps long (an 8th), then back. */
export interface Flick {
  at: number; len: number; midi: number;
  /** A 16th's silence (in steps) after it before the held note comes back (the quick note then a 16th itself). */
  gap?: number;
  /** At the held note's end: bent up (or down) to, and the line moves on from there. */
  bend?: boolean;
}

export interface GuideNote {
  /** Step in its section, length in steps, the note, and its scale degree (0 home, 1 the 2nd ... any octave). */
  step: number; len: number; midi: number; deg: number;
  /** Out of the key (a mood's colour note). */
  colour?: boolean;
  /** A leap after a pause. */
  leap?: boolean;
  /** Bent into from the note before (no new attack): the bend's length in steps (an 8th, a quarter, half a bar). */
  bend?: number;
  /** Quick notes on it. */
  flicks?: Flick[];
}

export interface GuideLine {
  /** Notes per section, in play order. */
  parts: GuideNote[][];
  mood: Mood;
  /** What it did, in plain words. */
  notes: string[];
}

/** A degree's place in its scale (0-6). */
const deg7 = (d: number) => mod(d, 7);
const DEG_NAME = ['1st (home)', '2nd', '3rd', '4th', '5th', '6th', '7th'];

type Colour = 'lead' | 'sigh' | 'dark' | 'float' | null;

interface GuideMood {
  /** Start degrees to pick from. */
  start: number[];
  /** How much it likes to rest on each degree (1st ... 7th). */
  rest: number[];
  /** Beats a note lasts, about (at calm; busier as the tension rises). */
  beats: number;
  /** A 3rd instead of a step; the same note again. */
  third: number; same: number;
  /** Leans down (<0) or up (>0). */
  lean: number;
  /** Chance of a pause at the end of a phrase; bars a phrase lasts. */
  pause: number; phrase: number;
  /** After a pause: chance of a leap, and how far (scale steps). */
  leap: number; leapMax: number;
  /** Range (scale steps) and where it sits (scale steps from home). */
  span: number; low: number;
  /** Chance a step is bent into rather than played, and how it likes its bends: an 8th, a quarter, half a bar. */
  bend: number; bendLen: [number, number, number];
  /** An out-of-key colour note and how often. */
  colour: Colour; colourP: number;
  /** In plain words. */
  desc: string;
}

// (degree feel, after David Huron's "Sweet Anticipation": the 1st home, the 5th strong and open, the 3rd
// warm (major or minor), the 2nd, 4th and 6th unsettled, the 7th yearning; higher and rising brighter,
// lower and falling darker; long notes calm, quick ones restless)
const MOODS: Record<Mood, GuideMood> = {
  happy: { start: [2, 4, 0], rest: [1.4, 0.6, 1.5, 0.6, 1.3, 1, 0.3], beats: 1.5, third: 0.3, same: 0.15, lean: 0.15, pause: 0.45, phrase: 2, leap: 0.5, leapMax: 4, span: 9, low: -2, bend: 0.2, bendLen: [1, 0.8, 0.3], colour: null, colourP: 0,
    desc: 'bright: sits on the 3rd and 5th, lively, leans up, leaps up after a pause' },
  melancholic: { start: [4, 2], rest: [1.2, 0.8, 1.5, 0.7, 1.1, 0.9, 0.4], beats: 2.5, third: 0.15, same: 0.1, lean: -0.35, pause: 0.55, phrase: 2, leap: 0.35, leapMax: 5, span: 7, low: -3, bend: 0.35, bendLen: [0.6, 1, 1], colour: 'sigh', colourP: 0.35,
    desc: 'falls more than it rises, slow, sighs down by step; a 6th leap now and then' },
  nostalgic: { start: [2, 4], rest: [1.2, 0.7, 1.4, 0.8, 1.1, 1.3, 0.4], beats: 2, third: 0.25, same: 0.1, lean: -0.1, pause: 0.5, phrase: 2, leap: 0.55, leapMax: 5, span: 8, low: -2, bend: 0.3, bendLen: [0.8, 1, 0.6], colour: 'sigh', colourP: 0.2,
    desc: 'warm: rests on the 3rd and 6th, gentle waves, a leap up of a 6th after a pause' },
  tense: { start: [1, 4, 6], rest: [0.6, 1.2, 0.8, 1.2, 1, 1, 1.3], beats: 1, third: 0.2, same: 0.35, lean: 0.1, pause: 0.3, phrase: 2, leap: 0.4, leapMax: 3, span: 6, low: -2, bend: 0.25, bendLen: [1, 0.6, 0.4], colour: 'lead', colourP: 0.5,
    desc: 'restless: the busiest, repeats itself, rests on unsettled notes (2nd, 4th, 7th), rarely home' },
  angry: { start: [0, 4], rest: [1.4, 0.5, 1, 0.8, 1.4, 0.7, 0.6], beats: 1, third: 0.2, same: 0.4, lean: 0, pause: 0.35, phrase: 2, leap: 0.6, leapMax: 4, span: 7, low: -3, bend: 0.2, bendLen: [1.5, 0.5, 0.2], colour: 'dark', colourP: 0.3,
    desc: 'hammers: busy, insistent repeats on the 1st and 5th, punches up after a pause' },
  dreamy: { start: [4, 2], rest: [1, 0.9, 1.3, 0.8, 1.3, 1.2, 0.8], beats: 4, third: 0.3, same: 0.05, lean: 0, pause: 0.6, phrase: 4, leap: 0.3, leapMax: 3, span: 6, low: -1, bend: 0.35, bendLen: [0.5, 1, 1.5], colour: 'float', colourP: 0.4,
    desc: 'floats: long held notes, wanders gently, never quite lands' },
  triumphant: { start: [0, 4], rest: [1.5, 0.5, 1.2, 0.6, 1.5, 0.8, 0.3], beats: 1.5, third: 0.35, same: 0.1, lean: 0.3, pause: 0.45, phrase: 2, leap: 0.7, leapMax: 4, span: 10, low: -3, bend: 0.25, bendLen: [1, 1, 0.5], colour: 'lead', colourP: 0.25,
    desc: 'climbs: home and the 5th, rises through the song, bold leaps after a pause' },
  dark: { start: [0, 2], rest: [1.4, 0.7, 1.3, 0.8, 1, 1, 0.5], beats: 2, third: 0.2, same: 0.2, lean: -0.25, pause: 0.45, phrase: 2, leap: 0.35, leapMax: 4, span: 7, low: -3, bend: 0.3, bendLen: [0.6, 1, 0.8], colour: 'dark', colourP: 0.4,
    desc: 'low and heavy: stays down, falls back, a dark half step above home' },
};

/** Quick notes per bar of a held note, by how many; and how often they're a 16th (else an 8th), by mood. */
const FLICK_RATE: Record<Flicks, number> = { off: 0, sparse: 0.25, some: 0.6, lots: 4 };
/** They come in clusters of 2 bars, frequent, then moderate, then sparse (Paul): how many in each, times the rate. */
type Cluster = 'frequent' | 'moderate' | 'sparse';
const CLUSTERS: Cluster[] = ['frequent', 'moderate', 'sparse'];
const CLUSTER_RATE: Record<Cluster, number> = { frequent: 2.2, moderate: 1, sparse: 0.3 };
const CLUSTER_BARS = 2;
/** How often a quick note is a 16th with a 16th's silence after it (an 8th in all), then the held note again. */
const GAP_P = 0.35;

/** How much longer notes are held than the first version's pace. */
const STEADY = 2.5;
/** Bends: only into a step (a half or whole step: a guitar's bend, and what MIDI's pitch bend can carry). */
const BEND_SEMIS = 2;

const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
export const noteName = (m: number) => `${NAMES[mod(m, 12)]}${Math.floor(m / 12) - 1}`;

/** Home in the middle of the voice: F3 to E4. */
const homeMidi = (key: number) => 53 + mod(key - 5, 12);
/**
 * The voice, C3 to C5 (Paul: the mid voice range, then "open up more of the higher range": was G4); a high voice (the singer's
 * high voice, or High) goes up to its own top in the song's high parts (tension from HIGH_T up).
 */
const MID: [number, number] = [48, 72];
/**
 * More room up (Paul: "the limiting of range has made it very stale, open up more of the higher range"):
 * the mood's span reaches this many scale steps higher, and a high voice goes past its usual top.
 */
const UP = 3;
const HIGH_EXTRA = 2;
const HIGH_T = 0.6;
/** Section kinds sung alike each time (Paul: "the verses should be similar and the choruses similar"). */
const REPEATS = ['verse', 'prechorus', 'chorus'];
/** How many notes of a repeat change, a step up or down (similar, not a copy). */
const VARY = 0.15;
/** Quick notes go down more often than up (Paul: "biased towards lower", whatever the mood). */
const FLICK_UP = 0.35;

/**
 * The out-of-key colour a mood is known for, if this note can carry it (moving into `next` direction):
 * the raised 7th pulling up home (tense, triumphant), the flat 6th sighing down to the 5th in a major key
 * (melancholy, nostalgia), the flat 2nd above home (dark, angry), the raised 4th floating up (dreamy).
 */
function colourShift(c: Colour, mode: string, d: number, up: boolean): number {
  const s = SCALES[mode as keyof typeof SCALES] as readonly number[];
  const at = s[deg7(d)];
  if (c === 'lead' && deg7(d) === 6 && at === 10 && up) return 1;
  if (c === 'sigh' && deg7(d) === 5 && at === 9 && !up) return -1;
  if (c === 'dark' && deg7(d) === 1 && at === 2 && !up) return -1;
  if (c === 'float' && deg7(d) === 3 && at === 5 && up) return 1;
  return 0;
}

/** Write the line for a list of sections played back to back (one idea, or a track). */
export function writeGuide(list: Idea[], moodIn: Mood | undefined, lean: Lean, salt = 0, flicks: Flicks = 'off', high: HighVoice | null = null): GuideLine {
  const first = list[0];
  const mood = moodIn ?? autoMood(first.song, first.seeds.song);
  const M = MOODS[mood];
  const rng = new Rng(`guide-${first.seeds.song}-${mood}-${lean}-${salt}`);
  const lo = M.low, hi = M.low + M.span + UP;
  let d = rng.pick(M.start);
  const parts: GuideNote[][] = [];
  const stat = { notes: 0, same: 0, step: 0, third: 0, leap: 0, colour: 0, pauses: 0, bends: 0, bendLens: [0, 0, 0], flicks: 0, flickBends: 0, flickGaps: 0, byCluster: { frequent: 0, moderate: 0, sparse: 0 } as Record<Cluster, number>, strong: 0, strongTone: 0, lowM: 999, hiM: 0, repeats: 0, varied: 0, highNotes: 0 };
  let afterPause = false, lastLeap = 0, sameRun = 0;
  const songBeats = list.reduce((n, i) => n + i.song.bars.reduce((b, x) => b + x.groups.length, 0), 0);
  let beatNo = 0;
  // (the quick notes have their own dice: the line stays the same whatever their number)
  const frng = new Rng(`guide-flicks-${first.seeds.song}-${mood}-${salt}`);
  // (the clusters: the cycle starts at a random place in each song)
  const phase = frng.int(0, 2);
  const clusterAt = (bar: number) => CLUSTERS[(Math.floor(bar / CLUSTER_BARS) + phase) % 3];
  let barBase = 0;
  /** A note cut a beat short (a pause after it), its quick notes in the cut gone. */
  const cutBeat = (n: GuideNote) => {
    n.len -= 4;
    if (n.flicks) {
      const keep = n.flicks.filter((f) => f.at + f.len + (f.gap ?? 0) <= n.len - (f.bend ? 0 : 1));
      stat.flicks -= n.flicks.length - keep.length;
      if (keep.length) n.flicks = keep; else delete n.flicks;
    }
  };
  // the first verse, pre-chorus and chorus, kept to sing again (their notes, and each note's colour shift)
  const firstOf = new Map<string, { notes: GuideNote[]; cs: number[]; total: number; bars: number }>();
  const top = high ? Math.max(MID[1], HIGH_VOICES[high].beltTop + HIGH_EXTRA) : MID[1];

  list.forEach((idea, si) => {
    const { song, chords } = idea;
    const home = homeMidi(song.key);
    const scale = SCALES[song.mode] as readonly number[];
    const midiOf = (x: number) => home + 12 * Math.floor(x / 7) + scale[deg7(x)];
    const tonesAt = (g: number) => chordTones(song.key, chords.timeline[chords.chordIdx[Math.min(song.total - 1, g)]].chord);
    const rootAt = (g: number) => chordPc(song.key, chords.timeline[chords.chordIdx[Math.min(song.total - 1, g)]].chord);
    // the beats, and which are strong (a bar's first, and the one nearest its middle)
    const beats = song.bars.flatMap((b, bi) => {
      const starts = groupStarts(b.groups);
      const mid = starts.reduce((x, p) => (Math.abs(p - b.len / 2) < Math.abs(x - b.len / 2) ? p : x), starts[0]);
      return starts.map((p) => ({ step: b.start + p, bar: bi, first: p === 0, strong: p === 0 || (p === mid && starts.length > 2) }));
    });
    const tension = (bar: number) => idea.section?.tension?.[bar] ?? 0.3 + 0.3 * Math.sin((Math.PI * (beatNo / Math.max(1, songBeats))));
    const out: GuideNote[] = [];
    const lastSection = si === list.length - 1;
    // (the voice: mid, up to the high voice's top where the song is high)
    const ceil = (t: number) => (high && t >= HIGH_T ? top : MID[1]);
    const inVoice = (x: number, t: number) => midiOf(x) >= MID[0] && midiOf(x) <= ceil(t) && x >= lo && x <= hi + (high ? 3 : 0);
    const kind = idea.section?.kind ?? '';
    const again = REPEATS.includes(kind) ? firstOf.get(kind) : undefined;
    let i = 0;
    // a verse, pre-chorus or chorus sung before: the same notes (in this section's key), a few a step away
    if (again && again.total === song.total && again.bars === song.bars.length) {
      const fit = (x: number) => midiOf(x) >= MID[0] && midiOf(x) <= top;
      const shift = [0, -7, 7].find((sh) => again.notes.every((n) => fit(n.deg + sh))) ?? 0;
      // (a leap into it straight on: the note before is cut a beat short, a pause before the leap)
      const before = parts[si - 1]?.[parts[si - 1].length - 1];
      const prevSong = list[si - 1]?.song;
      const entry = again.notes[0];
      let lateIn = 0;
      if (before && prevSong && entry.step === 0 && before.step + before.len === prevSong.total && Math.abs(entry.deg + shift - d) >= 3) {
        if (before.len >= 8) { cutBeat(before); stat.pauses++; }
        // (else the repeat comes in a beat late)
        else if (entry.len >= 8) lateIn = 4;
      }
      again.notes.forEach((n0, k) => {
        let deg = n0.deg + shift, cs = again.cs[k];
        const inner = k > 0 && k < again.notes.length - 1 && !n0.bend && !again.notes[k + 1]?.bend;
        if (inner && rng.chance(VARY)) {
          const to = deg + (rng.chance(0.5) ? 1 : -1);
          // (still small moves either side: a changed note never makes a leap)
          const near = (o?: GuideNote) => !o || Math.abs(o.deg + shift - to) <= 2 || o === again.notes[k + 1] && !!o.leap;
          const before = out[out.length - 1];
          if (fit(to) && (!before || Math.abs(before.deg - to) <= 2) && (near(again.notes[k + 1]) || !!again.notes[k + 1]?.leap)) { deg = to; cs = 0; stat.varied++; }
        }
        // (out of the voice (a repeat in a higher key): brought back in, a step at a time)
        while (!fit(deg) && midiOf(deg) > top) deg--;
        while (!fit(deg) && midiOf(deg) < MID[0]) deg++;
        // (the song's last note: home)
        if (lastSection && k === again.notes.length - 1) {
          deg = [-7, 0, 7, 14].map((h) => h).filter((h) => fit(h)).reduce((b, h) => (Math.abs(h - deg) < Math.abs(b - deg) ? h : b), 0);
          cs = 0;
        }
        if (cs && (midiOf(deg) + cs > top || midiOf(deg) + cs < MID[0])) cs = 0;
        const lp = n0.leap || (k === 0 && Math.abs(deg - d) >= 3);
        const late = k === 0 ? lateIn : 0;
        const note: GuideNote = { step: n0.step + late, len: n0.len - late, midi: midiOf(deg) + cs, deg, ...(cs ? { colour: true } : {}), ...(lp ? { leap: true } : {}), ...(n0.bend ? { bend: n0.bend } : {}) };
        // (a bend only into a step: a key change or a changed note can make it more)
        const prev = out[out.length - 1];
        if (note.bend && (!prev || Math.abs(note.midi - prev.midi) > BEND_SEMIS || note.midi === prev.midi)) delete note.bend;
        out.push(note);
        stat.notes++;
        stat.lowM = Math.min(stat.lowM, note.midi); stat.hiM = Math.max(stat.hiM, note.midi);
        if (note.midi > MID[1]) stat.highNotes++;
      });
      stat.repeats++;
      d = out[out.length - 1].deg;
      afterPause = false; lastLeap = 0; sameRun = 0;
      beatNo += beats.length;
      i = beats.length;
    }
    while (i < beats.length) {
      const b = beats[i];
      const t = tension(b.bar);
      // a pause at the end of a phrase (never before the first note, never in the last bar of the song)
      const phraseStart = b.first && b.bar > 0 && b.bar % M.phrase === 0;
      const lastBar = lastSection && b.bar === song.bars.length - 1;
      if ((phraseStart || (si > 0 && i === 0 && out.length === 0)) && !afterPause && !lastBar && (stat.notes > 0) && rng.chance(M.pause * (si > 0 && i === 0 ? 0.5 : 1))) {
        const r = rng.chance(0.6) ? 1 : 2;
        i += r; beatNo += r;
        afterPause = true;
        stat.pauses++;
        continue;
      }
      // how long: the mood's pace (steady: Paul, "too many shifts, almost every beat"), a little quicker as
      // the tension rises; notes change only on strong beats (a bar's first, or its middle)
      const mean = STEADY * M.beats * (1.15 - 0.3 * t);
      const want = Math.max(1, Math.round(mean * (0.7 + rng.next() * 0.6)));
      // (up to the next phrase start, so pauses can come there)
      const phraseAt = (j: number) => beats[j].first && beats[j].bar % M.phrase === 0;
      let n = 1;
      while (i + n < beats.length && !phraseAt(i + n) && (n < want || !beats[i + n].strong)) n++;
      const end = i + n >= beats.length;
      const songEnd = lastSection && end;
      // (the song's last two bars head for home, the nearest one)
      const homes = [-7, 0, 7, 14].filter((h) => midiOf(h) >= MID[0] && midiOf(h) <= MID[1]);
      const homeD = (homes.length ? homes : [0]).reduce((bh, h) => (Math.abs(h - d) < Math.abs(bh - d) ? h : bh));
      const closing = lastSection && b.bar >= song.bars.length - 4;
      // (the height the tension asks for, within the voice; a high voice reaches for its top where it's high)
      const voiceDs = Array.from({ length: 30 }, (_, k) => k - 10).filter((x) => inVoice(x, t));
      const dBot = Math.min(...voiceDs), dTop = Math.max(...voiceDs);
      let want0 = lo + t * (hi - lo) + M.lean * 2;
      if (high && t >= HIGH_T) want0 = Math.max(want0, dTop - 1);
      const target = closing ? homeD : Math.max(dBot, Math.min(dTop, want0));
      const strong = b.strong || n >= 2;
      // every candidate move, weighted
      const cands: { d: number; w: number }[] = [];
      const reach = afterPause ? M.leapMax : 2;
      for (let s = -reach; s <= reach; s++) {
        const x = d + s;
        // (above the voice where the song calms down: only on the way down, a step at a time)
        if (!inVoice(x, t) && !(x < d && midiOf(x) <= midiOf(d) && midiOf(x) >= MID[0] && x <= hi + 3)) continue;
        const a = Math.abs(s);
        let w = a === 0 ? (sameRun >= 2 || stat.notes === 0 ? 0 : M.same) : a === 1 ? 1 : a === 2 ? M.third : M.leap * (afterPause ? 2.5 : 0) / (a - 2);
        if (stat.notes === 0) w = s === 0 ? 1 : 0;
        // after a leap: step back the other way
        if (lastLeap && s !== 0) w *= Math.sign(s) === -Math.sign(lastLeap) && a <= 2 ? 3 : 0.15;
        // toward the tension's height, and the mood's lean
        if (s !== 0) {
          const toward = Math.sign(target - d) === Math.sign(s);
          w *= toward ? 1 + Math.min(2, Math.abs(target - d) / 2) : 0.7;
          w *= 1 + M.lean * Math.sign(s);
        }
        // where it likes to rest (more on long notes and strong beats)
        w *= M.rest[deg7(x)] ** (strong ? 1.6 : 0.6);
        // with the chords: strong beats on the chord's notes
        if (lean === 'in' && strong) w *= tonesAt(b.step).includes(mod(midiOf(x), 12)) ? 3 : 0.35;
        // a section's last note settles (1st, 3rd, 5th); the song's last note is home
        if (end && [0, 2, 4].includes(deg7(x))) w *= 3;
        if (songEnd) w = deg7(x) === 0 ? w + 100 : 0;
        if (w > 0) cands.push({ d: x, w });
      }
      // (the last note: home, even out of a step's reach)
      if (songEnd && !cands.some((c) => deg7(c.d) === 0)) { cands.length = 0; cands.push({ d: homeD, w: 1 }); }
      // (nothing in reach within the voice (a key change): the nearest note that is)
      if (!cands.length) cands.push({ d: voiceDs.reduce((bx, x) => (Math.abs(x - d) < Math.abs(bx - d) ? x : bx), voiceDs[0] ?? 0), w: 1 });
      let r = rng.next() * cands.reduce((s, c) => s + c.w, 0);
      const pick = cands.find((c) => (r -= c.w) <= 0) ?? cands[cands.length - 1];
      const s = pick.d - d;
      const a = Math.abs(s);
      // (a forced jump (home at the end, back into the voice): a pause before it, the note before cut a beat)
      let forced = false;
      if (a >= 3 && !afterPause && stat.notes > 0) {
        const pv = out[out.length - 1] ?? (i === 0 ? parts[si - 1]?.[parts[si - 1].length - 1] : undefined);
        const pvEnd = pv ? pv.step + pv.len : -1;
        const joins = pv && (out.length ? pvEnd === b.step : pvEnd === list[si - 1].song.total && b.step === 0);
        if (joins && pv.len >= 8) { cutBeat(pv); stat.pauses++; forced = true; }
        // (else a beat's pause here, and the note after it)
        else if (joins && n > 1) { i += 1; beatNo += 1; afterPause = true; stat.pauses++; continue; }
      }
      if (stat.notes > 0) { if (a === 0) stat.same++; else if (a === 1) stat.step++; else if (a === 2) stat.third++; else stat.leap++; }
      d = pick.d;
      lastLeap = a >= 3 ? s : 0;
      sameRun = a === 0 ? sameRun + 1 : 0;
      let midi = midiOf(d);
      // a mood's colour note (not on the chord's root, never against a held strong chord note when leaning in)
      const shift = M.colour && !songEnd ? colourShift(M.colour, song.mode, d, target > d) : 0;
      let colour = false;
      if (shift && rng.chance(M.colourP) && midi + shift <= ceil(t) && midi + shift >= MID[0] && mod(midi + shift - rootAt(b.step), 12) !== 6 && !(lean === 'in' && b.strong)) { midi += shift; colour = true; stat.colour++; }
      const stepEnd = i + n < beats.length ? beats[i + n].step : song.total;
      const prev = out[out.length - 1];
      // (the same note again, straight on: held on, not struck again)
      if (prev && a === 0 && prev.midi === midi && prev.step + prev.len === b.step) {
        prev.len = stepEnd - prev.step;
        i += n; beatNo += n;
        continue;
      }
      // a bend into the next step: straight on from the note before (no pause), by a half or whole step,
      // over an 8th, a quarter or half a bar (never more than half the note)
      let bend = 0;
      if (prev && prev.step + prev.len === b.step && a === 1 && Math.abs(midi - prev.midi) <= BEND_SEMIS && rng.chance(M.bend)) {
        const opts = [2, 4, Math.round(song.bars[b.bar].len / 2)].map((len, j) => ({ len, w: len * 2 <= stepEnd - b.step ? M.bendLen[j] : 0 }));
        let r2 = rng.next() * opts.reduce((x, o) => x + o.w, 0);
        if (r2 > 0) { bend = (opts.find((o) => (r2 -= o.w) <= 0) ?? opts[0]).len; stat.bends++; stat.bendLens[opts.findIndex((o) => o.len === bend)]++; }
      }
      out.push({ step: b.step, len: stepEnd - b.step, midi, deg: d, ...(colour ? { colour } : {}), ...(a >= 3 || forced ? { leap: true } : {}), ...(bend ? { bend } : {}) });
      stat.notes++;
      if (b.strong) { stat.strong++; if (tonesAt(b.step).includes(mod(midi, 12))) stat.strongTone++; }
      stat.lowM = Math.min(stat.lowM, midi); stat.hiM = Math.max(stat.hiM, midi);
      if (midi > MID[1]) stat.highNotes++;
      afterPause = false;
      i += n; beatNo += n;
    }
    // (the first of its kind: kept, to sing again)
    if (REPEATS.includes(kind) && !firstOf.has(kind) && out.length) firstOf.set(kind, { notes: out.map((n) => ({ ...n })), cs: out.map((n) => n.midi - midiOf(n.deg)), total: song.total, bars: song.bars.length });
    // quick notes on the long ones (Paul): one note up or down a step or two, for an 8th, on the 8th-note
    // grid, then back to the line, like a drum hit (now and then a 16th and a 16th's silence); at a held
    // note's very end, a bend to it instead (and on from there). They come in 2-bar clusters: frequent,
    // moderate, sparse. Not on notes in a bend, never the song's last note's end.
    const barOf = (g: number) => barBase + Math.max(0, song.bars.findIndex((b) => b.start + b.len > g));
    out.forEach((n, k) => {
      const next = out[k + 1];
      if (n.len < 8 || n.bend || next?.bend) return;
      const songLast = lastSection && k === out.length - 1;
      const barLen = song.bars.find((b) => b.start + b.len > n.step)?.len ?? 16;
      const fl: Flick[] = [];
      for (let at = flicks === 'lots' ? 2 : 4; at < n.len; at += 2) {
        const r = frng.next(), up = frng.chance(FLICK_UP), two = frng.chance(0.25), gap = frng.chance(GAP_P);
        const cl = clusterAt(barOf(n.step + at));
        const pOn = (FLICK_RATE[flicks] * CLUSTER_RATE[cl] * 2) / barLen;
        // (apart: a beat, an 8th in a frequent cluster or on Lots (Paul: "much more frequent"))
        const last = fl[fl.length - 1];
        if (last && at < last.at + last.len + (last.gap ?? 0) + (cl === 'frequent' || flicks === 'lots' ? 2 : 4)) continue;
        if (r >= pOn) continue;
        // (with a pause: a 16th, a 16th's silence, then the line again on the 8th)
        const len = gap ? 1 : 2;
        if (at + len > n.len) continue;
        const end = at + len === n.len;
        if (end && songLast) continue;
        const m = midiOf(n.deg + (up ? 1 : -1) * (two ? 2 : 1));
        if (m === n.midi || m < MID[0] - 2 || m > (high ? top : MID[1]) + 2) continue;
        // (a 16th's silence before the note comes back: only with room after it)
        const rest = !end && gap && at + len + 1 < n.len;
        if (gap && !rest) continue;
        fl.push({ at, len, midi: m, ...(end ? { bend: true } : {}), ...(rest ? { gap: 1 } : {}) });
        if (rest) stat.flickGaps++;
        stat.byCluster[cl]++;
        stat.flicks++;
        if (end) stat.flickBends++;
      }
      if (fl.length) n.flicks = fl;
    });
    // the song's last note rings to the end
    parts.push(out);
    barBase += song.bars.length;
  });

  const moves = Math.max(1, stat.step + stat.third + stat.same + stat.leap);
  const pc = (x: number) => `${Math.round((100 * x) / moves)}%`;
  const startDeg = deg7(parts.find((p) => p.length)?.[0].deg ?? 0);
  const colourWord: Record<Exclude<Colour, null>, string> = {
    lead: 'the raised 7th pulling up home', sigh: 'the flat 6th sighing down to the 5th', dark: 'the flat 2nd, dark, just above home', float: 'the raised 4th, floating',
  };
  const notes = [
    `Mood: ${MOOD_LABEL[mood]}${moodIn ? '' : ' (auto)'}: ${M.desc}`,
    `Starts on the ${DEG_NAME[startDeg]}, ends on home. Range ${noteName(stat.lowM)} to ${noteName(stat.hiM)}`,
    `Voice: ${high ? `high (${HIGH_VOICES[high].label}): mid range, up to ${noteName(top)} where the song is high (${stat.highNotes} notes up there)` : `mid (${noteName(MID[0])} to ${noteName(MID[1])})`}`,
    `Repeats: ${stat.repeats} ${stat.repeats === 1 ? 'section' : 'sections'} sung like the first verse, pre-chorus or chorus (${stat.varied} notes changed a step)`,
    `Moves: steps ${pc(stat.step)}, 3rds ${pc(stat.third)}, held on ${pc(stat.same)}, leaps after a pause ${pc(stat.leap)} (${stat.leap})`,
    `Bends: ${stat.bends} (into a step: ${stat.bendLens[0]} over an 8th, ${stat.bendLens[1]} over a quarter, ${stat.bendLens[2]} over half a bar)`,
    ...(flicks === 'off' ? [] : [`Quick notes: ${stat.flicks} in 2-bar clusters (frequent ${stat.byCluster.frequent}, moderate ${stat.byCluster.moderate}, sparse ${stat.byCluster.sparse}); ${stat.flickGaps} as a 16th with a 16th's pause before the note comes back, ${stat.flickBends} bent to at a note's end`]),
    `${stat.notes} notes, about ${(songBeats / Math.max(1, stat.notes)).toFixed(1)} beats each; ${stat.pauses} pauses`,
    `Chords: ${lean === 'in' ? 'leaning in' : 'leaning out (key only)'}: strong beats on a chord note ${Math.round((100 * stat.strongTone) / Math.max(1, stat.strong))}%`,
    M.colour ? `Out of key: ${colourWord[M.colour]} (${stat.colour}${stat.colour === 1 ? ' time' : ' times'})` : 'Out of key: none (this mood stays in the scale)',
  ];
  return { parts, mood, notes };
}
