// Pure, deterministic idea generator: same options + seeds = same idea.

import { GENRES, GENRE_LIST } from './genres';
import type { Cycle, GenOptions, Idea, Seeds, Song } from './idea';
import { generateBass } from './parts/bass';
import { generateChords } from './parts/chords';
import { generateDrums } from './parts/drums';
import { generateStrum } from './parts/strum';
import { Rng, newSeed } from './rng';
import { type Bar, METERS, lcm, phrasePlan, pickMeters } from './rhythm';

export function randomSeeds(): Seeds {
  return { song: newSeed(), chords: newSeed(), drums: newSeed(), strum: newSeed(), bass: newSeed() };
}

function planSong(rng: Rng, opts: GenOptions): Song {
  const w = opts.weirdness;
  const genreSel = opts.genre;
  const genre = genreSel === 'random' ? rng.pick(GENRE_LIST) : genreSel;
  const borrow = () => (genreSel === 'random' && rng.chance(0.35 + w * 0.3) ? rng.pick(GENRE_LIST) : genre);
  const partGenres = { drums: borrow(), strum: borrow(), bass: borrow() };
  const G = GENRES[genre];

  const key = rng.int(0, 11);
  const mode = w > 0.6 && rng.chance(0.5) ? rng.pick(['phrygian', 'lydian'] as const) : rng.pick(G.modes);
  let bpm = rng.int(...G.bpm);
  if (w > 0.8 && rng.chance(0.4)) bpm += rng.pick([-25, 25]);

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
  if (w > 0.5 && rng.chance((w - 0.35) * 1.3)) {
    const count = w > 0.85 ? 2 : 1;
    for (const part of rng.shuffle(['hat', 'kick', 'strum'] as const).slice(0, count)) {
      cycles.push({ part, len: rng.pick([3, 5, 6, 7, 10, 12, 20].filter((x) => x !== bars[0].len)) });
    }
  }

  return {
    genreSel, genre, partGenres, key, mode, bpm, swing: G.swing, w,
    meters, meterLabel: meters.length > 1 ? meters.join(' + ') : meters[0],
    groupsFor, bars, total: pos, plan, cycles,
  };
}

export function generate(opts: GenOptions, seeds: Seeds = randomSeeds()): Idea {
  const song = planSong(new Rng(seeds.song), opts);
  const chords = generateChords(new Rng(seeds.chords), song);
  const drums = generateDrums(new Rng(seeds.drums), song);
  const strum = generateStrum(new Rng(seeds.strum), song, chords);
  const bass = generateBass(new Rng(seeds.bass), song, chords, drums);

  const tag = (x: string) => (x === 'A2' ? "A'" : x);
  const notes = [
    `Drum phrase: ${song.plan.map(tag).join(' ')}` +
      (drums.fills.length ? ` · fills on bar ${drums.fills.map((f) => f.bar + 1).join(' & ')}` : '') +
      (drums.halfTime ? ' · half-time' : '') +
      (drums.fourFloor ? ' · four-on-the-floor' : ''),
    ...chords.notes,
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

  return { seeds, opts, song, chords, drums, strum, bass, notes };
}
