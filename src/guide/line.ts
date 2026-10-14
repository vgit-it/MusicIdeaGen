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

const mod = (n: number, m: number) => ((n % m) + m) % m;

export type Lean = 'in' | 'out';

export interface GuideNote {
  /** Step in its section, length in steps, the note, and its scale degree (0 home, 1 the 2nd ... any octave). */
  step: number; len: number; midi: number; deg: number;
  /** Out of the key (a mood's colour note). */
  colour?: boolean;
  /** A leap after a pause. */
  leap?: boolean;
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
  /** An out-of-key colour note and how often. */
  colour: Colour; colourP: number;
  /** In plain words. */
  desc: string;
}

// (degree feel, after David Huron's "Sweet Anticipation": the 1st home, the 5th strong and open, the 3rd
// warm (major or minor), the 2nd, 4th and 6th unsettled, the 7th yearning; higher and rising brighter,
// lower and falling darker; long notes calm, quick ones restless)
const MOODS: Record<Mood, GuideMood> = {
  happy: { start: [2, 4, 0], rest: [1.4, 0.6, 1.5, 0.6, 1.3, 1, 0.3], beats: 1.5, third: 0.3, same: 0.15, lean: 0.15, pause: 0.45, phrase: 2, leap: 0.5, leapMax: 4, span: 9, low: -2, colour: null, colourP: 0,
    desc: 'bright: sits on the 3rd and 5th, lively, leans up, leaps up after a pause' },
  melancholic: { start: [4, 2], rest: [1.2, 0.8, 1.5, 0.7, 1.1, 0.9, 0.4], beats: 2.5, third: 0.15, same: 0.1, lean: -0.35, pause: 0.55, phrase: 2, leap: 0.35, leapMax: 5, span: 7, low: -3, colour: 'sigh', colourP: 0.35,
    desc: 'falls more than it rises, slow, sighs down by step; a 6th leap now and then' },
  nostalgic: { start: [2, 4], rest: [1.2, 0.7, 1.4, 0.8, 1.1, 1.3, 0.4], beats: 2, third: 0.25, same: 0.1, lean: -0.1, pause: 0.5, phrase: 2, leap: 0.55, leapMax: 5, span: 8, low: -2, colour: 'sigh', colourP: 0.2,
    desc: 'warm: rests on the 3rd and 6th, gentle waves, a leap up of a 6th after a pause' },
  tense: { start: [1, 4, 6], rest: [0.6, 1.2, 0.8, 1.2, 1, 1, 1.3], beats: 1, third: 0.2, same: 0.35, lean: 0.1, pause: 0.3, phrase: 2, leap: 0.4, leapMax: 3, span: 6, low: -2, colour: 'lead', colourP: 0.5,
    desc: 'restless: quick, repeats itself, rests on unsettled notes (2nd, 4th, 7th), rarely home' },
  angry: { start: [0, 4], rest: [1.4, 0.5, 1, 0.8, 1.4, 0.7, 0.6], beats: 1, third: 0.2, same: 0.4, lean: 0, pause: 0.35, phrase: 2, leap: 0.6, leapMax: 4, span: 7, low: -3, colour: 'dark', colourP: 0.3,
    desc: 'hammers: quick, insistent repeats on the 1st and 5th, punches up after a pause' },
  dreamy: { start: [4, 2], rest: [1, 0.9, 1.3, 0.8, 1.3, 1.2, 0.8], beats: 4, third: 0.3, same: 0.05, lean: 0, pause: 0.6, phrase: 4, leap: 0.3, leapMax: 3, span: 6, low: -1, colour: 'float', colourP: 0.4,
    desc: 'floats: long held notes, wanders gently, never quite lands' },
  triumphant: { start: [0, 4], rest: [1.5, 0.5, 1.2, 0.6, 1.5, 0.8, 0.3], beats: 1.5, third: 0.35, same: 0.1, lean: 0.3, pause: 0.45, phrase: 2, leap: 0.7, leapMax: 4, span: 10, low: -3, colour: 'lead', colourP: 0.25,
    desc: 'climbs: home and the 5th, rises through the song, bold leaps after a pause' },
  dark: { start: [0, 2], rest: [1.4, 0.7, 1.3, 0.8, 1, 1, 0.5], beats: 2, third: 0.2, same: 0.2, lean: -0.25, pause: 0.45, phrase: 2, leap: 0.35, leapMax: 4, span: 7, low: -3, colour: 'dark', colourP: 0.4,
    desc: 'low and heavy: stays down, falls back, a dark half step above home' },
};

const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
export const noteName = (m: number) => `${NAMES[mod(m, 12)]}${Math.floor(m / 12) - 1}`;

