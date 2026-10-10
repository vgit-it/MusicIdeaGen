// Grows an 8-bar idea into a full track: intro, verses, choruses, bridge and outro.
// Like a real song, a track reuses a few blocks of music (verse, chorus, bridge) and plays
// them at different energy levels (1 quiet … 5 everything). Scope: docs/TRACKS.md
//
// Pure and deterministic: the same idea always grows into the same track.

import { type BuildOptions, buildIdea, withSheet } from './generator';
import { GENRES, type Genre, QUIET_STYLES, type RiffStyle } from './genres';
import type {
  ChordEvent, ChordPart, ChordSheet, DrumPart, GuitarHit, Idea, SectionInfo, SectionKind, Seeds, Song, Stroke,
} from './idea';
import { type DrumBar, addFill } from './parts/drums';
import { type Guitar2Style, generateGuitar2, generateHook, pickStyle } from './parts/guitar2';
import { BASS_LINE_DESC } from './parts/bass';
import { RIFF_STYLE_LABEL } from './parts/riff';
import { naturalStrokes } from './parts/strum';
import { applySheet, hasPins } from './parts/sheet';
import { playBand } from './players/band';
import { Rng } from './rng';
import { SOUND_NAME, type SoundId, type SoundSlot, orchestrate } from './sounds';
import { type Bar, type Variant, groupStarts, zeros } from './rhythm';
import { type Chord, type Mode, NOTE_NAMES, QUALITIES, SCALES, chordPc, degreeChord } from './theory';
import { lowestOf, powerChord } from './theory/fretboard';

export type Choice = 'auto' | 'on' | 'off';
export type IntroChoice = 'auto' | 'alone' | 'layered' | 'long' | 'band';
export type OutroChoice = 'auto' | 'short' | 'long' | 'jam';

/** How a track is built: its own seeds (so each block can be rerolled alone), structure choices, and an optional hand-edited order. */
export interface TrackOptions {
  /** `chorus`: a riff track's new chorus, when the idea's riff plays the verses (missing in older links). */
  seeds: { structure: string; verse: string; pre: string; bridge: string; hook: string; chorus?: string; band?: string };
  intro: IntroChoice;
  pre: Choice;
  interlude: Choice;
  keyChange: Choice;
  /** Short (4 bars), long (the last line repeats as a tag) or a jam (new music in a new key); missing in older links: Auto. */
  outro?: OutroChoice;
  /** Riff genres: the idea's riff plays under the verses (missing in older links: Auto). */
  riffVerse?: Choice;
  /** Played by the band: each player plays the written parts their own way (missing in older links: on). */
  band?: 'on' | 'off';
  /** Sections in order, when edited by hand (otherwise the genre template decides). */
  order?: SectionKind[];
  /** Rhythm instrument chosen by hand for a kind of section (every verse, every chorus...). */
  sounds?: Partial<Record<SoundSlot, SoundId>>;
  /** Chords you set on a block (every verse, pre-chorus or bridge plays them). The chorus is the idea's own sheet. */
  chords?: Partial<Record<ChordBlock, ChordSheet>>;
}

/** Blocks whose chords you can set in a track (the chorus is the idea itself). */
export type ChordBlock = 'verse' | 'pre' | 'bridge' | 'chorus';

/**
 * Where a section's chords are set: a block (its bars as written, `opts.chords` its sheet), or the idea
 * itself (`block` 'idea'). A section's bar i is bar `from + i % n` of `idea`.
 */
export interface ChordTarget { block: ChordBlock | 'idea'; idea: Idea; from: number; n: number }

export const defaultTrackOptions = (src: Idea): TrackOptions => {
  const s = src.seeds.song;
  return {
    seeds: { structure: `${s}-track`, verse: `${s}-verse`, pre: `${s}-pre`, bridge: `${s}-bridge`, hook: `${s}-hook`, chorus: `${s}-chorus` },
    intro: 'auto', pre: 'auto', interlude: 'auto', keyChange: 'auto',
  };
};

export interface Track {
  /** The idea the track grew from. */
  source: Idea;
  opts: TrackOptions;
  /** The order of sections actually built (edit a copy of this to rearrange the track). */
  order: SectionKind[];
  /** Each section is a playable idea with `section` set. */
  sections: Idea[];
  bars: number;
  steps: number;
  /** Where each kind of section's chords can be set (kinds missing here can't be edited). */
  edit: Partial<Record<SectionKind, ChordTarget>>;
  /** Riff genres: the idea's riff plays the verses, and (`newChorus`) the chorus is new music. */
  riffVerse: boolean;
  newChorus: boolean;
}

/** Length in seconds at the track's tempo. */
export const trackSeconds = (t: Track) => (t.steps * 15) / t.source.song.bpm;

/* ------------------------------------------------------------ slicing and joining */

const DRUM_LANES = ['kick', 'snare', 'hat', 'hatOpen', 'ride', 'crash', 'tom'] as const;

/** A run of bars from an idea. */
interface Seg { idea: Idea; from: number; n: number }
const seg = (idea: Idea, from = 0, n = idea.song.bars.length - from): Seg => ({ idea, from, n });

/** The first `k` bars of a list of segments. */
function take(segs: Seg[], k: number): Seg[] {
  const out: Seg[] = [];
  for (const s of segs) {
    if (k <= 0) break;
    const n = Math.min(k, s.n);
    out.push({ ...s, n });
    k -= n;
  }
  return out;
}

function chordIdxFor(timeline: ChordEvent[], total: number): number[] {
  const idx = zeros(total);
  for (let t = 0, g = 0; g < total; g++) {
    while (t + 1 < timeline.length && timeline[t + 1].step <= g) t++;
    idx[g] = t;
  }
  return idx;
}

/** Glue runs of bars into one section. */
function join(segs: Seg[], info: SectionInfo): Idea {
  const first = segs[0].idea;
  const riff = !!first.guitar;
  const bars: Bar[] = [];
  const styles: RiffStyle[] = [];
  const plan: Variant[] = [];
  const timeline: ChordEvent[] = [];
  const strum: Stroke[] = [];
  const bass: number[] = [];
  const bassLen: number[] = [];
  const lanes = Object.fromEntries(DRUM_LANES.map((l) => [l, [] as number[]])) as Record<(typeof DRUM_LANES)[number], number[]>;
  const fills: DrumPart['fills'] = [];
  const guitar: GuitarHit[] = [];
  const guitar2: GuitarHit[] = [];
  let pos = 0;

  for (const { idea, from, n } of segs) {
    const src = idea.song.bars.slice(from, from + n);
    const a = src[0].start, last = src[src.length - 1], b = last.start + last.len;
    const off = pos - a, barOff = bars.length - from;
    src.forEach((bar, i) => {
      bars.push({ ...bar, start: bar.start + off });
      if (idea.song.sections) styles.push(idea.song.sections[from + i]);
      plan.push(idea.song.plan[from + i]);
    });
    // the chord already sounding when the run starts
    const { timeline: tl, chordIdx } = idea.chords;
    if (tl[chordIdx[a]].step !== a) timeline.push({ step: pos, chord: tl[chordIdx[a]].chord });
    for (const e of tl) if (e.step >= a && e.step < b) timeline.push({ step: e.step + off, chord: e.chord });
    strum.push(...idea.strum.slice(a, b));
    bass.push(...idea.bass.slice(a, b));
    bassLen.push(...(idea.bassLen?.slice(a, b) ?? zeros(b - a)));
    for (const l of DRUM_LANES) lanes[l].push(...idea.drums[l].slice(a, b));
    for (const f of idea.drums.fills) if (f.bar >= from && f.bar < from + src.length) fills.push({ bar: f.bar + barOff, len: f.len });
    for (const h of idea.guitar ?? []) if (h.step >= a && h.step < b) guitar.push({ ...h, step: h.step + off });
    for (const h of idea.guitar2) if (h.step >= a && h.step < b) guitar2.push({ ...h, step: h.step + off });
    pos += b - a;
  }

  const song: Song = { ...first.song, bars, total: pos, plan, sections: first.song.sections ? styles : undefined };
  return {
    seeds: first.seeds,
    opts: first.opts,
    song,
    chords: { timeline, chordIdx: chordIdxFor(timeline, pos), notes: [] },
    drums: { ...lanes, fills, halfTime: first.drums.halfTime, fourFloor: first.drums.fourFloor, groove: first.drums.groove },
    strum,
    bass,
    bassLen: riff || segs.some((s) => s.idea.bassLen) ? bassLen : undefined,
    bassLine: first.bassLine,
    guitar: riff ? guitar : undefined,
    guitar2,
    notes: [],
    section: info,
  };
}

/* ------------------------------------------------------------ blocks */

/** A new block of music: same song, new seeds for the listed parts. */
function block(src: Idea, tag: string, reseed: (keyof Seeds)[], over: Partial<Song> = {}, chords?: BuildOptions['chords']): Idea {
  const seeds: Seeds = { ...src.seeds };
  for (const k of reseed) seeds[k] = `${src.seeds[k] ?? src.seeds.strum}-${tag}`;
  return buildIdea(src.opts, seeds, { ...src.song, ...over }, { chords });
}

const chordSig = (i: Idea) => i.chords.timeline.map((e) => `${e.chord.root}${e.chord.q}`).join();


/** Breakdowns sit on the tonic: the riff's stabs do the moving. */
const tonicOnly = (c: ChordPart): ChordPart => ({
  timeline: [{ step: 0, chord: { root: 0, q: '5' } }],
  chordIdx: zeros(c.chordIdx.length),
  notes: [],
});

const fill8 = (s: RiffStyle): RiffStyle[] => new Array<RiffStyle>(8).fill(s);

/* ------------------------------------------------------------ drum helpers */

const beatSet = (song: Song) => new Set(song.bars.flatMap((b) => groupStarts(b.groups).map((p) => b.start + p)));

function barOf(d: DrumPart, bar: Bar): DrumBar {
  const s = (a: number[]) => a.slice(bar.start, bar.start + bar.len);
  return { K: s(d.kick), S: s(d.snare), H: s(d.hat), O: s(d.hatOpen), R: s(d.ride), T: s(d.tom) };
}

function putBar(d: DrumPart, bar: Bar, b: DrumBar) {
  for (let j = 0; j < bar.len; j++) {
    const g = bar.start + j;
    d.kick[g] = b.K[j]; d.snare[g] = b.S[j]; d.hat[g] = b.H[j]; d.hatOpen[g] = b.O[j]; d.ride[g] = b.R[j]; d.tom[g] = b.T[j];
  }
}

