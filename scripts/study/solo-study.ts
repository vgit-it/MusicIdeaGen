// Solo study (docs/STUDY-SOLO.md): how real guitar solos are shaped, and the licks they share, in the Lakh MIDI
// collection. The lead guitar study's songs (lead-study.ts); a solo: 4+ bars with no singing where the lead plays
// 3+ notes a bar. Numbers only, and licks only as shared shapes (heard in many songs by many artists).
// Run: npx rolldown scripts/study/solo-study.ts --platform node --format esm -o node_modules/.cache/solo-study.mjs && node node_modules/.cache/solo-study.mjs [collection] (writes OUT, default solo-study.json)
import fs from 'node:fs';
import path from 'node:path';
import { MAJ, MIN, corr, findVox, genreOf, norm } from './lakh-songs';
import { type BN, type Track, guitarish, isLead, onsets, read } from './lead-read';
import { generate } from '../../src/generator';
import type { Genre } from '../../src/genres';
import { buildTrack, defaultTrackOptions } from '../../src/track';
import { toMidi } from '../../src/export/midi';
import { MINORISH } from '../../src/parts/guitar2';

const ROOT = process.argv[2] ?? 'experiments/MidiCollection';
const REAL = process.env.REAL !== '0';
const OUT = process.env.OUT ?? 'solo-study.json';
const mod = (n: number, m: number) => ((n % m) + m) % m;
const PENTA = { M: [0, 2, 4, 7, 9], m: [0, 3, 5, 7, 10] };
const BLUES = { M: [3, 6, 10], m: [6] };

interface Solo {
  side: 'real' | 'app';
  artist: string; genre: string; minor: boolean; bars: number; n: number;
  /** where the highest note first comes (0-1), how often it's played, and whether a note within a step of it comes before the last 30% */
  peakAt: number; peakCount: number; peakEarly: number;
  /** the line's middle note in each quarter of the solo, above the solo's own middle (semitones) */
  heightQ: number[];
  /** notes a bar in each quarter */
  densQ: number[];
  /** beats with no note sounding, in each quarter (share) */
  restQ: number[];
  start: { deg: number; h: number; onBeat: number };
  end: { deg: number; onRoot: number; onDown: number; held: number; h: number };
  /** fast runs (4+ notes, 16ths or quicker): how many, their notes, direction (up, down, both), stepwise (scale runs) */
  runs: { n: number; up: number; down: number; both: number; scale: number; notes: number };
  /** the bar before the highest note: a run up into it, a jump to it, a step */
  into: string;
  heldNotes: number;
  /** notes held 2 beats or more, and the longest note (beats) */
  long: number; longest: number;
  penta: number; blue: number; repeatedNote: number;
  /** 1-bar rhythms played again in the solo, and 1-bar shapes played again a step or more away (a sequence) */
  rhyAgain: number; seq: number;
  /** distinct notes over the solo */
  pitches: number; range: number;
  /** triplet onsets, notes in 3-note groups of a quick sequence (a pattern moved down or up the scale) */
  trip: number;
  /** bars (3+ notes): played again exactly (notes and rhythm), rhythm only, the next bar the same rhythm, the rhythm back after 2+ bars */
  rep?: { bars: number; exact: number; rhythm: number; next: number; later: number };
  /** notes outside the pentatonic: by degree (above the key root), how many quick (a 16th or less to the next), on a beat */
  out?: { deg: number[]; quick: number; onBeat: number; n: number };
  /** triplet notes by kind (a third of a beat apart: 8th triplets; a sixth: 16th triplets; two thirds: quarter triplets), and 8th-triplet groups going down, up, turning */
  trips?: { t8: number; t16: number; t4: number; down: number; up: number; turn: number };
  /** times the line comes back to within a step of its top note (separate visits) */
  topVisits?: number;
}
const solos: Solo[] = [];

/** Shared licks: the notes above the key's root (and their steps), counted once a song. */
interface Seen { songs: number; last: number; artists: Set<string>; genres: Record<string, number> }
const licks = new Map<string, Seen>(), licksR = new Map<string, Seen>();
const count = (m: Map<string, Seen>, key: string, song: number, artist: string, genre: string) => {
  let r = m.get(key);
  if (!r) { r = { songs: 0, last: -1, artists: new Set(), genres: {} }; m.set(key, r); }
  if (r.last === song) return;
  r.last = song; r.songs++; r.artists.add(artist); r.genres[genre] = (r.genres[genre] ?? 0) + 1;
};

