// The learned writer's odds (docs/VOCAL-LEARNED.md, option 5 of docs/STUDY-LAKH.md): for every note of the Lakh MIDI
// collection's vocal lines (on the grid), the scale step from the note before, counted by a small context (the step
// before it, where the note starts in the bar, what the note before was against the chord, where it sits in its
// phrase) per genre and for all songs; and which 16ths of each beat real singers sing (the rhythm); contexts kept only when 25+ songs by 15+ artists have them. Also which kind of
// note lands on beat 1 or 3, at phrase ends and on a phrase's first note on a beat (its landing), and phrase starts' and endings' scale degrees. Counts only: no melodies, no lyrics.
// Writes src/realism/learned.json. Run: npm run realism-learned [-- <MidiCollection>]
import fs from 'node:fs';
import { MAX_STEP, RELS, type Ph, type Rel, cellKey, ctxKeys, posKey, prevKey, tempoKey } from '../../src/realism/learned';
import { forEachSong } from './lakh-songs';

const root = process.argv[2] ?? 'experiments/MidiCollection';
const GENRES = ['rock', 'pop', 'funk', 'hardrock', 'metal', 'grunge', 'altmetal'];
const MIN_SONGS = Number(process.env.MIN_SONGS ?? 25), MIN_ARTISTS = Number(process.env.MIN_ARTISTS ?? 15);
const mod = (n: number, m: number) => ((n % m) + m) % m;
const MAJ = [0, 2, 4, 5, 7, 9, 11], MIN = [0, 2, 3, 5, 7, 8, 10];

interface Tally { songs: Set<number>; artists: Set<string>; n: number[] }
const steps: Record<string, Map<string, Tally>> = Object.fromEntries(['all', ...GENRES].map((g) => [g, new Map()]));
const blank = () => RELS.map(() => 0);
const strong: Record<string, number[]> = {}, end: Record<string, number[]> = {}, any: Record<string, number[]> = {}, endDeg: Record<string, number[]> = {};
const land: Record<string, number[]> = {}, startDeg: Record<string, number[]> = {};
const songsIn: Record<string, number> = {};
// the rhythm: inside each phrase (up to its last note), which 16ths of each beat are sung (a 4-bit cell), by the beat
// in the bar, whether the 16th before the beat was sung, and the tempo
interface CellTally { songs: Set<number>[]; artists: Set<string>[]; n: number[] }
const cells: Record<string, Map<string, CellTally>> = Object.fromEntries(['all', ...GENRES].map((g) => [g, new Map()]));
let beatsCounted = 0;
let songNo = 0, clean = 0, notes = 0;