const emptyBar = (len: number): DrumBar => ({ K: zeros(len), S: zeros(len), H: zeros(len), O: zeros(len), R: zeros(len), T: zeros(len) });

function crashAt(d: DrumPart, g: number) {
  d.crash[g] = 0.85;
  d.kick[g] = Math.max(d.kick[g], 0.9);
  d.hat[g] = 0; d.hatOpen[g] = 0; d.ride[g] = 0;
}

function clearDrums(idea: Idea) {
  for (const l of DRUM_LANES) idea.drums[l].fill(0);
  idea.drums.fills = [];
}

/** A drum fill in the last bar (if it doesn't have one). */
function ensureFill(idea: Idea, rng: Rng) {
  const { bars, w } = idea.song;
  const L = bars.length - 1;
  if (idea.drums.fills.some((f) => f.bar === L)) return;
  const b = barOf(idea.drums, bars[L]);
  const len = addFill(rng, b, bars[L].len, bars[L].groups, w, idea.song.partGenres.drums);
  putBar(idea.drums, bars[L], b);
  idea.drums.fills.push({ bar: L, len, seam: true });
}

/** Drums sit out, then come in with a fill at the end (intros). */
function pickup(idea: Idea, rng: Rng) {
  clearDrums(idea);
  const { bars, w } = idea.song;
  const L = bars.length - 1;
  const b = emptyBar(bars[L].len);
  const len = addFill(rng, b, bars[L].len, bars[L].groups, w, idea.song.partGenres.drums);
  putBar(idea.drums, bars[L], b);
  idea.drums.fills.push({ bar: L, len, seam: true });
}

/* ------------------------------------------------------------ energy */

/**
 * Drums get lighter (2: closed 8th hats, no crashes; 3: closed hats, one crash)
 * or bigger (5: ride, crashes every 2 bars). 4 = as written.
 */
function shapeDrums(idea: Idea, e: number, rng: Rng) {
  const d = idea.drums, { song } = idea, n = song.total;
  const beat = beatSet(song);
  const barStarts = new Set(song.bars.map((b) => b.start));
  if (e <= 1) {
    for (let g = 0; g < n; g++) {
      const cym = d.hat[g] || d.ride[g] || d.hatOpen[g] || d.crash[g];
      d.kick[g] = barStarts.has(g) ? 0.7 : 0;
      d.snare[g] = 0; d.tom[g] = 0; d.crash[g] = 0; d.hatOpen[g] = 0; d.ride[g] = 0;
      d.hat[g] = beat.has(g) && cym ? 0.4 : 0;
    }
    d.fills = [];
  } else if (e === 2) {
    for (let g = 0; g < n; g++) {
      const wash = d.hatOpen[g] || d.ride[g] || (g > 0 && d.crash[g]);
      if (wash && !d.hat[g]) d.hat[g] = beat.has(g) ? 0.55 : 0.42;
      d.hatOpen[g] = 0; d.ride[g] = 0;
      if (g > 0) d.crash[g] = 0;
      if (g % 2) {
        d.hat[g] = 0;
        if (!beat.has(g)) d.kick[g] = 0;
      }
      d.hat[g] *= 0.85;
      d.snare[g] *= 0.9;
    }
  } else if (e === 3) {
    // verses: closed hi-hat instead of ride, one crash at the top only
    for (let g = 0; g < n; g++) {
      if (d.ride[g] && !d.hat[g]) d.hat[g] = beat.has(g) ? 0.6 : 0.45;
      d.ride[g] = 0;
      if (g > 0 && d.crash[g]) { d.crash[g] = 0; d.hat[g] = 0.6; }
    }
  } else if (e >= 5) {
    const toRide = !song.sections && !d.ride.some(Boolean) && rng.chance(0.6);
    if (toRide) {
      for (let g = 0; g < n; g++) {
        if (d.hat[g] && g % 2 === 0) d.ride[g] = Math.min(0.8, d.hat[g] + 0.05);
        d.hat[g] = 0;
      }
    }
    song.bars.forEach((b, i) => { if (i % 2 === 0) crashAt(d, b.start); });
  }
}

const bassRoot = (key: number, c: Chord) => {
  let m = 36 + chordPc(key, c);
  if (m > 43) m -= 12;
  return m;
};

/** Where a held chord is struck: on each change, and again at the top of every second bar it carries on for. */
function restrikes(song: Song, changes: Set<number>): Set<number> {
  const out = new Set(changes);
  let held = 0;
  song.bars.forEach((b) => {
    held = changes.has(b.start) ? 0 : held + 1;
    if (held && held % 2 === 0) out.add(b.start);
  });
  return out;
}

/** Strummed parts: held chords (1), palm mutes (2), as written (3–4), every beat struck (5). */
function shapeStrum(idea: Idea, e: number) {
  if (e === 3 || e === 4) return;
  const { strum, song, chords } = idea;
  const genre = song.partGenres.strum;
  const beat = beatSet(song);
  const changes = new Set(chords.timeline.map((t) => t.step));
  const again = restrikes(song, changes);
  for (let g = 0; g < song.total; g++) {
    const s = strum[g];
    if (e <= 1) strum[g] = again.has(g) ? 'D' : '.';
    else if (e === 2 && genre !== 'funk') {
      if (s === 'U' || (genre === 'pop' && s === 'x')) strum[g] = '.';
      else if (genre !== 'pop' && s === 'D' && !beat.has(g) && !changes.has(g)) strum[g] = 'p';
    // the biggest sections: palm mutes open up and every beat is struck, but the pattern's gaps stay
    } else if (e >= 5 && genre !== 'funk' && (s === 'p' || (s === '.' && beat.has(g)))) strum[g] = 'D';
  }
  // every chord change is heard
  for (const c of changes) if (c < song.total && strum[c] !== 'D') strum[c] = 'D';
}

/** Bass: long roots (1), roots on the beat (2), as written (3–4), driving 8ths (5). */
function shapeBass(idea: Idea, e: number) {
  if (e === 3 || e === 4) return;
  const { bass, song, chords } = idea;
  // a flowing line already moves: the biggest sections keep it (funk keeps its groove)
  if (e >= 5 && (song.partGenres.bass === 'funk' || idea.bassLine === 'flowing')) return;
  // long roots and driving 8ths are played legato
  idea.bassLen?.fill(0);
  const beat = beatSet(song);
  const changes = new Set(chords.timeline.map((t) => t.step));
  const again = restrikes(song, changes);
  for (let g = 0; g < song.total; g++) {
    const r = bassRoot(song.key, chords.timeline[chords.chordIdx[g]].chord);
    if (e <= 2) bass[g] = changes.has(g) || (e === 2 ? beat.has(g) : again.has(g)) ? r : 0;
    else if (g % 2 === 0 && !bass[g]) bass[g] = r;
  }
}

/** Cap notes so nothing rings past step `s`. */
const capAt = (s: number) => (h: GuitarHit): GuitarHit => ({ ...h, len: Math.max(1, Math.min(h.len, s - h.step)) });

/** Everyone stops for the last beat or two of the section, then the next section hits. */
function bandStop(idea: Idea, beats: number) {
  const { bars } = idea.song;
  const L = bars.length - 1, bar = bars[L];
  const end = bar.start + bar.len;
  const s0 = end - bar.groups.slice(-beats).reduce((a, b) => a + b, 0);
  for (const l of DRUM_LANES) for (let g = s0; g < end; g++) idea.drums[l][g] = 0;
  idea.drums.fills = idea.drums.fills.filter((f) => f.bar !== L);
  for (let g = s0; g < end; g++) { idea.strum[g] = '.'; idea.bass[g] = 0; }
  // a muted scratch chokes the strummed chord
  if (!idea.guitar) idea.strum[s0] = 'x';
  if (idea.guitar) idea.guitar = idea.guitar.filter((h) => h.step < s0).map(capAt(s0));
  idea.guitar2 = idea.guitar2.filter((h) => h.step < s0).map(capAt(s0));
  idea.section!.tail = { stop: s0 };
  // the last bass note stops too
  const lens = idea.bassLen ?? zeros(idea.song.total);
  for (let g = s0 - 1; g >= bar.start; g--) {
    if (!idea.bass[g]) continue;
    lens[g] = Math.min(lens[g] || s0 - g, s0 - g);
    break;
  }
  if (!idea.guitar) idea.bassLen = lens.some(Boolean) ? lens : undefined;
  else idea.bassLen = lens;
}

/** The last bar becomes one held chord on the home chord, with a crash. */
function makeEnding(idea: Idea, home: Chord) {
  const { song } = idea;
  const L = song.bars.length - 1, bar = song.bars[L];
  const a = bar.start, b = a + bar.len;
  for (const l of DRUM_LANES) for (let g = a; g < b; g++) idea.drums[l][g] = 0;
  idea.drums.fills = idea.drums.fills.filter((f) => f.bar !== L);
  idea.drums.crash[a] = 0.95;
  idea.drums.kick[a] = 0.95;
  const lens = idea.bassLen ?? zeros(song.total);
  for (let g = a; g < b; g++) { idea.strum[g] = '.'; idea.bass[g] = 0; lens[g] = 0; }
  idea.guitar2 = idea.guitar2.filter((h) => h.step < a).map(capAt(a));
  const timeline = [...idea.chords.timeline.filter((e) => e.step < a), { step: a, chord: home }];
  idea.chords = { ...idea.chords, timeline, chordIdx: chordIdxFor(timeline, song.total) };
  if (idea.guitar && song.tuning) {
    const t = song.tuning;
    idea.guitar = idea.guitar.filter((h) => h.step < a).map(capAt(a));
    idea.guitar.push({ step: a, ...powerChord(song.key, t, true), len: bar.len, vel: 0.95 });
    // same octave as the riff bass
    const tonic = lowestOf(song.key, t);
    let shift = 0;
    while (tonic - shift > 36) shift += 12;
    idea.bass[a] = tonic - shift;
  } else {
    idea.strum[a] = 'D';
    idea.bass[a] = bassRoot(song.key, home);
  }
  lens[a] = bar.len;
  idea.bassLen = lens;
  idea.section = { ...idea.section!, ending: true };
}

/* ------------------------------------------------------------ harmony plan */

/** A chord plan: [root in semitones above the key, length in bars]. Verses and pre-choruses end on V (or bVII) to lead into the chorus. */
type Plan = [number, number][];

