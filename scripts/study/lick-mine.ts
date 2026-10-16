// The lick finder (docs/LEAD-LICKS.md): what real lead guitarists' licks are made of, from the lead guitar parts of
// the Lakh MIDI collection (the lead guitar study's songs, lead-study.ts), where the singer rests (solos, fills).
// - Rhythms: a lick is a run of 3-10 notes inside a phrase, at most two bars, ending on a held note (an 8th or
//   more). Its rhythm (where it starts in the beat, its onsets in 16ths, its last note's length) is kept only when
//   many songs and artists play it alike (MIN_SONGS, MIN_ARTISTS): the instrument's shared vocabulary.
// - Notes: how real leads move from note to note, as counts: the next step (semitones) by the note it's on (above
//   the key's root), the step before and how quick the next one is; and the notes licks start and end on.
// Numbers only: no song's notes, names or phrases are kept.
// Run: npm run lick-mine (writes src/realism/licks.json)
import fs from 'node:fs';
import path from 'node:path';
import { MAJ, MIN, corr, findVox, genreOf, norm } from './lakh-songs';
import { type BN, guitarish, isLead, onsets, read } from './lead-read';

const ROOT = process.argv[2] ?? 'experiments/MidiCollection';
const OUT = process.env.OUT ?? 'src/realism/licks.json';
const MIN_SONGS = Number(process.env.MIN_SONGS ?? 8), MIN_ARTISTS = Number(process.env.MIN_ARTISTS ?? 6);
const mod = (n: number, m: number) => ((n % m) + m) % m;

/** A rhythm, seen in: songs, the last song (to count each once), artists, the app's genres. */
interface Seen { songs: number; last: number; artists: Set<string>; genres: Record<string, number> }
const rhythms = new Map<string, Seen>();
/** The step model: by the key's mode, the context "note above the key's root|the step before|how quick", the next step's counts. */
const steps: Record<'M' | 'm', Record<string, Record<number, number>>> = { M: {}, m: {} };
/** The notes licks start and end on (above the key's root). */
const starts = { M: new Array(12).fill(0), m: new Array(12).fill(0) }, ends = { M: new Array(12).fill(0), m: new Array(12).fill(0) };

/** The step before, in a few sizes: none (the first note), a big leap down, a skip down, a step down, the same, up... (as src/parts/reallicks.ts) */
const prevBucket = (d: number | null) => (d === null ? 'x' : d <= -5 ? 'D' : d <= -3 ? 'S' : d < 0 ? 's' : d === 0 ? '0' : d < 3 ? 'u' : d < 5 ? 'U' : 'P');
/** How quick the next note comes: a 16th, an 8th, longer. */
const gapClass = (g: number) => (g <= 1 ? 'q' : g === 2 ? 'e' : 'l');

function mine(top: BN[], sung: Uint8Array, tonic: number, minor: boolean, song: number, artist: string, genre: string) {
  const mode = minor ? 'm' : 'M';
  const phrases: BN[][] = [];
  top.forEach((n, i) => { const p = top[i - 1]; if (p && n.s - p.e < 1 && n.s - p.s < 3) phrases[phrases.length - 1].push(n); else phrases.push([n]); });
  for (const ph of phrases) {
    const q = ph.map((n) => n.s * 4);
    const grid = q.map((x) => Math.abs(x - Math.round(x)) < 0.15);
    const pitch = ph.map((n) => n.p + (n.bend ?? 0));
    const free = (i: number) => !sung[Math.round(q[i])];
    // the step model, in lead moments (the singer resting), on the grid
    for (let i = 1; i < ph.length; i++) {
      if (!grid[i] || !grid[i - 1] || !free(i)) continue;
      const d = pitch[i] - pitch[i - 1];
      if (Math.abs(d) > 12) continue;
      const before = i >= 2 && grid[i - 2] ? pitch[i - 1] - pitch[i - 2] : null;
      const ctx = `${mod(pitch[i - 1] - tonic, 12)}|${prevBucket(before)}|${gapClass(Math.round(q[i]) - Math.round(q[i - 1]))}`;
      const c = (steps[mode][ctx] ??= {});
      c[d] = (c[d] ?? 0) + 1;
    }
    if (free(0) && ph.length >= 3) { starts[mode][mod(pitch[0] - tonic, 12)]++; ends[mode][mod(pitch[ph.length - 1] - tonic, 12)]++; }
    // the rhythms
    const mine1 = new Set<string>();
    for (let i = 0; i < ph.length; i++) {
      for (let j = i + 2; j < Math.min(ph.length, i + 10); j++) {
        if (!grid.slice(i, j + 1).every(Boolean)) break;
        const s0 = Math.round(q[i]);
        const ons = ph.slice(i, j + 1).map((_, k) => Math.round(q[i + k]) - s0);
        if (ons.some((o, k) => k && o === ons[k - 1])) break;
        // the last note held an 8th or more (to the next note, or to its end at the phrase's end)
        const lastLen = j + 1 < ph.length ? Math.min(Math.round(ph[j].e * 4) - Math.round(q[j]), Math.round(q[j + 1]) - Math.round(q[j])) : Math.round(ph[j].e * 4) - Math.round(q[j]);
        if (lastLen < 2) continue;
        const tail = Math.min(lastLen, 4);
        if (ons[ons.length - 1] + tail > 32) break;
        // a lead moment: the singer resting under most of it
        if (ons.filter((o) => sung[s0 + o]).length > ons.length * 0.25) continue;
        const key = `${s0 % 4}|${ons.join(',')}|${tail}`;
        if (mine1.has(key)) continue;
        mine1.add(key);
        let r = rhythms.get(key);
        if (!r) { r = { songs: 0, last: -1, artists: new Set(), genres: {} }; rhythms.set(key, r); }
        if (r.last === song) continue;
        r.last = song; r.songs++; r.artists.add(artist); r.genres[genre] = (r.genres[genre] ?? 0) + 1;
      }
    }
  }
}

