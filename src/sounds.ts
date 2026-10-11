// Which instrument plays each part. An idea uses its genre's sound; a track keeps one sound per part
// all song, like a band, with sometimes one featured section on a contrasting instrument.
//
// Pure and deterministic (seeded), like the rest of the generator.

import type { Genre } from './genres';
import type { SectionKind } from './idea';
import type { Rng } from './rng';

export type SoundId = 'piano' | 'acoustic' | 'electric-clean' | 'electric-crunch' | 'electric-dist';

/** The instruments a track section plays on. */
export interface SectionSound {
  /** Rhythm part (strummed chords or the riff). */
  chords: SoundId;
  guitar2: SoundId;
}

/** Short names for the section strip. */
export const SOUND_SHORT: Record<SoundId, string> = {
  piano: 'Piano', acoustic: 'Acoustic', 'electric-clean': 'Clean', 'electric-crunch': 'Crunch', 'electric-dist': 'Distortion',
};

/** Names for section notes. */
export const SOUND_NAME: Record<SoundId, string> = {
  piano: 'piano', acoustic: 'acoustic guitar', 'electric-clean': 'clean electric guitar',
  'electric-crunch': 'crunchy electric guitar', 'electric-dist': 'distorted electric guitar',
};

/** Rhythm part on Auto, for an idea. */
export const AUTO_CHORDS: Record<Genre, SoundId> = {
  rock: 'electric-crunch',
  pop: 'acoustic',
  funk: 'electric-clean',
  hardrock: 'electric-crunch',
  metal: 'electric-dist',
  grunge: 'electric-dist',
  altmetal: 'electric-dist',
};

/** Guitar 2 on Auto: a lead tone for rock genres (more gain than the rhythm guitar, so it sings over it), clean for pop and funk. */
export const AUTO_GUITAR2: Record<Genre, SoundId> = {
  rock: 'electric-dist',
  pop: 'electric-clean',
  funk: 'electric-clean',
  hardrock: 'electric-dist',
  metal: 'electric-dist',
  grunge: 'electric-dist',
  altmetal: 'electric-dist',
};

type W = [SoundId, number][];

interface Palette {
  /** Energy 1–2 (quiet intros, verses, bridges). Riff genres: no piano (it can't play a riff convincingly). */
  soft: W;
  /** Energy 3. */
  mid: W;
  /** Choruses. */
  loud: W;
  /** Guitar 2 carrying the hook through a strummed track. */
  hook: W;
}

const PALETTES: Record<Genre, Palette> = {
  rock: {
    soft: [['acoustic', 3], ['electric-clean', 3], ['piano', 1]],
    mid: [['electric-crunch', 3], ['electric-clean', 1], ['acoustic', 1]],
    loud: [['electric-crunch', 1]],
    hook: [['electric-dist', 3], ['electric-crunch', 1], ['electric-clean', 1]],
  },
  pop: {
    soft: [['piano', 3], ['acoustic', 2], ['electric-clean', 1]],
    mid: [['acoustic', 3], ['piano', 1], ['electric-clean', 1]],
    loud: [['acoustic', 3], ['electric-crunch', 1], ['electric-clean', 1]],
    hook: [['electric-clean', 3], ['piano', 1], ['electric-crunch', 1]],
  },
  funk: {
    soft: [['electric-clean', 2], ['piano', 2]],
    mid: [['electric-clean', 3], ['piano', 1]],
    loud: [['electric-clean', 1]],
    hook: [['electric-clean', 1]],
  },
  hardrock: {
    soft: [['electric-clean', 3], ['acoustic', 2]],
    mid: [['electric-crunch', 3], ['electric-clean', 1]],
    loud: [['electric-crunch', 1]],
    hook: [['electric-dist', 1]],
  },
  metal: {
    soft: [['electric-clean', 3], ['acoustic', 2]],
    mid: [['electric-dist', 3], ['electric-crunch', 1]],
    loud: [['electric-dist', 1]],
    hook: [['electric-dist', 1]],
  },
  // the quiet verse, loud chorus of grunge
  grunge: {
    soft: [['electric-clean', 3], ['acoustic', 1]],
    mid: [['electric-crunch', 2], ['electric-clean', 2], ['electric-dist', 1]],
    loud: [['electric-dist', 1]],
    hook: [['electric-dist', 1]],
  },
  altmetal: {
    soft: [['electric-clean', 1]],
    mid: [['electric-dist', 2], ['electric-clean', 1], ['electric-crunch', 1]],
    loud: [['electric-dist', 1]],
    hook: [['electric-dist', 1]],
  },
};

