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
interface Pattern { name: string; p: string; spice?: string; /** How busy, for the real mix: 0 held chords, 1 quarters or stabs, 2 8ths, 3 16ths. */ c?: 0 | 1 | 2 | 3 }

const PATTERNS: Record<'rock' | 'pop' | 'funk', [Pattern, number][]> = {
  rock: [
    [{ name: 'down, down-up', p: 'D...D.U...U.D.U.', spice: '........D.......' }, 3],
    [{ name: 'hit and let ring', p: 'D.......D.....U.' }, 2],
    [{ name: 'driving 8ths', p: 'D.D.D.D.D.D.D.D.' }, 2],
    [{ name: 'palm-muted chug, open on the beat', p: 'D.p.p.p.D.p.p.p.', spice: '..............D.' }, 2],
    [{ name: 'push on the and of 2', p: 'D.....D.....D.U.' }, 2],
    [{ name: 'accents and a choke', p: 'D..D..D...D.x...' }, 1],
    // Malcolm Young: mostly downs, stabs with space between them
    [{ name: 'stabs and space', p: 'D.....D...D.....', spice: '..............D.' }, 1.5],
    [{ name: 'the old faithful', p: 'D.D.U.U.D.U.D.U.' }, 1.5],
  ],
  pop: [
    [{ name: 'down, down-up', p: 'D...D.U...U.D.U.', spice: '..U.............' }, 3],
    [{ name: 'quarter strums', p: 'D...D...D...D...', spice: '..............U.' }, 2],
    [{ name: '3-3-2 strum', p: 'D..D..D.D...D.U.' }, 2],
    [{ name: 'let it ring, then 8ths', p: 'D.......D.U.D.U.' }, 2],
    [{ name: 'half notes', p: 'D.......D.......', spice: '......U.........' }, 1],
    [{ name: 'muted backbeat', p: 'D...x.U.D.U.x.U.' }, 1],
    [{ name: 'island strum', p: 'D...D.U...U.D.U.', spice: '.............U..' }, 1.5],
    [{ name: 'tresillo on 16ths', p: 'D..D..D.D..D..D.' }, 1],
    [{ name: 'folk 16ths', p: 'D..UD.U..UD.D.U.' }, 1],
  ],
  funk: [
    [{ name: '16th scratch groove', p: 'D.xUx.xUD.xUx.xU' }, 2],
    [{ name: 'off-beat stabs', p: '..D...D.x.D...D.', spice: '.............U..' }, 2],
    [{ name: 'chank on 2 and 4 with scratches', p: 'x.x.D.x.x.x.D.x.' }, 2],
    [{ name: 'syncopated stabs', p: 'D..D..x.x.D..D..' }, 2],
    // Nile Rodgers: the hand never stops, a few strums ring out of the scratching
    [{ name: 'chucking 16ths', p: 'x.xDx.D.x.xDx.D.' }, 2],
    [{ name: 'chicken scratch', p: 'xUx.D.xUx.xUD.x.' }, 1],
  ],
};

/**
 * The real mix (docs/STUDY-RHYTHM.md): the library widened to what the guitar does in real songs: held
 * chords, quarter-note strums and backbeat chops, 8ths in their many shapes, 16th strums, sparse stabs.
 * Weights follow the shares measured in the Lakh MIDI collection per genre (chord parts only); the
 * rhythms are 1-bar shapes found in 40+ real songs. `c`: how busy (0 held, 1 quarters or stabs, 2 8ths, 3 16ths).
 */