function measure(side: 'real' | 'app', top: BN[], b0: number, b1: number, low: number[], tonic: number, minor: boolean, song: number, artist: string, genre: string) {
  const ns = top.filter((n) => n.s >= b0 * 4 && n.s < (b1 + 1) * 4);
  if (ns.length < 12) return;
  const t0 = b0 * 4, T = (b1 + 1 - b0) * 4;
  const rel = (n: BN) => (n.s - t0) / T;
  const pitch = ns.map((n) => n.p + (n.bend ?? 0));
  const sorted = [...pitch].sort((a, b) => a - b), mid = sorted[sorted.length >> 1];
  const hi = sorted[sorted.length - 1];
  const firstHi = pitch.indexOf(hi);
  const q = (f: (xs: number[], k: number) => number) => [0, 1, 2, 3].map((k) => f(ns.map((n, i) => i).filter((i) => Math.min(3, Math.floor(rel(ns[i]) * 4)) === k), k));
  const mode = minor ? 'm' : 'M';
  const deg = (p: number) => mod(p - tonic, 12);
  // rests: beats with nothing sounding
  const sounding = new Uint8Array(T);
  for (const n of ns) for (let b = Math.floor(n.s - t0); b < Math.min(T, Math.ceil(n.e - t0)); b++) sounding[b] = 1;
  // runs
  const runs = { n: 0, up: 0, down: 0, both: 0, scale: 0, notes: 0 };
  for (let i = 0; i < ns.length;) {
    let k = i; while (k + 1 < ns.length && ns[k + 1].s - ns[k].s <= 0.27) k++;
    if (k - i + 1 >= 4) {
      runs.n++; runs.notes += k - i + 1;
      const ds = pitch.slice(i + 1, k + 1).map((p, j) => p - pitch[i + j]);
      const ups = ds.filter((d) => d > 0).length, downs = ds.filter((d) => d < 0).length;
      if (ups >= 0.75 * ds.length) runs.up++; else if (downs >= 0.75 * ds.length) runs.down++; else runs.both++;
      if (ds.every((d) => Math.abs(d) <= 3 && d !== 0) && (ups === ds.length || downs === ds.length)) runs.scale++;
    }
    i = k + 1;
  }
  // into the peak: the notes in the beat or two before it
  let into = 'start';
  if (firstHi > 0) {
    const before = ns.map((n, i) => i).filter((i) => i < firstHi && ns[firstHi].s - ns[i].s <= 2);
    const ds = before.map((i) => pitch[i + 1] - pitch[i]);
    if (before.length >= 3 && ds.filter((d) => d > 0).length >= 0.75 * ds.length && ns[firstHi].s - ns[before[0]].s <= 1.5) into = 'run up';
    else if (pitch[firstHi] - pitch[firstHi - 1] >= 5) into = 'jump';
    else if (pitch[firstHi] - pitch[firstHi - 1] > 0) into = 'step up';
    else into = 'other';
  }
  // repetition: 1-bar rhythms again; 1-bar step shapes again at another height (a sequence)
  const barKeys = new Map<string, number>(), shapes = new Map<string, Set<number>>();
  for (let b = b0; b <= b1; b++) {
    const bn = ns.map((n, i) => i).filter((i) => ns[i].s >= b * 4 && ns[i].s < b * 4 + 4);
    if (bn.length < 3) continue;
    const rk = bn.map((i) => Math.round((ns[i].s - b * 4) * 4)).join(',');
    barKeys.set(rk, (barKeys.get(rk) ?? 0) + 1);
    const sk = rk + '|' + bn.slice(1).map((i, j) => pitch[i] - pitch[bn[j]]).join(',');
    (shapes.get(sk) ?? shapes.set(sk, new Set()).get(sk)!).add(pitch[bn[0]]);
  }
  const barsWith = [...barKeys.values()].reduce((s, x) => s + x, 0);
  const lastN = ns[ns.length - 1], lastP = pitch[pitch.length - 1];
  const lowAt = (s: number) => low[Math.round(s * 4)];
  solos.push({
    side, artist, genre, minor, bars: b1 - b0 + 1, n: ns.length,
    peakAt: rel(ns[firstHi]), peakCount: pitch.filter((p) => p === hi).length,
    peakEarly: pitch.some((p, i) => p >= hi - 2 && rel(ns[i]) < 0.4) ? 1 : 0,
    heightQ: q((xs) => (xs.length ? xs.reduce((s, i) => s + pitch[i], 0) / xs.length - pitch.reduce((s, p) => s + p, 0) / pitch.length : NaN)),
    densQ: q((xs) => xs.length / (T / 16)),
    restQ: [0, 1, 2, 3].map((k) => { const a = Math.floor((k * T) / 4), b = Math.floor(((k + 1) * T) / 4); let r = 0; for (let x = a; x < b; x++) if (!sounding[x]) r++; return r / Math.max(1, b - a); }),
    start: { deg: deg(pitch[0]), h: pitch[0] - mid, onBeat: Math.abs(ns[0].s - Math.round(ns[0].s)) < 0.06 ? 1 : 0 },
    end: {
      deg: deg(lastP), onRoot: lowAt(lastN.s) !== undefined && mod(lastP - lowAt(lastN.s), 12) === 0 ? 1 : 0,
      onDown: Math.abs((lastN.s % 4)) < 0.06 || Math.abs((lastN.s % 4) - 4) < 0.06 ? 1 : 0, held: lastN.e - lastN.s, h: lastP - mid,
    },
    runs, into,
    heldNotes: ns.filter((n) => n.e - n.s >= 1).length / (T / 4),
    long: ns.filter((n) => n.e - n.s >= 2).length / ns.length, longest: Math.max(...ns.map((n) => n.e - n.s)),
    penta: pitch.filter((p) => PENTA[mode].includes(deg(p))).length / ns.length,
    blue: pitch.filter((p) => BLUES[mode].includes(deg(p))).length / ns.length,
    repeatedNote: pitch.slice(1).filter((p, i) => p === pitch[i]).length / (ns.length - 1),
    rhyAgain: barsWith ? [...barKeys.values()].filter((x) => x > 1).reduce((s, x) => s + x, 0) / barsWith : NaN,
    seq: barsWith ? [...shapes.values()].filter((s) => s.size > 1).length / barsWith : NaN,
    pitches: new Set(pitch).size, range: hi - sorted[0],
    trip: ns.filter((n) => { const f = mod(n.s, 1); return Math.abs(f - 1 / 3) < 0.05 || Math.abs(f - 2 / 3) < 0.05; }).length / ns.length,
  });
  // repetition in detail
  {
    const bk: { b: number; r: string; e: string }[] = [];
    for (let b = b0; b <= b1; b++) {
      const bn = ns.map((n, i) => i).filter((i) => ns[i].s >= b * 4 && ns[i].s < b * 4 + 4);
      if (bn.length < 3) continue;
      const r = bn.map((i) => Math.round((ns[i].s - b * 4) * 4)).join(',');
      bk.push({ b, r, e: r + '|' + bn.map((i) => pitch[i]).join(',') });
    }
    const rep = { bars: bk.length, exact: 0, rhythm: 0, next: 0, later: 0 };
    for (const x of bk) {
      if (bk.some((y) => y !== x && y.e === x.e)) rep.exact++;
      if (bk.some((y) => y !== x && y.r === x.r)) rep.rhythm++;
      if (bk.some((y) => Math.abs(y.b - x.b) === 1 && y.r === x.r)) rep.next++;
      if (bk.some((y) => Math.abs(y.b - x.b) >= 2 && y.r === x.r)) rep.later++;
    }
    solos[solos.length - 1].rep = rep;
    // notes outside the pentatonic
    const out = { deg: new Array(12).fill(0), quick: 0, onBeat: 0, n: 0 };
    pitch.forEach((p, i) => {
      if (PENTA[mode].includes(deg(p))) return;
      out.deg[deg(p)]++; out.n++;
      if (i + 1 < ns.length && ns[i + 1].s - ns[i].s <= 0.27) out.quick++;
      if (Math.abs(ns[i].s - Math.round(ns[i].s)) < 0.06) out.onBeat++;
    });
    solos[solos.length - 1].out = out;
    // triplets
    const trips = { t8: 0, t16: 0, t4: 0, down: 0, up: 0, turn: 0 };
    for (let i = 0; i + 1 < ns.length; i++) {
      const d = ns[i + 1].s - ns[i].s;
      if (Math.abs(d - 1 / 3) < 0.04) trips.t8++; else if (Math.abs(d - 1 / 6) < 0.03) trips.t16++; else if (Math.abs(d - 2 / 3) < 0.05) trips.t4++;
    }
    for (let i = 0; i + 2 < ns.length; i++) {
      if (Math.abs(mod(ns[i].s, 1)) > 0.05 && Math.abs(mod(ns[i].s, 1) - 1) > 0.05) continue;
      if (Math.abs(ns[i + 1].s - ns[i].s - 1 / 3) > 0.04 || Math.abs(ns[i + 2].s - ns[i + 1].s - 1 / 3) > 0.04) continue;
      const a = pitch[i + 1] - pitch[i], b = pitch[i + 2] - pitch[i + 1];
      if (a < 0 && b < 0) trips.down++; else if (a > 0 && b > 0) trips.up++; else trips.turn++;
    }
    solos[solos.length - 1].trips = trips;
    let visits = 0, near = false;
    for (const p of pitch) { const n = p >= hi - 2; if (n && !near) visits++; near = n; }
    solos[solos.length - 1].topVisits = visits;
  }
  if (side === 'app') return;
  // the licks: 4-7 notes in a row inside a phrase, as notes above the key's root (rhythm free), and with their rhythm (16ths)
  const phrases: number[][] = [];
  ns.forEach((n, i) => { const p = ns[i - 1]; if (p && n.s - p.e < 0.75 && n.s - p.s < 2) phrases[phrases.length - 1].push(i); else phrases.push([i]); });
  for (const ph of phrases) {
    for (let a = 0; a < ph.length; a++) for (let L = 4; L <= 7 && a + L <= ph.length; L++) {
      const w = ph.slice(a, a + L);
      if (ns[w[L - 1]].s - ns[w[0]].s > 4) break;
      const ps = w.map((i) => pitch[i]);
      if (new Set(ps).size < 3) continue;
      // (in the octave the lick starts in: its first note's height above the key's root, then the steps)
      const key = `${mode}|${deg(ps[0])}|${ps.slice(1).map((p, j) => p - ps[j]).join(',')}`;
      count(licks, key, song, artist, genre);
      const on = w.map((i) => ns[i].s * 4);
      if (on.every((x) => Math.abs(x - Math.round(x)) < 0.2)) count(licksR, `${key}|${mod(Math.round(on[0]), 4)}:${on.slice(1).map((x, j) => Math.round(x) - Math.round(on[j])).join(',')}`, song, artist, genre);
    }
  }
}

