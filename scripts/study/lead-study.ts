// Lead guitar study (docs/STUDY-LEAD.md): the lead guitar parts of the Lakh MIDI collection's songs beside the app's
// Guitar 2, measured by the same code. Real side: songs with a singer's line (lakh-songs.ts' finder) and a lead guitar
// (a guitar track, not the singer's, one note at a time, above the rhythm register; a track named lead or solo first).
// App side: N songs per genre built as tracks and exported with the app's own MIDI export (vocal on), read back by the
// same reader. Numbers only: no notes or phrases of any song are kept.
// Run: npm run lead-study (REAL=0 to skip the collection, N=40 app songs per genre; writes OUT, default lead-study.json)
import fs from 'node:fs';
import path from 'node:path';
import { parseMidi } from 'midi-file';
import { generate } from '../../src/generator';
import type { Genre } from '../../src/genres';
import { buildTrack, defaultTrackOptions } from '../../src/track';
import { toMidi } from '../../src/export/midi';
import { MAJ as KMAJ, MIN as KMIN, corr, findVox, genreOf, norm, type N } from './lakh-songs';

const ROOT = process.argv[2] ?? 'experiments/MidiCollection';
const GENRES: Genre[] = ['rock', 'pop', 'funk', 'hardrock', 'metal', 'grunge', 'altmetal'];
const N_APP = Number(process.env.N ?? 40), OUT = process.env.OUT ?? 'lead-study.json';
const mod = (n: number, m: number) => ((n % m) + m) % m;
const median = (a: number[]) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
const SCALE = { maj: [0, 2, 4, 5, 7, 9, 11], min: [0, 2, 3, 5, 7, 8, 10] };
const PENTA = { maj: [0, 2, 4, 7, 9], min: [0, 3, 5, 7, 10] };

interface BN extends N { bent?: boolean }
interface Track { name: string; ch: number; prog: number; ns: BN[] }

/** Every track's notes (in beats), with notes bent by pitch-bend events marked. */
function read(bytes: Uint8Array): { T: Track[]; ts: string; bpm: number } | null {
  let m; try { m = parseMidi(bytes); } catch { return null; }
  const ppq = (m.header as { ticksPerBeat?: number }).ticksPerBeat;
  if (!ppq) return null;
  let ts = '', bpm = 0;
  const T = m.tracks.map((t) => {
    let tick = 0, name = '', ch = -1, prog = -1;
    const on: Record<number, number> = {}, ns: BN[] = [], bends: number[] = [];
    for (const e of t as any[]) {
      tick += e.deltaTime;
      if (e.type === 'trackName' && !name) name = (e.text || '').trim();
      else if (e.type === 'timeSignature' && !ts) ts = `${e.numerator}/${e.denominator}`;
      else if (e.type === 'setTempo' && !bpm) bpm = 60000000 / e.microsecondsPerBeat;
      else if (e.type === 'programChange' && prog < 0) prog = e.programNumber;
      else if (e.type === 'pitchBend' && Math.abs(e.value) > 400) bends.push(tick / ppq);
      else if (e.type === 'noteOn' && e.velocity > 0) { on[e.channel * 128 + e.noteNumber] = tick; ch = e.channel; }
      else if (e.type === 'noteOff' || (e.type === 'noteOn' && e.velocity === 0)) { const k = e.channel * 128 + e.noteNumber; if (on[k] !== undefined) { ns.push({ s: on[k] / ppq, e: tick / ppq, p: e.noteNumber }); delete on[k]; } }
    }
    ns.sort((x, y) => x.s - y.s || x.p - y.p);
    if (bends.length) { let j = 0; for (const n of ns) { while (j < bends.length && bends[j] < n.s - 0.01) j++; if (j < bends.length && bends[j] < n.e) n.bent = true; } }
    return { name, ch, prog, ns };
  });
  return { T, ts, bpm: bpm || 120 };
}

/** Onsets: notes struck together (within a 32nd) are one. */
const onsets = (ns: BN[]) => { const o: BN[][] = []; for (const n of ns) { const l = o[o.length - 1]; if (l && n.s - l[0].s < 0.12) l.push(n); else o.push([n]); } return o; };
const NOT_GTR = /vo(c|x|ice)|sax|key|synth|piano|organ|string|bass|trump|flute|horn|brass|harp|pad|sing|melod/i;
const guitarish = (t: Track) => t.ch !== 9 && !/bass/i.test(t.name) && ((t.prog >= 24 && t.prog <= 31 && !NOT_GTR.test(t.name)) || (/guit|gtr|solo|lead|\bgt\b/i.test(t.name) && !NOT_GTR.test(t.name) && (t.prog < 0 || t.prog <= 31)));
/** A lead line: mostly one note at a time, above the rhythm register, more than a few pitches. */
function isLead(t: Track) {
  if (t.ns.length < 30) return false;
  const o = onsets(t.ns), ps = t.ns.map((n) => n.p);
  return o.filter((x) => new Set(x.map((n) => n.p)).size >= 3).length / o.length < 0.25 && median(ps) >= 57 && new Set(ps).size >= 7;
}

