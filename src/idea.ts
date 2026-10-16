import type { EnergyStyle } from './parts/energy';
import type { VocalNote, VoiceType } from './parts/vocal';
// Shared types for a generated idea.

import type { Genre, GenreSel, RiffStyle } from './genres';
import type { SectionSound } from './sounds';
import type { Bar, Variant } from './rhythm';
import type { Chord, Mode, Quality } from './theory';
import type { BassLine } from './parts/bass';
import type { Tuning } from './theory/fretboard';
import type { HighVoice, Timbre } from './parts/singers';
import type { StrumColour } from './theory/guitar';

export type PartName = 'chords' | 'drums' | 'strum' | 'bass';

/** One seed per part so parts can be rerolled independently later (M3). */
export interface Seeds {
  song: string;
  chords: string;
  drums: string;
  strum: string;
  bass: string;
  /** Optional so older seed sets still work. */
  guitar2?: string;
  /** The singer's melody and words (optional, like guitar2). */
  vocal?: string;
  /** Piano, pad, strings and percussion layers (optional, like guitar2). */
  keys?: string;
  pad?: string;
  strings?: string;
  perc?: string;
}

export interface GenOptions {
  genre: GenreSel;
  meter: string; // 'auto' | 'mixed' | '4/4' ...
  weirdness: number; // 0..1
  /** Fixed tempo; leave out for the genre's own range. */
  bpm?: number;
  /** Chords you set (strummed genres); the generator writes the rest around them. */
  chords?: ChordSheet;
  /** Semitones higher the vocal tunes are written (the Chester voice: a tenor; in key, the tune itself rewritten). */
  vocalLift?: number;
  /** Who sings the vocal high (the tunes kept under their top; singers.ts), if anyone. */
  vocalSinger?: HighVoice;
  /** How the vocal's rhythm is written: classic (speech rhythm, the default) or on the metronome grid (docs/VOCAL-RHYTHM.md). */
  vocalRhythm?: 'grid' | 'words';
  /** How the vocal's pitches are written: classic (the default), shaped (docs/VOCAL-MELODY.md), melody first (docs/VOCAL-FIRST.md) or learned (docs/VOCAL-LEARNED.md). */
  vocalMelody?: 'shaped' | 'first' | 'learned';
  /** Shaped: one signature move chosen (src/parts/moves.ts); left out: each song its own, by genre. */
  vocalMove?: string;
  /** How the singer carries the energy (src/parts/energy.ts): a style chosen, 'off' (as before), or left out: Auto. */
  vocalEnergy?: string;
  /** Real songs (docs/REALISM.md): the melody writers lean toward real vocal lines of the genre. */
  vocalReal?: boolean;
  /** Patterns (docs/PATTERNS.md): the vocal's rhythms and short shapes drawn from a library of common real ones. */
  vocalPatterns?: boolean;
  /** Real strum mix (docs/STUDY-RHYTHM.md): strumming patterns from a library widened to what real guitarists play: held chords, quarters, 8ths in many shapes, 16ths, stabs. */
  strumMix?: boolean;
  /** Guitar 2 (the lead player) plays whole lines, mostly by step, as well as short licks (docs/LEAD-LINES.md). Off: as before. */
  leadLines?: boolean;
  /** Guitar 2 plays a picked figure, the same each bar (some songs' verses), and its lines come back (docs/LEAD-FIGURES.md). Off: as before. */
  leadFigures?: boolean;
  /** Guitar 2 keeps out from under the singer's lines, by genre (metal and hard rock most), and plays a line over a band intro (docs/LEAD-ROOM.md). Off: as before. */
  leadRoom?: boolean;
  /** Songs without a solo: now and then no lead guitar at all (pop most), else a short lead break after a chorus (docs/LEAD-BREAKS.md). Off: as before. */
  leadBreaks?: boolean;
  /** A second lead guitar on the hook and the solo's peak: a harmony, an octave or a double (hard rock and metal most; docs/LEAD-TWIN.md). Off: as before. */
  leadTwin?: boolean;
  /** Real licks: solos and verse fills also play licks written from real lead guitar parts (shared rhythms, real note-to-note odds; docs/LEAD-LICKS.md). Off: as before. */
  leadLicks?: boolean;
  /** Solo New: the new solo writer, built from real solos (docs/SOLO-NEW.md). Off: the classic writer. */
  leadSolo?: boolean;
}

