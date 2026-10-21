// Pure, deterministic idea generator: same options + seeds = same idea.

import { singLead } from './parts/leadvocal';
import { linkVoice, singSong } from './verse/sing';
import type { MoveId } from './parts/moves';
import { autoVoice, singIdea } from './parts/vocal';
import type { EnergyStyle } from './parts/energy';
import { autoMood } from './tension';
import { GENRES, GENRE_LIST, type Genre, type RiffStyle } from './genres';
import type { ChordPart, Cycle, GenOptions, Idea, Seeds, Song, Stroke } from './idea';
import { BASS_LINE_DESC, bassLengths, generateBass, generateRiffBass, pickBassLine, writeBassLine } from './parts/bass';
import { generateChords } from './parts/chords';
import { clearFills, lockBand, phraseEnd } from './parts/cohesion';
import { generateDrums } from './parts/drums';
import { generateGuitar2 } from './parts/guitar2';
import { generateHeavyDrums } from './parts/heavyDrums';
import { generateRiff } from './parts/riff';
import { applySheet, hasPins } from './parts/sheet';
import { pickRhythm, pickRiffPlayer, playRhythm, playRiffPart } from './players/rhythm';
import { carryOver, developStrum, generateStrum, naturalStrokes } from './parts/strum';
import { Rng, newSeed } from './rng';
import { type Bar, METERS, lcm, phrasePlan, pickMeters } from './rhythm';
import { TUNINGS, type Tuning } from './theory/fretboard';
import { pickHigh } from './parts/singers';