/** Home in the middle of the voice: A3 to G#4. */
const homeMidi = (key: number) => 57 + mod(key - 9, 12);

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
export function writeGuide(list: Idea[], moodIn: Mood | undefined, lean: Lean, salt = 0): GuideLine {
  const first = list[0];
  const mood = moodIn ?? autoMood(first.song, first.seeds.song);
  const M = MOODS[mood];
  const rng = new Rng(`guide-${first.seeds.song}-${mood}-${lean}-${salt}`);
  const lo = M.low, hi = M.low + M.span;
  let d = rng.pick(M.start);
  const parts: GuideNote[][] = [];
  const stat = { notes: 0, same: 0, step: 0, third: 0, leap: 0, colour: 0, pauses: 0, strong: 0, strongTone: 0, lowM: 999, hiM: 0 };
  let afterPause = false, lastLeap = 0, sameRun = 0;
  const songBeats = list.reduce((n, i) => n + i.song.bars.reduce((b, x) => b + x.groups.length, 0), 0);
  let beatNo = 0;

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
    let i = 0;
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
      // how long: the mood's pace, quicker as the tension rises; long notes start on strong beats
      const mean = M.beats * (1.35 - 0.7 * t);
      let n = Math.max(1, Math.round(mean * (0.6 + rng.next() * 0.8)));
      if (!b.strong && n > 2) n = 2;
      // (up to the next phrase start, so pauses can come there)
      let k = 1;
      while (k < n && i + k < beats.length && !(beats[i + k].first && beats[i + k].bar % M.phrase === 0)) k++;
      n = k;
      const end = i + n >= beats.length;
      const songEnd = lastSection && end;
      // (the song's last two bars head for home, the nearest one)
      const homeD = Math.round(d / 7) * 7 >= lo ? Math.round(d / 7) * 7 : Math.round(d / 7) * 7 + 7;
      const closing = lastSection && b.bar >= song.bars.length - 2;
      const target = closing ? homeD : lo + t * (hi - lo) + M.lean * 2;
      const strong = b.strong || n >= 2;
      // every candidate move, weighted
      const cands: { d: number; w: number }[] = [];
      const reach = afterPause ? M.leapMax : 2;
      for (let s = -reach; s <= reach; s++) {
        const x = d + s;
        if (x < lo || x > hi) continue;
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
      if (!cands.length) cands.push({ d: Math.max(lo, Math.min(hi, d)), w: 1 });
      let r = rng.next() * cands.reduce((s, c) => s + c.w, 0);
      const pick = cands.find((c) => (r -= c.w) <= 0) ?? cands[cands.length - 1];
      const s = pick.d - d;
      const a = Math.abs(s);
      if (stat.notes > 0) { if (a === 0) stat.same++; else if (a === 1) stat.step++; else if (a === 2) stat.third++; else stat.leap++; }
      d = pick.d;
      lastLeap = a >= 3 ? s : 0;
      sameRun = a === 0 ? sameRun + 1 : 0;
      let midi = midiOf(d);
      // a mood's colour note (not on the chord's root, never against a held strong chord note when leaning in)
      const shift = M.colour && !songEnd ? colourShift(M.colour, song.mode, d, target > d) : 0;
      let colour = false;
      if (shift && rng.chance(M.colourP) && mod(midi + shift - rootAt(b.step), 12) !== 6 && !(lean === 'in' && b.strong)) { midi += shift; colour = true; stat.colour++; }
      const stepEnd = i + n < beats.length ? beats[i + n].step : song.total;
      out.push({ step: b.step, len: stepEnd - b.step, midi, deg: d, ...(colour ? { colour } : {}), ...(a >= 3 ? { leap: true } : {}) });
      stat.notes++;
      if (b.strong) { stat.strong++; if (tonesAt(b.step).includes(mod(midi, 12))) stat.strongTone++; }
      stat.lowM = Math.min(stat.lowM, midi); stat.hiM = Math.max(stat.hiM, midi);
      afterPause = false;
      i += n; beatNo += n;
    }
    // the song's last note rings to the end
    parts.push(out);
  });

  const moves = Math.max(1, stat.notes - 1);
  const pc = (x: number) => `${Math.round((100 * x) / moves)}%`;
  const startDeg = deg7(parts.find((p) => p.length)?.[0].deg ?? 0);
  const colourWord: Record<Exclude<Colour, null>, string> = {
    lead: 'the raised 7th pulling up home', sigh: 'the flat 6th sighing down to the 5th', dark: 'the flat 2nd, dark, just above home', float: 'the raised 4th, floating',
  };
  const notes = [
    `Mood: ${MOOD_LABEL[mood]}${moodIn ? '' : ' (auto)'}: ${M.desc}`,
    `Starts on the ${DEG_NAME[startDeg]}, ends on home. Range ${noteName(stat.lowM)} to ${noteName(stat.hiM)}`,
    `Moves: steps ${pc(stat.step)}, 3rds ${pc(stat.third)}, same note ${pc(stat.same)}, leaps after a pause ${pc(stat.leap)} (${stat.leap})`,
    `${stat.notes} notes, about ${(songBeats / Math.max(1, stat.notes)).toFixed(1)} beats each; ${stat.pauses} pauses`,
    `Chords: ${lean === 'in' ? 'leaning in' : 'leaning out (key only)'}: strong beats on a chord note ${Math.round((100 * stat.strongTone) / Math.max(1, stat.strong))}%`,
    M.colour ? `Out of key: ${colourWord[M.colour]} (${stat.colour}${stat.colour === 1 ? ' time' : ' times'})` : 'Out of key: none (this mood stays in the scale)',
  ];
  return { parts, mood, notes };
}
