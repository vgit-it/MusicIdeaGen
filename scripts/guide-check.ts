// Guide line safety check (Paul: "i dont want to break the existing system"). Writes the guide line and its
// words for 168 songs (every mood, genre and 4/4, 6/8, 7/8; the quick-note levels, Lean in/out and the voices
// taken in turn) and compares each with the saved reference (scripts/guide-reference.json): with every new
// idea switched off, every note, quick note, push, pull and word must be the same as before.
// Also checks the rules with whatever is on: the words sit exactly on the tune, at most 4 changes heard in any
// second, the range.
//   npm run guide-check          compare with the reference
//   npm run guide-check -- save  save a new reference (only when a change to the line is meant)

import { readFileSync, writeFileSync } from 'node:fs';
import { generate } from '../src/generator';
import { buildTrack, defaultTrackOptions } from '../src/track';
import { type Flicks, type GuideIdeas, writeGuide } from '../src/guide/line';
import { guideWords } from '../src/guide/words';
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
const IDEAS: [string, GuideIdeas][] = [['all off', {}], ['Repeat idea', { motif: true }], ['Slow line', { spine: true }], ['Pitch by words', { speech: true }], ['Question and answer', { qa: true }], ['all on', { motif: true, spine: true, speech: true, qa: true }]];

const out: Record<string, string> = {};
const broken: string[] = [];
let songs = 0;
for (const [ideaName, ideas] of IDEAS) {
let k = 0;
for (const mood of MOODS) for (const genre of GENRES) for (const meter of METERS) {
  const s = `gc-${genre}-${meter}-${mood}`;
  const flicks = FLICKS[k % 4], lean = k % 3 === 2 ? 'out' : 'in', high = HIGH[k % 4];
  k++;
  const idea = generate({ genre, meter, weirdness: 0.3 } as never, { song: s, chords: s + 'c', drums: s + 'd', strum: s + 's', bass: s + 'b', vocal: s + 'v' } as never);
  const tr = buildTrack(idea, { ...defaultTrackOptions(idea), mood } as never);
  const list = tr.sections;
  const L = writeGuide(list, tr.mood, lean, 0, flicks, high, ideas);
  const W = guideWords(list, L);
  const id = `${ideaName === 'all off' ? '' : `[${ideaName}] `}${mood}|${genre}|${meter}|${flicks}|${lean}|${high ?? 'mid'}`;
  if (ideaName === 'all off') out[id] = hash(JSON.stringify({ parts: L.parts, silent: L.silent, words: W.map((ls) => ls.map((l) => ({ t: l.text, n: l.notes.map((x) => [x.step, x.len, x.midi, x.vel, x.syl.text, x.syl.wordStart, x.syl.stress]) }))) }));
  if (ideaName === 'all off') songs++;
  // the rules
  list.forEach((idea, si) => {
    const total = idea.song.total, six = 15 / idea.song.bpm;
    const want: (number | null)[] = Array(total).fill(null), got: (number | null)[] = Array(total).fill(null);
    const changes: number[] = [];
    for (const n of L.parts[si]) {
      if (!n.bend) changes.push(n.step);
      for (let t = 0; t < n.len; t++) want[n.step + t] = n.midi;
      for (const f of n.flicks ?? []) {
        changes.push(n.step + f.at);
        if (!f.bend) changes.push(n.step + f.at + f.len + (f.gap ?? 0));
        for (let t = f.at; t < (f.bend ? n.len : f.at + f.len); t++) want[n.step + t] = f.midi;
        if (f.gap) for (let t = 0; t < f.gap; t++) want[n.step + f.at + f.len + t] = null;
      }
      for (const m of n.marks ?? []) {
        changes.push(n.step + m.at);
        if (m.back) { changes.push(n.step + m.at + m.back); for (let t = m.at + 1; t < m.at + m.back && t < n.len; t++) want[n.step + t] = null; }
      }
      if (n.midi < 48 || n.midi > 84) broken.push(`${id} ${idea.section?.label}: a note out of range (${n.midi})`);
    }
    for (const l of W[si]) for (const x of l.notes) for (let t = 0; t < x.len; t++) got[x.step + t] = x.midi;
    if (want.some((v, t) => v !== got[t])) broken.push(`${id} ${idea.section?.label}: the words are off the tune`);
    // (at most 4 changes heard in any second; a note start at a step can count once)
    const at = [...new Set(changes)].sort((a, b) => a - b);
    for (let i = 0; i + 4 < at.length; i++) if ((at[i + 4] - at[i]) * six < 1 - 1e-9) { broken.push(`${id} ${idea.section?.label}: over 4 changes in a second`); break; }
  });
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
console.log(broken.length ? `RULES BROKEN: ${broken.length}\n  ${broken.slice(0, 12).join('\n  ')}` : 'Rules: all kept.');
if (broken.length) process.exitCode = 1;
