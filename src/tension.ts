// Tension and release across a whole song, shaped by its mood (research: docs/TENSION.md).
// A song is planned as one tension curve (0 calm … 1 the climax), bar by bar, before the band plays
// it: each section's level, how it builds or settles inside, where the one climax is, how deep the
// releases go. The mood sets the shape (a melancholic song rises slowly to a modest peak and lets go
// gently; an angry one stays high and hits; a triumphant one climbs to one big late peak). The parts
// follow it: each section's energy (how the drums, bass, strumming and layers are shaped) comes from
// it, and the mix level and how hard everyone plays follow it bar by bar (crescendos into choruses,
// a breakdown that rebuilds, an outro that fades or holds).

import type { Genre } from './genres';
import type { SectionKind, Song } from './idea';
import { Rng } from './rng';

export type Mood = 'happy' | 'melancholic' | 'nostalgic' | 'tense' | 'angry' | 'dreamy' | 'triumphant' | 'dark';
export type MoodChoice = 'auto' | Mood;

export const MOODS: Mood[] = ['happy', 'melancholic', 'nostalgic', 'tense', 'angry', 'dreamy', 'triumphant', 'dark'];

export const MOOD_LABEL: Record<Mood, string> = {
  happy: 'Happy', melancholic: 'Melancholic', nostalgic: 'Nostalgic', tense: 'Tense', angry: 'Angry',
  dreamy: 'Dreamy', triumphant: 'Triumphant', dark: 'Dark',
};

/** The shape of a song's arc. */
type Shape = 'waves' | 'arch' | 'plateau' | 'climb' | 'flat' | 'restless';

export interface MoodProfile {
  /** The calm parts and the climax (0-1). */
  base: number;
  peak: number;
  /** How much each repeat of a section grows (a slow rise grows more over the song, less at once). */
  grow: number;
  /** How steep a build is inside a section (pre-chorus, a breakdown rebuilding). */
  build: number;
  /** How far a release drops (the bridge before the last chorus, the outro). */
  release: number;
  shape: Shape;
  /** The outro: holds the climax, or lets go. */
  outro: 'hold' | 'fade';
  /** The level range of the mix from the calmest bar to the climax (dB). */
  range: number;
  /** Chances: the last chorus up a key; the band stopping before a chorus (a breath, then the arrival). */
  keyChange: number;
  stop: number;
  /** Quiet verses and bridges (strummed songs). */
  quiet: number;
  /** Into an arrival: chances of the bass holding the 5th underneath (a pedal), and the last chord suspended (sus4). */
  pedal: number;
  sus: number;
  desc: string;
}

