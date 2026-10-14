// How hard or soft the Guide line is sung (experiment, docs/GUIDE.md; Paul: "how hard or soft it's sung").
// The words' own levels (a push loud, a held note medium, a quick note light) shaped like the vocals'
// (src/parts/melody.ts followTension, src/parts/energy.ts, the wails): louder with the bar's tension and
// the section's energy, high notes taking more push than low ones, stressed syllables leaning in and light
// ones falling back; a quiet section now and then sung soft all through (no belting); and a big line
// (chorus, bridge, outro; a pre-chorus's last line now and then) belting its top held note. The tune and
// the words stay exactly as they are; only each sound's level changes, which the voice hears as effort:
// loud notes above the singer's break belted (or screamed), soft ones breathier.

import type { Idea, SectionKind } from '../idea';
import { Rng } from '../rng';
import type { GuideLine } from './line';
import type { GuideSungLine } from './words';

/** Chance a line belts its top held note, by section (a pre-chorus only its last line). */
const BELT: Partial<Record<SectionKind, number>> = { chorus: 0.65, bridge: 0.55, outro: 0.45, prechorus: 0.4, verse: 0.06 };
/** How readily each genre belts (x). */
const GENRE_BELT: Record<string, number> = { pop: 0.85, funk: 0.8, rock: 1, hardrock: 1.2, metal: 1.2, grunge: 1.1, altmetal: 1.25 };
/** Chance a quiet section (energy 2 or less) is sung soft all through. */
const SOFT_P = 0.5;

const clamp = (v: number) => Math.max(0.45, Math.min(1, v));

/** Shapes the words' levels in place; returns what it did, for the notes list. */
export function shapeDynamics(list: Idea[], line: GuideLine, words: GuideSungLine[][], salt = 0): string[] {
  const all = words.flat().flatMap((l) => l.notes);
  if (!all.length) return [];
  const lo = Math.min(...all.map((n) => n.midi)), hi = Math.max(...all.map((n) => n.midi));
  const span = Math.max(1, hi - lo);
  const genre = list[0].song.genre;
  let belts = 0, soft = 0;
  words.forEach((lines, si) => {
    if (!lines.length) return;
    const idea = list[si];
    const kind = idea.section?.kind ?? 'verse';
    const energy = idea.section?.energy ?? 3;
    // (by kind: repeated choruses sung alike)
    const rng = new Rng(`guide-dyn-${list[0].seeds.song}-${line.mood}-${salt}-${kind}-${energy}`);
    const barLen = idea.song.bars[0]?.len ?? 16;
    const t = idea.section?.tension ?? [];
    const tAt = (step: number) => t[Math.max(0, Math.min(t.length - 1, Math.floor(step / barLen)))] ?? 0.5;
    const e = (energy - 3) / 2;
    const hush = energy <= 2 && kind !== 'chorus' && rng.chance(SOFT_P);
    if (hush) soft++;
    lines.forEach((L, li) => {
      let prev = 0.8;
      for (const n of L.notes) {
        // (a bend carries its word on at the same effort)
        if (n.syl.text === '~') { n.vel = prev; continue; }
        let v = n.vel * (0.86 + 0.3 * tAt(n.step)) * (1 + 0.08 * e);
        v *= 0.94 + 0.12 * ((n.midi - lo) / span);
        v += n.syl.stress ? 0.04 : -0.05;
        if (hush) v = Math.min(0.8, v * 0.85);
        n.vel = prev = clamp(Math.round(v * 100) / 100);
      }
      if (hush) return;
      // a belt: the line's top held note (a beat or more, near the song's top), sung full out
      const p = (BELT[kind] ?? 0) * (GENRE_BELT[genre] ?? 1) * (kind === 'prechorus' && li !== lines.length - 1 ? 0 : 1);
      if (!rng.chance(Math.min(0.9, p))) return;
      const held = L.notes.filter((n) => n.len >= 4 && n.midi >= hi - 4);
      const top = held.reduce<typeof held[number] | null>((b, n) => (!b || n.midi > b.midi ? n : b), null);
      if (!top) return;
      top.vel = 1;
      // (and the bend carrying it on)
      for (let k = L.notes.indexOf(top) + 1; k < L.notes.length && L.notes[k].syl.text === '~'; k++) L.notes[k].vel = 1;
      belts++;
    });
  });
  const out = ['Sung hard or soft: louder with the tension and the section, high notes pushed, stressed words leaning in'];
  if (soft) out.push(`${soft} quiet section${soft > 1 ? 's' : ''} sung soft all through`);
  if (belts) out.push(`${belts} line${belts > 1 ? 's' : ''} belting ${belts > 1 ? 'their' : 'its'} top note`);
  return out;
}
