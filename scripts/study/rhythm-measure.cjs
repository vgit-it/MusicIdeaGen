// Rhythm guitar study (docs/STUDY-RHYTHM.md). Run: node scripts/study/rhythm-measure.cjs <folder of folders of .mid> <out.json> [app]
// Measures the rhythm guitar of every song in the folder (one level of sub-folders: the artist, or the genre for the app's
// own MIDI) and writes per-song numbers, then prints a table per genre. The same code measures real songs and the app's
// export, so the two sides are counted the same way. Numbers only: no notes, patterns or phrases of any song are kept
// except 1-bar rhythm shapes (which of the 16 slots are struck), counted across songs.
const fs = require('fs'), path = require('path');
const { parseMidi } = require('midi-file');

const root = process.argv[2], out = process.argv[3], APP = process.argv[4] === 'app';
const G = {
  metal: ['Metallica', 'Iron_Maiden', 'Black_Sabbath', 'Megadeth', 'Judas_Priest', 'Ozzy_Osbourne', 'Slayer', 'Pantera', 'Motorhead', 'Dio', 'Anthrax', 'Korn', 'Tool', 'Deftones', 'Rage_Against_the_Machine', 'Disturbed', 'Slipknot', 'Sepultura'],
  grunge: ['Nirvana', 'Pearl_Jam', 'Soundgarden', 'Alice_in_Chains', 'Stone_Temple_Pilots', 'Foo_Fighters', 'Smashing_Pumpkins', 'Bush', 'Silverchair', 'Hole'],
  hardrock: ['AC_DC', 'Led_Zeppelin', 'Deep_Purple', 'Aerosmith', 'Van_Halen', 'Kiss', 'Def_Leppard', 'Bon_Jovi', 'Scorpions', 'Whitesnake', 'Guns_N_Roses', 'Motley_Crue', 'Europe', 'Rainbow', 'Thin_Lizzy', 'Uriah_Heep', 'Twisted_Sister', 'Skid_Row', 'Poison', 'Cinderella'],
  rock: ['The_Beatles', 'The_Rolling_Stones', 'U2', 'Queen', 'Green_Day', 'Oasis', 'Radiohead', 'The_Who', 'Pink_Floyd', 'R.E.M.', 'Bruce_Springsteen', 'Eagles', 'Dire_Straits', 'The_Police', 'Creedence_Clearwater_Revival', 'Tom_Petty_and_the_Heartbreakers', 'The_Doors', 'Blur', 'The_Kinks', 'ZZ_Top', 'The_Cure', 'Red_Hot_Chili_Peppers', 'Bryan_Adams', 'Fleetwood_Mac'],
  pop: ['Madonna', 'Michael_Jackson', 'ABBA', 'Britney_Spears', 'Backstreet_Boys', 'Spice_Girls', 'Kylie_Minogue', 'Whitney_Houston', 'Mariah_Carey', 'Celine_Dion', 'Elton_John', 'George_Michael', 'Phil_Collins', 'Roxette', 'Duran_Duran', 'Pet_Shop_Boys', 'Madness', 'Bee_Gees', 'Lionel_Richie', 'Cyndi_Lauper', 'Wham!', 'Robbie_Williams', 'Take_That', 'Westlife', 'Shania_Twain'],
  funk: ['James_Brown', 'Stevie_Wonder', 'Earth,_Wind_&_Fire', 'Kool_&_the_Gang', 'Prince', 'Chic', 'Sly_&_the_Family_Stone', 'Parliament', 'Rick_James', 'The_Commodores', 'Jamiroquai', 'Tower_of_Power', 'Average_White_Band'],
};
const genreOf = (dir) => { if (APP) return dir; const a = dir.replace(/ /g, '_').replace(/'/g, ''); for (const [g, l] of Object.entries(G)) if (l.includes(a)) return g; return 'other'; };

const files = [];
for (const a of fs.readdirSync(root)) {
  const d = path.join(root, a);
  if (!fs.statSync(d).isDirectory()) continue;
  const seen = new Set();
  for (const f of fs.readdirSync(d).sort()) {
    if (!/\.mid$/i.test(f)) continue;
    const key = APP ? f : f.replace(/\.\d+\.mid$/i, '.mid').toLowerCase(); // one version per song
    if (seen.has(key)) continue;
    seen.add(key); files.push([a, f]);
  }
}

const slotOf = (beats) => Math.round(beats * 4);
const median = (a) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const mean = (a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN;
const qualityOf = (notes) => {
  const low = Math.min(...notes), pcs = new Set(notes.map((n) => ((n - low) % 12 + 12) % 12));
  const has = (...x) => x.every((i) => pcs.has(i));
  if (pcs.size === 1) return 'single';
  if (pcs.size === 2 && has(7)) return 'power';
  if (pcs.size === 2) return 'dyad';
  if (has(0, 7) && !pcs.has(3) && !pcs.has(4)) return has(2) ? 'sus2' : has(5) ? 'sus4' : 'other';
  if ((has(4, 7) || has(3, 7)) && (pcs.has(10) || pcs.has(11) || pcs.has(9) && has(3))) return 'seventh';
  if ((has(4, 7) || has(3, 7)) && pcs.has(2)) return 'add9';
  if (has(4, 7) || has(3, 7)) return pcs.size === 3 ? 'triad' : 'triad+';
  return 'other';
};

function readNotes(m) {
  const ppq = m.header.ticksPerBeat;
  let bpm = 120, ts = null;
  const tracks = [];
  m.tracks.forEach((t, ti) => {
    let tick = 0, name = '', prog = -1, ch = -1;
    const on = {}, ns = [];
    for (const e of t) {
      tick += e.deltaTime;
      if (e.type === 'trackName' && !name) name = (e.text || '').trim();
      else if (e.type === 'setTempo' && ti === 0 && tick === 0) bpm = 60e6 / e.microsecondsPerBeat;
      else if (e.type === 'setTempo' && bpm === 120 && !tracks.length) bpm = 60e6 / e.microsecondsPerBeat;
      else if (e.type === 'timeSignature' && !ts) ts = `${e.numerator}/${e.denominator}`;
      else if (e.type === 'programChange' && prog < 0) prog = e.programNumber;
      else if (e.type === 'noteOn' && e.velocity > 0) { on[e.channel * 128 + e.noteNumber] = [tick, e.velocity]; ch = e.channel; }
      else if (e.type === 'noteOff' || (e.type === 'noteOn' && e.velocity === 0)) {
        const k = e.channel * 128 + e.noteNumber, o = on[k];
        if (o) { ns.push({ s: o[0] / ppq, e: tick / ppq, p: e.noteNumber, v: o[1] }); delete on[k]; }
      }
    }
    ns.sort((a, b) => a.s - b.s || a.p - b.p);
    tracks.push({ ti, name, prog, ch, ns });
  });
  return { ppq, bpm, ts, tracks };
}

const BASS = /bass|bajo|basso/i, LEADN = /lead|solo|melod|vocal|vox/i, GUIT = /guit|gtr|git|rhythm|strum|acous|\bgt\b|chord/i;
const isGuitarTrack = (t) => t.ch !== 9 && t.ns.length >= 30 && !BASS.test(t.name) && ((t.prog >= 24 && t.prog <= 31) || (GUIT.test(t.name) && !(t.prog >= 32 && t.prog <= 39) && !(t.prog >= 40)));

// notes within 0.15 beat of a group's first note are one hit (a strum's spread)
function toHits(ns) {
  const hits = [];
  for (const n of ns) {
    const h = hits[hits.length - 1];
    if (h && n.s - h.s <= 0.15) { h.notes.push(n); } else hits.push({ s: n.s, notes: [n] });
  }
  for (const h of hits) {
    h.pitches = h.notes.map((n) => n.p);
    h.size = new Set(h.pitches).size;
    h.vel = mean(h.notes.map((n) => n.v));
    h.end = median(h.notes.map((n) => n.e));
    h.spread = h.notes[h.notes.length - 1].s - h.s;
  }
  return hits;
}

function measureTrack(t, rd) {
  const hits = toHits(t.ns);
  if (hits.length < 20) return null;
  const msPerBeat = 60000 / rd.bpm;
  const r = { hits: hits.length, prog: t.prog, name: t.name };
  // chordal or single-note
  r.chordalShare = hits.filter((h) => h.size >= 2).length / hits.length;
  const nBars = Math.floor(Math.max(...hits.map((h) => h.s)) / 4) + 1;
  const barHits = Array.from({ length: nBars }, () => []);
  for (const h of hits) barHits[Math.floor(h.s / 4)].push(h);
  const active = barHits.map((b, i) => [i, b]).filter(([, b]) => b.length);
  r.bars = nBars; r.activeBars = active.length;
  r.silentShare = 1 - active.length / nBars;
  r.hitsPerBar = hits.length / active.length;
  // slots
  r.slotHist = new Array(16).fill(0); r.slotVel = new Array(16).fill(0); const slotN = new Array(16).fill(0);
  let onGrid = 0, devs = [], trip = 0, sixteenth = 0, offEighth = 0;
  for (const h of hits) {
    const pos = h.s - Math.floor(h.s / 4) * 4, sl = slotOf(pos) % 16;
    r.slotHist[sl]++; r.slotVel[sl] += h.vel; slotN[sl]++;
    const dev = Math.abs(pos * 4 - Math.round(pos * 4)); devs.push(dev * msPerBeat / 4);
    if (dev < 0.12) onGrid++;
    const fr = (pos % 1);
    if (Math.abs(fr - 1 / 3) < 0.07 || Math.abs(fr - 2 / 3) < 0.07) trip++;
    if (sl % 2 === 1) sixteenth++;
    if (sl % 4 === 2) offEighth++;
  }
  r.slotHist = r.slotHist.map((x) => x / hits.length);
  r.slotVel = r.slotVel.map((x, i) => slotN[i] ? x / slotN[i] : null);
  r.onGrid = onGrid / hits.length; r.devMs = median(devs); r.devMean = mean(devs);
  r.tripletShare = trip / hits.length; r.sixteenthShare = sixteenth / hits.length; r.eighthOffShare = offEighth / hits.length;
  // sizes and qualities
  r.size = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, '6+': 0 };
  r.qual = {};
  for (const h of hits) {
    const k = h.pitches.length >= 6 ? '6+' : h.pitches.length; r.size[k] = (r.size[k] || 0) + 1 / hits.length;
    const q = qualityOf(h.pitches); r.qual[q] = (r.qual[q] || 0) + 1 / hits.length;
  }
  const lows = hits.map((h) => Math.min(...h.pitches)), tops = hits.map((h) => Math.max(...h.pitches));
  r.lowMed = median(lows); r.topMed = median(tops); r.spanMed = median(hits.map((h, i) => tops[i] - lows[i]));
  r.distinctPitches = new Set(t.ns.map((n) => n.p)).size;
  // lengths relative to the gap to the next hit
  r.len = { staccato: 0, mid: 0, ring: 0 }; let held = 0, nlen = 0;
  hits.forEach((h, i) => {
    const nxt = hits[i + 1]; if (!nxt) return;
    const gap = Math.min(nxt.s - h.s, 4); if (gap <= 0.05) return;
    const ratio = (h.end - h.s) / gap; nlen++;
    if (ratio < 0.4) r.len.staccato++; else if (ratio < 0.85) r.len.mid++; else r.len.ring++;
    if (h.end - h.s >= 3) held++;
  });
  for (const k of Object.keys(r.len)) r.len[k] /= nlen || 1;
  r.heldPadShare = held / (nlen || 1);
  // velocity
  const vs = hits.map((h) => h.vel), vm = mean(vs), vsd = Math.sqrt(mean(vs.map((v) => (v - vm) ** 2)));
  r.velMean = vm; r.velSd = vsd; r.velCv = vsd / vm; r.constVel = vsd < 2 ? 1 : 0;
  const beatV = [], offV = [];
  hits.forEach((h) => { const sl = slotOf(h.s % 4 * 1) % 16; (sl % 4 === 0 ? beatV : offV).push(h.vel); });
  r.accentRatio = beatV.length && offV.length ? mean(beatV) / mean(offV) : NaN;
  // strum spread and direction
  const sp = hits.filter((h) => h.size >= 3 && h.notes.length >= 3);
  const withSpread = sp.filter((h) => h.spread > 0.004);
  r.spreadShare = sp.length ? withSpread.length / sp.length : NaN; r.spreadN = sp.length;
  if (withSpread.length >= 10) {
    r.spreadMs = median(withSpread.map((h) => h.spread * msPerBeat));
    let down = 0, downB = 0, nB = 0, downO = 0, nO = 0;
    for (const h of withSpread) {
      const d = h.notes[0].p < h.notes[h.notes.length - 1].p; if (d) down++;
      const sl = slotOf(h.s % 4) % 16; if (sl % 2 === 0) { nB++; if (d) downB++; } else { nO++; if (d) downO++; }
    }
    r.downShare = down / withSpread.length; r.downOnEighth = nB ? downB / nB : NaN; r.downOnSixteenth = nO ? downO / nO : NaN;
  }
  // bar patterns
  const pat = (b) => { const s = new Set(); b.forEach((h) => s.add(slotOf(h.s % 4) % 16)); return [...s].sort((a, c) => a - c).join(','); };
  const pats = barHits.map((b) => b.length ? pat(b) : '');
  r.same = [[0, 0], [0, 0], [0, 0], [0, 0]]; // by bar in a 4-bar phrase: [n, identical to the bar before]
  let any4 = 0, any4n = 0, uniq = new Set();
  const counts = {};
  pats.forEach((p, i) => {
    if (!p) return;
    uniq.add(p); counts[p] = (counts[p] || 0) + 1;
    if (i > 0 && pats[i - 1]) { r.same[i % 4][0]++; if (pats[i - 1] === p) r.same[i % 4][1]++; }
    if (i >= 4) { any4n++; if (pats.slice(i - 4, i).includes(p)) any4++; }
  });
  r.any4 = any4n ? any4 / any4n : NaN;
  r.uniquePatterns = uniq.size / active.length;
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  r.topPatternShare = top ? top[1] / active.length : NaN;
  r.patterns = counts;
  // hit-count and velocity change within a phrase (bar j of 4: how much it differs from bar j-1)
  // bar kinds, licks
  r.barKind = { strum: 0, pick: 0, chug: 0, riff: 0, mixed: 0 };
  r.lickBars = 0; r.lickPos = [0, 0, 0, 0]; r.lickPos8 = new Array(8).fill(0); r.chordalBars = 0;
  for (const [i, b] of active) {
    const single = b.filter((h) => h.size === 1), multi = b.length - single.length;
    const pcs = new Set(single.map((h) => h.pitches[0] % 12)), pit = new Set(single.map((h) => h.pitches[0]));
    let k;
    if (multi >= b.length * 0.6) { k = 'strum'; r.chordalBars++; if (single.length >= 3 && single.length <= b.length - 2) { r.lickBars++; r.lickPos[i % 4]++; r.lickPos8[i % 8]++; } }
    else if (single.length >= b.length * 0.8) k = pit.size <= 2 ? 'chug' : (b.length >= 4 && pcs.size <= 4 && pit.size >= 3 ? 'pick' : 'riff');
    else k = 'mixed';
    r.barKind[k]++;
    if (k === 'strum' && !(multi >= b.length)) { /* a strum bar with some single notes */ }
  }
  for (const k of Object.keys(r.barKind)) r.barKind[k] /= active.length;
  // chord changes: where in the bar the new chord's first hit lands
  r.changeSlot = new Array(16).fill(0); let changes = 0, prevSet = null;
  for (const h of hits.filter((x) => x.size >= 2)) {
    const set = new Set(h.pitches.map((p) => p % 12));
    if (prevSet) {
      const inter = [...set].filter((x) => prevSet.has(x)).length, uni = new Set([...set, ...prevSet]).size;
      if (inter / uni < 0.5) { changes++; r.changeSlot[slotOf(h.s % 4) % 16]++; prevSet = set; }
    } else prevSet = set;
  }
  r.changes = changes;
  r.changeSlot = r.changeSlot.map((x) => changes ? x / changes : 0);
  // density per 8-bar block: does it move from section to section
  const blocks = []; for (let i = 0; i + 8 <= nBars; i += 8) blocks.push(barHits.slice(i, i + 8).reduce((s, b) => s + b.length, 0));
  let moved = 0, bn = 0; for (let i = 1; i < blocks.length; i++) if (blocks[i] && blocks[i - 1]) { bn++; if (Math.abs(blocks[i] - blocks[i - 1]) / Math.max(blocks[i], blocks[i - 1]) > 0.2) moved++; }
  r.blockMoved = bn ? moved / bn : NaN;
  // loudness per 8-bar block
  const bv = []; for (let i = 0; i + 8 <= nBars; i += 8) { const v = barHits.slice(i, i + 8).flat().map((h) => h.vel); bv.push(v.length ? mean(v) : null); }
  let vm2 = 0, vn2 = 0; for (let i = 1; i < bv.length; i++) if (bv[i] && bv[i - 1]) { vn2++; if (Math.abs(bv[i] - bv[i - 1]) / bv[i - 1] > 0.08) vm2++; }
  r.velBlockMoved = vn2 ? vm2 / vn2 : NaN;
  // push: a hit on the 'and' of 4 (slot 14) or the e/a before the bar; share of bars with such a hit that has no hit on slot 15... and a chord struck early
  r.push14 = active.filter(([, b]) => b.some((h) => slotOf(h.s % 4) % 16 === 14)).length / active.length;
  r.noBeat1 = active.filter(([, b]) => !b.some((h) => slotOf(h.s % 4) % 16 === 0)).length / active.length;
  r.stopBars = 0; // bars that start with a hit then go quiet for the last 2 beats
  for (const [, b] of active) if (b.length >= 1 && b.every((h) => h.s % 4 < 2)) r.stopBars++;
  r.stopBars /= active.length;
  // when it plays: first bar, bars at the end, silent runs in the middle
  const firstB = active[0][0], lastB = active[active.length - 1][0];
  r.firstBar = firstB; r.lastGap = nBars - 1 - lastB;
  let run = 0, runs4 = 0, runsAll = 0, midSilent = 0;
  for (let i = firstB; i <= lastB; i++) { if (!barHits[i].length) { run++; midSilent++; } else { if (run >= 1) runsAll++; if (run >= 4) runs4++; run = 0; } }
  r.midRuns = runsAll / ((lastB - firstB + 1) / 16); r.midRuns4 = runs4 / ((lastB - firstB + 1) / 16); r.midSilent = midSilent / (lastB - firstB + 1);
  r.harmRate = changes / active.length;
  r.hitsHist = { '1': 0, '2': 0, '3-4': 0, '5-6': 0, '7-8': 0, '9-12': 0, '13+': 0 };
  for (const [, b] of active) { const n = b.length; r.hitsHist[n === 1 ? '1' : n === 2 ? '2' : n <= 4 ? '3-4' : n <= 6 ? '5-6' : n <= 8 ? '7-8' : n <= 12 ? '9-12' : '13+'] += 1 / active.length; }
  r.barHits = barHits.map((b) => b.map((h) => slotOf(h.s % 4) % 16));
  r.barLow = barHits.map((b) => (b.length ? Math.min(...b.flatMap((h) => h.pitches)) : null));
  return r;
}

const recs = [];
let failed = 0;
for (const [a, f] of files) {
  let m; try { m = parseMidi(fs.readFileSync(path.join(root, a, f))); } catch { failed++; continue; }
  const rd = readNotes(m);
  if (!APP && rd.ts && rd.ts !== '4/4') continue;
  const gts = rd.tracks.filter(isGuitarTrack);
  if (!gts.length) { recs.push({ f: a + '/' + f, genre: genreOf(a), none: 1 }); continue; }
  const scored = gts.map((t) => ({ t, h: toHits(t.ns) })).map(({ t, h }) => ({ t, chordal: h.filter((x) => x.size >= 2).length, hits: h.length, lead: LEADN.test(t.name) }));
  const cand = scored.filter((s) => !s.lead);
  const pool = cand.length ? cand : scored;
  const rhythmTrack = APP ? (scored.find((s) => /^Rhythm guitar$/.test(s.t.name)) || pool[0]) : pool.sort((a2, b2) => b2.chordal - a2.chordal || b2.hits - a2.hits)[0];
  const r = measureTrack(rhythmTrack.t, rd);
  if (!r) { recs.push({ f: a + '/' + f, genre: genreOf(a), none: 1 }); continue; }
  r.f = a + '/' + f; r.genre = genreOf(a); r.bpm = rd.bpm;
  r.nGuitar = gts.length;
  const progs = gts.map((t) => t.prog);
  r.hasAcoustic = progs.some((p) => p >= 24 && p <= 26) ? 1 : 0;
  r.hasElectric = progs.some((p) => p >= 27 && p <= 31) ? 1 : 0;
  r.hasLead = gts.some((t) => LEADN.test(t.name)) ? 1 : 0;
  r.others = gts.filter((t) => t !== rhythmTrack.t).length;
  r.otherRoles = gts.filter((t) => t !== rhythmTrack.t).map((t) => {
    const o = measureTrack(t, rd); if (!o) return null;
    // how much it plays the same bars with the same hits as the main part, and how far above/below
    let both = 0, same = 0, overlapBars = 0, shared = 0, uni = 0, dLow = [];
    for (let i = 0; i < Math.min(r.barHits.length, o.barHits.length); i++) {
      const a = r.barHits[i], b = o.barHits[i]; if (!a.length || !b.length) continue;
      both++; const A = new Set(a), B = new Set(b);
      const inter = [...A].filter((x) => B.has(x)).length, un = new Set([...A, ...B]).size;
      shared += inter; uni += un; if (inter === un) same++;
      if (r.barLow[i] != null && o.barLow[i] != null) dLow.push(o.barLow[i] - r.barLow[i]);
    }
    const mainActive = r.barHits.filter((b) => b.length).length;
    return { lead: LEADN.test(t.name) ? 1 : 0, kind: o.chordalShare >= 0.5 ? 'chordal' : 'single', hitsPerBar: o.hitsPerBar, chordalShare: o.chordalShare, prog: o.prog,
      jaccard: uni ? shared / uni : NaN, identical: both ? same / both : NaN, overlap: both / mainActive, dLow: dLow.length ? median(dLow) : NaN, barKind: o.barKind, midSilent: o.midSilent, sixteenth: o.sixteenthShare };
  }).filter(Boolean);
  r.kind = r.chordalShare >= 0.5 ? 'chordal' : 'single';
  recs.push(r);
}
for (const r of recs) { delete r.barHits; delete r.barLow; }
fs.writeFileSync(out, JSON.stringify(recs));
console.log({ files: files.length, failed, withGuitar: recs.filter((r) => !r.none).length, noGuitar: recs.filter((r) => r.none).length });
