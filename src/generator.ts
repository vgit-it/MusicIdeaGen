// Pure, deterministic idea generator: same options + seeds = same idea.

import { GENRES, GENRE_LIST, type Genre, type RiffStyle } from './genres';
import type { ChordPart, Cycle, GenOptions, Idea, Seeds, Song, Stroke } from './idea';
import { bassLengths, generateBass, generateRiffBass } from './parts/bass';
import { generateChords } from './parts/chords';
import { clearFills, lockBand, phraseEnd } from './parts/cohesion';
import { generateDrums } from './parts/drums';
import { generateGuitar2 } from './parts/guitar2';
import { generateHeavyDrums } from './parts/heavyDrums';
import { generateRiff } from './parts/riff';
import { generateStrum, naturalStrokes } from './parts/strum';
import { Rng, newSeed } from './rng';
import { type Bar, METERS, lcm, phrasePlan, pickMeters } from './rhythm';
import { TUNINGS, type Tuning } from './theory/fretboard';


export function randomSeeds(): Seeds {
  return { song: newSeed(), chords: newSeed(), drums: newSeed(), strum: newSeed(), bass: newSeed(), guitar2: newSeed(), keys: newSeed(), pad: newSeed() };
}

/** Genres whose parts mix well with a strummed genre (Random only). */
const BORROW: Partial<Record<Genre, Genre[]>> = { rock: ['rock', 'pop'], pop: ['pop', 'rock', 'funk'], funk: ['funk', 'pop'] };

function planSong(rng: Rng, opts: GenOptions): Song {
  const w = opts.weirdness;
  const genreSel = opts.genre;
  const genre = genreSel === 'random' ? rng.pick(GENRE_LIST) : genreSel;
  const G = GENRES[genre];
  // Random can mix genres between parts, but only ones that groove together (funk drums under rock
  // strumming fought it); very weird ideas can mix anything
  const wild = w >= 0.6;
  const fits = (g: Genre) => BORROW[g] ?? [g];
  const borrow = (pool: Genre[]) => (genreSel === 'random' && !G.riff && rng.chance(0.35 + w * 0.3) ? rng.pick(pool) : genre);
  const drums = borrow(wild ? GENRE_LIST.filter((g) => !GENRES[g].riff) : fits(genre));
  // the strumming and bass also have to groove with the drums
  const withDrums = wild ? GENRE_LIST.filter((g) => !GENRES[g].riff) : fits(genre).filter((g) => fits(drums).includes(g));
  const partGenres = { drums, strum: borrow(withDrums), bass: borrow(withDrums) };

  // riff genres: tuning first, then a key that sits on the open low strings
  let tuning: Tuning | undefined;
  let sections: RiffStyle[] | undefined;
  let key = rng.int(0, 11);
  if (G.riff) {
    tuning = TUNINGS[rng.weighted(G.riff.tunings)];
    const r = rng.next(), s = tuning.strings;
    key = (r < 0.65 ? s[0] : r < 0.85 ? s[1] : s[0] + 2) % 12;
    const [a, b] = rng.weighted(G.riff.arrangements.map(([x, y, wt]) => [[x, y] as const, wt] as const));
    sections = [a, a, a, a, b, b, b, b];
  }
  const mode = w > 0.6 && rng.chance(0.5) ? rng.pick(['phrygian', 'lydian'] as const) : rng.pick(G.modes);
  let bpm = rng.int(...G.bpm);
  if (w > 0.8 && rng.chance(0.4)) bpm += rng.pick([-25, 25]);
  // rolled anyway, so a fixed tempo doesn't change any other decision
  if (opts.bpm) bpm = opts.bpm;

  const meters = pickMeters(rng, opts.meter, w, G.altMeters);
  const groupsFor: Record<string, number[]> = {};
  for (const m of new Set(meters)) groupsFor[m] = rng.pick(METERS[m].groups);
  const bars: Bar[] = [];
  let pos = 0;
  for (let b = 0; b < 8; b++) {
    const meter = meters[b % meters.length];
    const len = METERS[meter].len;
    bars.push({ meter, len, start: pos, groups: groupsFor[meter] });
    pos += len;
  }

  const plan = phrasePlan(rng, w);

  const cycles: Cycle[] = [];
  if (!G.riff && w > 0.5 && rng.chance((w - 0.35) * 1.3)) {
    const count = w > 0.85 ? 2 : 1;
    for (const part of rng.shuffle(['hat', 'kick', 'strum'] as const).slice(0, count)) {
      cycles.push({ part, len: rng.pick([3, 5, 6, 7, 10, 12, 20].filter((x) => x !== bars[0].len)) });
    }
  }

  return {
    genreSel, genre, partGenres, key, mode, bpm, swing: G.swing, w,
    meters, meterLabel: meters.length > 1 ? meters.join(' + ') : meters[0],
    groupsFor, bars, total: pos, plan, cycles, tuning, sections,
  };
}

