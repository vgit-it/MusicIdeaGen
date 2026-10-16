// Real songs for the Guide line and the Anchor line (docs/REALISM.md): several lines written, the one sung
// most like real vocal lines of the song's genre (and major or minor) kept. The real numbers come from the
// Lakh MIDI collection (src/realism/targets.json: numbers only, no notes). Measured on the words as sung (a
// note a syllable, a bend a new note), the way real vocal tracks are.

import type { Idea } from '../idea';
import { MINORISH, chordTones } from '../parts/guitar2';
import { type Hist, type Profile, type RNote, type RSong, type SongKey, measureSong, songFigures, tv } from '../realism/measure';
import targets from '../realism/targets.json';
import type { HighVoice } from '../parts/singers';
import type { Mood } from '../tension';
import { scoreLine, writeAnchor } from './anchor';
import { copiesReal } from '../realism/patterns';
import { type Flicks, type GuideIdeas, type GuideLine, type GuideRange, type GuideTonality, type Lean, writeGuide } from './line';
import { guideWords } from './words';

const T = targets as unknown as Record<string, Profile>;
/** Patterns: a line written again at most this many times to get clear of a real song's 2-bar stretch. */
const GUARD_TRIES = 6;
/** Lines written to pick from. */
export const REAL_TRIES = 8;
/** A genre and mode with fewer real songs than this uses the genre's numbers. */
const MIN_SONGS = 20;

/** The real songs to aim at: the genre's, major or minor where there are enough. */
export function realTarget(song: Idea['song']): Profile {
  const g = T[song.genre] ? song.genre : 'all';
  const sub = T[`${g}/${MINORISH.includes(song.mode) ? 'minor' : 'major'}`];
  return sub && sub.songs >= MIN_SONGS ? sub : T[g];
}

/** The line as sung (its words' notes, a syllable carried on the same note joined), in beats over the whole song, and the band's notes under it. */
export function sungSong(list: Idea[], line: GuideLine, salt = 0): RSong {
  const W = guideWords(list, line, salt);
  const notes: RNote[] = [];
  const band: Set<number>[] = [];
  let off = 0;
  list.forEach((idea, si) => {
    const { song, chords, bass } = idea;
    let b = 0;
    for (let st = 0; st < song.total; st++) {
      const set = new Set(chordTones(song.key, chords.timeline[chords.chordIdx[st]].chord));
      if (bass?.[st]) b = bass[st];
      if (b) set.add(b % 12);
      band[off + st] = set;
    }
    for (const ln of W[si] ?? []) for (const n of ln.notes) {
      const last = notes[notes.length - 1], s = (off + n.step) / 4, e = (off + n.step + n.len) / 4;
      if (n.syl.text === '~' && last && last.p === n.midi && Math.abs(last.e - s) < 0.01) last.e = e;
      else notes.push({ s, e, p: n.midi });
    }
    off += song.total;
  });
  const empty = new Set<number>();
  const first = list[0].song;
  return { notes, tonic: first.key % 12, minor: MINORISH.includes(first.mode), bandAt: (x) => band[Math.floor(x * 4 + 1e-6)] ?? empty };
}

/** How the per-song figures are scaled into the cost (range in octaves). */
const SCALE: Record<SongKey, number> = { same: 1, strongCT: 1, range: 1 / 12, repeat2bar: 1, early: 1 };
/** The spreads weighed in too (half: one song's are noisier). */
const SPREADS: [string, number][] = [['interval', 0.5], ['phraseBars', 0.5], ['onset16', 0.5], ['phraseSpan', 0.3], ['afterLeap', 0.3]];

/**
 * How far a line is from real songs (0: as real songs; lower is better): each per-song figure outside the middle
 * half of real songs costs its distance to it (inside: nothing, so lines still differ the way songs do), plus
 * the gaps in the spreads of steps, phrase lengths, onsets in the beat, phrase spans and what follows a leap.
 */
