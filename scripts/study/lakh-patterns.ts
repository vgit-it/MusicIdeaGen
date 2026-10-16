// The pattern library (docs/PATTERNS.md, option 2 of docs/STUDY-LAKH.md): common 1-bar vocal rhythms and short
// note shapes, mined from the Lakh MIDI collection's vocal lines, kept only when many songs by many different
// artists share them (so none is any one song's). Writes src/realism/patterns.json (the patterns, counts per
// genre) and src/realism/guard.json (the copy guard: a Bloom filter of real 2-bar stretches only a few songs
// share; hashes, no notes). Run: npm run realism-patterns [-- <MidiCollection>]
import fs from 'node:fs';
import { GUARD_HASHES, type QNote, guardSig, hash32, rhythmKeys, shapeKeys } from '../../src/realism/patterns';
import { forEachSong } from './lakh-songs';

const root = process.argv[2] ?? 'experiments/MidiCollection';
const GENRES = ['rock', 'pop', 'funk', 'hardrock', 'metal', 'grunge', 'altmetal'];
/** Kept when found in at least this many songs by this many artists. */
const MIN_SONGS = Number(process.env.MIN_SONGS ?? 25), MIN_ARTISTS = Number(process.env.MIN_ARTISTS ?? 15);
/** Shapes kept per length (the most shared). */
const SHAPES_PER_LEN = 250, RHYTHMS_MAX = 300;
/** A real 2-bar stretch shared by fewer songs or artists than this is guarded (could be recognised); one with fewer
 * notes or pitches than this is too plain to tell a song by (a held note, a chant on one or two notes). */
const GUARD_SONGS = 5, GUARD_ARTISTS = 3, GUARD_NOTES = 5, GUARD_PITCHES = 3;
/** Bloom filter bits per guarded stretch (about 0.1% false alarms). */
const GUARD_BITS = 14.4;
const mod = (n: number, m: number) => ((n % m) + m) % m;

interface Tally { songs: Set<number>; artists: Set<string>; by: number[] }
const tally = (m: Map<string, Tally>, k: string, song: number, artist: string, g: number) => {
  let t = m.get(k);
  if (!t) m.set(k, (t = { songs: new Set(), artists: new Set(), by: GENRES.map(() => 0) }));
  if (!t.songs.has(song) && g >= 0) t.by[g]++;
  t.songs.add(song); t.artists.add(artist);
};
const rhythms = new Map<string, Tally>(), shapes = new Map<string, Tally>(), windows = new Map<string, Tally>();
let songNo = 0, clean = 0;
/** Each on-grid song's bar rhythms and 4-note shapes, for the library's coverage of real songs. */
const songKeys: { rk: string[]; s4: string[] }[] = [];

forEachSong(root, (S) => {
  const song = songNo++, g = S.genre ? GENRES.indexOf(S.genre) : -1;
  const mel = S.mel;
  const q = mel.map((n) => Math.round(n.s * 4));
  // the copy guard: every song (hand-played ones too), 2-bar stretches from every bar
  const bars = Math.ceil((q[q.length - 1] + 1) / 16);
  for (let b = 0; b + 1 < bars; b++) {
    const idx = q.map((x, i) => [x, i]).filter(([x]) => x >= b * 16 && x < b * 16 + 32).map(([, i]) => i);
    if (idx.length < GUARD_NOTES || new Set(idx.map((i) => mel[i].p)).size < GUARD_PITCHES) continue;
    tally(windows, guardSig(idx.map((i) => q[i] - b * 16), idx.map((i) => mel[i].p)), song, S.artist, g);
  }
  // the library: songs on the grid only (no hand-played timing)
  const onGrid = mel.filter((n) => Math.abs(n.s * 4 - Math.round(n.s * 4)) < 0.12).length / mel.length;
  if (onGrid < 0.9) return;
  clean++;
  // 1-bar rhythms and 4-6 note shapes (src/realism/patterns.ts: the same keys the app's lines are measured by)
  const qs: QNote[] = mel.map((n) => ({ q: Math.round(n.s * 4), e: n.e * 4, p: n.p }));
  const rel = (n: QNote) => { const low = S.low[n.q], iv = low ? mod(n.p - low, 12) : -1; return iv === 0 ? 'R' : iv === 3 || iv === 4 ? '3' : iv === 7 ? '5' : S.slots[n.q]?.has(mod(n.p, 12)) ? 'c' : 'n'; };
  const rk = rhythmKeys(qs), sk = shapeKeys(qs, S.tonic, S.minor, rel), s4 = shapeKeys(qs, S.tonic, S.minor, rel, [4]);
  for (const k of rk) tally(rhythms, k, song, S.artist, g);
  for (const k of sk) tally(shapes, k, song, S.artist, g);
  songKeys.push({ rk, s4 });
});

