// Meter check for the verse melody writer: does the line still sit right in 3/4, 6/8, 5/4, 7/8... and in songs that change meter?
// Every meter is written for N songs (all genres, real tracks from the generator, the mood notes on) and per meter we print:
//   - crashes and the rules that must hold (nothing overlaps, nothing past the end)
//   - bar lines: how many of the song's real bar starts an equal-bars grid (the old one: barOf) misses (only mixed meters can), and whether the writer's
//     own grid (songGrid) has every real bar and ends where the section ends, and the writer gives each real bar its chord-note label
//   - notes crossing a real bar line (a long note over the line is fine now and then; many is a sign of a drifting grid)
//   - note starts: on a bar's first beat, on a beat group's start (the real accents), on a chord change
//   - chord tones: share of notes that are the sounding chord's root, 3rd or 5th at the note's start
//   - phrasing: phrases starting and ending on a beat group's start, and the held endings that start on one (a syncopated one is allowed, a few)
//   npm run meter-check          (N=28 songs per meter)
//   N=70 npm run meter-check

import { MAIN_GUITARS, generate } from '../src/generator';
import { buildTrack, defaultTrackOptions } from '../src/track';
import { MOODS, type Mood } from '../src/tension';
import { emoOn } from '../src/verse/emotion';
import { writeSong, songOptions } from '../src/verse/sing';
import { barOf, songGrid } from '../src/verse/section';
import { fifth, third } from '../src/verse/verse';
import { groupStarts } from '../src/rhythm';
import { shortLen } from '../src/verse/longer';

const N = Number(process.env.N ?? 28);
const GENRES = ['rock', 'pop', 'funk', 'hardrock', 'metal', 'grunge', 'altmetal'];
const METERS = (process.env.METERS ?? '4/4,3/4,6/8,5/4,5/8,7/8,9/8,7/4,11/8,mixed').split(',');

interface Acc { songs: number; crashes: number; broken: number; bars: number; barMiss: number; gridOff: number; labelsOff: number; notes: number; cross: number; onBar: number; onGroup: number; onChange: number; chordTone: number; phrases: number; phStart: number; phEnd: number; endings: number; endOnBeat: number; longs: number; longEndOk: number; fractional: number; short: number; barLens: Set<number>; err: string }
const mk = (): Acc => ({ songs: 0, crashes: 0, broken: 0, bars: 0, barMiss: 0, gridOff: 0, labelsOff: 0, notes: 0, cross: 0, onBar: 0, onGroup: 0, onChange: 0, chordTone: 0, phrases: 0, phStart: 0, phEnd: 0, endings: 0, endOnBeat: 0, longs: 0, longEndOk: 0, fractional: 0, short: 0, barLens: new Set(), err: '' });
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
        // the writer's grid: every real bar, ending where the section ends; one chord-note label per real bar
        const G = songGrid(sec);
        if (G.count !== bars.length || Math.abs(G.end(bars.length - 1) - total) > 1e-6) a.gridOff++;
        if (v.built.bars.length !== bars.length) a.labelsOff++;
        // bar lines: the real ones against an equal-bars grid
        for (const b of bars) { a.bars++; if (Math.abs(b.start / bar - Math.round(b.start / bar)) > 1e-6) a.barMiss++; }
        const starts = bars.map((b) => b.start), accents = new Set(bars.flatMap((b) => groupStarts(b.groups).map((g) => b.start + g)));
        const changes = new Set(chords.map((e) => e.step));
        // (beats and half beats of the real bars: where a long note may end)
        const halves = new Set(bars.flatMap((b) => { let p = b.start; return b.groups.map((g) => { const h = Math.round(p + g / 2); p += g; return h; }); }));
        for (const ph of v.built.phrases) {
          a.phrases++;
          if (accents.has(Math.round(ph.step))) a.phStart++;
          if (accents.has(Math.round(ph.step + ph.len)) || Math.abs(ph.step + ph.len - total) < 1e-6) a.phEnd++;
        }
        for (const n of ns) {
          if (n.end && n.len >= 2) { a.endings++; if (accents.has(Math.round(n.step))) a.endOnBeat++; }
          a.notes++;
          if (!n.third && (Math.abs(n.step - Math.round(n.step)) > 1e-6 || Math.abs(n.len - Math.round(n.len)) > 1e-6)) a.fractional++;
          if (n.len <= shortLen(G) + 1e-9) a.short++;
          if (n.len >= 4 && !n.third) { a.longs++; const e = Math.round(n.step + n.len); if (accents.has(e) || halves.has(e) || Math.abs(n.step + n.len - total) < 1e-6) a.longEndOk++; }
          if (starts.some((st) => n.step < st - 1e-6 && n.step + n.len > st + 1e-6)) a.cross++;
          if (starts.some((st) => Math.abs(n.step - st) < 1e-6)) a.onBar++;
          if (accents.has(Math.round(n.step))) a.onGroup++;
          if (changes.has(Math.round(n.step))) a.onChange++;
          const e = [...chords].reverse().find((c) => c.step <= Math.floor(n.step + 1e-6));
          if (e && [0, third(e.chord), fifth(e.chord)].some((x) => (key + e.chord.root + x) % 12 === ((n.midi % 12) + 12) % 12)) a.chordTone++;
        }
      }
    } catch (e) { a.crashes++; a.err ||= String((e as Error).stack ?? e).split('\n').slice(0, 3).join(' | '); }
  }
}

const pc = (x: number, t: number) => (t ? ((100 * x) / t).toFixed(0).padStart(3) + '%' : '   -');
console.log(`${N} songs per meter, mood notes on\n`);
console.log('meter  | songs crash | bar lengths     | old-grid misses | grid / labels off | rules broken | notes over a bar line | on bar start | on beat group | on chord change | chord tones | phrases start on a beat | phrases end on a beat | held endings start on a beat | long notes end on a beat or half | notes on a half step | short notes (8th or less)');
for (const m of METERS) {
  const a = rows[m];
  console.log(`${m.padEnd(6)} | ${String(a.songs).padStart(5)} ${String(a.crashes).padStart(5)} | ${[...a.barLens].sort((x, y) => x - y).join(',').padEnd(15)} | ${pc(a.barMiss, a.bars).padStart(8)} ${String(a.barMiss).padStart(5)} | ${String(a.gridOff).padStart(8)} ${String(a.labelsOff).padStart(8)} | ${String(a.broken).padStart(12)} | ${pc(a.cross, a.notes).padStart(21)} | ${pc(a.onBar, a.notes).padStart(12)} | ${pc(a.onGroup, a.notes).padStart(13)} | ${pc(a.onChange, a.notes).padStart(15)} | ${pc(a.chordTone, a.notes)} | ${pc(a.phStart, a.phrases).padStart(23)} | ${pc(a.phEnd, a.phrases).padStart(21)} | ${pc(a.endOnBeat, a.endings).padStart(26)} | ${pc(a.longEndOk, a.longs).padStart(32)} | ${String(a.fractional).padStart(18)} | ${pc(a.short, a.notes).padStart(10)}`);
  if (a.err) console.log('        first crash:', a.err);
}
if (Object.values(rows).some((a) => a.crashes || a.broken || a.gridOff || a.labelsOff)) process.exitCode = 1;