export function realCost(list: Idea[], line: GuideLine, salt = 0): { cost: number; figs: Record<SongKey, number> } {
  const song = sungSong(list, line, salt), notes = song.notes;
  const t = realTarget(list[0].song);
  const m = measureSong(song);
  const figs = songFigures(m);
  if (notes.length < 8) return { cost: 99, figs };
  let cost = 0;
  for (const k of Object.keys(SCALE) as SongKey[]) {
    const [lo, hi] = t.iqr?.[k] ?? [0, 1];
    cost += Math.max(0, lo - figs[k], figs[k] - hi) * SCALE[k];
  }
  const norm = (h: Hist = {}) => { const s = Object.values(h).reduce((a, b) => a + b, 0) || 1; return Object.fromEntries(Object.entries(h).map(([k, v]) => [k, v / s])); };
  for (const [k, w] of SPREADS) cost += w * tv(norm(m.hist[k]), t.hist[k]);
  return { cost, figs };
}

const pc = (x: number) => `${Math.round(100 * x)}%`;

/**
 * The line most like real songs out of several (each its own dice; the first the line as without the switch).
 * `extra`: another score to weigh in (higher better, x0.15: Best of several's), so both count.
 */
export function keepReal(list: Idea[], tries: GuideLine[], salt: number, extra?: (l: GuideLine) => number): GuideLine {
  const scored = tries.map((l) => ({ l, ...realCost(list, l, salt), x: extra ? extra(l) : 0 }));
  const key = (s: (typeof scored)[number]) => s.cost - 0.15 * s.x;
  let bi = 0;
  scored.forEach((s, k) => { if (key(s) < key(scored[bi])) bi = k; });
  const b = scored[bi], t = realTarget(list[0].song);
  b.l.notes.push(`Real songs: kept try ${bi + 1} of ${tries.length}, the nearest to real ${list[0].song.genre} songs (cost ${b.cost.toFixed(2)}, the others ${scored.filter((_, k) => k !== bi).map((s) => s.cost.toFixed(2)).join(', ')}): the same note again ${pc(b.figs.same)} (real ${pc(t.iqr!.same[0])}-${pc(t.iqr!.same[1])}), strong beats on the chord ${pc(b.figs.strongCT)} (real ${pc(t.iqr!.strongCT[0])}-${pc(t.iqr!.strongCT[1])}), range ${b.figs.range} (real ${t.iqr!.range[0]}-${t.iqr!.range[1]}), 2-bar repeats ${pc(b.figs.repeat2bar)}, phrases peaking early ${pc(b.figs.early)}`);
  return b.l;
}

/**
 * The Guide line or the Anchor line, with the Real songs switch: written several times (each its own dice), the
 * try sung most like real songs kept; with Best of several on too, its score weighed in. Off: as before.
 */
export function writeLine(list: Idea[], mood: Mood | undefined, lean: Lean, salt: number, flicks: Flicks, high: HighVoice | null, ideas: GuideIdeas, range: GuideRange | null, tonality: GuideTonality | null): GuideLine {
  const one = (s: number | string, i: GuideIdeas) => (i.anchor ? writeAnchor(list, mood, lean, s, range, tonality, i) : writeGuide(list, mood, lean, s, flicks, high, i, range, tonality));
  // (patterns: the copy guard: a line with a 2-bar stretch a real song sings is written again)
  const clean = (l: GuideLine) => !ideas.patterns || !copiesReal(sungSong(list, l, salt).notes.map((n) => ({ step: n.s * 4, midi: n.p })), list[0].song.bars[0]?.len ?? 16);
  if (!ideas.real) {
    let l = one(salt, ideas);
    for (let k = 1; k <= GUARD_TRIES && !clean(l); k++) l = one(`${salt}-guard${k}`, ideas);
    if (ideas.patterns && clean(l)) l.notes.push('Patterns: no 2 bars copy a real song (checked against real 2-bar stretches)');
    return l;
  }
  // (each try with the writers' own real-songs ways on, Best of several's picking done here instead)
  const plain: GuideIdeas = { ...ideas, best: false };
  const all = Array.from({ length: REAL_TRIES }, (_, k) => one(k ? `${salt}-real${k}` : salt, plain));
  const ok = all.filter(clean);
  return keepReal(list, ok.length ? ok : all, salt, ideas.anchor && ideas.best ? (l) => scoreLine(list, l).total : undefined);
}