const MIX: Record<'rock' | 'pop' | 'funk', [Pattern, number][]> = {
  rock: [
    // held chords (about 9%)
    [{ name: 'whole-note chords', p: 'D...............', spice: '..............U.', c: 0 }, 5],
    [{ name: 'hit and let ring', p: 'D.......D.....U.', c: 0 }, 3],
    [{ name: 'a chord on beat 3', p: '........D.......', spice: '..............U.', c: 0 }, 1.5],
    [{ name: 'a push into the next bar', p: 'D.............D.', c: 0 }, 2],
    // quarters and stabs (about 25%)
    [{ name: 'quarter strums', p: 'D...D...D...D...', spice: '..............U.', c: 1 }, 7],
    [{ name: 'quarters with a 16th push', p: 'D...D...D...D..U', c: 1 }, 4],
    [{ name: 'backbeat chops', p: '....D.......D...', c: 1 }, 3],
    [{ name: 'beats 2, 3 and 4', p: '....D...D...D...', c: 1 }, 2],
    [{ name: 'quarters, then 8ths', p: 'D...D...D.D.D.D.', c: 1 }, 4],
    [{ name: 'stabs and space', p: 'D.....D...D.....', spice: '..............D.', c: 1 }, 2.5],
    [{ name: 'two stabs', p: 'D.....D.........', c: 1 }, 1.5],
    [{ name: 'accents and a choke', p: 'D..D..D...D.x...', c: 1 }, 1.5],
    // 8ths (about 45%)
    [{ name: 'down, down-up', p: 'D...D.U...U.D.U.', spice: '........D.......', c: 2 }, 7],
    [{ name: 'driving 8ths', p: 'D.D.D.D.D.D.D.D.', c: 2 }, 6],
    [{ name: 'driving 8ths, 16th push', p: 'D.D.D.DUD.D.D.DU', c: 2 }, 5],
    [{ name: 'a beat, then 8ths', p: 'D...D.D.D.D.D.D.', c: 2 }, 4],
    [{ name: '8ths from the and of 1', p: '..D.D.D.D.D.D.D.', c: 2 }, 2],
    [{ name: '8ths with a gap on beat 3', p: 'D.D.D.D...D.D.D.', c: 2 }, 2],
    [{ name: '8ths, the last beat open', p: 'D.D.D.D.D.D.D...', c: 2 }, 2.5],
    [{ name: 'push on the and of 2', p: 'D.....D.....D.U.', c: 2 }, 3],
    [{ name: 'the old faithful', p: 'D.D.U.U.D.U.D.U.', c: 2 }, 3],
    [{ name: 'palm-muted chug, open on the beat', p: 'D.p.p.p.D.p.p.p.', spice: '..............D.', c: 2 }, 4],
    // 16ths (about 13%)
    [{ name: 'steady 16ths', p: 'DUDUDUDUDUDUDUDU', c: 3 }, 7],
    [{ name: '16th push before every beat', p: 'D..UD..UD..UD..U', c: 3 }, 4],
    [{ name: 'ghosted 16ths', p: 'DxUxDxUxDxUxDxUx', c: 3 }, 3],
    [{ name: 'down-up, a gap, up', p: 'DU.UDU.UDU.UDU.U', c: 3 }, 2.5],
  ],
  pop: [
    [{ name: 'whole-note chords', p: 'D...............', spice: '..............U.', c: 0 }, 6],
    [{ name: 'half notes', p: 'D.......D.......', spice: '......U.........', c: 0 }, 3.5],
    [{ name: 'let it ring, then 8ths', p: 'D.......D.U.D.U.', c: 0 }, 2.5],
    [{ name: 'a chord on beat 3', p: '........D.......', c: 0 }, 1.5],
    [{ name: 'a push into the next bar', p: 'D.............D.', c: 0 }, 1.5],
    [{ name: 'quarter strums', p: 'D...D...D...D...', spice: '..............U.', c: 1 }, 8],
    [{ name: 'quarters with a 16th push', p: 'D...D...D...D..U', c: 1 }, 4],
    [{ name: 'backbeat chops', p: '....D.......D...', c: 1 }, 4],
    [{ name: 'quarters, then 8ths', p: 'D...D...D.D.D.D.', c: 1 }, 3],
    [{ name: 'a stab on 2 and the and of 3', p: '....D.....D.....', c: 1 }, 2],
    [{ name: 'muted backbeat', p: 'D...x.U.D.U.x.U.', c: 2 }, 1.5],
    [{ name: 'down, down-up', p: 'D...D.U...U.D.U.', spice: '..U.............', c: 2 }, 6],
    [{ name: 'island strum', p: 'D...D.U...U.D.U.', spice: '.............U..', c: 2 }, 2],
    [{ name: '3-3-2 strum', p: 'D..D..D.D...D.U.', c: 2 }, 2],
    [{ name: 'a beat, then 8ths', p: 'D...D.D.D.D.D.D.', c: 2 }, 3],
    [{ name: '8ths from the and of 1', p: '..D.D.D.D.D.D.D.', c: 2 }, 2],
    [{ name: '8ths, the last beat open', p: 'D.D.D.D.D.D.D...', c: 2 }, 2.5],
    [{ name: 'driving 8ths, 16th push', p: 'D.D.D.DUD.D.D.DU', c: 2 }, 3],
    [{ name: 'tresillo on 16ths', p: 'D..D..D.D..D..D.', c: 3 }, 3],
    [{ name: 'folk 16ths', p: 'D..UD.U..UD.D.U.', c: 3 }, 3],
    [{ name: '16th push before every beat', p: 'D..UD..UD..UD..U', c: 3 }, 4],
    [{ name: 'steady 16ths', p: 'DUDUDUDUDUDUDUDU', c: 3 }, 7],
    [{ name: 'down-up, a gap, up', p: 'DU.UDU.UDU.UDU.U', c: 3 }, 3],
    [{ name: 'ghosted 16ths', p: 'DxUxDxUxDxUxDxUx', c: 3 }, 3],
  ],
  funk: [
    [{ name: '16th scratch groove', p: 'D.xUx.xUD.xUx.xU', c: 3 }, 3],
    [{ name: 'off-beat stabs', p: '..D...D.x.D...D.', spice: '.............U..', c: 1 }, 2],
    [{ name: 'chank on 2 and 4 with scratches', p: 'x.x.D.x.x.x.D.x.', c: 1 }, 2],
    [{ name: 'syncopated stabs', p: 'D..D..x.x.D..D..', c: 2 }, 2],
    [{ name: 'chucking 16ths', p: 'x.xDx.D.x.xDx.D.', c: 3 }, 2.5],
    [{ name: 'chicken scratch', p: 'xUx.D.xUx.xUD.x.', c: 3 }, 1.5],
    [{ name: 'backbeat chops', p: '....D.......D...', c: 1 }, 1.5],
    [{ name: 'a long chord and a stab', p: 'D.........D.....', c: 0 }, 1],
    [{ name: 'quarter strums', p: 'D...D...D...D...', c: 1 }, 1],
    [{ name: 'driving 8ths, 16th push', p: 'D.D.D.DUD.D.D.DU', c: 2 }, 1.5],
    [{ name: '16th push before every beat', p: 'D..UD..UD..UD..U', c: 3 }, 2],
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
export function generateStrum(rng: Rng, song: Song, chords: ChordPart, mix = false): { strum: Stroke[]; name: string | null } {
  const { w, bars, total, groupsFor, plan } = song;
  const g = song.partGenres.strum;
  // riff genres only strum when borrowed into another genre: treat them as rock
  const genre = GENRES[g].riff ? 'rock' : (g as 'rock' | 'pop' | 'funk');
  const lib = mix ? MIX[genre] : PATTERNS[genre];
  const pat = rng.weighted(lib);
  // the second half can lift to a sibling pattern (when the song's plan has a B section); in the real
  // mix one of about the same busyness (a held chord doesn't jump to 16ths)
  const lift = rng.weighted(lib.filter(([x]) => x.name !== pat.name && (!mix || Math.abs((x.c ?? 2) - (pat.c ?? 2)) <= 1)));
  const spice = w >= 0.3 && rng.chance(0.3 + w);
  const second = plan.slice(4).some((v) => v === 'B' || v === 'C') && rng.chance(0.6);
  // how this player phrases the pattern: as written, with a breath before the next bar (the last
  // stroke left out), or a choke on the last off-beat; so two takes of one pattern still differ
  const touch = rng.weighted<'plain' | 'breath' | 'choke'>([['plain', 2], ['breath', 1], ['choke', 1]]);

  const bar16 = (x: Pattern) => {
    const a = strokes(x.p);
    if (spice && x.spice) for (let i = 0; i < 16; i++) if (x.spice[i] !== '.') a[i] = x.spice[i] as Stroke;
    if (touch === 'breath') { for (let i = 15; i >= 13; i--) if (a[i] !== '.') { a[i] = '.'; break; } }
    if (touch === 'choke' && a[14] === '.' && a[15] === '.') a[14] = 'x';
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
    // where the hand moves in 16ths (a 16th struck either side), an 8th is a down-strum again: two
    // up-strums in a row can't happen
    for (let i = 2; i < b.len; i += 2) {
      const g = b.start + i;
      if (strum[g] === 'U' && (strum[g - 1] !== '.' || (i + 1 < b.len && strum[g + 1] !== '.'))) strum[g] = 'D';
    }
  }
}

/**
 * Where a chord carries on into the next bar, the strumming can carry on too instead of starting the
 * pattern again: the downbeat tied over (the last strum keeps ringing), or the first half of the bar
 * left to ring and the pattern picking up halfway. Once per idea (a player's habit). Returns a note.
 */
export function carryOver(rng: Rng, song: Song, chords: ChordPart, strum: Stroke[]): string | null {
  const habit = rng.weighted<'restrike' | 'tie' | 'ring'>([['restrike', 2], ['tie', 2], ['ring', 1]]);
  if (habit === 'restrike') return null;
  let done = false;
  song.bars.forEach((bar, bi) => {
    const a = bar.start;
    if (bi === 0 || chords.chordIdx[a] !== chords.chordIdx[a - 1]) return;
    // something has to be ringing into the bar: an open strum in the last beat before it
    const prev = song.bars[bi - 1];
    let last = -1;
    for (let g = a - 1; g >= prev.start + prev.len - prev.groups[prev.groups.length - 1]; g--) if (strum[g] !== '.') { last = g; break; }
    if (last < 0 || strum[last] === 'x' || strum[last] === 'p') return;
    const until = habit === 'tie' ? a + 2 : a + (groupStarts(bar.groups)[Math.ceil(bar.groups.length / 2)] ?? bar.len);
    for (let g = a; g < until; g++) if (chords.chordIdx[g] === chords.chordIdx[a]) strum[g] = '.';
    done = true;
  });
  if (!done) return null;
  return habit === 'tie' ? 'Strumming: tied over the bar line where a chord carries on' : 'Strumming: a chord that carries on is left ringing into the next bar, the pattern picks up halfway';
}

type Turn = 'fill' | 'quarters' | 'stop' | 'pickup' | 'same';
const TURN_DESC: Record<Exclude<Turn, 'same'>, string> = {
  fill: '16th strums through the last beat',
  quarters: 'quarter notes through the last two beats',
  stop: 'a hit and a choke on the last beat',
  pickup: 'an 8th of down-up leading over the bar line',
};

/**
 * A player doesn't loop one bar like a sequencer: the pattern stays (about three bars in four as
 * written) but the second and third bars of each four-bar phrase can change a stroke or two (an
 * up-strum added or left out, a strum on the backbeat choked, one moved a 16th), and the fourth bar
 * turns the phrase around, the player's way. 4/4 bars only. Changes the lane in place; returns a note.
 */
export function developStrum(rng: Rng, song: Song, chords: ChordPart, strum: Stroke[]): string | null {
  const g = song.partGenres.strum;
  const genre = GENRES[g].riff ? 'rock' : (g as 'rock' | 'pop' | 'funk');
  if (song.cycles.some((c) => c.part === 'strum')) return null;
  const changes = new Set(chords.timeline.map((t) => t.step));
  const rate = { rock: 0.3, pop: 0.3, funk: 0.45 }[genre] + song.w * 0.2;
  const turn = rng.weighted<Turn>(genre === 'funk' ? [['fill', 1], ['stop', 2], ['same', 2]]
    : genre === 'pop' ? [['fill', 1], ['quarters', 1], ['pickup', 2], ['same', 2]]
      : [['fill', 2], ['quarters', 1], ['stop', 2], ['pickup', 1], ['same', 1.5]]);
  let varied = 0, turned = 0;
  song.bars.forEach((bar, bi) => {
    if (bar.len !== 16 || bar.groups.length !== 4) return;
    const a = bar.start;
    const free = (j: number) => !changes.has(a + j) && j > 0;
    const k = bi % 4;
    if ((k === 1 || k === 2) && rng.chance(rate)) {
      const kind = rng.weighted<'drop' | 'add' | 'chuck' | 'shift'>([['drop', 2], ['add', 2], ['chuck', genre === 'funk' ? 0 : 1], ['shift', 1]]);
      const hits = Array.from({ length: 16 }, (_, j) => j).filter((j) => strum[a + j] !== '.' && free(j));
      const gaps = Array.from({ length: 16 }, (_, j) => j).filter((j) => strum[a + j] === '.' && free(j));
      if (kind === 'drop') {
        const off = hits.filter((j) => j % 4 !== 0);
        if (off.length > 1) { strum[a + rng.pick(off)] = '.'; varied++; }
      } else if (kind === 'add') {
        // an up-strum in a gap, the hand already moving
        const odd = gaps.filter((j) => j % 2 === 1 && strum[a + j - 1] !== '.');
        const pool = odd.length ? odd : gaps.filter((j) => j % 2 === 0 && j % 4 !== 0);
        if (pool.length) { strum[a + rng.pick(pool)] = 'U'; varied++; }
      } else if (kind === 'chuck') {
        const back = [4, 12].filter((j) => strum[a + j] === 'D' && free(j));
        if (back.length) { strum[a + rng.pick(back)] = 'x'; varied++; }
      } else {
        const off = hits.filter((j) => j % 4 !== 0 && j < 15);
        const j = off.length ? rng.pick(off) : -1;
        const to = j < 0 ? -1 : rng.pick([j - 1, j + 1]);
        if (to > 0 && to < 16 && strum[a + to] === '.' && free(to)) { strum[a + to] = strum[a + j]; strum[a + j] = '.'; varied++; }
      }
    }
    if (k === 3 && turn !== 'same' && bi < song.bars.length - 1) {
      // (the turn stays clear of a chord change in the bar's second half)
      for (let j = 8; j < 16; j++) if (changes.has(a + j)) return;
      if (turn === 'fill') { strum[a + 12] = 'D'; strum[a + 13] = 'U'; strum[a + 14] = 'D'; strum[a + 15] = 'U'; }
      else if (turn === 'quarters') for (let j = 8; j < 16; j++) strum[a + j] = j % 4 === 0 ? 'D' : '.';
      else if (turn === 'stop') { strum[a + 12] = 'D'; strum[a + 13] = '.'; strum[a + 14] = 'x'; strum[a + 15] = '.'; }
      else { strum[a + 14] = 'D'; strum[a + 15] = 'U'; }
      turned++;
    }
  });
  if (!varied && !turned) return null;
  return `Strumming: ${varied ? 'small changes from bar to bar' : 'the pattern as written'}${turned ? `, and ${TURN_DESC[turn as Exclude<Turn, 'same'>]} at the end of each phrase` : ''}`;
}
