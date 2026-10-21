// Lakh MIDI study (docs/STUDY-LAKH.md). Run: node scripts/study/lakh-measure.cjs <MidiCollection> scan.json (writes songs.json)
// Pass 2: one version per song with a lead vocal track; measure the melody against the band.
const fs = require('fs'), path = require('path');
const { parseMidi } = require('midi-file');
const root = process.argv[2];
const scan = JSON.parse(fs.readFileSync(process.argv[3] || 'scan.json', 'utf8'));
const LEAD = /^(melody|melodie|melody 1|vocals?|lead ?vo(cal|x)s?|vocal-lin|solo vox|vox|voice|vocals? 1|lead|lead vocal)$/i;
const seen = new Set(), picks = [];
for (const r of scan) {
  const key = r.f.replace(/\.\d+\.mid$/i, '.mid').toLowerCase();
  if (seen.has(key) || r.ts && r.ts !== '4/4') continue;
  if (!r.names.some((n) => LEAD.test(n))) continue;
  seen.add(key); picks.push(r);
}
const MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MIN = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const corr = (a, b) => { const ma = a.reduce((s, x) => s + x) / 12, mb = b.reduce((s, x) => s + x) / 12; let n = 0, da = 0, db = 0; for (let i = 0; i < 12; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; } return n / Math.sqrt(da * db); };
const MAJ_SC = [0, 2, 4, 5, 7, 9, 11], MIN_SC = [0, 2, 3, 5, 7, 8, 10];
const H = {}; const inc = (k, v, w = 1) => { H[k] ??= {}; H[k][v] = (H[k][v] || 0) + w; };
const songStats = [];
let used = 0, skipPoly = 0, skipRange = 0;
for (const r of picks) {
  let m; try { m = parseMidi(fs.readFileSync(path.join(root, r.f))); } catch { continue; }
  const ppq = m.header.ticksPerBeat; if (!ppq) continue;
  // notes per track
  const T = m.tracks.map((t) => { let tick = 0, name = ''; const on = {}, ns = []; let ch = -1;
    for (const e of t) { tick += e.deltaTime;
      if (e.type === 'trackName' && !name) name = (e.text || '').trim();
      if (e.type === 'noteOn' && e.velocity > 0) { on[e.channel * 128 + e.noteNumber] = [tick, e.velocity]; ch = e.channel; }
      else if (e.type === 'noteOff' || (e.type === 'noteOn' && e.velocity === 0)) { const k = e.channel * 128 + e.noteNumber, o = on[k]; if (o) { ns.push({ s: o[0] / ppq, e: tick / ppq, p: e.noteNumber, v: o[1] }); delete on[k]; } } }
    ns.sort((a, b) => a.s - b.s); return { name, ns, ch }; });
  const vi = T.findIndex((t) => LEAD.test(t.name) && t.ns.length > 40 && t.ch !== 9);
  if (vi < 0) continue;
  const mel = T[vi].ns;
  // monophonic? overlaps
  let ov = 0; for (let i = 1; i < mel.length; i++) if (mel[i].s < mel[i - 1].e - 0.05 && mel[i].s - mel[i - 1].s < 0.05) ov++;
  if (ov / mel.length > 0.1) { skipPoly++; continue; }
  const pitches = mel.map((n) => n.p).sort((a, b) => a - b);
  const lo = pitches[Math.floor(pitches.length * 0.05)], hi = pitches[Math.floor(pitches.length * 0.95)];
  if (lo < 45 || hi > 86) { skipRange++; continue; }
  const band = T.filter((t, i) => i !== vi && t.ch !== 9 && !LEAD.test(t.name) && !/vo(cal|x|ice)|melod|harm|back/i.test(t.name)).flatMap((t) => t.ns);
  if (band.length < 100) continue;
  // key
  const pc = new Array(12).fill(0); for (const n of band.concat(mel)) pc[n.p % 12] += n.e - n.s;
  let best = -2, tonic = 0, minor = false;
  for (let k = 0; k < 12; k++) { const rot = pc.slice(k).concat(pc.slice(0, k)); const a = corr(rot, MAJ), b = corr(rot, MIN); if (a > best) { best = a; tonic = k; minor = false; } if (b > best) { best = b; tonic = k; minor = true; } }
  const SC = minor ? MIN_SC : MAJ_SC;
  const deg = (p) => { const x = ((p - tonic) % 12 + 12) % 12; return SC.indexOf(x); };
  used++;
  const g = genreOf(r.f);
  // per-note measures
  let grid = 0, inScale = 0, chordTone = 0, strongCT = 0, strong = 0, bassClash = 0;
  const slots = []; // per 16th: notes sounding
  for (const n of band) for (let s = Math.ceil((n.s - 0.02) * 4); s < n.e * 4 - 0.08 && s < 40000; s++) (slots[s] ??= []).push(n);
  const bandAt = (t) => slots[Math.round(t * 4)] || [];
  for (let i = 0; i < mel.length; i++) {
    const n = mel[i], pos = n.s % 4, frac = n.s * 4 - Math.round(n.s * 4);
    if (Math.abs(frac) < 0.12) grid++;
    if (deg(n.p) >= 0) inScale++;
    const snd = bandAt(n.s), pcs = new Set(snd.map((b) => b.p % 12));
    const isCT = pcs.has(n.p % 12); if (isCT) chordTone++;
    const onBeat = Math.abs(pos - Math.round(pos)) < 0.06 && Math.round(pos) % 2 === 0;
    if (onBeat) { strong++; if (isCT) strongCT++; }
    const low = snd.length ? snd.reduce((a, b) => (b.p < a.p ? b : a)) : null;
    if (low && [1, 11, 6].includes(((n.p - low.p) % 12 + 12) % 12)) bassClash++;
    // duration in beats
    const d = n.e - n.s; inc('dur', d < 0.375 ? '16th' : d < 0.75 ? '8th' : d < 1.5 ? 'quarter' : d < 3 ? 'half' : 'whole+');
    // onset within the beat
    const sub = Math.round((n.s % 1) * 4) % 4; inc('onset16', ['beat', 'e', '&', 'a'][sub]);
    if (i) { const prev = mel[i - 1], gap = n.s - prev.e;
      if (gap < 1) { const iv = n.p - prev.p; const a = Math.abs(iv);
        inc('interval', a === 0 ? 'repeat' : a <= 2 ? 'step' : a <= 4 ? 'third' : a <= 7 ? '4th-5th' : a <= 12 ? '6th-octave' : 'over octave');
        inc('dir', iv > 0 ? 'up' : iv < 0 ? 'down' : 'same');
        if (a > 4 && i + 1 < mel.length && mel[i + 1].s - n.e < 1) { const nx = mel[i + 1].p - n.p; inc('afterLeap', nx === 0 ? 'repeat' : Math.sign(nx) !== Math.sign(iv) ? 'turns back' : 'keeps going'); }
      }
    }
  }
  // phrases: split on gaps >= 1 beat
  const phr = []; let st = 0;
  for (let i = 1; i <= mel.length; i++) if (i === mel.length || mel[i].s - mel[i - 1].e >= 1) { phr.push(mel.slice(st, i)); st = i; }
  for (const p of phr) { const len = p[p.length - 1].e - p[0].s; inc('phraseBars', len < 2 ? '<0.5' : len < 4 ? '0.5-1' : len < 8 ? '1-2' : len < 16 ? '2-4' : '4+');
    const last = p[p.length - 1]; const d = deg(last.p); inc('phraseEndDegree', d < 0 ? 'off-key' : ['1', '2', '3', '4', '5', '6', '7'][d]);
    const sp = Math.max(...p.map((n) => n.p)) - Math.min(...p.map((n) => n.p)); inc('phraseSpan', sp <= 4 ? '≤3rd' : sp <= 7 ? '4th-5th' : sp <= 12 ? '≤octave' : '>octave');
    const first = p[0], top = p.reduce((a, b) => (b.p > a.p ? b : a)), x = (top.s - first.s) / Math.max(0.01, last.s - first.s); inc('peakWhere', x < 0.33 ? 'early' : x < 0.66 ? 'middle' : 'late');
  }
  // repetition: 2-bar windows (rhythm + intervals) that occur again in the song
  const win = {}; for (let b = 0; b < mel[mel.length - 1].e; b += 8) { const w = mel.filter((n) => n.s >= b && n.s < b + 8); if (w.length < 3) continue;
    const sig = w.map((n, i) => `${Math.round((n.s - b) * 4)}:${i ? n.p - w[i - 1].p : 0}`).join(','); win[sig] = (win[sig] || 0) + 1; }
  const tot = Object.values(win).reduce((a, b) => a + b, 0), rep = Object.values(win).filter((c) => c > 1).reduce((a, b) => a + b, 0);
  songStats.push({ f: r.f, g, n: mel.length, grid: grid / mel.length, inScale: inScale / mel.length, chordTone: chordTone / mel.length, strongCT: strong ? strongCT / strong : 0, bassClash: bassClash / mel.length, range: hi - lo, lo, hi, repeat2bar: tot ? rep / tot : 0, minor, conf: best });
}
function genreOf() { return ''; }
const avg = (k) => (songStats.reduce((s, x) => s + x[k], 0) / songStats.length).toFixed(3);
const pct = (k, q) => { const a = songStats.map((x) => x[k]).sort((a, b) => a - b); return a[Math.floor(a.length * q)]; };
console.log({ picks: picks.length, used, skipPoly, skipRange });
for (const k of ['grid', 'inScale', 'chordTone', 'strongCT', 'bassClash', 'range', 'repeat2bar', 'conf']) console.log(k, 'avg', avg(k), 'p10', pct(k, 0.1), 'p50', pct(k, 0.5), 'p90', pct(k, 0.9));
console.log('clean (grid>.9, inScale>.85, conf>.75):', songStats.filter((s) => s.grid > 0.9 && s.inScale > 0.85 && s.conf > 0.75).length);
console.log('minor share', (songStats.filter((s) => s.minor).length / songStats.length).toFixed(2));
for (const [k, v] of Object.entries(H)) { const t = Object.values(v).reduce((a, b) => a + b, 0); console.log(k, Object.entries(v).sort((a, b) => b[1] - a[1]).map(([a, b]) => `${a} ${(100 * b / t).toFixed(1)}%`).join(' | ')); }
fs.writeFileSync('songs.json', JSON.stringify(songStats));