const MAJOR_PLANS: Record<'verse' | 'pre' | 'bridge', Plan[]> = {
  verse: [
    [[0, 2], [5, 2], [0, 2], [7, 2]], // I IV I V
    [[0, 1], [7, 1], [9, 1], [5, 1], [0, 1], [7, 1], [9, 1], [7, 1]], // I V vi IV … V
    [[9, 2], [5, 2], [0, 2], [7, 2]], // vi IV I V
    [[0, 2], [10, 2], [5, 2], [7, 2]], // I bVII IV V
    [[0, 3], [5, 1], [0, 3], [7, 1]], // I . . IV I . . V
    [[0, 4], [5, 2], [7, 2]], // I . . . IV . V .
  ],
  pre: [
    [[5, 1], [7, 1], [5, 1], [7, 1]], // IV V IV V
    [[9, 1], [5, 1], [2, 1], [7, 1]], // vi IV ii V
    [[5, 2], [7, 2]], // IV . V .
    [[2, 1], [5, 1], [7, 2]], // ii IV V .
  ],
  bridge: [
    [[9, 2], [5, 2], [0, 2], [7, 2]], // vi IV I V
    [[5, 2], [9, 2], [5, 2], [7, 2]], // IV vi IV V
    [[4, 2], [9, 2], [5, 2], [7, 2]], // iii vi IV V
    [[10, 2], [5, 2], [10, 2], [7, 2]], // bVII IV bVII V
  ],
};

const MINOR_PLANS: Record<'verse' | 'pre' | 'bridge', Plan[]> = {
  verse: [
    [[0, 2], [8, 2], [0, 2], [7, 2]], // i bVI i v
    [[0, 2], [5, 2], [0, 2], [10, 2]], // i iv i bVII
    [[0, 1], [10, 1], [8, 1], [10, 1]], // i bVII bVI bVII
    [[0, 4], [8, 2], [10, 2]], // i . . . bVI . bVII .
    [[0, 3], [10, 1], [0, 3], [8, 1]], // i . . bVII i . . bVI
  ],
  pre: [
    [[8, 1], [10, 1], [8, 1], [10, 1]], // bVI bVII bVI bVII
    [[5, 2], [7, 2]], // iv . v .
    [[3, 2], [10, 2]], // bIII . bVII .
    [[8, 2], [10, 2]], // bVI . bVII .
  ],
  bridge: [
    [[3, 2], [10, 2], [8, 2], [7, 2]], // bIII bVII bVI v
    [[8, 2], [3, 2], [10, 2], [7, 2]], // bVI bIII bVII v
    [[5, 2], [8, 2], [10, 2], [7, 2]], // iv bVI bVII v
  ],
};

/** Choruses written for a riff that plays the verses: away from home, then back (V bVII I, IV V I…). */
const CHORUS_PLANS: Record<'major' | 'minor', Plan[]> = {
  major: [[[7, 2], [10, 2], [0, 4]], [[5, 2], [7, 2], [0, 4]], [[10, 2], [5, 2], [0, 4]], [[5, 2], [0, 2], [7, 2], [0, 2]]],
  minor: [[[8, 2], [10, 2], [0, 4]], [[3, 2], [10, 2], [0, 4]], [[5, 2], [8, 2], [10, 2], [0, 2]], [[8, 2], [3, 2], [10, 2], [0, 2]]],
};

/** Outro jams: a short loop in the new key, round and round. */
const JAM_PLANS: Record<'major' | 'minor', Plan[]> = {
  minor: [[[0, 1], [8, 1], [10, 1], [0, 1]], [[0, 2], [10, 1], [8, 1]], [[0, 1], [3, 1], [10, 1], [5, 1]], [[0, 1], [10, 1], [8, 1], [10, 1]]],
  major: [[[0, 1], [10, 1], [5, 1], [0, 1]], [[0, 1], [7, 1], [10, 1], [5, 1]], [[0, 2], [5, 1], [10, 1]]],
};

/** Riff verses sit on the tonic and move in the last bar. */
const RIFF_VERSE_MOVE = { major: [10, 5, 7], minor: [10, 8, 5, 3, 7] };

const isMinor = (m: Mode) => m === 'minor' || m === 'dorian' || m === 'phrygian';
const plansFor = (m: Mode) => (isMinor(m) ? MINOR_PLANS : MAJOR_PLANS);

const NUMERAL = ['I', 'bII', 'II', 'bIII', 'III', 'IV', '#IV', 'V', 'bVI', 'VI', 'bVII', 'VII'];
const numeral = (c: Chord) =>
  c.q === '5' ? `${NUMERAL[c.root]}5` : ['min', 'm7', 'm9'].includes(c.q) ? NUMERAL[c.root].toLowerCase() : NUMERAL[c.root];

/** "I – IV – I – V" for a block's chords. */
function describeChords(idea: Idea): string {
  const out: string[] = [];
  for (const e of idea.chords.timeline) {
    const n = numeral(e.chord);
    if (out[out.length - 1] !== n) out.push(n);
  }
  return out.slice(0, 8).join(' – ');
}

/** A chord on `root` that fits the mode (out-of-key roots are major), coloured like the genre. */
function chordOn(song: Song, root: number, power: boolean, rng: Rng): Chord {
  if (power) return { root, q: '5' };
  const G = GENRES[song.genre];
  const scale: readonly number[] = SCALES[song.mode];
  const d = scale.indexOf(root);
  let c: Chord = d >= 0 ? degreeChord(scale, d, !!G.seventh) : { root, q: G.seventh ? '7' : 'maj' };
  if (c.q === 'dim' || c.q === 'aug' || c.q === 'm7b5') c = { root, q: '5' };
  return G.flavor(c, rng);
}

/** Chords written from a plan (instead of random ones), before the block's other parts are written to them. */
const planned = (song: Song, plan: Plan, rng: Rng, power: boolean) => (c: ChordPart): ChordPart => {
  const byRoot = new Map<number, Chord>(); // the same chord every time a root comes back
  const timeline: ChordEvent[] = [];
  for (let bi = 0, k = 0; bi < song.bars.length; k++) {
    const [root, n] = plan[k % plan.length];
    if (!byRoot.has(root)) byRoot.set(root, chordOn(song, root, power, rng));
    timeline.push({ step: song.bars[bi].start, chord: byRoot.get(root)! });
    bi += n;
  }
  return { timeline, chordIdx: chordIdxFor(timeline, c.chordIdx.length), notes: [] };
};

/** Riff styles that want real chords rather than power chords. */
const chordal = (s: RiffStyle) => s === 'arp' || s === 'picked' || s === 'lick';

/** Move a whole section up (a key change for the last chorus). */
function transpose(idea: Idea, n: number) {
  idea.song = { ...idea.song, key: (idea.song.key + n) % 12 };
  idea.bass = idea.bass.map((m) => (m ? m + n : 0));
  const up = (h: GuitarHit): GuitarHit => ({ ...h, notes: h.notes.map((m) => m + n) });
  if (idea.guitar) idea.guitar = idea.guitar.map(up);
  idea.guitar2 = idea.guitar2.map(up);
}

/* ------------------------------------------------------------ arrangement */

/** Write a drum fill into an (empty) bar: the drums coming in. */
function fillBar(idea: Idea, bi: number, rng: Rng) {
  const { bars, w } = idea.song;
  const b = emptyBar(bars[bi].len);
  const len = addFill(rng, b, bars[bi].len, bars[bi].groups, w, idea.song.partGenres.drums);
  putBar(idea.drums, bars[bi], b);
  idea.drums.fills.push({ bar: bi, len, seam: true });
}

/** Eight-bar intro: the hook alone for four bars, the drums come in with a fill, the bass joins (now or two bars later). */
function layerIntro(idea: Idea, rng: Rng): string {
  const { bars } = idea.song;
  const half = bars[3].start + bars[3].len;
  const bassFrom = rng.chance(0.4) && bars[6] ? bars[6].start : half;
  for (const l of DRUM_LANES) for (let g = 0; g < half; g++) idea.drums[l][g] = 0;
  idea.drums.fills = idea.drums.fills.filter((f) => f.bar > 3);
  fillBar(idea, 3, rng);
  for (let g = 0; g < bassFrom; g++) { idea.bass[g] = 0; if (idea.bassLen) idea.bassLen[g] = 0; }
  idea.guitar2 = idea.guitar2.filter((h) => h.step >= half);
  idea.section!.bandFrom = half;
  return bassFrom > half
    ? 'Layered: guitar alone, the drums come in with a fill at bar 5, the bass two bars later'
    : 'Layered: guitar alone, then drums (with a fill) and bass come in at bar 5';
}

/**
 * Sixteen-bar intro, built up a layer at a time: the guitar alone, the drums come in (with a fill),
 * then the bass, then Guitar 2 and the full band. The drums stay light (no crashes, closed hats)
 * until everyone's in, and fill into the last four bars.
 */
function longIntro(idea: Idea, rng: Rng): string {
  const { bars, total } = idea.song;
  const at = (bi: number) => bars[bi]?.start ?? total;
  const drumsIn = at(4), bassIn = at(8), allIn = at(12);
  const d = idea.drums;
  for (const l of DRUM_LANES) for (let g = 0; g < drumsIn; g++) d[l][g] = 0;
  for (let g = drumsIn; g < allIn; g++) {
    d.crash[g] = 0;
    if (d.hatOpen[g]) { d.hat[g] = Math.max(d.hat[g], d.hatOpen[g] * 0.8); d.hatOpen[g] = 0; }
  }
  d.fills = d.fills.filter((f) => f.bar > 3);
  fillBar(idea, 3, rng);
  if (bars[11] && !d.fills.some((f) => f.bar === 11)) {
    const b = barOf(d, bars[11]);
    d.fills.push({ bar: 11, len: addFill(rng, b, bars[11].len, bars[11].groups, idea.song.w, idea.song.partGenres.drums), seam: true });
    putBar(d, bars[11], b);
  }
  crashAt(d, allIn);
  for (let g = 0; g < bassIn; g++) { idea.bass[g] = 0; if (idea.bassLen) idea.bassLen[g] = 0; }
  idea.guitar2 = idea.guitar2.filter((h) => h.step >= allIn);
  idea.section!.bandFrom = allIn;
  return 'Long build: guitar alone, the drums come in with a fill at bar 5, the bass at bar 9, everyone (Guitar 2 too) at bar 13';
}

/**
 * An outro jam builds: the half-time first part keeps its cymbals down (a crash only where it starts)
 * and fills into the full band, which crashes in.
 */