export function generate(opts: GenOptions, seeds: Seeds = randomSeeds()): Idea {
  return buildIdea(opts, seeds, planSong(new Rng(seeds.song), opts));
}

export interface BuildOptions {
  /** Change the chords before the other parts are written to them (tracks: a bridge that starts away from home). */
  chords?: (c: ChordPart) => ChordPart;
}

/** All parts for a planned song. Tracks call this with tweaked songs and seeds to write each block. */
export function buildIdea(opts: GenOptions, seeds: Seeds, song: Song, b: BuildOptions = {}): Idea {
  let chords = generateChords(new Rng(seeds.chords), song);
  if (b.chords) chords = b.chords(chords);
  if (song.sections) return generateRiffIdea(opts, seeds, song, chords);
  const drums = generateDrums(new Rng(seeds.drums), song);
  const { strum, name: pattern } = generateStrum(new Rng(seeds.strum), song, chords);
  const bass = generateBass(new Rng(seeds.bass), song, chords, drums);
  // last: the parts react to each other (pushes, kicks, fills, the end of the first phrase)
  const together = lockBand(new Rng(`${seeds.drums}-band`), song, chords, drums, strum, bass);
  const bassLen = bassLengths(new Rng(`${seeds.bass}-len`), song, bass);
  // the band's habit, not one part's: rerolling the strumming or the bass doesn't change it
  const ending = phraseEnd(new Rng(`${seeds.song}-end`), song, chords, drums, strum, bass, bassLen);
  if (ending) together.push(ending);
  naturalStrokes(song, strum);

  const tag = (x: string) => (x === 'A2' ? "A'" : x);
  const notes = [
    `Drums: ${drums.groove ?? 'groove'} · phrase ${song.plan.map(tag).join(' ')}` +
      (drums.fills.length ? ` · fills on bar ${drums.fills.map((f) => f.bar + 1).join(' & ')}` : '') +
      (drums.halfTime ? ' · half-time' : '') +
      (drums.fourFloor ? ' · four-on-the-floor' : ''),
    ...(pattern ? [`Strumming: ${pattern}`] : []),
    ...chords.notes,
    ...together,
    ...song.cycles.map((c) => {
      const nb = lcm(c.len, song.bars[0].len) / song.bars[0].len;
      const name = c.part === 'hat' ? 'Hi-hat' : c.part === 'kick' ? 'Extra kicks' : 'Strum';
      return `${name} repeats every ${c.len} sixteenths — ${nb > 8 ? 'never lines up with the bar within these 8 bars' : `lines up with the bar again every ${nb} bars`}`;
    }),
  ];
  const pg = song.partGenres;
  if (song.genreSel === 'random' && (pg.drums !== song.genre || pg.strum !== song.genre || pg.bass !== song.genre)) {
    notes.push(`Mixed genres: chords ${song.genre}, drums ${pg.drums}, strum ${pg.strum}, bass ${pg.bass}`);
  }

  const g2 = generateGuitar2(new Rng(seeds.guitar2 ?? `${seeds.strum}-2`), song, chords, null);
  notes.splice(1, 0, ...g2.notes);

  return { seeds, opts, song, chords, drums, strum, bass, bassLen, guitar2: clearFills(song, drums, g2.hits), notes };
}

/** Riff genres: guitar riff first, then drums locked to it and bass doubling it. */
function generateRiffIdea(opts: GenOptions, seeds: Seeds, song: Song, chords: ChordPart): Idea {
  const riff = generateRiff(new Rng(seeds.strum), song, chords);
  const drums = generateHeavyDrums(new Rng(seeds.drums), song, riff);
  const { bass, lens } = generateRiffBass(song, chords, drums, riff);
  const notes = [
    ...riff.notes,
    (drums.fills.length ? `Drum fills on bar ${drums.fills.map((f) => f.bar + 1).join(' & ')}` : 'No drum fills') +
      (drums.halfTime ? ' · half-time feel' : '') + ' · kick and bass follow the riff',
    ...chords.notes,
  ];
  const g2 = generateGuitar2(new Rng(seeds.guitar2 ?? `${seeds.strum}-2`), song, chords, riff.hits);
  notes.splice(1, 0, ...g2.notes);
  const strum = new Array<Stroke>(song.total).fill('.');
  return { seeds, opts, song, chords, drums, strum, bass, bassLen: lens, guitar: riff.hits, guitar2: g2.hits, notes };
}