const seen = new Set<string>();
let songs = 0;
for (const a of REAL ? fs.readdirSync(ROOT) : []) {
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
    const T = r.T, vi = findVox(T);
    if (vi < 0) continue;
    const voxOn = new Map<number, number>(); for (const n of T[vi].ns) voxOn.set(Math.round(n.s * 4), n.p % 12);
    const leads = T.map((t, i) => ({ t, i })).filter(({ t, i }) => i !== vi && guitarish(t) && isLead(t)
      && t.ns.filter((n) => voxOn.get(Math.round(n.s * 4)) === n.p % 12).length / t.ns.length <= 0.5);
    if (!leads.length) continue;
    leads.sort((x, y) => Number(/lead|solo/i.test(y.t.name)) - Number(/lead|solo/i.test(x.t.name)) || y.t.ns.length - x.t.ns.length);
    const leadIx = new Set(leads.map((c) => c.i));
    const band = T.filter((t, i) => i !== vi && !leadIx.has(i) && t.ch !== 9 && !/vo(c|x|ice)|melod|harm|back/i.test(t.name)).flatMap((t) => t.ns);
    if (band.length < 100) continue;
    const pc = new Array(12).fill(0); for (const n of band.concat(T[vi].ns)) pc[n.p % 12] += n.e - n.s;
    let best = -2, tonic = 0, minor = false;
    for (let k = 0; k < 12; k++) { const rot = pc.slice(k).concat(pc.slice(0, k)); const x = corr(rot, MAJ), y = corr(rot, MIN); if (x > best) { best = x; tonic = k; minor = false; } if (y > best) { best = y; tonic = k; minor = true; } }
    const low: number[] = [];
    for (const n of band) for (let s = Math.ceil((n.s - 0.02) * 4); s < n.e * 4 - 0.08 && s < 40000; s++) if (!low[s] || n.p < low[s]) low[s] = n.p;
    songs++;
    findSolos('real', T, vi, leads[0].t, low, tonic, minor, songs, a, genre);
  }
}

