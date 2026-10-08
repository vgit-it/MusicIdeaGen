// Strumming / comping on the 16th grid. Like the drums, a player picks a pattern and sits on it:
// one real strumming pattern per idea (from a small library per genre), with deliberate changes
// only (a lift for the second half, the band's habit at the end of a phrase, see cohesion.ts).
// Chords ring until the next stroke, so sparse patterns hold chords; scratches (x) choke them.
// Odd meters build their pattern from the beat groups, decided once. Weirdness adds spice.

import { GENRES } from '../genres';
import type { ChordPart, Song, Stroke } from '../idea';
import type { Rng } from '../rng';
import { groupStarts } from '../rhythm';

/** One bar of 4/4 (16 steps): D down, U up, x muted scratch, p palm-muted, . rest (the chord rings on). */
interface Pattern { name: string; p: string; spice?: string }

const PATTERNS: Record<'rock' | 'pop' | 'funk', [Pattern, number][]> = {
  rock: [
    [{ name: 'down, down-up', p: 'D...D.U...U.D.U.', spice: '........D.......' }, 3],
    [{ name: 'hit and let ring', p: 'D.......D.....U.' }, 2],
    [{ name: 'driving 8ths', p: 'D.D.D.D.D.D.D.D.' }, 2],
    [{ name: 'palm-muted chug, open on the beat', p: 'D.p.p.p.D.p.p.p.', spice: '..............D.' }, 2],
    [{ name: 'push on the and of 2', p: 'D.....D.....D.U.' }, 2],
    [{ name: 'accents and a choke', p: 'D..D..D...D.x...' }, 1],
  ],
  pop: [
    [{ name: 'down, down-up', p: 'D...D.U...U.D.U.', spice: '..U.............' }, 3],
    [{ name: 'quarter strums', p: 'D...D...D...D...', spice: '..............U.' }, 2],
    [{ name: '3-3-2 strum', p: 'D..D..D.D...D.U.' }, 2],
    [{ name: 'let it ring, then 8ths', p: 'D.......D.U.D.U.' }, 2],
    [{ name: 'half notes', p: 'D.......D.......', spice: '......U.........' }, 1],
    [{ name: 'muted backbeat', p: 'D...x.U.D.U.x.U.' }, 1],
  ],
  funk: [
    [{ name: '16th scratch groove', p: 'D.xUx.xUD.xUx.xU' }, 2],
    [{ name: 'off-beat stabs', p: '..D...D.x.D...D.', spice: '.............U..' }, 2],
    [{ name: 'chank on 2 and 4 with scratches', p: 'x.x.D.x.x.x.D.x.' }, 2],
    [{ name: 'syncopated stabs', p: 'D..D..x.x.D..D..' }, 2],
  ],
};

const strokes = (s: string): Stroke[] => [...s] as Stroke[];

/** Any meter: a pattern from the beat groups, each group's figure decided once. */
function groupPattern(rng: Rng, len: number, groups: number[], genre: 'rock' | 'pop' | 'funk'): Stroke[] {
  const a: Stroke[] = new Array<Stroke>(len).fill('.');
  const st = groupStarts(groups);
  const figs: Record<string, string[][]> = {
    rock: [['D...', 'D.D.', 'D..U'], ['D..', 'D.U'], ['D.', 'D.']],
    pop: [['D...', 'D.U.', 'D...'], ['D..', 'D.U'], ['D.', 'U.']],
    funk: [['D.xU', 'x.D.', '..D.'], ['D.x', 'x.D'], ['D.', 'x.']],
  };
  groups.forEach((g, i) => {
    const pool = figs[genre][g >= 4 ? 0 : g === 3 ? 1 : 2];
    const f = rng.pick(pool);
    for (let k = 0; k < g; k++) a[st[i] + k] = (f[k] ?? '.') as Stroke;
  });
  return a;
}

/** The strum lane, and the pattern's name for the notes (null in odd meters, where it's built from the beat groups). */
export function generateStrum(rng: Rng, song: Song, chords: ChordPart): { strum: Stroke[]; name: string | null } {
  const { w, bars, total, groupsFor, plan } = song;
  const g = song.partGenres.strum;
  // riff genres only strum when borrowed into another genre: treat them as rock
  const genre = GENRES[g].riff ? 'rock' : (g as 'rock' | 'pop' | 'funk');
  const lib = PATTERNS[genre];
  const pat = rng.weighted(lib);
  // the second half can lift to a sibling pattern (when the song's plan has a B section)
  const lift = rng.weighted(lib.filter(([x]) => x.name !== pat.name));
  const spice = w >= 0.3 && rng.chance(0.3 + w);
  const second = plan.slice(4).some((v) => v === 'B' || v === 'C') && rng.chance(0.6);

  const bar16 = (x: Pattern) => {
    const a = strokes(x.p);
    if (spice && x.spice) for (let i = 0; i < 16; i++) if (x.spice[i] !== '.') a[i] = x.spice[i] as Stroke;
    return a;
  };
  const byMeter: Record<string, { A: Stroke[]; B: Stroke[] }> = {};
  for (const [m, gr] of Object.entries(groupsFor)) {
    const len = gr.reduce((a, b) => a + b, 0);
    byMeter[m] = len === 16 && gr.length === 4
      ? { A: bar16(pat), B: bar16(lift) }
      : { A: groupPattern(rng, len, gr, genre), B: groupPattern(rng, len, gr, genre) };
  }
  const strum = bars.flatMap((b, i) => [...byMeter[b.meter][i >= 4 && second ? 'B' : 'A']]);

  // very weird ideas: the odd stroke moves
  if (w > 0.6) for (let i = 1; i < total; i++) if (rng.chance((w - 0.6) * 0.3)) strum[i] = strum[i] === '.' ? rng.pick<Stroke>(['D', 'U', 'x']) : '.';

  for (const c of song.cycles) {
    if (c.part !== 'strum') continue;
    const cyc: Stroke[] = ['D', ...Array.from({ length: c.len - 1 }, () => rng.pick<Stroke>(['.', '.', 'x', 'U', 'D']))];
    for (let s = 0; s < total; s++) strum[s] = cyc[s % c.len];
  }

  // every chord change should be heard
  for (const e of chords.timeline) if (strum[e.step] === '.' || strum[e.step] === 'x') strum[e.step] = 'D';
  const fourFour = bars.some((b) => b.len === 16 && b.groups.length === 4);
  const name = !fourFour || song.cycles.some((c) => c.part === 'strum') ? null : second && lift.name !== pat.name ? `${pat.name}, then ${lift.name}` : pat.name;
  return { strum, name };
}

/**
 * Strokes as a strumming hand plays them: the hand moves down on the beat and 8ths and up in between,
 * so a chord between two 8ths is an up-strum (lighter, top strings), and one on a beat is a down-strum.
 * Patterns and the band pass (which strums with the kick) can leave full downstrokes on 16ths, which
 * sounds mechanical. Palm mutes and scratches stay as they are. Changes the lane in place.
 */
export function naturalStrokes(song: Song, strum: Stroke[]) {
  for (const b of song.bars) {
    for (let i = 0; i < b.len; i++) {
      const g = b.start + i;
      if (i % 2 === 1 && strum[g] === 'D') strum[g] = 'U';
      else if (i % 4 === 0 && strum[g] === 'U') strum[g] = 'D';
    }
  }
}