function jamBuild(idea: Idea, firstBars: number, rng: Rng) {
  const { bars, total } = idea.song;
  const at = bars[firstBars]?.start ?? total;
  const d = idea.drums;
  for (let g = 1; g < at; g++) d.crash[g] = 0;
  const L = firstBars - 1;
  if (bars[L] && !d.fills.some((f) => f.bar === L)) {
    const b = barOf(d, bars[L]);
    d.fills.push({ bar: L, len: addFill(rng, b, bars[L].len, bars[L].groups, idea.song.w, idea.song.partGenres.drums), seam: true });
    putBar(d, bars[L], b);
  }
  crashAt(d, at);
}

/** The last bar builds: snare 8ths, then 16ths, getting louder; the band drives 8ths with it. */
function snareBuild(idea: Idea) {
  const { bars, key } = idea.song;
  const L = bars.length - 1, bar = bars[L];
  const d = idea.drums;
  const st = groupStarts(bar.groups);
  const lastG = bar.len - bar.groups[bar.groups.length - 1];
  for (let j = 0; j < bar.len; j++) {
    const g = bar.start + j;
    d.hat[g] = 0; d.hatOpen[g] = 0; d.ride[g] = 0; d.tom[g] = 0; d.crash[g] = 0;
    d.kick[g] = st.includes(j) ? 0.9 : 0;
    d.snare[g] = j >= lastG || j % 2 === 0 ? 0.4 + 0.55 * (j / bar.len) : 0;
    if (!idea.guitar && j % 2 === 0) {
      idea.strum[g] = 'D';
      idea.bass[g] = bassRoot(key, idea.chords.timeline[idea.chords.chordIdx[g]].chord);
    } else if (!idea.guitar) { idea.strum[g] = '.'; idea.bass[g] = 0; }
  }
  d.fills = [...d.fills.filter((f) => f.bar !== L), { bar: L, len: bar.len, build: true }];
  idea.section!.tail = { build: bar.start };
}

const HIT_PATTERNS = [[0, 3, 6], [0, 6, 10], [0, 4, 8, 10], [0, 3, 6, 8, 11], [0, 6, 8, 14]];

/** The last bar is a figure of band hits: everyone on the same accents, silence between. */
function bandHits(idea: Idea, rng: Rng) {
  const { bars, key } = idea.song;
  const L = bars.length - 1, bar = bars[L];
  const a = bar.start, b = a + bar.len;
  const fits = HIT_PATTERNS.filter((p) => p[p.length - 1] < bar.len - 1);
  const hits = (fits.length ? rng.pick(fits) : [0, Math.floor(bar.len / 2)]).map((p) => a + p);
  idea.section!.tail = { hits };
  const chordAt = (g: number) => idea.chords.timeline[idea.chords.chordIdx[g]].chord;
  for (const l of DRUM_LANES) for (let g = a; g < b; g++) idea.drums[l][g] = 0;
  idea.drums.fills = idea.drums.fills.filter((f) => f.bar !== L);
  const lens = idea.bassLen ?? zeros(idea.song.total);
  for (let g = a; g < b; g++) { idea.strum[g] = '.'; idea.bass[g] = 0; lens[g] = 0; }
  idea.guitar2 = idea.guitar2.filter((h) => h.step < a).map(capAt(a));
  if (idea.guitar) idea.guitar = idea.guitar.filter((h) => h.step < a).map(capAt(a));
  for (const g of hits) {
    idea.drums.kick[g] = 0.95;
    idea.drums.snare[g] = 0.9;
    const pc = chordPc(key, chordAt(g));
    if (idea.guitar && idea.song.tuning) {
      idea.guitar.push({ step: g, ...powerChord(pc, idea.song.tuning, true), len: 2, vel: 0.95 });
      const tonic = lowestOf(pc, idea.song.tuning);
      let shift = 0;
      while (tonic - shift > 40) shift += 12;
      idea.bass[g] = tonic - shift;
    } else {
      idea.strum[g] = 'D';
      // a muted scratch an 8th later chokes the chord: short, tight hits
      if (g + 2 < b && !hits.includes(g + 2)) idea.strum[g + 2] = 'x';
      idea.bass[g] = bassRoot(key, chordAt(g));
    }
    lens[g] = 2;
  }
  idea.bassLen = lens;
}

/* ------------------------------------------------------------ seams: how one section hands over to the next */

const lastBarOf = (idea: Idea) => idea.song.bars[idea.song.bars.length - 1];

/** Where the second half of a bar starts (beat 3 in 4/4). */
const halfOf = (bar: Bar) => bar.start + (groupStarts(bar.groups).find((p) => p >= bar.len / 2) ?? Math.floor(bar.len / 2));

/** A section's first chord, written relative to another section's key (the last chorus can be in a new key). */
function firstChordIn(from: Idea, to: Idea): Chord {
  const c = from.chords.timeline[0].chord;
  return { ...c, root: (chordPc(from.song.key, c) - to.song.key + 12) % 12 };
}

/** Rewrite a section's chords from step `s` to its end. */
function setChordFrom(idea: Idea, s: number, chord: Chord) {
  const timeline = [...idea.chords.timeline.filter((e) => e.step < s), { step: s, chord }];
  idea.chords = { ...idea.chords, timeline, chordIdx: chordIdxFor(timeline, idea.song.total) };
}

const tonesOf = (key: number, c: Chord) => QUALITIES[c.q].map((i) => (key + c.root + i) % 12);
/** A note a half step from a chord tone (or a tritone from the root) rubs against the chord. */
const rubs = (n: number, key: number, c: Chord) => {
  const pc = n % 12, tones = tonesOf(key, c);
  return !tones.includes(pc) && (tones.some((t) => (pc - t + 12) % 12 === 1 || (t - pc + 12) % 12 === 1) || (pc - tones[0] + 12) % 12 === 6);
};
/** The nearest chord tone to a note. */
function nearestTone(n: number, key: number, c: Chord): number {
  const tones = tonesOf(key, c);
  for (let d = 1; d < 7; d++) for (const m of [n - d, n + d]) if (tones.includes(((m % 12) + 12) % 12)) return m;
  return n;
}

/** The next note of a scale above (dir 1) or below (dir -1) a note. */
function scaleStep(n: number, dir: 1 | -1, key: number, mode: Mode): number {
  const pcs = SCALES[mode].map((p) => (p + key) % 12);
  let m = n + dir;
  while (!pcs.includes(((m % 12) + 12) % 12)) m += dir;
  return m;
}

/**
 * A turnaround: the second half of the last bar moves to a chord that leads into the next section
 * (V of its first chord, or IV or bVII of it), instead of sitting on the chord the next section
 * starts on, or stepping to it awkwardly. Into a key change it's always the new key's V.
 */
function turnaround(a: Idea, b: Idea, rng: Rng, keyChange: boolean, pinned: boolean): string | null {
  if (a.guitar) return null; // riffs write their own moves
  // sections whose chords you set keep them (a key change still needs its V)
  if (!keyChange && pinned) return null;
  const { song } = a;
  const tl = a.chords.timeline, last = tl[tl.length - 1];
  const bar = lastBarOf(a);
  const target = firstChordIn(b, a);
  const iv = (target.root - last.chord.root + 12) % 12;
  // the last chord already held the whole bar, and the next section starts on it: nothing moves
  const stuck = iv === 0 && last.step <= bar.start;
  const awkward = iv === 1 || iv === 6 || iv === 11;
  if (!keyChange && !(stuck && rng.chance(0.7)) && !awkward) return null;
  const s = Math.max(halfOf(bar), last.step);
  if (s > song.total - 4) return null;
  const scale: readonly number[] = SCALES[song.mode];
  const leads: [number, number][] = keyChange ? [[(target.root + 7) % 12, 1]]
    : ([[(target.root + 7) % 12, 3], [(target.root + 5) % 12, 1], [(target.root + 10) % 12, 1]] as [number, number][])
      .filter(([r]) => scale.includes(r) && r !== last.chord.root);
  if (!leads.length) return null;
  const chord = chordOn(song, rng.weighted(leads), false, rng);
  const old = tl[a.chords.chordIdx[s]].chord;
  setChordFrom(a, s, chord);
  if (a.strum[s] !== 'D') a.strum[s] = 'D';
  // the bass moves with the chord (keeping its figure)
  let d = (chord.root - old.root + 12) % 12;
  if (d > 6) d -= 12;
  const playing = a.bass.slice(bar.start, song.total).some(Boolean);
  for (let g = s; g < song.total; g++) {
    if (!a.bass[g]) continue;
    let m = a.bass[g] + d;
    while (m > 52) m -= 12;
    while (m < 28) m += 12;
    a.bass[g] = m;
  }
  if (playing && !a.bass[s]) a.bass[s] = bassRoot(song.key, chord);
  // Guitar 2: notes that would rub against the new chord move to its nearest chord tone (or stop, if held into it)
  a.guitar2 = a.guitar2.map((h) => {
    if (h.step + h.len <= s || h.swell) return h;
    if (h.step < s) return h.notes.some((n) => rubs(n, song.key, chord)) ? capAt(s)(h) : h;
    return h.notes.some((n) => rubs(n, song.key, chord)) ? { ...h, notes: h.notes.map((n) => (rubs(n, song.key, chord) ? nearestTone(n, song.key, chord) : n)) } : h;
  });
  return `Turnaround: the last bar turns to ${numeral(chord)}, leading into the ${b.section!.label.toLowerCase()}`;
}

/**
 * The band pushes into the next section: its first chord comes an 8th early, on the "and" of the last
 * beat, with a crash, and rings over the bar line (the downbeat isn't struck again).
 * False when the next section has nothing on its downbeat to push.
 */