const seen = new Set<string>();
let files = 0, songs = 0;
for (const a of fs.readdirSync(ROOT)) {
  const d = path.join(ROOT, a);
  if (!fs.statSync(d).isDirectory()) continue;
  const genre = genreOf[norm(a)] ?? 'other';
  for (const f of fs.readdirSync(d)) {
    if (!/\.mid$/i.test(f)) continue;
    const key = `${a}/${f}`.replace(/\.\d+\.mid$/i, '.mid').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const r = read(fs.readFileSync(path.join(d, f)));
    if (!r || (r.ts && r.ts !== '4/4')) continue;
    files++;
    // the same song selection as the lead guitar study: a singer, a lead guitar that isn't doubling them, a band
    const T = r.T, vi = findVox(T);
    if (vi < 0) continue;
    const voxOn = new Map<number, number>(); for (const n of T[vi].ns) voxOn.set(Math.round(n.s * 4), n.p % 12);
    const leads = T.map((t, i) => ({ t, i })).filter(({ t, i }) => i !== vi && guitarish(t) && isLead(t)
      && t.ns.filter((n) => voxOn.get(Math.round(n.s * 4)) === n.p % 12).length / t.ns.length <= 0.5);
    if (!leads.length) continue;
    const leadIx = new Set(leads.map((c) => c.i));
    const band = T.filter((t, i) => i !== vi && !leadIx.has(i) && t.ch !== 9 && !/vo(c|x|ice)|melod|harm|back/i.test(t.name)).flatMap((t) => t.ns);
    if (band.length < 100) continue;
    const pc = new Array(12).fill(0); for (const n of band.concat(T[vi].ns)) pc[n.p % 12] += n.e - n.s;
    let best = -2, tonic = 0, minor = false;
    for (let k = 0; k < 12; k++) { const rot = pc.slice(k).concat(pc.slice(0, k)); const x = corr(rot, MAJ), y = corr(rot, MIN); if (x > best) { best = x; tonic = k; minor = false; } if (y > best) { best = y; tonic = k; minor = true; } }
    const sung = new Uint8Array(40000);
    for (const n of T[vi].ns) for (let g = Math.round(n.s * 4); g < Math.round(n.e * 4) && g < 40000; g++) sung[g] = 1;
    songs++;
    for (const { t } of leads) mine(onsets(t.ns).map((o) => o.reduce((x, y) => (y.p > x.p ? y : x))), sung, tonic, minor, songs, a, genre);
  }
}

// the shared rhythms: [rhythm, songs, songs in each of the app's genres (GENRES' order)]
const GENRES = ['pop', 'rock', 'hardrock', 'metal', 'grunge', 'altmetal', 'funk'];
const R = [...rhythms].filter(([, r]) => r.songs >= MIN_SONGS && r.artists.size >= MIN_ARTISTS)
  .sort((a, b) => b[1].songs - a[1].songs)
  .map(([k, r]) => [k, r.songs, GENRES.map((g) => r.genres[g] ?? 0)]);
// (contexts heard fewer than 20 times are left to the coarser ones)
const S: typeof steps = { M: {}, m: {} };
for (const m of ['M', 'm'] as const) for (const [ctx, c] of Object.entries(steps[m])) if (Object.values(c).reduce((s, x) => s + x, 0) >= 20) S[m][ctx] = c;
fs.writeFileSync(OUT, JSON.stringify({ about: 'docs/LEAD-LICKS.md: lick rhythms shared by many real songs and artists, and note-to-note counts of real lead lines (Lakh MIDI collection); no notes of any song', genres: GENRES, rhythms: R, steps: S, starts, ends }));
const size: Record<number, number> = {}; for (const [k] of R) { const n = (k as string).split('|')[1].split(',').length; size[n] = (size[n] ?? 0) + 1; }
console.log('files', files, 'songs with a lead guitar', songs, 'rhythms seen', rhythms.size, 'shared', R.length, size);
console.log('step contexts', Object.keys(S.M).length, Object.keys(S.m).length, 'bytes', fs.statSync(OUT).size);