const keep = (m: Map<string, Tally>) => [...m].filter(([, t]) => t.songs.size >= MIN_SONGS && t.artists.size >= MIN_ARTISTS).sort((a, b) => b[1].songs.size - a[1].songs.size);
const R = keep(rhythms).slice(0, RHYTHMS_MAX);
const Sh = [4, 5, 6].flatMap((L) => keep(shapes).filter(([k]) => k.split(':')[1].split(',').length === L - 1).slice(0, SHAPES_PER_LEN));
// the guard: a Bloom filter (about 0.1% false alarms) of the stretches few songs share
const guarded = [...windows].filter(([, t]) => t.songs.size < GUARD_SONGS || t.artists.size < GUARD_ARTISTS).map(([k]) => k);
const bits = Math.ceil((guarded.length * GUARD_BITS) / 8) * 8;
const filter = new Uint8Array(bits / 8);
for (const k of guarded) { const h1 = hash32(k), h2 = hash32(`${k}#`) | 1; for (let j = 0; j < GUARD_HASHES; j++) { const b = (h1 + j * h2) >>> 0; filter[(b % bits) >> 3] |= 1 << ((b % bits) & 7); } }
// (coverage: how many of real songs' own bars and 4-note shapes the kept library holds)
const rSet = new Set(R.map(([k]) => k)), sSet = new Set(Sh.map(([k]) => k));
const share = (xs: string[], set: Set<string>) => xs.filter((x) => set.has(x)).length / Math.max(1, xs.length);
const coverage = { rhythm: Math.round(1000 * share(songKeys.flatMap((x) => x.rk), rSet)) / 1000, shape4: Math.round(1000 * share(songKeys.flatMap((x) => x.s4), sSet)) / 1000 };
const row = ([k, t]: [string, Tally]) => [k, t.songs.size, t.artists.size, t.by];
fs.writeFileSync('src/realism/patterns.json', JSON.stringify({
  source: `Lakh MIDI Dataset (Colin Raffel, CC-BY 4.0): ${clean} on-grid vocal lines. Only patterns found in ${MIN_SONGS}+ songs by ${MIN_ARTISTS}+ artists; counts only (docs/PATTERNS.md).`,
  genres: GENRES, coverage, rhythms: R.map(row), shapes: Sh.map(row),
}));
// (the exact fingerprints, for the realism lab's count of true copies: local only, never shipped)
fs.mkdirSync('node_modules/.cache', { recursive: true });
fs.writeFileSync('node_modules/.cache/lakh-windows.json', JSON.stringify(guarded));
fs.writeFileSync('src/realism/guard.json', JSON.stringify({ source: 'Hashes of real 2-bar vocal stretches (onsets and steps) shared by fewer than 5 songs or 3 artists, 5+ notes on 3+ pitches: no notes (docs/PATTERNS.md).', bits, k: GUARD_HASHES, filter: Buffer.from(filter).toString('base64') }));
console.log({ coverage, songs: songNo, clean, rhythms: `${R.length} kept of ${rhythms.size}`, shapes: `${Sh.length} kept of ${shapes.size}`, windows: windows.size, guarded: guarded.length, guardKB: Math.round(bits / 8 / 1024) });
console.log('top rhythms', R.slice(0, 12).map(([k, t]) => `${k} (${t.songs.size})`).join('  '));
console.log('top shapes', Sh.slice(0, 12).map(([k, t]) => `${k} (${t.songs.size})`).join('  '));