interface Rec {
  side: 'real' | 'app'; genre: string; artist: string;
  has: number; named?: number; leads?: number; doubles?: number; twin?: number;
  presence?: number; withVox?: number; voxBarsFilled?: number; solos?: number; soloBars?: number[]; soloAt?: number[];
  nps?: number; npsSolo?: number; npsVerse?: number;
  len?: number[]; pos?: number[]; step?: number[]; up?: number; phraseNotes?: number; phraseBeats?: number;
  range?: number; height?: number; aboveVox?: number; onBand?: number; onBandHeld?: number; inScale?: number; inPenta?: number; blue?: number;
  bent?: number; dbl?: number; grace?: number; onGtr?: number; soloWhere?: number[]; answered?: number; second?: number; fast?: number; fastest?: number; repeat2?: number; barKind?: number[]; bpm?: number;
  appTech?: Record<string, number>;
}

function measure(T: Track[], bpm: number, side: 'real' | 'app', genre: string, artist: string, tech?: Record<string, number>): Rec | null {
  const vi = findVox(T);
  if (vi < 0) return null;
  const vox = T[vi].ns;
  const cands = T.map((t, i) => ({ t, i })).filter(({ t, i }) => i !== vi && guitarish(t) && isLead(t));
  const rec: Rec = { side, genre, artist, has: 0, bpm };
  // a guitar playing the singer's line along with them is a double, not a lead
  const voxOn = new Map<number, number>(); for (const n of vox) voxOn.set(Math.round(n.s * 4), n.p % 12);
  const doubles = (t: Track) => t.ns.filter((n) => voxOn.get(Math.round(n.s * 4)) === n.p % 12).length / t.ns.length > 0.5;
  const leads = cands.filter(({ t }) => !doubles(t));
  rec.doubles = cands.length > leads.length ? 1 : 0;
  // the band: everything but the singer, the leads and the drums
  const leadIx = new Set(leads.map((c) => c.i));
  const band = T.filter((t, i) => i !== vi && !leadIx.has(i) && t.ch !== 9 && !/vo(c|x|ice)|melod|harm|back/i.test(t.name)).flatMap((t) => t.ns);
  if (band.length < 100) return null;
  const end = Math.max(...T.flatMap((t) => t.ns.map((n) => n.e)));
  const nBars = Math.ceil(end / 4);
  if (nBars < 16) return null;
  if (!leads.length) return rec;
  leads.sort((a, b) => Number(/lead|solo/i.test(b.t.name)) - Number(/lead|solo/i.test(a.t.name)) || b.t.ns.length - a.t.ns.length);
  const L = leads[0].t;
  rec.has = 1; rec.named = /lead|solo/i.test(L.name) ? 1 : 0; rec.leads = leads.length;
  // key
  const pc = new Array(12).fill(0); for (const n of band.concat(vox)) pc[n.p % 12] += n.e - n.s;
  let best = -2, tonic = 0, minor = false;
  for (let k = 0; k < 12; k++) { const rot = pc.slice(k).concat(pc.slice(0, k)); const x = corr(rot, KMAJ), y = corr(rot, KMIN); if (x > best) { best = x; tonic = k; minor = false; } if (y > best) { best = y; tonic = k; minor = true; } }
  const slots: Set<number>[] = [], gslots: Set<number>[] = [];
  for (const n of band) for (let s = Math.ceil((n.s - 0.02) * 4); s < n.e * 4 - 0.08 && s < 40000; s++) (slots[s] ??= new Set()).add(n.p % 12);
  // (the guitars and bass only: the app's export has no keys, so this one is fair to both sides)
  const gb = T.filter((t, i) => i !== vi && !leadIx.has(i) && t.ch !== 9 && t.prog >= 24 && t.prog <= 39).flatMap((t) => t.ns);
  for (const n of gb) for (let s = Math.ceil((n.s - 0.02) * 4); s < n.e * 4 - 0.08 && s < 40000; s++) (gslots[s] ??= new Set()).add(n.p % 12);
  const O = onsets(L.ns), top = O.map((o) => o.reduce((a, b) => (b.p > a.p ? b : a)));
  // twin leads: another lead guitar a 3rd or 6th away at the same moments
  if (leads.length > 1) {
    const at = new Map<number, number>(); for (const n of leads[1].t.ns) at.set(Math.round(n.s * 4), n.p);
    rec.twin = top.filter((n) => { const q = at.get(Math.round(n.s * 4)); return q !== undefined && [3, 4, 8, 9].includes(mod(n.p - q, 12)); }).length / top.length > 0.3 ? 1 : 0;
  } else rec.twin = 0;
  // where it plays: bars, against the singer
  const leadBar = new Array(nBars).fill(0), voxBar = new Array(nBars).fill(0);
  for (const n of top) leadBar[Math.min(nBars - 1, Math.floor(n.s / 4))]++;
  for (const n of vox) voxBar[Math.min(nBars - 1, Math.floor(n.s / 4))]++;
  const first = Math.min(L.ns[0].s, vox[0].s, band[0].s);
  const songBars = nBars - Math.floor(first / 4);
  rec.presence = leadBar.filter((x) => x > 0).length / songBars;
  // the singer's phrases (gaps under a beat joined): lead notes inside them are "with the singer"
  const ph: [number, number][] = []; for (const n of vox) { const l = ph[ph.length - 1]; if (l && n.s - l[1] < 1) l[1] = Math.max(l[1], n.e); else ph.push([n.s, n.e]); }
  let j = 0, inside = 0;
  for (const n of top) { while (j < ph.length && ph[j][1] < n.s) j++; if (j < ph.length && ph[j][0] <= n.s) inside++; }
  rec.withVox = inside / top.length;
  const voxBars = voxBar.map((x, i) => [x, i]).filter(([x]) => x >= 2).map(([, i]) => i);
  rec.voxBarsFilled = voxBars.filter((i) => leadBar[i] > 0).length / Math.max(1, voxBars.length);
  // solos: 4+ bars with no singing and the lead playing 3+ notes in most of them
  const soloBar = leadBar.map((x, i) => voxBar[i] === 0 && x >= 3);
  rec.soloBars = []; rec.soloAt = [];
  const inSolo = new Array(nBars).fill(false);
  for (let i = 0; i < nBars;) {
    if (!soloBar[i]) { i++; continue; }
    let k = i; while (k + 1 < nBars && (soloBar[k + 1] || (k + 2 < nBars && soloBar[k + 2] && voxBar[k + 1] === 0))) k++;
    if (k - i + 1 >= 4) { rec.soloBars.push(k - i + 1); rec.soloAt.push((i - first / 4) / songBars); for (let b = i; b <= k; b++) inSolo[b] = true; }
    i = k + 1;
  }
  rec.solos = rec.soloBars.length;
  rec.soloWhere = [0, 0, 0]; // intro, middle, outro
  for (let k = 0; k < rec.soloAt.length; k++) { const a = rec.soloAt[k], b = a + rec.soloBars[k] / songBars; rec.soloWhere[a < 0.08 ? 0 : b > 0.92 ? 2 : 1]++; }
  // answers: a sung line (2+ beats) followed by a gap of a beat or more inside the singing: does the lead play in the gap?
  let gaps = 0, answered = 0;
  for (let k = 0; k + 1 < ph.length; k++) {
    const [a0, a1] = ph[k], b0 = ph[k + 1][0];
    if (a1 - a0 < 2 || b0 - a1 < 1 || b0 - a1 > 8) continue;
    gaps++; if (top.some((n) => n.s >= a1 - 0.25 && n.s < b0)) answered++;
  }
  rec.answered = gaps >= 4 ? answered / gaps : NaN;
  // a second lead line: in the same bars as the first (a harmony or double), or elsewhere (another part, a solo track)
  if (leads.length > 1) { const b2 = new Set(leads[1].t.ns.map((n) => Math.floor(n.s / 4))); const b1 = new Set(top.map((n) => Math.floor(n.s / 4))); rec.second = [...b2].filter((b) => b1.has(b)).length / b2.size; }
  const active = leadBar.map((x, i) => [x, i]).filter(([x]) => x > 0);
  rec.nps = top.length / active.length;
  const sb = active.filter(([, i]) => inSolo[i]), vb = active.filter(([, i]) => !inSolo[i] && voxBar[i] > 0);
  rec.npsSolo = sb.length ? sb.reduce((s, [x]) => s + x, 0) / sb.length : NaN;
  rec.npsVerse = vb.length ? vb.reduce((s, [x]) => s + x, 0) / vb.length : NaN;
  // lengths (to the next onset, capped by the note): 32nd, 16th, 8th, quarter, half+ ; and where onsets fall
  rec.len = [0, 0, 0, 0, 0]; rec.pos = [0, 0, 0, 0, 0, 0]; // beat, e, &, a, triplet, off-grid
  let fast = 0, fastest = 0;
  top.forEach((n, i) => {
    const ioi = i + 1 < top.length ? top[i + 1].s - n.s : 4;
    const l = Math.min(n.e - n.s, ioi);
    rec.len![l < 0.19 ? 0 : l < 0.37 ? 1 : l < 0.74 ? 2 : l < 1.5 ? 3 : 4]++;
    const f = mod(n.s, 1), q = Math.round(f * 4), dq = Math.abs(f * 4 - q);
    if (dq < 0.12) rec.pos![q % 4]++;
    else if (Math.abs(f - 1 / 3) < 0.06 || Math.abs(f - 2 / 3) < 0.06) rec.pos![4]++;
    else rec.pos![5]++;
  });
  // fast runs: 4+ notes in a row each a 16th or less apart; the fastest bar in notes a second
  for (let i = 0; i < top.length;) { let k = i; while (k + 1 < top.length && top[k + 1].s - top[k].s <= 0.27) k++; if (k - i + 1 >= 4) fast += k - i + 1; i = k + 1; }
  rec.fast = fast / top.length;
  for (const [x] of active) fastest = Math.max(fastest, x);
  rec.fastest = fastest / (4 * 60 / bpm);
  rec.len = rec.len.map((x) => x / top.length); rec.pos = rec.pos.map((x) => x / top.length);
  // steps between notes inside phrases (a rest of a beat or more ends one): same, 1-2, 3-4, 5-7, 8+
  rec.step = [0, 0, 0, 0, 0]; let up = 0, moves = 0, nSteps = 0;
  const phrases: BN[][] = [];
  top.forEach((n, i) => { const p = top[i - 1]; if (p && n.s - p.e < 1 && n.s - p.s < 3) { phrases[phrases.length - 1].push(n); const d = Math.abs(n.p - p.p); rec.step![d === 0 ? 0 : d <= 2 ? 1 : d <= 4 ? 2 : d <= 7 ? 3 : 4]++; nSteps++; if (d) { moves++; if (n.p > p.p) up++; } } else phrases.push([n]); });
  rec.step = rec.step.map((x) => x / Math.max(1, nSteps)); rec.up = up / Math.max(1, moves);
  rec.phraseNotes = median(phrases.map((p) => p.length));
  rec.phraseBeats = median(phrases.map((p) => p[p.length - 1].e - p[0].s));
  const ps = top.map((n) => n.p).sort((a, b) => a - b);
  rec.range = ps[Math.floor(ps.length * 0.95)] - ps[Math.floor(ps.length * 0.05)];
  rec.height = median(ps); rec.aboveVox = rec.height - median(vox.map((n) => n.p));
  // against the band and the key
  const sc = SCALE[minor ? 'min' : 'maj'], pe = PENTA[minor ? 'min' : 'maj'];
  let onB = 0, nB = 0, held = 0, heldOn = 0, inS = 0, inP = 0, blue = 0, onG = 0, nG = 0;
  for (const n of top) {
    const g = gslots[Math.round(n.s * 4)];
    if (g && g.size) { nG++; if (g.has(n.p % 12)) onG++; }
    const s = slots[Math.round(n.s * 4)];
    if (s && s.size) { nB++; if (s.has(n.p % 12)) onB++; if (n.e - n.s >= 0.5) { held++; if (s.has(n.p % 12)) heldOn++; } }
    const d = mod(n.p - tonic, 12);
    if (sc.includes(d)) inS++; if (pe.includes(d)) inP++;
    if (d === 6 || (!minor && (d === 3 || d === 10))) blue++;
  }
  rec.onGtr = nG >= 20 ? onG / nG : NaN;
  rec.onBand = onB / Math.max(1, nB); rec.onBandHeld = held >= 5 ? heldOn / held : NaN;
  rec.inScale = inS / top.length; rec.inPenta = inP / top.length; rec.blue = blue / top.length;
  rec.bent = L.ns.filter((n) => n.bent).length / L.ns.length;
  rec.grace = top.filter((n, i) => i + 1 < top.length && top[i + 1].s - n.s <= 0.13 && Math.abs(top[i + 1].p - n.p) <= 2 && top[i + 1].p !== n.p).length / top.length;
  rec.dbl = O.filter((o) => new Set(o.map((n) => n.p)).size === 2).length / O.length;
  // 2-bar stretches (rhythm and steps) heard again in the lead part
  const key2 = (b: number) => { const ns = top.filter((n) => n.s >= b * 4 && n.s < b * 4 + 8); return ns.length < 3 ? '' : ns.map((n, i) => `${Math.round((n.s - b * 4) * 4)}:${i ? n.p - ns[i - 1].p : 0}`).join(','); };
  const ks = new Map<string, number>(); for (let b = 0; b + 1 < nBars; b += 2) { const k = key2(b); if (k) ks.set(k, (ks.get(k) ?? 0) + 1); }
  let rep = 0, tot = 0; for (const c of ks.values()) { tot += c; if (c > 1) rep += c; }
  rec.repeat2 = tot ? rep / tot : NaN;
  // what a bar of lead is: a lick (1-5 notes), a line (6+ notes, moving), an arpeggio (6+ notes on 4 or fewer chord notes)
  rec.barKind = [0, 0, 0];
  for (const [x, i] of active) {
    const ns = top.filter((n) => Math.floor(n.s / 4) === i);
    const pcs = new Set(ns.map((n) => n.p % 12)), on = ns.filter((n) => slots[Math.round(n.s * 4)]?.has(n.p % 12)).length;
    rec.barKind[x <= 5 ? 0 : pcs.size <= 4 && on >= 0.8 * ns.length ? 2 : 1]++;
  }
  rec.barKind = rec.barKind.map((x) => x / active.length);
  if (tech) rec.appTech = tech;
  return rec;
}