export const PROFILES: Record<Mood, MoodProfile> = {
  happy: { base: 0.4, peak: 0.88, grow: 0.06, build: 0.18, release: 0.35, shape: 'waves', outro: 'hold', range: 7, keyChange: 0.2, stop: 1.2, quiet: 0.5, pedal: 0.45, sus: 0.35,
    desc: 'lifts into every chorus, a dip before the last one, a full, bright arrival' },
  melancholic: { base: 0.22, peak: 0.62, grow: 0.08, build: 0.1, release: 0.25, shape: 'arch', outro: 'fade', range: 6, keyChange: 0, stop: 0.5, quiet: 0.85, pedal: 0.15, sus: 0.5,
    desc: 'a slow rise to a modest peak, then a long letting go; soft landings' },
  nostalgic: { base: 0.3, peak: 0.72, grow: 0.07, build: 0.12, release: 0.3, shape: 'waves', outro: 'fade', range: 6, keyChange: 0.08, stop: 0.8, quiet: 0.7, pedal: 0.25, sus: 0.5,
    desc: 'gentle waves that grow, a warm peak late, a soft ending' },
  tense: { base: 0.5, peak: 0.84, grow: 0.05, build: 0.2, release: 0.12, shape: 'restless', outro: 'hold', range: 5, keyChange: 0, stop: 1.5, quiet: 0.4, pedal: 0.7, sus: 0.3,
    desc: 'restless, many small builds, releases that never quite settle' },
  angry: { base: 0.62, peak: 1, grow: 0.04, build: 0.15, release: 0.15, shape: 'plateau', outro: 'hold', range: 4.5, keyChange: 0, stop: 1.6, quiet: 0.15, pedal: 0.4, sus: 0.1,
    desc: 'high from the start, released by impact (stops, then the band slams back in)' },
  dreamy: { base: 0.15, peak: 0.48, grow: 0.04, build: 0.06, release: 0.1, shape: 'flat', outro: 'fade', range: 4, keyChange: 0, stop: 0.2, quiet: 0.9, pedal: 0, sus: 0.6,
    desc: 'calm, small swells, no hard arrivals, a fade' },
  triumphant: { base: 0.35, peak: 1, grow: 0.1, build: 0.22, release: 0.3, shape: 'climb', outro: 'hold', range: 8, keyChange: 0.35, stop: 1, quiet: 0.5, pedal: 0.6, sus: 0.45,
    desc: 'one long climb to a big late peak, every lever at once for the arrival' },
  dark: { base: 0.38, peak: 0.78, grow: 0.06, build: 0.12, release: 0.25, shape: 'waves', outro: 'fade', range: 6, keyChange: 0, stop: 1, quiet: 0.6, pedal: 0.4, sus: 0.2,
    desc: 'heavy and slow to rise, releases that fall back low rather than bright' },
};

/** A mood for a song on Auto: from its genre, its mode and its tempo. */
export function autoMood(song: Song, seed: string): Mood {
  const g: Genre = song.genre;
  const minor = ['minor', 'dorian', 'phrygian'].includes(song.mode);
  const w: Partial<Record<Mood, number>> =
    g === 'metal' ? { angry: 3, dark: 2, triumphant: 1, tense: 1 }
      : g === 'hardrock' ? { angry: 2, triumphant: 2, happy: 1, dark: 1 }
        : g === 'grunge' ? { dark: 3, melancholic: 2, angry: 2 }
          : g === 'altmetal' ? { dark: 2, tense: 2, angry: 2, melancholic: 1 }
            : g === 'funk' ? { happy: 3, tense: 1, nostalgic: 1 }
              : g === 'pop' ? (minor ? { melancholic: 3, nostalgic: 2, dreamy: 1, tense: 1 } : { happy: 3, nostalgic: 2, triumphant: 1, dreamy: 1 })
                : minor ? { melancholic: 2, dark: 2, tense: 1, angry: 1 } : { happy: 2, nostalgic: 2, triumphant: 1 };
  // slow songs lean calm and sad, fast ones driven
  for (const m of Object.keys(w) as Mood[]) {
    if (song.bpm < 85 && ['melancholic', 'dreamy', 'dark', 'nostalgic'].includes(m)) w[m]! *= 2;
    if (song.bpm > 140 && ['angry', 'happy', 'tense'].includes(m)) w[m]! *= 2;
    if (minor && m === 'happy') w[m]! *= 0.4;
  }
  return new Rng(`${seed}-mood`).weighted(Object.entries(w) as [Mood, number][]);
}

/** What the planner needs of a section. */
export interface ArcSlot {
  kind: SectionKind;
  bars: number;
  final?: boolean;
  /** The section's energy as the structure has it (1-5): intros keep theirs, others move from it by one at most. */
  energy: number;
  intro?: 'alone' | 'band' | 'layered' | 'long';
  /** A solo section. */
  solo?: boolean;
  /** An outro that goes somewhere (a solo over it, a jam): it can be the climax. */
  big?: boolean;
}

export interface ArcSection {
  /** Tension per bar (0-1). */
  tension: number[];
  /** The section's energy (1-5), from its tension. */
  energy: number;
  /** Mix level per bar (dB, 0 at the climax). */
  db: number[];
  /** Words for the notes: "building", "the climax"... */
  role: string;
}