/** One half-bar of a chord sheet: a chord [root above the key, quality], '-' (the chord before carries on), or null (left to the generator). */
export type SheetCell = [number, Quality] | '-' | null;
/** Chords you set: two cells per bar (first half, second half). */
export type ChordSheet = SheetCell[];

/** A rhythm that repeats every `len` 16ths regardless of the bar line. */
export interface Cycle {
  part: 'hat' | 'kick' | 'strum';
  len: number;
}

/** Song-level decisions every part builds on. */
export interface Song {
  genreSel: GenreSel;
  genre: Genre;
  partGenres: { drums: Genre; strum: Genre; bass: Genre };
  key: number;
  mode: Mode;
  bpm: number;
  swing: number;
  w: number;
  meters: string[];
  meterLabel: string;
  groupsFor: Record<string, number[]>;
  bars: Bar[];
  total: number;
  plan: Variant[];
  cycles: Cycle[];
  /** Riff genres only: guitar tuning and the riff style of each bar. */
  tuning?: Tuning;
  sections?: RiffStyle[];
  /** Tracks: force the drums into (or out of) half-time. */
  forceHalf?: boolean;
  /** Tracks: drums never wait out the first bars of a quiet intro. */
  noTacet?: boolean;
  /** Tracks: a groove the drums shouldn't pick (the verse plays a different groove from the chorus). */
  avoidGroove?: string;
}

export interface ChordEvent {
  step: number;
  chord: Chord;
}

export interface ChordPart {
  timeline: ChordEvent[];
  /** For each step, the index into timeline of the chord sounding. */
  chordIdx: number[];
  notes: string[];
}

/** Drum lanes, one value per 16th step. 0 = silent, otherwise velocity (toms: 1-3 = which tom). */
export interface DrumPart {
  kick: number[];
  snare: number[];
  hat: number[];
  hatOpen: number[];
  ride: number[];
  crash: number[];
  tom: number[];
  /**
   * `seam`: a fill the track adds between sections (or where the drums come in), not part of a groove.
   * `build`: a snare build into a chorus (always played as written).
   */
  fills: { bar: number; len: number; seam?: boolean; build?: boolean }[];
  halfTime: boolean;
  fourFloor: boolean;
  /** The groove's name (strummed genres), for the notes. */
  groove?: string;
  /** Tracks, played by the band: where the drummer sits against the beat, in ms (+ late, - early; the kick is the anchor). */
  feel?: { snare: number; cym: number };
}

/**
 * Strum lane symbols:
 * D down, U up, x muted scratch, p palm-muted down, . rest
 */
export type Stroke = 'D' | 'U' | 'x' | 'p' | '.';

/** One thing the guitar plays in a riff: a note, power chord or chord. */
/** How the fretting hand reaches a note from the one before it on the same string. */
export type Move = 'pick' | 'hammer' | 'pull' | 'slide';

/**
 * How a player actually plays a note (tracks, set by the band's hands pass, src/players/hands.ts):
 * where on the neck, and how the hand gets there. Playback follows it; MIDI export stays as written.
 */
export interface Touch {
  /** String (0 = lowest) and fret (of the lowest note, for an octave shape). */
  string: number;
  fret: number;
  /** Picked, or reached from the last note without picking: hammered on, pulled off, slid. */
  move: Move;
  /** The next note comes legato out of this one: it rings right into it. */
  tied?: boolean;
  /** The finger lifts this many ms before the next note (moving to a new position). */
  lift?: number;
  /** Slides into the note from this many semitones away (bass; Guitar 2 uses GuitarHit.slide). */
  from?: number;
  /** Bent up into the note from this many semitones below. */
  bend?: number;
  /** Vibrato depth (cents) on a held note, when the part asks for one. */
  vib?: number;
  /** Slides off the end of the note, down this many semitones (a fall-off). */
  fall?: number;
  /** A finger squeak on the wound strings as the hand shifts to this note. */
  squeak?: boolean;
}

