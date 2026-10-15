// Guide line safety check (Paul: "i dont want to break the existing system"). Writes the guide line and its
// words for 168 songs (every mood, genre and 4/4, 6/8, 7/8; the quick-note levels, Lean in/out and the voices
// taken in turn) and compares each with the saved reference (scripts/guide-reference.json): with every new
// idea switched off, every note, quick note, push, pull and word must be the same as before.
// Also checks the rules with whatever is on: the words sit exactly on the tune, at most 4 changes heard in any
// second, the range, the levels, a new note inside a word only ever a bend, never two notes at once, a note held at most a bar.
//   npm run guide-check          compare with the reference
//   npm run guide-check -- save  save a new reference (only when a change to the line is meant)

import { readFileSync, writeFileSync } from 'node:fs';
import { generate } from '../src/generator';
import { buildTrack, defaultTrackOptions } from '../src/track';
import { type Flicks, type GuideIdeas, type GuideRange, type GuideTonality, writeGuide } from '../src/guide/line';
import { guideWords } from '../src/guide/words';
import { ANCHOR_HOLD_BARS, writeAnchor } from '../src/guide/anchor';
import { shapeDynamics } from '../src/guide/dynamics';
import { MOODS } from '../src/tension';
import type { HighVoice } from '../src/parts/singers';

const REF = 'scripts/guide-reference.json';
const save = process.argv.includes('save');
const GENRES = ['rock', 'pop', 'funk', 'hardrock', 'metal', 'grunge', 'altmetal'];
const METERS = ['4/4', '6/8', '7/8'];
const FLICKS: Flicks[] = ['off', 'sparse', 'some', 'lots'];
const HIGH: (HighVoice | null)[] = [null, null, 'tenor', 'woman'];

/** A short fingerprint of a string (FNV-1a). */
const hash = (s: string) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0; return h.toString(16); };

/** Each new idea switched on alone (the rules checked with it on too). */
const IDEAS: [string, GuideIdeas][] = [['all off', {}], ['Repeat idea', { motif: true }], ['Slow line', { spine: true }], ['Pitch by words', { speech: true }], ['Question and answer', { qa: true }], ['Breaths', { breath: true }], ['Section change', { shift: true }], ['Lead-ins', { leadIn: true }], ['Carry over', { carry: true }], ['Hard and soft', { dynamics: true }],
  ['all on', { motif: true, spine: true, speech: true, qa: true, breath: true, shift: true, leadIn: true, carry: true, dynamics: true }]];
const ALL_ON = IDEAS[IDEAS.length - 1][1];
/** Ranges set by hand (the Range sliders), the rules checked within each: off and all on, narrow, wide, very low, very high. */
const RANGES: GuideRange[] = [[24, 36], [36, 72], [55, 79], [40, 52], [78, 90], [24, 90], [60, 72]];
/** Keys and scales of the line's own (a key as semitones from the song's), the rules checked with each, guarded or not. */
const TONES: [number | null, GuideTonality['scale'], boolean][] = [[null, 'lydian', true], [1, null, true], [6, 'phrygian', false], [7, 'harmonic', true], [3, 'locrian', false]];
const RUNS: [string, GuideIdeas, GuideRange | null, [number | null, GuideTonality['scale'], boolean] | null][] = [...IDEAS.map(([n, i]): [string, GuideIdeas, null, null] => [n, i, null, null]),
  ...RANGES.flatMap((r): [string, GuideIdeas, GuideRange, null][] => [[`range ${r.join('-')}`, {}, r, null], [`range ${r.join('-')}, all on`, ALL_ON, r, null]]),
  // (Anchor line: a writer of its own; with Hard and soft, a range and a key and scale of its own)
  ['Anchor line', { anchor: true }, null, null], ['Anchor line, Hard and soft', { anchor: true, dynamics: true }, null, null], ['Anchor line, range 40-52', { anchor: true }, [40, 52], null], ['Anchor line, range 24-90', { anchor: true }, [24, 90], null], ['Anchor line, key +6 phrygian', { anchor: true }, null, [6, 'phrygian', false]],
  ...TONES.flatMap((t): [string, GuideIdeas, null, [number | null, GuideTonality['scale'], boolean]][] => [[`key +${t[0] ?? 0} ${t[1] ?? 'same'}${t[2] ? ' guarded' : ''}`, {}, null, t], [`key +${t[0] ?? 0} ${t[1] ?? 'same'}${t[2] ? ' guarded' : ''}, all on`, ALL_ON, null, t]])];

