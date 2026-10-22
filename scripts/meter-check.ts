// Meter check for the verse melody writer: does the line still sit right in 3/4, 6/8, 5/4, 7/8... and in songs that change meter?
// Every meter is written for N songs (all genres, real tracks from the generator, the mood notes on) and per meter we print:
//   - crashes and the rules that must hold (nothing overlaps, nothing past the end)
//   - bar lines: how many of the song's real bar starts the writer's bar grid (barOf) misses (only mixed meters can)
//   - notes crossing a real bar line (a long note over the line is fine now and then; many is a sign of a drifting grid)
//   - note starts: on a bar's first beat, on a beat group's start (the real accents), on a chord change
//   - chord tones: share of notes that are the sounding chord's root, 3rd or 5th at the note's start
//   npm run meter-check          (N=28 songs per meter)
//   N=70 npm run meter-check

import { MAIN_GUITARS, generate } from '../src/generator';
import { buildTrack, defaultTrackOptions } from '../src/track';
import { MOODS, type Mood } from '../src/tension';
import { emoOn } from '../src/verse/emotion';
import { writeSong, songOptions } from '../src/verse/sing';
import { barOf, kindOf } from '../src/verse/section';
import { fifth, third } from '../src/verse/verse';
import { groupStarts } from '../src/rhythm';

const N = Number(process.env.N ?? 28);
const GENRES = ['rock', 'pop', 'funk', 'hardrock', 'metal', 'grunge', 'altmetal'];
const METERS = (process.env.METERS ?? '4/4,3/4,6/8,5/4,5/8,7/8,9/8,7/4,11/8,mixed').split(',');

interface Acc { songs: number; crashes: number; broken: number; bars: number; barMiss: number; notes: number; cross: number; onBar: number; onGroup: number; onChange: number; chordTone: number; barLens: Set<number>; err: string }
const mk = (): Acc => ({ songs: 0, crashes: 0, broken: 0, bars: 0, barMiss: 0, notes: 0, cross: 0, onBar: 0, onGroup: 0, onChange: 0, chordTone: 0, barLens: new Set(), err: '' });
const rows: Record<string, Acc> = {};

for (const meter of METERS) {
  const a = (rows[meter] = mk());
  for (let i = 0; i < N; i++) {
    const genre = GENRES[i % 7], mood = MOODS[i % MOODS.length] as Mood, s = `mc-${meter}-${i}-${genre}`;
    try {
      const idea = generate({ genre, meter, weirdness: meter === 'mixed' ? 0.9 : 0.3, ...MAIN_GUITARS } as never, { song: s, chords: s + 'c', drums: s + 'd', strum: s + 's', bass: s + 'b', vocal: s + 'v' } as never);
      const list = buildTrack(idea, { ...defaultTrackOptions(idea) } as never).sections;
      const song = writeSong(list, songOptions(s + 'v', 0, { mood, on: emoOn(), climax: list[list.length - 2] }));
      a.songs++;
      for (const sec of list) {
        const v = song.get(sec);
        if (!v) continue;
        const total = sec.chords.timeline.length ? sec.chords.chordIdx.length : 0, bars = sec.song.bars, bar = barOf(sec), key = sec.song.key;
        const ns = v.built.notes, chords = sec.chords.timeline;
        for (const b of bars) a.barLens.add(b.len);
        for (let k = 1; k < ns.length; k++) if (ns[k].step < ns[k - 1].step + ns[k - 1].len - 1e-6) a.broken++;
        if (ns.some((n) => n.step + n.len > total + 1e-6)) a.broken++;
        // bar lines: the real ones against the writer's grid
        for (const b of bars) { a.bars++; if (Math.abs(b.start / bar - Math.round(b.start / bar)) > 1e-6) a.barMiss++; }
        const starts = bars.map((b) => b.start), accents = new Set(bars.flatMap((b) => groupStarts(b.groups).map((g) => b.start + g)));
        const changes = new Set(chords.map((e) => e.step));
        for (const n of ns) {
          a.notes++;
          if (starts.some((st) => n.step < st - 1e-6 && n.step + n.len > st + 1e-6)) a.cross++;
          if (starts.some((st) => Math.abs(n.step - st) < 1e-6)) a.onBar++;
          if (accents.has(Math.round(n.step))) a.onGroup++;
          if (changes.has(Math.round(n.step))) a.onChange++;
          const e = [...chords].reverse().find((c) => c.step <= Math.floor(n.step + 1e-6));
          if (e && [0, third(e.chord), fifth(e.chord)].some((x) => (key + e.chord.root + x) % 12 === ((n.midi % 12) + 12) % 12)) a.chordTone++;
        }
        void kindOf;
      }
    } catch (e) { a.crashes++; a.err ||= String((e as Error).stack ?? e).split('\n').slice(0, 3).join(' | '); }
  }
}

const pc = (x: number, t: number) => (t ? ((100 * x) / t).toFixed(0).padStart(3) + '%' : '   -');
console.log(`${N} songs per meter, mood notes on\n`);
console.log('meter  | songs crash | bar lengths     | bar-line misses | rules broken | notes over a bar line | on bar start | on beat group | on chord change | chord tones');
for (const m of METERS) {
  const a = rows[m];
  console.log(`${m.padEnd(6)} | ${String(a.songs).padStart(5)} ${String(a.crashes).padStart(5)} | ${[...a.barLens].sort((x, y) => x - y).join(',').padEnd(15)} | ${pc(a.barMiss, a.bars).padStart(8)} ${String(a.barMiss).padStart(5)} | ${String(a.broken).padStart(12)} | ${pc(a.cross, a.notes).padStart(21)} | ${pc(a.onBar, a.notes).padStart(12)} | ${pc(a.onGroup, a.notes).padStart(13)} | ${pc(a.onChange, a.notes).padStart(15)} | ${pc(a.chordTone, a.notes)}`);
  if (a.err) console.log('        first crash:', a.err);
}
if (Object.values(rows).some((a) => a.crashes || a.broken)) process.exitCode = 1;