const driven = (s: SoundId) => s === 'electric-crunch' || s === 'electric-dist';

/** A weighted pick, avoiding the sounds in `not` when anything else is on offer. */
function pick(rng: Rng, w: W, ...not: SoundId[]): SoundId {
  const ok = w.filter(([s]) => !not.includes(s));
  return rng.weighted(ok.length ? ok : w);
}

/** Sections that share a sound override (every verse, every chorus...). */
export type SoundSlot = Exclude<SectionKind, 'breakdown'>;
export const soundSlot = (k: SectionKind): SoundSlot => (k === 'breakdown' ? 'bridge' : k);

/** What a section is, for picking its sound. */
export interface SoundSection {
  kind: SectionKind;
  energy: number;
  /** The last chorus. */
  final?: boolean;
  intro?: 'alone' | 'band' | 'layered' | 'long';
  /** Guitar 2 plays the track's hook here. */
  hook?: boolean;
}

/** The streams the picks come from: one per block, so rerolling a block can change its sound alone. */
export interface SoundRngs { track: Rng; verse: Rng; pre: Rng; bridge: Rng; hook: Rng }

/**
 * Pick each section's instruments. `riff`: the rhythm part is a riff (riff genres), not strummed chords.
 * `fixed`: sounds chosen by hand for some kinds of section (rhythm part only).
 *
 * A band keeps its instruments all song: one rhythm guitar sound and one Guitar 2 sound, start to
 * finish (quiet sections play them softer, and Guitar 2's quiet parts on its amp's clean channel).
 * Switching from section to section (a clean verse, a crunchy pre-chorus, an acoustic bridge, Guitar 2
 * on piano then distortion) made sections jump out of nowhere. The one exception, sometimes: a single
 * featured section (the bridge, or else a quiet intro) on a contrasting instrument, so it stands out.
 */
export function orchestrate(
  genre: Genre, riff: boolean, list: SoundSection[], r: SoundRngs, fixed: Partial<Record<SoundSlot, SoundId>> = {},
): SectionSound[] {
  const pal = PALETTES[genre];
  // the band's guitar: the chorus sound, all song
  const main = pick(r.track, pal.loud);
  // Guitar 2's: the hook's sound when it carries a hook, else the genre's lead tone
  const lead = list.some((s) => s.hook) ? pick(r.hook, pal.hook) : AUTO_GUITAR2[genre];
  // the featured section: a quiet bridge (or breakdown), else a quiet intro
  const featured = list.findIndex((s) => (s.kind === 'bridge' || s.kind === 'breakdown') && s.energy <= 3);
  // (a riff intro stays on the band's sound: the classic riff intro)
  const quietIntro = riff ? -1 : list.findIndex((s) => s.kind === 'intro' && s.energy <= 2);
  const fi = featured >= 0 ? (r.bridge.chance(0.4) ? featured : -1) : quietIntro >= 0 && r.track.chance(0.25) ? quietIntro : -1;
  const feature = fi >= 0 ? pick(fi === featured ? r.bridge : r.track, pal.soft, main) : main;

  return list.map((s, i) => {
    const chords = fixed[soundSlot(s.kind)] ?? (i === fi ? feature : main);
    // (a featured acoustic or piano section gets a clean Guitar 2 beside it)
    const guitar2 = i === fi && driven(lead) && !driven(feature) ? 'electric-clean' : lead;
    return { chords, guitar2 };
  });
}

/** Words for the track notes: the song's sound, and its featured section if it has one. */
export function describeSounds(list: SoundSection[], sounds: SectionSound[]): string {
  const main = sounds.find((_, i) => list[i].kind === 'chorus')?.chords ?? sounds[0].chords;
  const odd = sounds.findIndex((s) => s.chords !== main);
  const g2 = sounds.find((_, i) => list[i].kind === 'chorus')?.guitar2 ?? sounds[0].guitar2;
  return `${SOUND_NAME[main]} and Guitar 2 on ${SOUND_NAME[g2]} all song${odd >= 0 ? `; the ${list[odd].kind === 'prechorus' ? 'pre-chorus' : list[odd].kind} on ${SOUND_NAME[sounds[odd].chords]} to stand out` : ''}`;
}