forEachSong(root, (S) => {
  const song = songNo++;
  const mel = S.mel;
  const onGrid = mel.filter((n) => Math.abs(n.s * 4 - Math.round(n.s * 4)) < 0.12).length / mel.length;
  if (onGrid < 0.9) return;
  clean++;
  const gs = S.genre ? ['all', S.genre] : ['all'];
  for (const g of gs) songsIn[g] = (songsIn[g] ?? 0) + 1;
  const sc = S.minor ? MIN : MAJ;
  const deg = (p: number) => { const r = p - S.tonic, pc = mod(r, 12); let i = 6; while (sc[i] > pc) i--; return 7 * Math.floor(r / 12) + i; };
  const q = mel.map((n) => Math.round(n.s * 4));
  const rel = (i: number): Rel => { const low = S.low[q[i]], iv = low ? mod(mel[i].p - low, 12) : -1; return iv === 0 ? 'R' : iv === 3 || iv === 4 ? '3' : iv === 7 ? '5' : S.slots[q[i]]?.has(mod(mel[i].p, 12)) ? 'c' : 'n'; };
  // phrases: a rest of a beat or more, or 4 beats from one note's start to the next
  const starts = mel.map((n, i) => i === 0 || n.s - mel[i - 1].e >= 1 || n.s - mel[i - 1].s >= 4);
  const ph = (i: number): Ph => (starts[i] ? 's' : i === mel.length - 1 || starts[i + 1] ? 'e' : 'm');
  const D = mel.map((n) => deg(n.p)), R = mel.map((_, i) => rel(i));
  const band = tempoKey(S.bpm);
  for (let a = 0; a < mel.length; ) {
    let b = a + 1; while (b < mel.length && !starts[b]) b++;
    const on = new Set(q.slice(a, b)), last = q[b - 1];
    for (let bt = Math.floor(q[a] / 4); bt < Math.floor(last / 4); bt++) {
      let c = 0; for (let k = 0; k < 4; k++) if (on.has(bt * 4 + k)) c |= 1 << k;
      const key = cellKey(mod(bt, 4), on.has(bt * 4 - 1), band);
      beatsCounted++;
      for (const g of gs) for (const k of [key, key.slice(0, key.lastIndexOf('|'))]) {
        let t = cells[g].get(k);
        if (!t) cells[g].set(k, (t = { songs: Array.from({ length: 16 }, () => new Set()), artists: Array.from({ length: 16 }, () => new Set()), n: new Array(16).fill(0) }));
        t.songs[c].add(song); t.artists[c].add(S.artist); t.n[c]++;
      }
    }
    a = b;
  }
  // (a phrase's landing: its first note on a beat, after any pickup)
  let landed = false;
  mel.forEach((_, i) => {
    const r = RELS.indexOf(R[i]), p = posKey(q[i]), f = ph(i);
    if (starts[i]) landed = false;
    const lands = !landed && q[i] % 4 === 0;
    if (lands) landed = true;
    for (const g of gs) {
      if (lands) (land[g] ??= blank())[r]++;
      if (starts[i]) (startDeg[g] ??= [0, 0, 0, 0, 0, 0, 0])[mod(D[i], 7)]++;
      (any[g] ??= blank())[r]++;
      if (p === 'S') (strong[g] ??= blank())[r]++;
      if (f === 'e') { (end[g] ??= blank())[r]++; (endDeg[g] ??= [0, 0, 0, 0, 0, 0, 0])[mod(D[i], 7)]++; }
    }
    if (i < 1) return;
    notes++;
    const st = Math.max(-MAX_STEP, Math.min(MAX_STEP, D[i] - D[i - 1]));
    const prev = prevKey(i < 2 || starts[i - 1] ? null : D[i - 1] - D[i - 2]);
    for (const k of ctxKeys(prev, p, R[i - 1], f)) for (const g of gs) {
      let t = steps[g].get(k);
      if (!t) steps[g].set(k, (t = { songs: new Set(), artists: new Set(), n: new Array(2 * MAX_STEP + 1).fill(0) }));
      t.songs.add(song); t.artists.add(S.artist); t.n[st + MAX_STEP]++;
    }
  });
});

const out: Record<string, Record<string, number[]>> = {};
let kept = 0, all = 0;
for (const g of ['all', ...GENRES]) {
  out[g] = {};
  for (const [k, t] of steps[g]) {
    all++;
    if (t.songs.size < MIN_SONGS || t.artists.size < MIN_ARTISTS) continue;
    kept++;
    // (an outcome only a couple of times in a context dropped: the shape of the odds, not anyone's notes)
    out[g][k] = t.n.map((x) => (x < 3 ? 0 : x));
  }
}
// (a beat's cell kept only when 25+ songs by 15+ artists sing it in that context: the shape of the odds, not anyone's rhythm)
const rhythm: Record<string, Record<string, number[]>> = {};
for (const g of ['all', ...GENRES]) {
  rhythm[g] = {};
  for (const [k, t] of cells[g]) {
    const n = t.n.map((x, c) => (t.songs[c].size >= MIN_SONGS && t.artists[c].size >= MIN_ARTISTS ? x : 0));
    if (n.some((x) => x > 0)) rhythm[g][k] = n;
  }
}
const own = (t: Record<string, number[]>) => Object.fromEntries(Object.entries(t).filter(([g]) => g === 'all' || (songsIn[g] ?? 0) >= MIN_SONGS));
const json = JSON.stringify({
  source: `Lakh MIDI Dataset (Colin Raffel, CC-BY 4.0): ${clean} on-grid vocal lines, ${notes} note-to-note steps, ${beatsCounted} sung beats' rhythms. Contexts kept only when ${MIN_SONGS}+ songs by ${MIN_ARTISTS}+ artists have them; counts only (docs/VOCAL-LEARNED.md).`,
  genres: GENRES, songs: songsIn, steps: out, strong: own(strong), end: own(end), any: own(any), endDeg: own(endDeg), land: own(land), startDeg: own(startDeg), rhythm,
});
fs.writeFileSync('src/realism/learned.json', json);
console.log({ songs: songNo, clean, notes, songsIn, contexts: `${kept} kept of ${all}`, perGenre: Object.fromEntries(Object.entries(out).map(([g, t]) => [g, Object.keys(t).length])), KB: Math.round(json.length / 1024) });
const A = out.all;
for (const k of ['S|S|R|s', '1|B|3|m', '-1|&|5|m', '0|S|R|e', '-1|S|c|e']) if (A[k]) console.log(k, A[k].map((x, i) => `${i - MAX_STEP}:${x}`).filter((s) => !s.endsWith(':0')).join(' '));