export interface Arc {
  mood: Mood;
  sections: ArcSection[];
  /** Index of the climax section. */
  climax: number;
}

const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));

/** Where each kind of section sits on a plain pop/rock arc (0-1), before the mood shapes it. */
const KIND_LEVEL: Record<SectionKind, number> = {
  intro: 0.4, verse: 0.35, prechorus: 0.52, chorus: 0.72, interlude: 0.6, bridge: 0.42, breakdown: 0.55, solo: 0.82, outro: 0.75,
};

/**
 * The song's tension curve: a level per section (by kind, growing each time a kind comes back), shaped
 * by the mood (waves, an arch, a plateau, a long climb, flat, restless), scaled into the mood's range
 * with one climax; then each section's shape inside (a verse edging up, a pre-chorus building, a chorus
 * holding, a bridge dropping and rebuilding, an outro holding or fading) and a small rise across each
 * four-bar phrase.
 */
export function planTension(slots: ArcSlot[], mood: Mood): Arc {
  const P = PROFILES[mood];
  const n = slots.length;
  const seen: Partial<Record<SectionKind, number>> = {};
  const totalBars = slots.reduce((a, s) => a + s.bars, 0);
  let at = 0;
  const mid = slots.map((s) => { const m = (at + s.bars / 2) / totalBars; at += s.bars; return m; });

  // 1. the level of each section on a plain arc, each repeat a little higher
  let level = slots.map((s, i) => {
    const k = (seen[s.kind] = (seen[s.kind] ?? 0) + 1) - 1;
    let v = KIND_LEVEL[s.kind] + k * P.grow;
    if (s.kind === 'intro') v = s.intro === 'alone' ? 0.3 : s.intro === 'band' ? 0.55 : 0.45;
    if (s.final) v = 0.95;
    if (s.kind === 'outro' && P.outro === 'fade') v = 0.5;
    // structure's own quiet or loud sections (a quiet riff verse, a picked bridge, a heavy breakdown)
    v += (s.energy - (s.kind === 'verse' ? 2.5 : s.kind === 'bridge' ? 3 : s.kind === 'breakdown' ? 5 : s.energy)) * 0.08;
    // the bridge before the last chorus is the big release (deep moods drop further)
    if ((s.kind === 'bridge' || s.kind === 'breakdown') && slots.slice(i + 1).some((x) => x.final)) v -= P.release * 0.4;
    return v;
  });

  // 2. the mood's shape
  const mean = level.reduce((a, b) => a + b, 0) / n;
  level = level.map((v, i) => {
    const pos = mid[i];
    switch (P.shape) {
      case 'arch': return pos > 0.75 && slots[i].kind !== 'chorus' ? v - (pos - 0.75) * 1.2 : v;
      case 'plateau': return 0.6 + 0.5 * (v - mean);
      case 'climb': return 0.45 * v + 0.55 * (0.2 + 0.8 * pos);
      case 'flat': return mean + 0.5 * (v - mean);
      case 'restless': return v + (i % 2 ? 0.05 : -0.03);
      default: return v;
    }
  });

  // 3. one climax: the last chorus (or the outro / a late solo, if they're higher), in the mood's range
  // (an outro that solos or jams takes the climax in moods that hold to the end: the song's last word)
  const bigOutro = slots.findIndex((s) => s.kind === 'outro' && s.big);
  let climax = bigOutro >= 0 && P.outro === 'hold' ? bigOutro : slots.findIndex((s) => s.final);
  if (climax < 0) climax = level.reduce((bi, v, i) => (v > level[bi] ? i : bi), 0);
  const lo = Math.min(...level), hi = Math.max(...level);
  const scaled = level.map((v) => P.base + (P.peak - P.base) * ((v - lo) / Math.max(0.01, hi - lo)));
  scaled[climax] = P.peak;
  for (let i = 0; i < n; i++) if (i !== climax) scaled[i] = Math.min(scaled[i], P.peak - 0.05);

  // 4. inside each section, bar by bar
  let prevEnd = scaled[0];
  const sections: ArcSection[] = slots.map((s, i) => {
    const v = scaled[i];
    const next = scaled[i + 1] ?? null;
    const t: number[] = [];
    const B = s.bars;
    let role = 'steady';
    for (let b = 0; b < B; b++) {
      const x = B > 1 ? b / (B - 1) : 1;
      let y = v;
      if (s.kind === 'intro' && (s.intro === 'long' || s.intro === 'layered')) { y = v - 0.15 + 0.2 * x; role = 'building up'; }
      else if (s.kind === 'prechorus') { y = v - P.build / 2 + P.build * x; role = 'building'; }
      else if (s.kind === 'verse') { y = v - 0.02 + 0.05 * x; role = next !== null && next > v + 0.1 && slots[i + 1].kind !== 'prechorus' ? 'edging up' : 'settled'; }
      else if (s.kind === 'chorus') { y = v + (x > 0.4 && x < 0.6 ? -0.02 : 0); role = i === climax ? 'the climax' : 'arrival'; }
      else if ((s.kind === 'bridge' || s.kind === 'breakdown') && next !== null && next > v) {
        // drops, then rebuilds over its last bars toward what comes next
        const from = Math.max(0, B - Math.max(2, Math.round(B / 3)));
        y = b < from ? v : v + (next - v) * 0.6 * ((b - from + 1) / (B - from));
        role = 'release, then rebuilding';
      } else if (s.solo) { y = v - 0.06 + 0.12 * Math.min(1, x / 0.7) - (x > 0.7 ? 0.05 * (x - 0.7) / 0.3 : 0); role = 'a solo building to its peak'; }
      else if (s.kind === 'outro') {
        // a fade lets go from where the song was, down past where it started
        if (P.outro === 'fade') { const from = Math.max(v, prevEnd - 0.08); y = from - (from - P.base * 0.8) * x; role = 'letting go'; } else { y = v; role = 'holding the peak'; }
      }
      // a small rise across each four-bar phrase (busier toward bar 4), more in restless songs
      y += ((b % 4) / 3 - 0.5) * (P.shape === 'restless' ? 0.06 : 0.03);
      t.push(clamp(y));
    }
    if (i === climax) role = 'the climax';
    prevEnd = t[t.length - 1];
    return { tension: t, energy: 0, db: [], role };
  });

  // energy and the mix level from the curve; the climax alone gets the top
  const allT = sections.flatMap((s) => s.tension);
  const tMax = Math.max(...allT), tMin = Math.min(...allT);
  sections.forEach((sec, i) => {
    const s = slots[i];
    const m = sec.tension.reduce((a, b) => a + b, 0) / sec.tension.length;
    let e = Math.max(1, Math.min(5, 1 + Math.floor(m * 5)));
    // intros keep their staging; choruses move at most one step from the structure's own level, the
    // rest up to two (a fading outro, a bridge that drops right down)
    const reach = s.kind === 'chorus' ? 1 : 2;
    if (s.kind === 'intro') e = s.energy;
    else e = Math.max(s.energy - reach, Math.min(s.energy + reach, e));
    if (s.kind === 'breakdown') e = Math.max(e, 4);
    sec.energy = e;
    sec.db = sec.tension.map((y) => -P.range * ((tMax - y) / Math.max(0.05, tMax - tMin)));
  });
  // nothing louder than the climax
  const top = sections[climax].energy;
  sections.forEach((s, i) => { if (i !== climax && s.energy > top) s.energy = top; });
  return { mood, sections, climax };
}

/** One line on the mood and arc for the notes. */
export function arcNote(arc: Arc, auto: boolean, labels: string[]): string {
  return `Mood: ${MOOD_LABEL[arc.mood].toLowerCase()}${auto ? ' (Auto)' : ''}: ${PROFILES[arc.mood].desc}. Climax: ${labels[arc.climax]}`;
}