function push(a: Idea, b: Idea): boolean {
  const total = a.song.total, s = total - 2;
  const bar = lastBarOf(a);
  if (s <= bar.start || !b.bass[0]) return false;
  if (a.guitar) {
    const first = b.guitar?.find((h) => h.step === 0 && !h.mute);
    if (!first) return false;
    b.guitar = b.guitar!.filter((h) => h !== first);
    a.guitar = a.guitar.filter((h) => h.step < s).map(capAt(s));
    a.guitar.push({ ...first, step: s, len: first.len + 2, vel: Math.max(first.vel, 0.9) });
  } else {
    if (b.strum[0] === '.' || b.strum[0] === 'x') return false;
    b.strum[0] = '.';
    for (let g = s; g < total; g++) a.strum[g] = '.';
    a.strum[s] = 'D';
  }
  setChordFrom(a, s, firstChordIn(b, a));
  // the bass pushes with the band, and rings into the next section
  const lens = a.bassLen ?? zeros(total);
  for (let g = s; g < total; g++) { a.bass[g] = 0; lens[g] = 0; }
  for (let g = s - 1; g >= bar.start; g--) {
    if (!a.bass[g]) continue;
    if (lens[g]) lens[g] = Math.min(lens[g], s - g);
    break;
  }
  a.bass[s] = b.bass[0];
  b.bass[0] = 0;
  if (b.bassLen) b.bassLen[0] = 0;
  let next = 1;
  while (next < 8 && !b.bass[next]) next++;
  lens[s] = 2 + next;
  a.bassLen = lens;
  // drums: kick and crash on the push, nothing on the downbeat after it
  for (const l of DRUM_LANES) for (let g = s; g < total; g++) a.drums[l][g] = 0;
  crashAt(a.drums, s);
  for (const l of ['kick', 'crash', 'hat', 'hatOpen', 'ride'] as const) b.drums[l][0] = 0;
  a.section!.tail = { push: s };
  b.section!.pushedIn = true;
  return true;
}

/** Loud into quiet: the band strikes one chord halfway through the last bar and lets it ring into the next section. */
function ringOut(a: Idea) {
  const { song } = a;
  const L = song.bars.length - 1, bar = song.bars[L];
  const h = halfOf(bar), total = song.total;
  const chord = a.chords.timeline[a.chords.chordIdx[h]].chord;
  const pc = chordPc(song.key, chord);
  for (const l of DRUM_LANES) for (let g = h; g < total; g++) a.drums[l][g] = 0;
  a.drums.fills = a.drums.fills.filter((f) => f.bar !== L);
  crashAt(a.drums, h);
  const lens = a.bassLen ?? zeros(total);
  for (let g = h; g < total; g++) { a.strum[g] = '.'; a.bass[g] = 0; lens[g] = 0; }
  if (a.guitar && song.tuning) {
    a.guitar = a.guitar.filter((x) => x.step < h).map(capAt(h));
    a.guitar.push({ step: h, ...powerChord(pc, song.tuning, true), len: total - h + 4, vel: 0.9 });
    let n = lowestOf(pc, song.tuning);
    while (n > 40) n -= 12;
    a.bass[h] = n;
  } else {
    a.strum[h] = 'D';
    a.bass[h] = bassRoot(song.key, chord);
  }
  for (let g = h - 1; g >= bar.start; g--) {
    if (!a.bass[g]) continue;
    if (lens[g]) lens[g] = Math.min(lens[g], h - g);
    break;
  }
  lens[h] = total - h + 4;
  a.bassLen = lens;
  a.section!.tail = { ring: h };
}

/**
 * The bass walks into the next section's first note over the last beat: up or down the scale, or
 * a chromatic approach from below, with the drum fill.
 */
function walkUp(a: Idea, b: Idea, rng: Rng): boolean {
  if (a.guitar || !b.bass[0]) return false;
  const { song } = a;
  const bar = lastBarOf(a), total = song.total;
  const beat = bar.groups[bar.groups.length - 1];
  if (bar.len < 8 || beat < 4 || !a.bass.slice(bar.start, total - beat).some(Boolean)) return false;
  const t = b.bass[0];
  let how = rng.weighted<'up' | 'down' | 'chromatic'>(song.partGenres.bass === 'funk' ? [['chromatic', 3], ['up', 1]] : [['up', 3], ['chromatic', 2], ['down', 1]]);
  const three = how === 'up' && bar.len >= 12 && rng.chance(0.35);
  // no room below the target on the bass: come down onto it instead
  if (how !== 'down' && t - (three ? 5 : 3) < 28) how = 'down';
  let line: number[];
  if (how === 'chromatic') line = [t - 2, t - 1];
  else {
    const dir = how === 'up' ? -1 : 1; // walking up means starting below
    const n1 = scaleStep(t, dir, b.song.key, b.song.mode), n2 = scaleStep(n1, dir, b.song.key, b.song.mode);
    line = three && how === 'up' ? [scaleStep(n2, dir, b.song.key, b.song.mode), n2, n1] : [n2, n1];
  }
  const from = total - 2 * line.length;
  const lens = a.bassLen;
  for (let g = from; g < total; g++) { a.bass[g] = 0; if (lens) lens[g] = 0; }
  line.forEach((n, i) => {
    a.bass[from + 2 * i] = n;
    if (lens) lens[from + 2 * i] = 2;
  });
  if (lens) for (let g = from - 1; g >= bar.start; g--) {
    if (!a.bass[g]) continue;
    if (lens[g]) lens[g] = Math.min(lens[g], from - g);
    break;
  }
  return true;
}

/** Guitar 2 leads into its next phrase: a note or two before the bar line, stepping into its first note. */
function g2Pickup(a: Idea, b: Idea, rng: Rng): boolean {
  const first = b.guitar2.find((h) => h.step === 0);
  if (!first || first.notes.length !== 1 || first.swell || first.mute) return false;
  const bar = lastBarOf(a), total = a.song.total;
  const beat = bar.groups[bar.groups.length - 1];
  if (bar.len < 8 || a.guitar2.some((h) => h.step + h.len > total - beat)) return false;
  const t = first.notes[0], { key, mode } = b.song;
  // up or down the scale into the note, two notes or one; only lines that sit with the chord under them
  const chordAt = (g: number) => a.chords.timeline[a.chords.chordIdx[g]].chord;
  const lines: [number[], number][] = [];
  for (const [dir, w] of [[-1, 3], [1, 2]] as const) {
    const n1 = scaleStep(t, dir, key, mode), n2 = scaleStep(n1, dir, key, mode);
    lines.push([[n2, n1], w], [[n1], w * 0.7]);
  }
  const fits = lines.filter(([l]) => l.every((n, i) => !rubs(n, a.song.key, chordAt(total - 2 * (l.length - i)))));
  if (!fits.length) return false;
  const line = rng.weighted(fits);
  line.forEach((n, i) => a.guitar2.push({
    step: total - 2 * (line.length - i), notes: [n], strings: first.strings, len: 2, vel: first.vel * 0.85, clean: first.clean,
  }));
  return true;
}

/* ------------------------------------------------------------ guitar 2 */

const runCount = (idea: Idea) => Math.ceil(idea.song.bars.length / 4);

/** Rewrite guitar 2 for a section: forced roles, or picked like an idea (undefined). Returns its description. */
function writeGuitar2(idea: Idea, rng: Rng, force?: Guitar2Style[]): string {
  const g2 = generateGuitar2(rng, idea.song, idea.chords, idea.guitar ?? null, force);
  idea.guitar2 = g2.hits;
  return g2.notes[0];
}

/** A role that plays (not 'rest'), picked as for an idea. */
function playingStyle(rng: Rng, idea: Idea, run: number): Guitar2Style {
  const sec = idea.song.sections?.[run * 4] ?? null;
  for (let i = 0; i < 6; i++) {
    const s = pickStyle(rng, idea.song.partGenres.strum, sec);
    if (s !== 'rest') return s;
  }
  return 'lead';
}


/* ------------------------------------------------------------ structure */

interface Slot {
  kind: SectionKind;
  energy: number;
  segs: Seg[];
  /** Guitar 2: keep what the block has, drop it, rewrite it, force roles, or play the track's hook. */
  g2: 'keep' | 'drop' | 'pick' | 'play' | 'lead' | 'swell' | 'hook' | 'build';
  intro?: 'alone' | 'band' | 'layered' | 'long';
  /** Number for repeated kinds ("Verse 2"). */
  n?: number;
  /** The last chorus: everything, and the key change. */
  final?: boolean;
}

export const KIND_LABEL: Record<SectionKind, string> = {
  intro: 'Intro', verse: 'Verse', prechorus: 'Pre-chorus', chorus: 'Chorus', interlude: 'Interlude',
  bridge: 'Bridge', breakdown: 'Breakdown', outro: 'Outro',
};

const STRUM_DESC = (e: number, genre: Genre) =>
  e <= 1 ? 'held chords'
    : e === 2 ? (genre === 'funk' ? 'the same groove, softer' : genre === 'pop' ? 'lighter strumming' : 'palm mutes, lighter strumming')
      : e >= 5 ? (genre === 'funk' ? 'full groove' : 'fuller strumming, every beat struck') : 'full strumming';

/** How often a track gets pre-choruses. */
const PRE_CHANCE: Record<Genre, number> = { rock: 0.5, pop: 0.55, funk: 0.15, hardrock: 0.5, metal: 0.35, grunge: 0.35, altmetal: 0.4 };

/** Funk verses vamp. */
const FUNK_VERSE: Plan[] = [[[0, 8]], [[0, 4], [5, 4]], [[0, 2], [5, 2]]];

/** Riff styles that make the best hook to bring back in intros and interludes. */
const HOOKY: readonly RiffStyle[] = ['picked', 'lick', 'gallop', 'pedal', 'single'];

/** A pre-chorus that doesn't start on the chorus's first chord (or it would steal the chorus's arrival). */
function prePlan(rng: Rng, plans: Plan[], chorus: Seg[]): Plan {
  const first = join(take(chorus, 1), { kind: 'chorus', label: '', energy: 4 }).chords.timeline[0].chord.root;
  const ok = plans.filter((p) => p[0][0] !== first);
  return rng.pick(ok.length ? ok : plans);
}

/** Tracks run about 2–3 minutes: optional sections go when it would be longer. */
const MAX_SECONDS = 210;