export function randomSeeds(): Seeds {
  return { song: newSeed(), chords: newSeed(), drums: newSeed(), strum: newSeed(), bass: newSeed(), guitar2: newSeed(), keys: newSeed(), pad: newSeed(), strings: newSeed(), perc: newSeed(), vocal: newSeed() };
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

/**
 * The app's main method (main.ts applies it to every idea; the research scripts can still choose): the lead guitar
 * and rhythm guitar play every way they've learned (they were switches, now always on): whole lines,
 * figures, room for the singer, breaks and no-lead songs, a twin, real licks, the solo writer built from real solos
 * (docs/LEAD-*.md, docs/SOLO-NEW.md), and the strum mix of real guitarists (docs/STUDY-RHYTHM.md). The guitar plan
 * is on in every track (track.ts).
 */
export const MAIN_GUITARS: Partial<GenOptions> = {
  leadLines: true, leadFigures: true, leadRoom: true, leadBreaks: true, leadTwin: true, leadLicks: true, leadSolo: true, strumMix: true,
};
/** The vocal's writers, fixed: Rhythm Words, Melody Learned, Real songs, Patterns; moves and energy by the song. */
export const MAIN_VOCAL: Partial<GenOptions> = { vocalRhythm: 'words', vocalMelody: 'learned', vocalReal: true, vocalPatterns: true, vocalMove: undefined, vocalEnergy: undefined };
export const MAIN_METHOD: Partial<GenOptions> = { ...MAIN_GUITARS, ...MAIN_VOCAL };

export function generate(opts: GenOptions, seeds: Seeds = randomSeeds()): Idea {
  const song = planSong(new Rng(seeds.song), opts);
  const idea = buildIdea(opts, seeds, song, withSheet(opts, seeds, song));
  // the rhythm guitarist plays it (strummed genres; picked with the strumming)
  // (the same player the idea's track starts with: picked with its band)
  const band = `${seeds.song}-band`;
  idea.written = { strum: [...idea.strum], guitar: idea.guitar?.map((h) => ({ ...h })) };
  const rng = new Rng(`${seeds.strum}-rhythm`);
  const notes = idea.guitar ? playRiffPart(idea, pickRiffPlayer(band, song.genre), band, rng)
    : playRhythm(idea, pickRhythm(band, song.partGenres.strum), band, rng);
  const at = idea.notes.map((n) => n.startsWith('Strumming')).lastIndexOf(true) + 1 || 1;
  idea.notes.splice(at, 0, ...notes);
  // the singer: the idea is a chorus, so it sings the chorus tune and its hook
  const vs = seeds.vocal ?? `${seeds.chords}-vocal`;
  singIdea(idea, vs, autoMood(song, seeds.song), opts.vocalLift ?? 0, opts.vocalRhythm, opts.vocalMelody, opts.vocalMove as MoveId | undefined, opts.vocalSinger, opts.vocalEnergy as EnergyStyle | 'off' | undefined, opts.vocalReal, opts.vocalPatterns,
    opts.vocalWriter === 'classic' ? undefined : (fake) => { singSong([fake], vs, opts.vocalLift ?? 0, !!opts.vocalStudied); linkVoice(fake, idea); });
  idea.vocalVoice = autoVoice(vs, song.partGenres.strum);
  idea.vocalHigh = pickHigh(vs, song.partGenres.strum);
  // the lead vocal as it's sung (an idea on its own: its own mood)
  if (opts.vocalWriter === 'classic') singLead([idea]);
  return idea;
}

/**
 * Chords you set: the generator fills in around them. Only for the idea itself (and a riff track's
 * copy of it); track sections that write their own chords don't use this.
 */
export function withSheet(opts: GenOptions, seeds: Seeds, song: Song): BuildOptions {
  const sheet = opts.chords;
  return hasPins(sheet) ? { chords: (c: ChordPart) => applySheet(new Rng(`${seeds.chords}-sheet`), song, c, sheet) } : {};
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
  const { strum, name: pattern } = generateStrum(new Rng(seeds.strum), song, chords, opts.strumMix);
  // a player, not a loop: small changes from bar to bar, and a turn at the end of each phrase
  const developed = developStrum(new Rng(`${seeds.strum}-develop`), song, chords, strum);
  // where a chord carries on into the next bar, the strumming can too
  const carried = carryOver(new Rng(`${seeds.strum}-carry`), song, chords, strum);
  // the bass: locked to the kick (short notes), or a held, flowing or driving line (notes held into each other)
  const bassLine = pickBassLine(new Rng(`${seeds.bass}-line`), song.partGenres.bass);
  const written = bassLine === 'locked' ? null : writeBassLine(new Rng(seeds.bass), song, chords, bassLine);
  const bass = written?.bass ?? generateBass(new Rng(seeds.bass), song, chords, drums);
  // last: the parts react to each other (pushes, kicks, fills, the end of the first phrase)
  const together = lockBand(new Rng(`${seeds.drums}-band`), song, chords, drums, strum, bass);
  const bassLen = written ? written.lens.map((l, g) => (bass[g] ? l : 0)) : bassLengths(new Rng(`${seeds.bass}-len`), song, bass);
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
    ...(developed ? [developed] : []),
    ...(carried ? [carried] : []),
    `Bass: ${BASS_LINE_DESC[bassLine]}`,
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

  const g2 = generateGuitar2(new Rng(seeds.guitar2 ?? `${seeds.strum}-2`), song, chords, null, undefined, undefined, { lines: opts.leadLines, figures: opts.leadFigures, figureSeed: `${seeds.guitar2 ?? seeds.strum}-figure`, licks: opts.leadLicks ? new Set<string>() : undefined });
  notes.splice(1, 0, ...g2.notes);

  return { seeds, opts, song, chords, drums, strum, bass, bassLen, bassLine, guitar2: clearFills(song, drums, g2.hits), notes };
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
  const g2 = generateGuitar2(new Rng(seeds.guitar2 ?? `${seeds.strum}-2`), song, chords, riff.hits, undefined, undefined, { lines: opts.leadLines, figures: opts.leadFigures, figureSeed: `${seeds.guitar2 ?? seeds.strum}-figure`, licks: opts.leadLicks ? new Set<string>() : undefined });
  notes.splice(1, 0, ...g2.notes);
  const strum = new Array<Stroke>(song.total).fill('.');
  return { seeds, opts, song, chords, drums, strum, bass, bassLen: lens, guitar: riff.hits, guitar2: g2.hits, notes };
}