const out: Record<string, string> = {};
const broken: string[] = [];
let songs = 0;
for (const [ideaName, ideas, range, tn] of RUNS) {
if (process.env.ONLY && !ideaName.includes(process.env.ONLY)) continue;
let k = 0;
for (const mood of MOODS) for (const genre of GENRES) for (const meter of METERS) {
  const s = `gc-${genre}-${meter}-${mood}`;
  const flicks = FLICKS[k % 4], lean = k % 3 === 2 ? 'out' : 'in', high = HIGH[k % 4];
  k++;
  const idea = generate({ genre, meter, weirdness: 0.3 } as never, { song: s, chords: s + 'c', drums: s + 'd', strum: s + 's', bass: s + 'b', vocal: s + 'v' } as never);
  const tr = buildTrack(idea, { ...defaultTrackOptions(idea), mood } as never);
  const list = tr.sections;
  const tone = tn && { key: tn[0] === null ? null : (list[0].song.key + tn[0]) % 12, scale: tn[1], guard: tn[2] };
  const L = ideas.anchor ? writeAnchor(list, tr.mood, lean, 0, range, tone) : writeGuide(list, tr.mood, lean, 0, flicks, high, ideas, range, tone);
  const W = guideWords(list, L);
  if (ideas.dynamics) shapeDynamics(list, L, W);
  const id = `${ideaName === 'all off' ? '' : `[${ideaName}] `}${mood}|${genre}|${meter}|${flicks}|${lean}|${high ?? 'mid'}`;
  if (ideaName === 'all off') out[id] = hash(JSON.stringify({ parts: L.parts, silent: L.silent, words: W.map((ls) => ls.map((l) => ({ t: l.text, n: l.notes.map((x) => [x.step, x.len, x.midi, x.vel, x.syl.text, x.syl.wordStart, x.syl.stress]) }))) }));
  if (ideaName === 'all off') songs++;
  // the rules, over the whole song (a note may run on past its section's end: a lead-in, a carry over)
  const offs: number[] = [];
  let tot = 0;
  for (const i of list) { offs.push(tot); tot += i.song.total; }
  const six = 15 / list[0].song.bpm;
  const want: (number | null)[] = Array(tot + 64).fill(null), got: (number | null)[] = Array(tot + 64).fill(null);
  const changes: number[] = [];
  let lastEnd = -1;
  list.forEach((idea, si) => {
    const o = offs[si], bar = idea.song.bars[0].len;
    for (const n of L.parts[si]) {
      const at = o + n.step;
      if (at < lastEnd) broken.push(`${id} ${idea.section?.label}: two notes at once`);
      lastEnd = at + n.len;
      if (n.len > bar * (ideas.anchor ? ANCHOR_HOLD_BARS : 1)) broken.push(`${id} ${idea.section?.label}: a note held over ${ideas.anchor ? `${ANCHOR_HOLD_BARS} bars` : 'a bar'}`);
      if (!n.bend) changes.push(at);
      for (let t = 0; t < n.len; t++) want[at + t] = n.midi;
      for (const f of n.flicks ?? []) {
        changes.push(at + f.at);
        if (!f.bend) changes.push(at + f.at + f.len + (f.gap ?? 0));
        for (let t = f.at; t < (f.bend ? n.len : f.at + f.len); t++) want[at + t] = f.midi;
        if (f.gap) for (let t = 0; t < f.gap; t++) want[at + f.at + f.len + t] = null;
      }
      for (const m of n.marks ?? []) {
        changes.push(at + m.at);
        if (m.back) { if (m.at + m.back < n.len) changes.push(at + m.at + m.back); for (let t = m.at + 1; t < m.at + m.back && t < n.len; t++) want[at + t] = null; }
      }
      if (range ? n.midi < range[0] || n.midi > range[1] || (n.flicks ?? []).some((f) => f.midi < range[0] - 2 || f.midi > range[1] + 2) : n.midi < 48 || n.midi > 84) broken.push(`${id} ${idea.section?.label}: a note out of range (${n.midi})`);
    }
    for (const l of W[si]) for (const x of l.notes) {
      for (let t = 0; t < x.len; t++) got[o + x.step + t] = x.midi;
      if (!(x.vel >= 0.45 && x.vel <= 1)) broken.push(`${id} ${idea.section?.label}: a level out of range (${x.vel})`);
    }
    // (a new note inside a word only ever a bend: carried on, gliding there; any other new note starts a word)
    for (const l of W[si]) l.notes.forEach((x, k) => {
      const p = l.notes[k - 1];
      if (p && x.midi !== p.midi && !x.syl.wordStart && !(x.syl.text === '~' && x.bend)) broken.push(`${id} ${idea.section?.label}: a new note inside a word, not bent`);
    });
  });
  if (want.some((v, t) => v !== got[t])) broken.push(`${id}: the words are off the tune`);
  // (at most 4 changes heard in any second; a note start at a step can count once)
  const at = [...new Set(changes)].sort((a, b) => a - b);
  for (let i = 0; i + 4 < at.length; i++) if ((at[i + 4] - at[i]) * six < 1 - 1e-9) { broken.push(`${id}: over 4 changes in a second`); break; }
}
}

if (save) {
  writeFileSync(REF, JSON.stringify(out, null, 1) + '\n');
  console.log(`Saved the reference: ${songs} songs.`);
} else {
  const ref = JSON.parse(readFileSync(REF, 'utf8')) as Record<string, string>;
  const changed = Object.keys(ref).filter((id) => ref[id] !== out[id]);
  console.log(changed.length ? `CHANGED: ${changed.length} of ${songs} songs differ from the reference, e.g.\n  ${changed.slice(0, 8).join('\n  ')}` : `Same as the reference: all ${songs} songs.`);
  if (changed.length) process.exitCode = 1;
}
console.log(broken.length ? `RULES BROKEN: ${broken.length}\n  ${broken.slice(0, process.env.ALL ? 9999 : 12).join('\n  ')}` : 'Rules: all kept.');
if (broken.length) process.exitCode = 1;
