// Which instrument plays each part. An idea uses its genre's sound; a track picks one per section,
// like a band arranging a song: quiet verses on acoustic or clean guitar, choruses driven, a bridge
// that contrasts with the verse, sometimes more gain for the last chorus.
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
  /** Chance the last chorus and outro step up to more gain. */
  up: number;
  /** Guitar 2 carrying the hook through a strummed track. */
  hook: W;
}

const PALETTES: Record<Genre, Palette> = {
  rock: {
    soft: [['acoustic', 3], ['electric-clean', 3], ['piano', 1]],
    mid: [['electric-crunch', 3], ['electric-clean', 1], ['acoustic', 1]],
    loud: [['electric-crunch', 1]],
    up: 0.35,
    hook: [['electric-dist', 3], ['electric-crunch', 1], ['electric-clean', 1]],
  },
  pop: {
    soft: [['piano', 3], ['acoustic', 2], ['electric-clean', 1]],
    mid: [['acoustic', 3], ['piano', 1], ['electric-clean', 1]],
    loud: [['acoustic', 3], ['electric-crunch', 1], ['electric-clean', 1]],
    up: 0,
    hook: [['electric-clean', 3], ['piano', 1], ['electric-crunch', 1]],
  },
  funk: {
    soft: [['electric-clean', 2], ['piano', 2]],
    mid: [['electric-clean', 3], ['piano', 1]],
    loud: [['electric-clean', 1]],
    up: 0,
    hook: [['electric-clean', 1]],
  },
  hardrock: {
    soft: [['electric-clean', 3], ['acoustic', 2]],
    mid: [['electric-crunch', 3], ['electric-clean', 1]],
    loud: [['electric-crunch', 1]],
    up: 0.3,
    hook: [['electric-dist', 1]],
  },
  metal: {
    soft: [['electric-clean', 3], ['acoustic', 2]],
    mid: [['electric-dist', 3], ['electric-crunch', 1]],
    loud: [['electric-dist', 1]],
    up: 0,
    hook: [['electric-dist', 1]],
  },
  // the quiet verse, loud chorus of grunge
  grunge: {
    soft: [['electric-clean', 3], ['acoustic', 1]],
    mid: [['electric-crunch', 2], ['electric-clean', 2], ['electric-dist', 1]],
    loud: [['electric-dist', 1]],
    up: 0,
    hook: [['electric-dist', 1]],
  },
  altmetal: {
    soft: [['electric-clean', 1]],
    mid: [['electric-dist', 2], ['electric-clean', 1], ['electric-crunch', 1]],
    loud: [['electric-dist', 1]],
    up: 0,
    hook: [['electric-dist', 1]],
  },
};

const driven = (s: SoundId) => s === 'electric-crunch' || s === 'electric-dist';
const more = (s: SoundId): SoundId => (s === 'electric-clean' ? 'electric-crunch' : s === 'electric-crunch' ? 'electric-dist' : s);

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
  intro?: 'alone' | 'band' | 'layered';
  /** Guitar 2 plays the track's hook here. */
  hook?: boolean;
}

/** The streams the picks come from: one per block, so rerolling a block can change its sound alone. */
export interface SoundRngs { track: Rng; verse: Rng; pre: Rng; bridge: Rng; hook: Rng }

/**
 * Pick each section's instruments. `riff`: the rhythm part is a riff (riff genres), not strummed chords.
 * `fixed`: sounds chosen by hand for some kinds of section (rhythm part only).
 */
export function orchestrate(
  genre: Genre, riff: boolean, list: SoundSection[], r: SoundRngs, fixed: Partial<Record<SoundSlot, SoundId>> = {},
): SectionSound[] {
  const pal = PALETTES[genre];
  const band = (e: number) => (e <= 2 ? pal.soft : e === 3 ? pal.mid : pal.loud);
  const at = (k: SectionKind) => list.find((s) => s.kind === k);

  // block sounds, picked once so every verse (chorus, bridge...) sounds alike
  const chorus = pick(r.track, pal.loud);
  const peak = r.track.chance(pal.up) ? more(chorus) : chorus;
  const verseE = at('verse')?.energy ?? 3;
  // half the time the verse avoids the chorus sound, so the chorus arrives with a change of colour
  const verse = verseE >= 4 ? chorus : r.verse.chance(0.5) ? pick(r.verse, band(verseE), chorus) : pick(r.verse, band(verseE));
  const pre = r.pre.weighted<SoundId>([[verse, 1], [chorus, 2]]);
  const b = at('bridge') ?? at('breakdown');
  const bridge = !b || b.energy >= 4 ? (b?.kind === 'breakdown' ? peak : chorus) : pick(r.bridge, band(b.energy), verse, chorus);
  const hookSound = pick(r.hook, pal.hook);
  const intro = (s: SoundSection): SoundId => {
    if (s.intro === 'band') return riff ? chorus : verse;
    if (s.intro === 'layered') return riff ? chorus : r.track.weighted<SoundId>([[chorus, 1], [verse, 1]]);
    // the riff alone: mostly on the chorus sound (the classic riff intro), sometimes soft first
    if (riff) return s.energy <= 1 ? verse : r.track.weighted<SoundId>([[chorus, 3], [pick(r.track, pal.soft), 1]]);
    return r.track.weighted<SoundId>([[verse, 2], [pick(r.track, pal.soft), 1], [chorus, 1]]);
  };
  const introSound = at('intro') ? intro(at('intro')!) : verse;

  const chordsFor = (s: SoundSection): SoundId => {
    const f = fixed[soundSlot(s.kind)];
    if (f) return f;
    switch (s.kind) {
      case 'intro': return introSound;
      case 'verse': return verse;
      case 'prechorus': return pre;
      case 'bridge': case 'breakdown': return bridge;
      case 'outro': return peak;
      case 'interlude': return chorus;
      default: return s.final ? peak : chorus;
    }
  };

  // guitar 2: the hook keeps its sound (softer in quiet sections); otherwise a lead tone when the
  // section is loud, and a clean guitar or piano that stands apart from the rhythm part when it's quiet
  const lead = AUTO_GUITAR2[genre];
  const softLead = (c: SoundId, rng: Rng): SoundId =>
    riff || c === 'piano' ? 'electric-clean' : pick(rng, [['electric-clean', 3], ['piano', 1]], c);
  const g2Rng = (k: SectionKind) => (k === 'verse' ? r.verse : k === 'prechorus' ? r.pre : k === 'bridge' || k === 'breakdown' ? r.bridge : r.track);

  return list.map((s) => {
    const chords = chordsFor(s);
    let guitar2: SoundId;
    if (s.hook) guitar2 = s.energy <= 2 && driven(hookSound) ? 'electric-clean' : hookSound;
    else if (s.energy <= 2 || (s.energy === 3 && !driven(chords))) guitar2 = softLead(chords, g2Rng(s.kind));
    else guitar2 = (s.final || s.kind === 'outro') && peak !== chorus ? more(lead) : lead;
    return { chords, guitar2 };
  });
}