export function buildTrack(src: Idea, opts: TrackOptions = defaultTrackOptions(src)): Track {
  const S = opts.seeds;
  // separate random streams, so rerolling one block leaves everything else as it was
  const rng = new Rng(S.structure);
  const vr = new Rng(S.verse), pr = new Rng(S.pre), br = new Rng(S.bridge);
  const { genre, mode } = src.song;
  const riff = !!src.song.sections;
  const P = plansFor(mode);
  // the idea again, but the drums never wait out its first bars (it gets sliced and repeated)
  const baseSong = { ...src.song, noTacet: true };
  const base = riff ? buildIdea(src.opts, src.seeds, baseSong, withSheet(src.opts, src.seeds, baseSong)) : src;
  const preRoll = rng.chance(PRE_CHANCE[genre]);
  const withPre = opts.order ? opts.order.includes('prechorus') : opts.pre === 'on' || (opts.pre === 'auto' && preRoll);
  const vTag = `v-${S.verse}`, pTag = `p-${S.pre}`, bTag = `b-${S.bridge}`;
  const cSeed = S.chorus ?? `${src.seeds.song}-chorus`;
  const seedOf = (b: ChordBlock) => (b === 'chorus' ? cSeed : S[b]);
  let riffVerse = false, newChorus = false;
  // chords you set on a block: the block's own chords are written around them, like the idea's
  const pinned = (b: ChordBlock) => hasPins(opts.chords?.[b]);
  const pin = (b: ChordBlock, song: Song, f?: BuildOptions['chords']): BuildOptions['chords'] => {
    const sheet = opts.chords?.[b];
    if (!hasPins(sheet)) return f;
    return (c) => applySheet(new Rng(`${seedOf(b)}-sheet`), song, f ? f(c) : c, sheet);
  };

  let verse: Seg[], chorus: Seg[], bridge: Seg[], hookSegs: Seg[];
  let pre: Seg[] | null = null;
  let verseE: number, bridgeE: number, bridgeKind: SectionKind = 'bridge';
  let home: Chord;

  if (riff) {
    const R = GENRES[genre].riff!;
    const s = base.song.sections!;
    const [va, vb] = [s[0], s[4]];
    let verseStyle = va;
    // the hook: the most riff-like half of the idea
    const hookHalf = [0, 1].find((h) => HOOKY.includes(s[h * 4]));
    const split = va !== vb && S.verse === defaultTrackOptions(src).seeds.verse;
    const rv = opts.riffVerse ?? 'auto';
    riffVerse = rv === 'on' || (rv === 'auto' && new Rng(`${S.structure}-riffverse`).chance(hookHalf !== undefined ? 0.5 : 0.25));
    if (split) {
      // ideas that change style halfway split: first half is the verse, second half the chorus
      // (with chords you set on the verse: the same riff, written to them)
      const v = pinned('verse')
        ? block(base, vTag, [], { sections: fill8(va) }, pin('verse', base.song, withSheet(src.opts, src.seeds, baseSong).chords))
        : base;
      verse = [seg(v, 0, 4), seg(v, 0, 4)];
      chorus = [seg(base, 4, 4), seg(base, 4, 4)];
    } else {
      // a new verse riff (also when the verse is rerolled): it sits on the home chord and moves in its last bar
      chorus = va !== vb ? [seg(base, 4, 4), seg(base, 4, 4)] : [seg(base)];
      const chorusStyle = vb;
      const options = R.verse.filter(([x]) => x !== chorusStyle);
      verseStyle = options.length ? vr.weighted(options) : 'arp';
      const move = vr.pick(RIFF_VERSE_MOVE[isMinor(mode) ? 'minor' : 'major']);
      verse = [seg(block(base, vTag, ['chords', 'strum'], { sections: fill8(verseStyle) },
        pin('verse', base.song, planned(base.song, [[0, 3], [move, 1]], vr, !chordal(verseStyle)))))];
    }
    hookSegs = hookHalf !== undefined ? [seg(base, hookHalf * 4, 4)] : take(chorus, 4);
    // the riff carries the song: it plays under the verses (an idea that splits with the riff first
    // already does). A chorus that would play the same riff gets new chords and big chords instead.
    if (riffVerse && !(split && hookHalf === 0)) {
      const h = hookSegs[0];
      verse = [h, h];
      verseStyle = s[h.from];
      if (chorus.some((c) => c.idea === h.idea && c.from < h.from + h.n && h.from < c.from + c.n)) {
        newChorus = true;
        const cr = new Rng(cSeed);
        const style = cr.weighted<RiffStyle>([['big', 3], ['chug', verseStyle === 'chug' ? 0 : 1]]);
        chorus = [seg(block(base, `c-${cSeed}`, ['chords', 'strum'], { sections: fill8(style) },
          pin('chorus', base.song, planned(base.song, cr.pick(CHORUS_PLANS[isMinor(mode) ? 'minor' : 'major']), cr, !chordal(style)))))];
      }
    }
    const quietVerse = QUIET_STYLES.includes(verseStyle);
    verseE = quietVerse ? 2 : 3;
    if (withPre) {
      const preStyle = pr.weighted<RiffStyle>([['big', 3], ['chug', 2]]);
      pre = [seg(block(base, pTag, ['strum', 'drums'], { sections: fill8(preStyle) },
        pin('pre', base.song, planned(base.song, prePlan(pr, P.pre, chorus), pr, !chordal(preStyle)))), 0, 4)];
    }
    if (R.breakdown) {
      bridgeKind = 'breakdown';
      bridgeE = 5;
      bridge = [seg(block(base, bTag, ['strum', 'drums'], { sections: fill8('chug'), forceHalf: true }, pin('bridge', base.song, tonicOnly)))];
    } else {
      const quiet = !quietVerse && br.chance(0.4);
      const options = R.bridge.filter(([x]) => x !== vb && x !== verseStyle);
      const style: RiffStyle = quiet ? 'arp' : options.length ? br.weighted(options) : 'single';
      bridgeE = quiet ? 2 : 4;
      bridge = [seg(block(base, bTag, ['chords', 'strum'], { sections: fill8(style), forceHalf: quiet ? undefined : true },
        pin('bridge', base.song, planned(base.song, br.pick(P.bridge), br, !chordal(style)))))];
    }
    home = { root: 0, q: '5' };
  } else {
    chorus = [seg(src)];
    // verse chords from a plan that ends on V (leading into the chorus), different from the chorus
    const vPlans = genre === 'funk' ? FUNK_VERSE : P.verse;
    let vb: Idea | null = null;
    for (let i = 0; i < 5 && (!vb || chordSig(vb) === chordSig(src)); i++) {
      // the verse gets its own groove (a drummer plays the verse differently from the chorus)
      vb = block(src, `${vTag}${i || ''}`, ['strum', 'drums'], { avoidGroove: src.drums.groove }, pin('verse', src.song, planned(src.song, vr.pick(vPlans), vr, false)));
    }
    verse = [seg(vb!)];
    // usually a soft first verse, so the chorus lands
    verseE = vr.pick([2, 2, 2, 3]);
    if (withPre) pre = [seg(block(src, pTag, ['strum'], {}, pin('pre', src.song, planned(src.song, prePlan(pr, P.pre, chorus), pr, false))), 0, 4)];
    bridgeE = br.weighted([[2, 1], [3, 2], [4, 1]]);
    // pop bridges are four bars: the plan at double speed, still ending on V
    const bPlan = br.pick(P.bridge).map(([r, n]): [number, number] => [r, genre === 'pop' ? Math.max(1, n / 2) : n]);
    const b = block(src, bTag, ['strum'], { forceHalf: bridgeE <= 3 ? !src.drums.halfTime : undefined }, pin('bridge', src.song, planned(src.song, bPlan, br, false)));
    bridge = genre === 'pop' ? [seg(b, 0, 4)] : [seg(b)];
    hookSegs = take(chorus, 4);
    const tl = src.chords.timeline;
    home = (tl.find((e) => e.chord.root === 0) ?? tl[0]).chord;
  }

  // where each kind of section's chords are set: a block's bars as written, or the idea (the chorus)
  const view = (b: ChordBlock, x: Seg): ChordTarget => {
    const v = join([x], { kind: 'verse', label: '', energy: 3 });
    return { block: b, idea: { ...v, section: undefined, notes: [], opts: { ...v.opts, chords: opts.chords?.[b] } }, from: x.from, n: x.n };
  };
  // (a riff that plays the verses is the idea's: its chords are the idea's; a new chorus is its own block)
  const ideaAt = (x: Seg): ChordTarget => ({ block: 'idea', idea: src, from: x.from, n: x.n });
  const chorusAt = newChorus ? view('chorus', chorus[0]) : ideaAt(chorus[0]);
  const edit: Track['edit'] = {
    verse: riffVerse && verse[0].idea === base ? ideaAt(verse[0]) : view('verse', verse[0]), chorus: chorusAt, outro: chorusAt,
    ...(pre ? { prechorus: view('pre', pre[0]) } : {}),
    [bridgeKind]: view('bridge', bridge[0]),
  };
  const kept: Partial<Record<SectionKind, boolean>> = {
    chorus: newChorus ? pinned('chorus') : hasPins(src.opts.chords), interlude: hasPins(src.opts.chords), outro: hasPins(src.opts.chords),
    verse: pinned('verse'), prechorus: pinned('pre'), bridge: pinned('bridge'), breakdown: pinned('bridge'),
  };

  // strummed genres: a lead hook over the chorus chords, which comes back through the track.
  // If the idea's Guitar 2 already plays a melody throughout, that melody is the hook.
  let hook: GuitarHit[] = [];
  let hookNote = '';
  const hookBase = join(chorus, { kind: 'chorus', label: '', energy: 4 });
  if (!riff) {
    const g2Line = src.notes.find((n) => n.startsWith('Guitar 2')) ?? '';
    const defaultHook = S.hook === defaultTrackOptions(src).seeds.hook;
    if (defaultHook && /^Guitar 2: (octave )?melody( \([^)]*\))? throughout/.test(g2Line) && hookBase.guitar2.length) {
      hook = hookBase.guitar2;
      hookNote = 'Guitar 2: the idea\'s melody, as the hook';
    } else {
      hook = generateHook(new Rng(S.hook), hookBase.song, hookBase.chords, null);
      hookNote = 'Guitar 2: the hook, a melody that comes back through the track';
    }
  }
  /** The hook's first `n` bars, placed from bar `at` of a section. */
  const placeHook = (idea: Idea, at: number, n: number) => {
    const len = hookBase.song.bars.slice(0, n).reduce((a, b) => a + b.len, 0);
    const off = idea.song.bars[at]?.start ?? 0;
    idea.guitar2 = hook.filter((h) => h.step < len && h.step + off < idea.song.total).map((h) => ({ ...h, step: h.step + off }));
  };

  // intro: layered (the hook alone, then the band joins), the hook alone, or the band playing softly
  const verseQuiet = verseE <= 2 && riff;
  const introRoll = rng.weighted<'alone' | 'band' | 'layered' | 'long'>(riff
    ? [['layered', verseQuiet ? 1 : 3], ['alone', 3], ['band', verseQuiet ? 0 : 1], ['long', verseQuiet ? 1 : 2]]
    : [['layered', 1], ['alone', 2], ['band', 2], ['long', 1]]);
  const introKind = opts.intro === 'auto' ? introRoll : opts.intro;
  const alone: Slot = { kind: 'intro', energy: riff && !verseQuiet ? 2 : 1, segs: take(verseQuiet ? verse : hookSegs, 4), g2: riff ? 'drop' : 'hook', intro: 'alone' };
  const layered: Slot = { kind: 'intro', energy: 3, segs: [...take(hookSegs, 4), ...take(hookSegs, 4)], g2: riff ? 'drop' : 'hook', intro: 'layered' };
  const introSlot: Slot = introKind === 'long'
    ? { kind: 'intro', energy: 3, segs: [0, 1, 2, 3].flatMap(() => take(hookSegs, 4)), g2: riff ? 'pick' : 'hook', intro: 'long' }
    : introKind === 'band'
      ? { kind: 'intro', energy: riff ? 4 : 2, segs: take(riff ? chorus : verse, 4), g2: 'drop', intro: 'band' }
      : introKind === 'layered' ? layered : alone;

  // the order of sections: by hand, or the genre's template
  const keyRoll = rng.chance(0.3);
  let order: SectionKind[];
  if (opts.order?.length) order = [...opts.order];
  else {
    // on Auto, an interlude only some of the time: it's the chorus chords again, and choruses already fill much of a song
    // (when the riff plays the verses, it comes back after the first chorus to lead into the next verse)
    const interlude = opts.interlude === 'on' || (opts.interlude === 'auto' && (riffVerse || new Rng(`${S.structure}-interlude`).chance(0.4)));
    order = ['intro', 'verse', ...(pre ? ['prechorus' as const] : []), 'chorus', ...(interlude ? ['interlude' as const] : []),
      'verse', ...(pre ? ['prechorus' as const] : []), ...(genre !== 'funk' ? ['chorus' as const] : []), bridgeKind, 'chorus', 'outro'];
  }
  // the bridge block plays wherever a bridge or breakdown is asked for
  order = order.map((k) => (k === 'bridge' || k === 'breakdown' ? bridgeKind : k));

  const verse2E = riff ? verseE : Math.min(3, verseE + 1);
  // the outro: a jam (new music in a new key), or long (the chorus's last line repeats as a tag), or short
  const outroOpt = opts.outro ?? 'auto';
  const jamSeed = riff ? S.structure : S.hook; // rerolling the outro rerolls its jam
  let outroJam = outroOpt === 'jam' || (outroOpt === 'auto' && new Rng(`${jamSeed}-jam`).chance(riff ? 0.3 : 0.15));
  let outroLong = !outroJam && (outroOpt === 'long' || (outroOpt === 'auto' && new Rng(`${S.structure}-outro`).chance(0.4)));
  // the jam: a new key (up a step to minor, or the relative minor or major), a short chord loop and
  // (riff genres) a new driving riff; half-time for 8 bars, then the full band for 8
  let jam: { segs: Seg[]; home: Chord; note: (key: number) => string } | null = null;
  if (outroJam) {
    const jr = new Rng(`${jamSeed}-jamkey`);
    const minorHome = isMinor(mode);
    const [shift, jamMode] = minorHome
      ? jr.weighted<[number, Mode]>([[[3, 'major'], 2], [[5, 'minor'], 1], [[2, 'minor'], 1]])
      : jr.weighted<[number, Mode]>([[[2, 'minor'], 2], [[9, 'minor'], 2]]);
    const R = GENRES[genre].riff;
    const loud = (R ? [...R.verse, ...R.bridge] : []).filter(([x]) => !QUIET_STYLES.includes(x) && x !== 'arp');
    const style: RiffStyle | undefined = R ? (loud.length ? jr.weighted(loud) : 'chug') : undefined;
    const plan = jr.pick(JAM_PLANS[isMinor(jamMode) ? 'minor' : 'major']);
    const over = { key: (src.song.key + shift) % 12, mode: jamMode, ...(style ? { sections: fill8(style) } : {}) };
    const from = riff ? base : src;
    const write = (half: boolean) => block(from, `j-${jamSeed}`, ['chords', 'strum', 'drums', 'bass'], { ...over, forceHalf: half },
      planned({ ...from.song, ...over }, plan, new Rng(`${jamSeed}-jamchords`), !!style && !chordal(style)));
    const a = write(true), b = write(false);
    jam = {
      segs: [seg(a), seg(b)],
      home: a.chords.timeline[0].chord,
      note: (key: number) => `Outro jam: a new key (${NOTE_NAMES[key]} ${jamMode}), a chord loop${style ? ` and a new ${RIFF_STYLE_LABEL[style]} riff` : ''}; half-time for 8 bars, then the full band, Guitar 2 leading`,
    };
  }
  const lastSeg = chorus[chorus.length - 1];
  const tag: Seg = { idea: lastSeg.idea, from: lastSeg.from + lastSeg.n - 2, n: 2 };
  const lastChorus = order.lastIndexOf('chorus');
  const choruses = order.filter((k) => k === 'chorus').length;
  const seen: Partial<Record<SectionKind, number>> = {};
  const slotFor = (kind: SectionKind, i: number): Slot => {
    const n = (seen[kind] = (seen[kind] ?? 0) + 1);
    if (kind === 'intro') return { ...introSlot, n };
    if (kind === 'verse') return n === 1 ? { kind, n, energy: verseE, segs: verse, g2: 'drop' } : { kind, n, energy: verse2E, segs: verse, g2: 'play' };
    if (kind === 'prechorus') return { kind, n, energy: 3, segs: pre ?? take(verse, 4), g2: 'drop' };
    if (kind === 'interlude') return { kind, n, energy: 4, segs: hookSegs, g2: riff ? 'keep' : 'hook' };
    if (kind === 'bridge' || kind === 'breakdown') return { kind, n, energy: bridgeE, segs: bridge, g2: bridgeE <= 2 ? 'swell' : 'pick' };
    if (kind === 'outro' && jam) return { kind, n, energy: 5, segs: jam.segs, g2: 'lead' };
    if (kind === 'outro') return { kind, n, energy: 5, segs: outroLong ? [...take(chorus, 4), tag, tag] : take(chorus, 4), g2: riff ? 'lead' : 'hook' };
    if (i === lastChorus && choruses > 1) return { kind, n, energy: 5, segs: chorus, g2: riff ? 'lead' : 'hook', final: true };
    return { kind, n, energy: 4, segs: chorus, g2: 'keep' };
  };
  let slots = order.map(slotFor);

  // automatic structure stays a song's length: drop the interlude, then pre-choruses, then shorten the intro
  const avgBar = src.song.total / src.song.bars.length;
  const seconds = (list: Slot[]) => (list.reduce((a, s) => a + s.segs.reduce((b, x) => b + x.n, 0), 0) * avgBar * 15) / src.song.bpm;
  if (!opts.order?.length) {
    if (seconds(slots) > MAX_SECONDS && opts.interlude === 'auto') slots = slots.filter((s) => s.kind !== 'interlude');
    if (seconds(slots) > MAX_SECONDS && opts.pre === 'auto') slots = slots.filter((s) => s.kind !== 'prechorus');
    // a jam shortens to 4 + 4 bars before anything else goes
    if (seconds(slots) > MAX_SECONDS && jam) {
      const short = [seg(jam.segs[0].idea, 0, 4), seg(jam.segs[1].idea, 0, 4)];
      slots = slots.map((x) => (x.kind === 'outro' ? { ...x, segs: short } : x));
    }
    if (seconds(slots) > MAX_SECONDS && outroOpt === 'auto' && outroLong) {
      outroLong = false;
      slots = slots.map((x) => (x.kind === 'outro' ? { ...x, segs: take(chorus, 4) } : x));
    }
    if (seconds(slots) > MAX_SECONDS && opts.intro === 'auto' && slots[0].intro === 'long') slots[0] = { ...layered, n: 1 };
    if (seconds(slots) > MAX_SECONDS && opts.intro === 'auto' && slots[0].intro === 'layered') slots[0] = { ...alone, n: 1 };
  }
  // when there's room, the first verse plays twice through and Guitar 2 joins halfway: a song's verses
  // usually outweigh its choruses (8-bar verses left the chorus chords filling over half the track)
  const v1 = slots.findIndex((s) => s.kind === 'verse');
  if (v1 >= 0) {
    const longer = [...slots];
    longer[v1] = { ...slots[v1], segs: [...slots[v1].segs, ...slots[v1].segs], g2: 'build' };
    if (seconds(longer) <= MAX_SECONDS * 0.85) slots = longer;
  }
  // numbers only for kinds that repeat
  const total: Partial<Record<SectionKind, number>> = {};
  for (const s of slots) total[s.kind] = (total[s.kind] ?? 0) + 1;
  for (const s of slots) if ((total[s.kind] ?? 0) < 2) s.n = undefined;

  // the last chorus can go up a key (rock and pop do this)
  const canChange = genre === 'rock' || genre === 'pop' || genre === 'hardrock';
  const keyUp = opts.keyChange === 'off' || !canChange && opts.keyChange !== 'on' ? 0
    : opts.keyChange === 'on' || (keyRoll && (genre !== 'hardrock' || rng.chance(0.6))) ? (genre === 'pop' && rng.chance(0.5) ? 1 : 2) : 0;
  const finalAt = slots.findIndex((s) => s.final);

  // instruments per section (each block's pick has its own stream, so a reroll can change it alone)
  const sounds = orchestrate(src.song.partGenres.strum, riff,
    slots.map((s) => ({ kind: s.kind, energy: s.energy, final: s.final, intro: s.intro, hook: s.g2 === 'hook' })), {
      track: new Rng(`${S.structure}-sound`), verse: new Rng(`${S.verse}-sound`), pre: new Rng(`${S.pre}-sound`),
      bridge: new Rng(`${S.bridge}-sound`), hook: new Rng(`${S.hook}-sound`),
    }, opts.sounds);

  const sections = slots.map((s, si) => {
    const r = new Rng(`${S.structure}-${si}-${s.kind}`);
    const label = s.n ? `${KIND_LABEL[s.kind]} ${s.n}` : KIND_LABEL[s.kind];
    const idea = join(s.segs, { kind: s.kind, label, energy: s.energy, sound: sounds[si] });
    const notes: string[] = [];

    // energy
    if (s.intro === 'alone') {
      pickup(idea, r);
      idea.bass.fill(0);
      if (idea.bassLen) idea.bassLen.fill(0);
      idea.section!.bandFrom = idea.song.total;
      notes.push(`${riff ? 'Riff' : 'Guitar'} alone, the drums come in with a fill`);
    } else {
      shapeDrums(idea, s.energy, r);
      if (!riff) shapeBass(idea, s.energy);
    }
    if (!riff) shapeStrum(idea, s.energy);

    // guitar 2
    const runs = runCount(idea);
    let g2 = 'Guitar 2: same as the idea';
    if (s.g2 === 'drop') { idea.guitar2 = []; g2 = 'Guitar 2: sits out'; }
    else if (s.g2 === 'pick') g2 = writeGuitar2(idea, r);
    else if (s.g2 === 'build') {
      g2 = writeGuitar2(idea, r, Array.from({ length: runs }, (_, k) => (k < runs / 2 ? 'rest' : playingStyle(r, idea, k))));
      notes.push('Plays twice through; Guitar 2 joins the second time');
    } else if (s.g2 === 'play') g2 = writeGuitar2(idea, r, Array.from({ length: runs }, (_, k) => playingStyle(r, idea, k)));
    else if (s.g2 === 'swell') g2 = writeGuitar2(idea, r, new Array<Guitar2Style>(runs).fill('swell'));
    else if (s.g2 === 'hook') {
      placeHook(idea, s.intro === 'layered' ? 4 : s.intro === 'long' ? 12 : 0, s.kind === 'chorus' ? idea.song.bars.length : 4);
      g2 = hookNote;
    } else if (s.g2 === 'lead') {
      const rs = idea.song.sections?.[0];
      const twin = rs === 'single' || rs === 'gallop' || rs === 'pedal';
      const style = r.weighted<Guitar2Style>(idea.song.partGenres.strum === 'funk' ? [['funk', 2], ['lead', 1]]
        : rs === 'picked' ? [['rhythm', 2], ['octaves', 1]]
          : [['lead', 3], ['octaves', 2], ...(twin ? [['harmony', 3] as [Guitar2Style, number]] : [])]);
      g2 = writeGuitar2(idea, r, new Array<Guitar2Style>(runs).fill(style));
    } else if (s.g2 === 'keep' && !idea.guitar2.length) g2 = 'Guitar 2: sits out';
    if (s.kind === 'interlude') notes.push(riff ? 'The hook riff comes back with the full band' : 'The hook comes back over the chorus chords');
    if (s.kind === 'verse' && riffVerse) notes.push('The idea\'s riff carries on under the verse');
    if (s.kind === 'chorus' && newChorus) notes.push('A new chorus: its own chords and big chords, so the riff stands out in the verses');

    if (s.intro === 'layered') notes.push(layerIntro(idea, r));
    if (s.intro === 'long') notes.push(longIntro(idea, r));
    if (s.kind === 'outro' && outroLong) notes.push('Long outro: the last line repeats as a tag before the end');
    if (s.kind === 'outro' && jam) {
      // (named in the key it ends up in: a last-chorus key change carries on into it)
      notes.push(jam.note((idea.song.key + (keyUp && finalAt >= 0 && si >= finalAt ? keyUp : 0)) % 12));
      jamBuild(idea, s.segs[0].n, r);
    }
    if (keyUp && finalAt >= 0 && si >= finalAt) {
      transpose(idea, keyUp);
      if (si === finalAt) notes.push(`Key change: up a ${keyUp === 1 ? 'half' : 'whole'} step for the last chorus`);
    }

    const rhythm = idea.song.sections
      ? [...new Set(idea.song.sections)].map((x) => RIFF_STYLE_LABEL[x]).join(', then ')
      : STRUM_DESC(s.energy, idea.song.partGenres.strum);
    notes.unshift(`${label} · energy ${s.energy} of 5 · ${idea.song.bars.length} bars · ${rhythm}`, `Chords: ${describeChords(idea)}`);
    notes.push(g2);
    if (idea.drums.groove && s.intro !== 'alone' && s.energy >= 2) notes.push(`Drums: ${idea.drums.groove}`);
    if (!riff && idea.bassLine && s.intro !== 'alone') {
      notes.push(`Bass: ${s.energy <= 2 ? 'long held roots' : s.energy >= 5 && idea.bassLine !== 'flowing' && idea.song.partGenres.bass !== 'funk' ? 'driving 8th notes, held into each other' : BASS_LINE_DESC[idea.bassLine]}`);
    }
    if (s.energy >= 5) notes.push('Drums: crashes every 2 bars');
    if (s.energy === 2 && s.intro !== 'alone') notes.push('Drums: lighter, closed hi-hat');
    if (s.energy === 3 && s.intro !== 'alone') notes.push('Drums: closed hi-hat');
    if (idea.song.forceHalf) notes.push('Drums: half-time');
    idea.notes = notes;
    return idea;
  });

  // a crash into each section (quiet openings don't crash)
  sections.forEach((idea, i) => {
    const e = idea.section!.energy;
    if (i === 0 && e <= 2) idea.drums.crash[0] = 0;
    if (i > 0 && e >= 2) crashAt(idea.drums, 0);
  });
  // transitions: into a chorus a fill, a snare build, band hits, a stop or a push; into a section as loud
  // a fill or a push; into a quieter one a fill, a chord left ringing or a breath. Then the parts lead
  // across the bar line: a turnaround chord, the bass walking in, Guitar 2's pickup notes.
  sections.forEach((idea, i) => {
    const b = sections[i + 1];
    if (!b) return;
    const r = new Rng(`${S.structure}-t${i}`);
    const m = new Rng(`${S.structure}-seam${i}`);
    const e = idea.section!.energy;
    const kind = idea.section!.kind;
    const next = b.section!;
    const into = next.kind === 'chorus' ? 'the chorus' : 'the next section';
    const turn = turnaround(idea, b, m, b.song.key !== idea.song.key, !!kept[kind]);
    if (turn) idea.notes.push(turn);
    type Seam = 'none' | 'fill' | 'build' | 'hits' | 'stop' | 'push' | 'ring';
    let t: Seam = 'none';
    // a big lift (quiet into loud) needs setting up: the band builds or fills into it, a stop only
    // works when there's something loud to stop, and a cymbal swells up into the new section
    const lift = next.energy - e >= 2;
    // intros that start with the guitar alone bring the drums in themselves (layered intros have
    // the band by their last bars, so they hand over like any other section)
    if (slots[i].intro !== 'alone') {
      if (next.kind === 'chorus' && kind !== 'chorus') {
        t = r.weighted<Seam>([['fill', 3], ['build', kind === 'prechorus' || lift ? 4 : 2], ['hits', 2], ['stop', e >= 3 ? 2 : 0], ['push', lift ? 1 : 2]]);
      } else if (lift) t = r.weighted<Seam>([['fill', 3], ['build', 2], ['push', 1]]);
      else if (next.energy >= e) t = r.weighted<Seam>([['fill', 3], ['push', 1]]);
      else t = r.weighted<Seam>([['fill', 3], ['ring', 2], ['stop', 1]]);
    }
    if (t === 'push' && !push(idea, b)) t = 'fill';
    if (t === 'build') { snareBuild(idea); idea.notes.push('Snare build into the chorus'); }
    else if (t === 'hits') { bandHits(idea, r); idea.notes.push('The band hits accents together into the chorus'); }
    else if (t === 'stop') { bandStop(idea, r.pick([1, 2])); idea.notes.push(next.energy < e ? 'Band stops for a breath before the next section' : 'Band stops right before the chorus'); }
    else if (t === 'push') idea.notes.push(`The band pushes into ${into}: its first chord comes an 8th early`);
    else if (t === 'ring') { ringOut(idea); idea.notes.push('The last chord is left ringing into the next section'); }
    else if (t === 'fill') { ensureFill(idea, r); idea.notes.push(`Drum fill into ${into}`); }
    if (lift) { idea.section!.riser = true; idea.notes.push(`A cymbal swells up into ${into}`); }
    if ((t === 'fill' || t === 'none') && idea.section!.energy >= 2 && m.chance(lift ? 0.8 : 0.55) && walkUp(idea, b, m)) idea.notes.push(`Bass walks into ${into}`);
    if (t !== 'hits' && t !== 'push' && m.chance(0.6) && g2Pickup(idea, b, m)) idea.notes.push(`Guitar 2 leads into ${into} with pickup notes`);
  });
  // a long outro's tag repeats the chorus's last bars: its bars don't line up with the chorus's
  if (outroLong || jam) delete edit.outro;
  // (a jam ends in its own key)
  makeEnding(sections[sections.length - 1], jam && slots[slots.length - 1].kind === 'outro' ? jam.home : home);
  sections[sections.length - 1].notes.push('Ends on a held chord');
  for (const idea of sections) {
    // reshaping and transitions can leave downstrokes between 8ths: strum them as a hand would
    naturalStrokes(idea.song, idea.strum);
    const { chords, guitar2 } = idea.section!.sound!;
    idea.notes.splice(2, 0, `Sound: ${SOUND_NAME[chords]}${idea.guitar2.length ? `, Guitar 2 on ${SOUND_NAME[guitar2]}` : ''}`);
  }

  // the band plays it: each player reads the whole track and plays the written part their way
  if (opts.band !== 'off') {
    const band = S.band ?? `${src.seeds.song}-band`;
    playBand(sections, band);
  }

  // each section knows the shape of its track (added layers plan where they play from it)
  const all = sections.map((s) => ({ kind: s.section!.kind, energy: s.section!.energy }));
  sections.forEach((s, index) => { s.section!.pos = { index, all }; });

  const bars = sections.reduce((a, s) => a + s.song.bars.length, 0);
  const steps = sections.reduce((a, s) => a + s.song.total, 0);
  return { source: src, opts, order: slots.map((s) => s.kind), sections, bars, steps, edit, riffVerse, newChorus };
}

/** Which of the track's seeds a section's reroll changes (null: the section is the idea itself). */
export function rerollSeedFor(kind: SectionKind, riffGenre: boolean, t?: Pick<Track, 'riffVerse' | 'newChorus'>): keyof TrackOptions['seeds'] | null {
  if (kind === 'verse') return t?.riffVerse ? null : 'verse';
  if (kind === 'chorus' && t?.newChorus) return 'chorus';
  if (kind === 'prechorus') return 'pre';
  if (kind === 'bridge' || kind === 'breakdown') return 'bridge';
  if (kind === 'chorus') return null;
  // intro, interlude, outro: the hook (strummed genres) or the arrangement around the riff
  return riffGenre ? 'structure' : 'hook';
}
