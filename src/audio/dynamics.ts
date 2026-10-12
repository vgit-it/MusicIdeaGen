import type { SectionInfo } from '../idea';

// Track dynamics, shared by playback and MIDI export (so an export matches what you hear).

/** How hard the rhythm guitar and bass are played at each energy level (index = energy). */
export const DYNAMICS = [1, 0.8, 0.87, 0.94, 1, 1];

/** Overall level (dB) of a track section at each energy level. */
export const SECTION_DB = [0, -5.5, -4, -3.5, 0, 0];

/** A section's mix level at a bar (dB): its tension curve's, or its energy's. */
export function levelAt(section: SectionInfo | undefined, bar: number): number {
  const db = section?.db;
  if (db?.length) return db[Math.max(0, Math.min(db.length - 1, bar))];
  return SECTION_DB[section?.energy ?? 4];
}

/** How much harder (or softer) the band plays at a bar than the section's average: it builds with the tension. */
export function liftAt(section: SectionInfo | undefined, bar: number): number {
  const t = section?.tension;
  if (!t?.length) return 1;
  const mean = t.reduce((a, b) => a + b, 0) / t.length;
  return 1 + 0.35 * (t[Math.max(0, Math.min(t.length - 1, bar))] - mean);
}