/** The solos (as the lead guitar study finds them): 4+ bars with no singing, the lead playing 3+ notes a bar. */
function findSolos(side: 'real' | 'app', T: Track[], vi: number, L: Track, low: number[], tonic: number, minor: boolean, song: number, artist: string, genre: string) {
  const top = onsets(L.ns).map((o) => o.reduce((x, y) => (y.p > x.p ? y : x)));
  const end = Math.max(...T.flatMap((t) => t.ns.map((n) => n.e))), nBars = Math.ceil(end / 4);
  const leadBar = new Array(nBars).fill(0), voxBar = new Array(nBars).fill(0);
  for (const n of top) leadBar[Math.min(nBars - 1, Math.floor(n.s / 4))]++;
  for (const n of T[vi].ns) voxBar[Math.min(nBars - 1, Math.floor(n.s / 4))]++;
  const soloBar = leadBar.map((x, i) => voxBar[i] === 0 && x >= 3);
  for (let i = 0; i < nBars;) {
    if (!soloBar[i]) { i++; continue; }
    let k = i; while (k + 1 < nBars && (soloBar[k + 1] || (k + 2 < nBars && soloBar[k + 2] && voxBar[k + 1] === 0))) k++;
    if (k - i + 1 >= 4) measure(side, top, i, k, low, tonic, minor, song, artist, genre);
    i = k + 1;
  }
}

