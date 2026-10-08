// Makes the band play together. A last pass over an idea's parts, once they're all written:
// - pushes: when a chord change comes an 8th early, kick, bass and guitar all push with it
//   and let the downbeat ring (tied), with the crash on the push
// - the strummed guitar hits with the kick's syncopations (rock, pop)
// - drum fills: the band holds a chord under the fill, or plays the fill's rhythm with it
// - Guitar 2 lays out under fills

import type { ChordPart, DrumPart, GuitarHit, Song, Stroke } from '../idea';
import type { Rng } from '../rng';
import { groupStarts } from '../rhythm';
import { type Chord, chordPc } from '../theory';

const bassRoot = (key: number, c: Chord) => {
  let m = 36 + chordPc(key, c);
  if (m > 43) m -= 12;
  return m;
};

/** Strummed genres: strum, bass and drums react to each other. Returns notes for the idea. */
export function lockBand(
  rng: Rng, song: Song, chords: ChordPart, drums: DrumPart, strum: Stroke[], bass: number[],
): string[] {
  const { bars, key, total } = song;
  const genre = song.partGenres.strum;
  const notes: string[] = [];
  const barStarts = new Set(bars.map((b) => b.start));
  const beats = new Set(bars.flatMap((b) => groupStarts(b.groups).map((p) => b.start + p)));
  const chordAt = (g: number) => chords.timeline[chords.chordIdx[Math.min(g, total - 1)]].chord;

  // pushes: a chord change an 8th (or 16th) before the bar line
  let pushes = 0;
  for (const e of chords.timeline) {
    const down = e.step + (barStarts.has(e.step + 2) ? 2 : barStarts.has(e.step + 1) ? 1 : 0);
    if (down === e.step || down >= total) continue;
    pushes++;
    drums.kick[e.step] = Math.max(drums.kick[e.step], 0.9);
    drums.snare[e.step] = 0;
    if (drums.crash[down]) {
      drums.crash[e.step] = drums.crash[down];
      drums.crash[down] = 0;
      drums.hat[e.step] = 0; drums.ride[e.step] = 0;
    }
    // tied over the bar line: nobody re-hits the downbeat
    drums.kick[down] = 0;
    if (strum[down] === 'D' || strum[down] === 'U') strum[down] = '.';
    bass[down] = 0;
    strum[e.step] = 'D';
    bass[e.step] = bassRoot(key, e.chord);
  }
  if (pushes) notes.push('Pushes: the whole band hits chord changes an 8th early and ties over the bar line');

  // the guitar hits with the kick when it plays off the beat
  if (genre === 'rock' || genre === 'pop') {
    let n = 0;
    for (let g = 0; g < total; g++) {
      if (drums.kick[g] && !beats.has(g) && strum[g] === '.') { strum[g] = 'D'; n++; }
    }
    if (n) notes.push('Guitar strikes with the off-beat kicks');
  }

  // drum fills: hold a chord under them, or play their rhythm together
  let holds = 0, unisons = 0;
  for (const f of drums.fills) {
    const bar = bars[f.bar];
    const end = bar.start + bar.len, from = end - f.len;
    const changes = new Set(chords.timeline.map((e) => e.step).filter((s) => s >= from && s < end));
    const unison = genre !== 'funk' && rng.chance(0.4);
    for (let g = from; g < end; g++) {
      const hitHere = unison
        ? g % 2 === 0 && (drums.snare[g] >= 0.5 || drums.tom[g] > 0 || drums.kick[g] > 0)
        : g === from;
      const on = hitHere || changes.has(g);
      strum[g] = on ? 'D' : '.';
      bass[g] = on ? bassRoot(key, chordAt(g)) : 0;
    }
    if (unison) unisons++; else holds++;
  }
  if (unisons) notes.push('Guitar and bass hit the drum fill\'s rhythm with the drums');
  if (holds) notes.push('Guitar and bass hold a chord under the drum fills');
  return notes;
}

/** Guitar 2 doesn't play over drum fills (a note held into the fill keeps ringing). */
export function clearFills(song: Song, drums: DrumPart, hits: GuitarHit[]): GuitarHit[] {
  const regions = drums.fills.map((f) => {
    const bar = song.bars[f.bar];
    return [bar.start + bar.len - f.len, bar.start + bar.len] as const;
  });
  return hits.filter((h) => !regions.some(([a, b]) => h.step >= a && h.step < b));
}

type Habit = 'hold' | 'stop' | 'none';

/**
 * The end of the first phrase (bar 4), played together: the guitar and bass either hold one chord
 * through the bar (space for the drums' answer), or stop on the last beat with a choke. Chosen once
 * per idea; skipped where the drums fill or the band pushes into bar 5. Returns a note, if any.
 */
export function phraseEnd(
  rng: Rng, song: Song, chords: ChordPart, drums: DrumPart, strum: Stroke[], bass: number[], lens: number[],
): string | null {
  const genre = song.partGenres.strum;
  const habit = rng.weighted<Habit>(genre === 'funk' ? [['stop', 2], ['none', 2], ['hold', 1]] : genre === 'pop' ? [['hold', 3], ['stop', 1], ['none', 1]] : [['hold', 3], ['stop', 2], ['none', 1]]);
  const bar = song.bars[3];
  if (!bar || habit === 'none' || drums.fills.some((f) => f.bar === 3)) return null;
  const a = bar.start, b = a + bar.len;
  const st = groupStarts(bar.groups);
  const s0 = a + st[st.length - 1];
  const changes = chords.timeline.map((e) => e.step).filter((s) => s > a && s < b);
  const root = (g: number) => bassRoot(song.key, chords.timeline[chords.chordIdx[g]].chord);
  if (habit === 'hold') {
    // a chord pushed into the bar from the one before stays tied (not struck again on the downbeat)
    const tied = chords.timeline.some((e) => e.step === a - 1 || e.step === a - 2);
    const hits = [...(tied ? [] : [a]), ...changes];
    for (let g = a; g < b; g++) { strum[g] = '.'; bass[g] = 0; lens[g] = 0; }
    hits.forEach((g, i) => {
      strum[g] = 'D';
      bass[g] = root(g);
      lens[g] = (hits[i + 1] ?? b) - g;
    });
    return 'End of the first phrase: guitar and bass hold one chord while the drums answer';
  }
  // stop: not if the band pushes a chord change in the last beat
  if (changes.some((c) => c >= s0)) return null;
  strum[s0] = 'x';
  for (let g = s0 + 1; g < b; g++) strum[g] = '.';
  for (let g = s0; g < b; g++) { bass[g] = 0; lens[g] = 0; }
  for (let g = s0 - 1; g >= a; g--) {
    if (!bass[g]) continue;
    lens[g] = Math.min(lens[g] || s0 - g, s0 - g);
    break;
  }
  return 'End of the first phrase: guitar and bass stop on the last beat, the drums answer';
}