const recs: Rec[] = [];
if (process.env.REAL !== '0') {
  const seen = new Set<string>();
  let files = 0;
  for (const a of fs.readdirSync(ROOT)) {
    const d = path.join(ROOT, a);
    if (!fs.statSync(d).isDirectory()) continue;
    for (const f of fs.readdirSync(d)) {
      if (!/\.mid$/i.test(f)) continue;
      const key = `${a}/${f}`.replace(/\.\d+\.mid$/i, '.mid').toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const r = read(fs.readFileSync(path.join(d, f)));
      if (!r || (r.ts && r.ts !== '4/4')) continue;
      files++;
      const m = measure(r.T, r.bpm, 'real', genreOf[norm(a)] ?? 'other', a);
      if (m) recs.push(m);
    }
  }
  console.log('real files', files, 'with a singer', recs.length, 'with a lead guitar', recs.filter((r) => r.has).length);
}
for (const g of GENRES) {
  for (let i = 0; i < N_APP; i++) {
    const s = `${g}-lead-${i}`;
    const idea = generate({ genre: g, meter: '4/4', weirdness: 0.3 } as Parameters<typeof generate>[0], { song: s, chords: s + 'c', drums: s + 'd', strum: s + 's', bass: s + 'b', vocal: s + 'v' });
    const tr = buildTrack(idea, defaultTrackOptions(idea));
    const id = g === 'pop' || g === 'funk' ? 'electric-clean' : g === 'rock' ? 'electric-crunch' : 'electric-dist';
    const bytes = toMidi(tr.sections, { chordIdFor: () => id, guitar2IdFor: () => id, vocal: 'auto', backing: 'off' });
    // the app's techniques (written on the notes; not in MIDI): share of Guitar 2's notes
    const hs = tr.sections.flatMap((x) => x.guitar2);
    const tech: Record<string, number> = { bend: 0, unbend: 0, slide: 0, legato: 0, trill: 0, tremolo: 0, rake: 0, vib: 0, dead: 0 };
    for (const h of hs) { if (h.bend) tech.bend++; if (h.unbend) tech.unbend++; if (h.slide || h.art === 'slide') tech.slide++; if (h.art === 'legato') tech.legato++; if (h.trill) tech.trill++; if (h.tremolo) tech.tremolo++; if (h.rake) tech.rake++; if (h.vib) tech.vib++; if (h.mute === 'dead') tech.dead++; }
    for (const k of Object.keys(tech)) tech[k] /= Math.max(1, hs.length);
    const r = read(bytes)!;
    const m = measure(r.T, idea.song.bpm, 'app', g, 'app', tech);
    if (m) recs.push(m);
    else console.log('app song not measured', s);
  }
}
fs.writeFileSync(OUT, JSON.stringify(recs));
console.log('wrote', recs.length, 'records to', OUT);