/** Strummed rhythm guitar, at a chord change: what the player's hands do (tracks). */
export interface ChangeTouch {
  /** The fingers squeak along the wound strings as the hand shifts (when the shapes are far apart). */
  squeak?: boolean;
  /** The hand lets go early: the last strum before the change hits the open strings. */
  open?: boolean;
}

export interface GuitarHit {
  step: number;
  /** MIDI notes, low to high, and the string each is on. */
  notes: number[];
  strings: number[];
  /** Length in 16ths. */
  len: number;
  vel: number;
  /** palm = palm-muted chug, dead = muted scratch. */
  mute?: 'palm' | 'dead';
  /** Quiet section: play on the clean channel even when the amp is driven. */
  clean?: boolean;
  /** Let other strings keep ringing (arpeggios). */
  letRing?: boolean;
  /** Slide into the note from this many semitones away. */
  slide?: number;
  /** Bent up into the note from this many semitones below, as written in a lick (0: written without a bend; the hands play it as written). */
  bend?: number;
  /** How the line gets to this note, as written (a solo): picked, legato from the last note (hammered or
   * pulled off, by direction), or slid; the hands play it that way where the fingering allows. */
  art?: 'pick' | 'legato' | 'slide';
  /** Vibrato depth on a held note (cents), as written; otherwise the instrument's own. */
  vib?: number;
  /** A bend let down again partway through the note, this many semitones (with `bend`: bent up and
   * released; without: picked already bent, then released). The note is the bent-up pitch. */
  unbend?: number;
  /** Trilled: hammered on and pulled off this many semitones above, fast, for the whole note. */
  trill?: number;
  /** Tremolo picked: the note picked again and again, as fast as the hand goes (32nds). */
  tremolo?: boolean;
  /** Raked into: the pick drags across this many muted strings just before the note. */
  rake?: number;
  /** A second lead guitar plays this with it (Twin, docs/LEAD-TWIN.md): a harmony, an octave or the same notes, panned the other way. */
  twin?: number[];
  /** Fade the note in (volume swell). */
  swell?: boolean;
  /** The low pedal note of a pedal riff (a harmony part skips it). */
  pedal?: boolean;
  /** Tracks: how the player's hands play it. */
  touch?: Touch;
}