// the app's solos, exported and read back by the same code (N tracks a genre, solos on; LICKS=1: Real licks)
const N_APP = Number(process.env.N ?? 40);
for (const g of ['rock', 'pop', 'funk', 'hardrock', 'metal', 'grunge', 'altmetal'] as Genre[]) {
  for (let i = 0; i < N_APP; i++) {
    const s = `${g}-solo-${i}`;
    const idea = generate({ genre: g, meter: '4/4', weirdness: 0.3, ...(process.env.LICKS ? { leadLicks: true } : {}), ...(process.env.SOLO ? { leadSolo: true } : {}) } as Parameters<typeof generate>[0], { song: s, chords: s + 'c', drums: s + 'd', strum: s + 's', bass: s + 'b', vocal: s + 'v' });
    const tr = buildTrack(idea, { ...defaultTrackOptions(idea), solo: 'on' });
    const id = g === 'pop' || g === 'funk' ? 'electric-clean' : g === 'rock' ? 'electric-crunch' : 'electric-dist';
    const r = read(toMidi(tr.sections, { chordIdFor: () => id, guitar2IdFor: () => id, vocal: 'auto', backing: 'off' }))!;
    const vi = findVox(r.T), li = r.T.findIndex((t) => t.name === 'Guitar 2');
    if (vi < 0 || li < 0) continue;
    const band = r.T.filter((t, k) => k !== vi && k !== li && t.ch !== 9 && !/vo(cal|x|ice)|twin/i.test(t.name)).flatMap((t) => t.ns);
    const low: number[] = [];
    for (const n of band) for (let x = Math.ceil((n.s - 0.02) * 4); x < n.e * 4 - 0.08 && x < 40000; x++) if (!low[x] || n.p < low[x]) low[x] = n.p;
    findSolos('app', r.T, vi, r.T[li], low, idea.song.key, MINORISH.includes(idea.song.mode), -1 - i, 'app', g);
  }
}

const shared = (m: Map<string, Seen>, s: number, ar: number) => [...m].filter(([, r]) => r.songs >= s && r.artists.size >= ar).sort((x, y) => y[1].songs - x[1].songs)
  .map(([k, r]) => ({ k, songs: r.songs, artists: r.artists.size, genres: r.genres }));
// the new solo writer's vocabulary (src/parts/solo2.ts): every shape shared by 10+ songs from 8+ artists
if (REAL && process.env.WRITE) {
  const GENRES = ['pop', 'rock', 'hardrock', 'metal', 'grunge', 'altmetal', 'funk'];
  const v = shared(licks, 10, 8).map(({ k, songs: n, genres }) => { const [m, d0, st] = k.split('|'); return [m, +d0, st.split(',').map(Number), n, GENRES.map((g) => genres[g] ?? 0)]; });
  fs.writeFileSync('src/realism/solo-licks.json', JSON.stringify({ about: 'docs/STUDY-SOLO.md: note shapes (from the key root, then the steps) played in real guitar solos by 10+ songs from 8+ artists (Lakh MIDI collection); counts only', genres: GENRES, shapes: v }));
}
fs.writeFileSync(OUT, JSON.stringify({ songs, solos, licks: shared(licks, 10, 8).slice(0, 400), licksR: shared(licksR, 6, 5).slice(0, 300) }));
console.log('songs with a lead', songs, 'solos', solos.length, 'solo songs', new Set(solos.map((s) => s.artist + s.n)).size, 'licks seen', licks.size, 'shared', shared(licks, 10, 8).length, 'with rhythm', shared(licksR, 6, 5).length);
