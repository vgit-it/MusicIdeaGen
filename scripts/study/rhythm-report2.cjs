// Rhythm guitar study, second look: what kind of part, when it plays, the second guitar, pattern coverage.
// Run: node scripts/study/rhythm-report2.cjs real.json app.json
const fs = require('fs');
const real = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).filter((r) => !r.none);
const app = JSON.parse(fs.readFileSync(process.argv[3], 'utf8')).filter((r) => !r.none);
const clean = (a) => a.filter((x) => x != null && !Number.isNaN(x));
const avg = (a) => { a = clean(a); return a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN; };
const med = (a) => { a = clean(a).sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : NaN; };
const f = (x, d = 2) => (Number.isNaN(x) || x == null ? '  - ' : x.toFixed(d));
const groups = (rs) => { const g = { all: rs }; for (const r of rs) (g[r.genre] ??= []).push(r); return g; };
const R = groups(real), A = groups(app);
const order = ['all', 'pop', 'rock', 'hardrock', 'grunge', 'metal', 'funk', 'altmetal'];
const show = (title, fn, d = 2, agg = avg) => {
  console.log('\n## ' + title);
  for (const g of order) { const r = R[g], a = A[g]; if (!r && !a) continue;
    console.log(g.padEnd(10), ((r ? f(agg(r.map(fn)), d) : '  -') + ' (' + (r ? r.length : 0) + ')').padEnd(14), (a ? f(agg(a.map(fn)), d) : '  -') + ' (' + (a ? a.length : 0) + ')'); }
};
// taxonomy of the main part
const style = (r) => {
  if (r.barKind.chug + r.barKind.riff >= 0.5) return 'chug/riff';
  if (r.barKind.pick >= 0.45) return 'picked';
  if (r.chordalShare < 0.5) return 'single notes, other';
  if (r.hitsPerBar < 3) return 'sustained (1-2 hits a bar)';
  if (r.hitsPerBar < 5) return 'quarters (3-5 hits)';
  if (r.sixteenthShare >= 0.2 && r.hitsPerBar >= 8) return '16ths strum';
  return '8ths strum (5-9 hits)';
};
const STY = ['sustained (1-2 hits a bar)', 'quarters (3-5 hits)', '8ths strum (5-9 hits)', '16ths strum', 'picked', 'chug/riff', 'single notes, other'];
for (const s of STY) show('main part is: ' + s, (r) => (style(r) === s ? 1 : 0));
for (const k of ['1', '2', '3-4', '5-6', '7-8', '9-12', '13+']) show('bars with ' + k + ' hits', (r) => r.hitsHist[k]);
show('harmonic rhythm: chord changes per bar the guitar plays', (r) => r.harmRate, 2, med);
show('shuffle/triplet feel songs (>=25% hits on triplet slots)', (r) => (r.tripletShare >= 0.25 ? 1 : 0));
show('first bar the guitar plays (median)', (r) => r.firstBar, 0, med);
show('guitar silent in first 4 bars', (r) => (r.firstBar >= 4 ? 1 : 0));
show('guitar silent in the last 2 bars', (r) => (r.lastGap >= 2 ? 1 : 0));
show('silent bars inside the guitar part (share)', (r) => r.midSilent);
show('silent runs of 1+ bars per 16 bars', (r) => r.midRuns, 2);
show('silent runs of 4+ bars per 16 bars', (r) => r.midRuns4, 2);
show('songs that sit out 4+ bars somewhere in the middle', (r) => (r.midRuns4 > 0 ? 1 : 0));
// second guitar
const others = (rs) => rs.flatMap((r) => (r.otherRoles || []).map((o) => ({ ...o, genre: r.genre })));
const OR = others(real), OA = others(app);
const role = (o) => (o.lead ? 'lead (by name)' : o.barKind.pick >= 0.4 ? 'picked/arpeggio' : o.barKind.chug + o.barKind.riff >= 0.5 ? 'chug/riff' : o.kind === 'chordal' ? 'second rhythm (chords)' : 'single-note line');
console.log('\n## second and later guitar tracks (all genres): n real', OR.length, ' n app', OA.length);
for (const rl of ['second rhythm (chords)', 'picked/arpeggio', 'chug/riff', 'single-note line', 'lead (by name)']) {
  const a = OR.filter((o) => role(o) === rl), b = OA.filter((o) => role(o) === rl);
  console.log(rl.padEnd(26), 'real', f(a.length / OR.length), 'app', f(b.length / (OA.length || 1)), ' | same bars+hits as main: real', f(avg(a.map((o) => o.identical))), 'app', f(avg(b.map((o) => o.identical))), ' | rhythm overlap (jaccard): real', f(avg(a.map((o) => o.jaccard))), 'app', f(avg(b.map((o) => o.jaccard))), ' | median low note vs main: real', f(med(a.map((o) => o.dLow)), 0), 'app', f(med(b.map((o) => o.dLow)), 0));
}
console.log('\n## second guitar plays together with the main part (share of main bars), all genres: real', f(avg(OR.map((o) => o.overlap))), 'app', f(avg(OA.map((o) => o.overlap))));
const per = (rs) => rs.map((r) => r.otherRoles || []);
for (const g of ['all', 'pop', 'rock', 'hardrock', 'grunge', 'metal', 'funk']) {
  const a = (R[g] || []).filter((r) => r.others > 0), b = (A[g] || []).filter((r) => r.others > 0);
  console.log(g.padEnd(9), 'songs with a 2nd guitar: real', f((R[g] || []).filter((r) => r.others > 0).length / (R[g] || []).length), 'app', f(b.length / ((A[g] || []).length || 1)),
    '| of them, 2nd is chords: real', f(avg(a.map((r) => (r.otherRoles || []).some((o) => role(o) === 'second rhythm (chords)') ? 1 : 0))), 'app', f(avg(b.map((r) => (r.otherRoles || []).some((o) => role(o) === 'second rhythm (chords)') ? 1 : 0))),
    '| 3+ guitars: real', f((R[g] || []).filter((r) => r.others > 1).length / (R[g] || []).length));
}
// pattern coverage
const patSet = (rs, min) => { const c = {}; for (const r of rs) for (const p of Object.keys(r.patterns || {})) c[p] = (c[p] || 0) + 1; return c; };
const barCount = (rs) => { const c = {}; let tot = 0; for (const r of rs) for (const [p, k] of Object.entries(r.patterns || {})) { c[p] = (c[p] || 0) + k; tot += k; } return { c, tot }; };
const cov = (label, rs, ra) => {
  const real = barCount(rs), app = barCount(ra), realSongs = patSet(rs), appSongs = patSet(ra);
  for (const minReal of [10, 40]) {
    // real bars whose pattern appears in >= minReal real songs, and how many of those the app also plays (in >=3 of its songs)
    let common = 0, commonCovered = 0, commonMissing = [];
    for (const [p, k] of Object.entries(real.c)) if (realSongs[p] >= minReal) { common += k; if ((appSongs[p] || 0) >= 3) commonCovered += k; else commonMissing.push([p, realSongs[p], k]); }
    console.log(label.padEnd(12), 'patterns in >=' + minReal + ' real songs hold', f(common / real.tot), 'of real bars; the app plays', f(commonCovered / common), 'of those bars worth (in >=3 of its songs). Missing:', commonMissing.length);
  }
  let appReal = 0, appBars = 0, appOdd = 0;
  for (const [p, k] of Object.entries(app.c)) { appBars += k; if ((realSongs[p] || 0) >= 10) appReal += k; else appOdd += k; }
  console.log(label.padEnd(12), 'app bars whose rhythm is common in real songs (>=10 songs):', f(appReal / appBars), ' not found in real songs that often:', f(appOdd / appBars));
};
const grid = (p) => Array.from({ length: 16 }, (_, i) => (p.split(',').includes(String(i)) ? 'x' : '.')).join('').replace(/(.{4})(?=.)/g, '$1 ');
console.log('\n## pattern coverage (chordal main tracks)');
cov('all', real.filter((r) => r.kind === 'chordal'), app.filter((r) => r.kind === 'chordal'));
for (const g of ['pop', 'rock', 'hardrock', 'grunge', 'funk']) cov(g, (R[g] || []).filter((r) => r.kind === 'chordal'), (A[g] || []).filter((r) => r.kind === 'chordal'));
// top missing patterns
{
  const rs = real.filter((r) => r.kind === 'chordal'), ra = app.filter((r) => r.kind === 'chordal');
  const rc = patSet(rs), ac = patSet(ra), rb = barCount(rs);
  const miss = Object.entries(rc).filter(([p, n]) => n >= 25 && (ac[p] || 0) < 4).sort((a, b) => rb.c[b[0]] - rb.c[a[0]]).slice(0, 24);
  console.log('\n## common real 1-bar rhythms the app plays in fewer than 4 of its songs (songs real / % of real bars / songs app)');
  for (const [p, n] of miss) console.log(grid(p), String(n).padStart(5), (100 * rb.c[p] / rb.tot).toFixed(2) + '%', ac[p] || 0);
  const ab = barCount(ra);
  const extra = Object.entries(ac).filter(([p, n]) => n >= 15 && (rc[p] || 0) < 5).sort((a, b) => ab.c[b[0]] - ab.c[a[0]]).slice(0, 14);
  console.log('\n## rhythms the app plays often that real songs rarely have (songs app / % of app bars / songs real)');
  for (const [p, n] of extra) console.log(grid(p), String(n).padStart(5), (100 * ab.c[p] / ab.tot).toFixed(2) + '%', rc[p] || 0);
}
