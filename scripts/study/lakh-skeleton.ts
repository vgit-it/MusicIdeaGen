// The skeleton library (docs/PATTERNS.md, "Guide line"): each real vocal line reduced to its slow line (notes held
// a beat or longer, notes on beats 1 and 3: src/realism/skeleton.ts), then counted: where its notes change in 2
// bars (timings) and the scale steps between 4-5 of its notes with what the first is against the band (shapes).
// Kept only when many songs by many different artists share them (so none is any one song's). Counts only, no
// melodies. Writes src/realism/skeleton.json. Run: npm run skeleton-patterns [-- <MidiCollection>]
import fs from 'node:fs';
import type { QNote } from '../../src/realism/patterns';
import { skeleton, skeletonShapes, timingKeys } from '../../src/realism/skeleton';
import { forEachSong } from './lakh-songs';

const root = process.argv[2] ?? 'experiments/MidiCollection';
const GENRES = ['rock', 'pop', 'funk', 'hardrock', 'metal', 'grunge', 'altmetal'];
const MIN_SONGS = Number(process.env.MIN_SONGS ?? 25), MIN_ARTISTS = Number(process.env.MIN_ARTISTS ?? 15);
const TIMINGS_MAX = 400, SHAPES_PER_LEN = 250;
const mod = (n: number, m: number) => ((n % m) + m) % m;

interface Tally { songs: Set<number>; artists: Set<string>; by: number[] }
const tally = (m: Map<string, Tally>, k: string, song: number, artist: string, g: number) => {
  let t = m.get(k);
  if (!t) m.set(k, (t = { songs: new Set(), artists: new Set(), by: GENRES.map(() => 0) }));
  if (!t.songs.has(song) && g >= 0) t.by[g]++;
  t.songs.add(song); t.artists.add(artist);
};
const timings = new Map<string, Tally>(), shapes = new Map<string, Tally>();
let songNo = 0, clean = 0, skelNotes = 0, allNotes = 0;
const songKeys: { tk: string[]; s4: string[] }[] = [];

forEachSong(root, (S) => {
  const song = songNo++, g = S.genre ? GENRES.indexOf(S.genre) : -1;
  const mel = S.mel;
  // (songs on the grid only: no hand-played timing)
  if (mel.filter((n) => Math.abs(n.s * 4 - Math.round(n.s * 4)) < 0.12).length / mel.length < 0.9) return;
  clean++;
  const qs: QNote[] = mel.map((n) => ({ q: Math.round(n.s * 4), e: n.e * 4, p: n.p }));
  const sk = skeleton(qs);
  skelNotes += sk.length; allNotes += qs.length;
  const rel = (n: QNote) => { const low = S.low[n.q], iv = low ? mod(n.p - low, 12) : -1; return iv === 0 ? 'R' : iv === 3 || iv === 4 ? '3' : iv === 7 ? '5' : S.slots[n.q]?.has(mod(n.p, 12)) ? 'c' : 'n'; };
  const tk = timingKeys(sk), sh = skeletonShapes(sk, S.tonic, S.minor, rel);
  for (const k of tk) tally(timings, k, song, S.artist, g);
  for (const k of sh) tally(shapes, k, song, S.artist, g);
  songKeys.push({ tk, s4: sh.filter((k) => k.split(':')[1].split(',').length === 3) });
});

const keep = (m: Map<string, Tally>) => [...m].filter(([, t]) => t.songs.size >= MIN_SONGS && t.artists.size >= MIN_ARTISTS).sort((a, b) => b[1].songs.size - a[1].songs.size);
const Tm = keep(timings).slice(0, TIMINGS_MAX);
const Sh = [4, 5].flatMap((L) => keep(shapes).filter(([k]) => k.split(':')[1].split(',').length === L - 1).slice(0, SHAPES_PER_LEN));
const tSet = new Set(Tm.map(([k]) => k)), sSet = new Set(Sh.map(([k]) => k));
const share = (xs: string[], set: Set<string>) => xs.filter((x) => set.has(x)).length / Math.max(1, xs.length);
const coverage = { timing: Math.round(1000 * share(songKeys.flatMap((x) => x.tk), tSet)) / 1000, shape4: Math.round(1000 * share(songKeys.flatMap((x) => x.s4), sSet)) / 1000 };
const row = ([k, t]: [string, Tally]) => [k, t.songs.size, t.artists.size, t.by];
fs.writeFileSync('src/realism/skeleton.json', JSON.stringify({
  source: `Lakh MIDI Dataset (Colin Raffel, CC-BY 4.0): ${clean} on-grid vocal lines, reduced to their slow line (notes held a beat or longer, notes on beats 1 and 3). Only patterns found in ${MIN_SONGS}+ songs by ${MIN_ARTISTS}+ artists; counts only (docs/PATTERNS.md).`,
  genres: GENRES, coverage, timings: Tm.map(row), shapes: Sh.map(row),
}));
console.log({ coverage, songs: songNo, clean, skeletonShare: Math.round((100 * skelNotes) / allNotes) + '% of notes', timings: `${Tm.length} kept of ${timings.size}`, shapes: `${Sh.length} kept of ${shapes.size}` });
console.log('top timings', Tm.slice(0, 16).map(([k, t]) => `${k} (${t.songs.size})`).join('  '));
console.log('top shapes', Sh.slice(0, 12).map(([k, t]) => `${k} (${t.songs.size})`).join('  '));