export interface Idea {
  seeds: Seeds;
  opts: GenOptions;
  song: Song;
  chords: ChordPart;
  drums: DrumPart;
  strum: Stroke[];
  /** MIDI note per step, 0 = rest. */
  bass: number[];
  /** Optional note length in 16ths per step (otherwise a note lasts until the next one). */
  bassLen?: number[];
  /** Tracks: how the bassist's hands play each note (per step, with `bass`). */
  bassTouch?: (Touch | undefined)[];
  /** Tracks, played by the band: how far the bassist sits behind the kick, in ms. */
  bassFeel?: number;
  /** Strummed genres: how the bass plays (locked to the kick, held, flowing or driving). */
  bassLine?: BassLine;
  /** Riff genres: the guitar part as explicit hits (replaces the strum lane for playback). */
  guitar?: GuitarHit[];
  /** Second guitar: lead, harmony, octaves, arpeggios or swells. */
  guitar2: GuitarHit[];
  /** The singer: a melody with a syllable on each note (tracks and ideas; missing in older ones). */
  vocal?: VocalNote[];
  /** Which voice sings it on Auto (the melody is written for the low one; the high one sings it an octave up). */
  vocalVoice?: VoiceType;
  /** Who sings it when it's sung high (one of the three high singers; missing in older ones: the rock tenor). */
  vocalHigh?: HighVoice;
  /** The singer's voice on Auto (clear, raspy or deep; missing in older ones: clear). */
  vocalTimbre?: Timbre;
  /** Backing vocals and ad-libs (sung by the same singer, panned around the lead), and whether the lead is double-tracked. */
  backing?: VocalNote[];
  vocalDouble?: boolean;
  /** The singer's energy style (src/parts/energy.ts), if on. */
  vocalEnergy?: EnergyStyle;
  /** Seconds the singer sits further behind the beat (or ahead: negative), by energy style. */
  vocalLay?: number;
  /** Tracks: the strummer's hands at chord changes (by the step of the change). */
  changeTouch?: Record<number, ChangeTouch>;
  /** Tracks, played by the band: how hard the strummed rhythm guitar plays (1 = as written). */
  strumGain?: number;
  /** Rhythm guitar (strummed genres), as its player plays it (src/players/rhythm.ts): how hard each
   * stroke is, per step (1 = as usual): accents, softer up-strums, a build. */
  strumVel?: number[];
  /** Rhythm guitar: how a stroke voices its chord, per step (a sus or add9 on a held chord, a high
   * triad, a power chord); otherwise the usual shape. */
  strumColour?: (StrumColour | undefined)[];
  /** Rhythm guitar (strummed genres): picked notes as well as the strums (arpeggiated sections, a fill
   * between chords). */
  rhythmPick?: GuitarHit[];
  /** Rhythm guitar (strummed genres): how the player shapes its chords: a capo, higher up the neck, a smooth top line. */
  shapes?: { capo?: number; near?: number; smooth?: boolean };
  /** Tracks, Guitar plan (src/players/presence.ts): the steps the rhythm guitar sits out (from, until), and the layer that covers its chords there (a piano, strings or pad, even if none was added). */
  guitarOut?: { from: number; until: number };
  cover?: 'keys' | 'strings' | 'pad';
  /** Rhythm guitar: a dotted-8th echo on it (ringing arpeggios). */
  rhythmEcho?: boolean;
  /** An idea on its own: its rhythm guitar as written, before the player played it (tracks start from this). */
  written?: { strum: Stroke[]; guitar?: GuitarHit[] };
  /** Rhythm guitar (strums and riffs): the player's timing, per step, in ms (+ late): a slow drift, never quite on the grid. */
  rhythmTime?: number[];
  /** Tracks, played by the band: how far Guitar 2 sits behind the beat, in ms. */
  g2Feel?: number;
  /** Tracks, played by the band: how far the strummed rhythm guitar sits behind the beat, in ms (- ahead). */
  strumFeel?: number;
  /** Tracks, played by the band: the in-between 16ths come this share of a 16th late (everyone). */
  lilt?: number;
  notes: string[];
  /** Set when this is one section of a track. */
  section?: SectionInfo;
}

export type SectionKind = 'intro' | 'verse' | 'prechorus' | 'chorus' | 'interlude' | 'bridge' | 'breakdown' | 'solo' | 'outro';

export interface SectionInfo {
  kind: SectionKind;
  /** e.g. "Verse 2" */
  label: string;
  /** 1 (quiet) to 5 (everything). */
  energy: number;
  /** The last bar is one held chord: the end of the track. */
  ending?: boolean;
  /** The instruments it plays on (when the parts are on Auto). */
  sound?: SectionSound;
  /** Step where the band comes in (intros that start with the guitar alone); layers like the piano wait for it. */
  bandFrom?: number;
  /** Guitar 2 plays a solo here (the mix lifts it). */
  solo?: boolean;
  /** How the section ends into the next one, so added layers stop or hit with the band. */
  tail?: { stop: number } | { hits: number[] } | { build: number } | { push: number } | { ring: number };
  /** A reversed cymbal swells up into the next section (a big lift). */
  riser?: boolean;
  /** The previous section pushed this one's first chord early: its downbeat isn't struck again. */
  pushedIn?: boolean;
  /** Tension per bar (0-1) from the song's arc, and the mix level per bar (dB, 0 at the climax). */
  tension?: number[];
  db?: number[];
  /** Where it sits in its track (and what the track is), so added layers can plan where they play. */
  pos?: { index: number; all: { kind: SectionKind; energy: number }[] };
}
