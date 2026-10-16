// Rhythm guitar study: real songs beside the app. Run: node scripts/study/rhythm-report.cjs real.json app.json
const fs = require('fs');
const real = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).filter((r) => !r.none);
const app = JSON.parse(fs.readFileSync(process.argv[3], 'utf8')).filter((r) => !r.none);
const clean = (a) => a.filter((x) => x != null && !Number.isNaN(x));
const med = (a) => { a = clean(a).sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : NaN; };
const avg = (a) => { a = clean(a); return a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN; };
const f = (x, d = 2) => (Number.isNaN(x) || x == null ? '  - ' : x.toFixed(d));
const groups = (rs) => { const g = { all: rs }; for (const r of rs) (g[r.genre] ??= []).push(r); return g; };
const R = groups(real), A = groups(app);
const order = ['all', 'pop', 'rock', 'hardrock', 'grunge', 'metal', 'funk', 'altmetal', 'other'];
const show = (title, fn, d = 2, agg = avg) => {
  console.log('\n## ' + title);
  console.log('genre'.padEnd(10), 'real(n)'.padEnd(14), 'app(n)');
  for (const g of order) {
    const r = R[g], a = A[g]; if (!r && !a) continue;
    console.log(g.padEnd(10), ((r ? f(agg(r.map(fn)), d) : '  -') + ' (' + (r ? r.length : 0) + ')').padEnd(14), (a ? f(agg(a.map(fn)), d) : '  -') + ' (' + (a ? a.length : 0) + ')');
  }
};
show('chordal share of hits (hits with 2+ notes)', (r) => r.chordalShare);
show('main track is chordal (>=50% multi-note hits)', (r) => (r.kind === 'chordal' ? 1 : 0));
show('hits per active bar (median)', (r) => r.hitsPerBar, 1, med);
show('silent bars share', (r) => r.silentShare);
show('stop bars (only hits in first 2 beats)', (r) => r.stopBars);
show('hits on 16th off-slots (e/a)', (r) => r.sixteenthShare);
show('hits on 8th offbeats (&)', (r) => r.eighthOffShare);
show('triplet-position hits', (r) => r.tripletShare);
show('on-grid share (within 0.12 of a 16th)', (r) => r.onGrid);
show('median timing deviation ms', (r) => r.devMs, 1, med);
show('velocity: constant (sd<2) songs', (r) => r.constVel);
show('velocity CV (sd/mean)', (r) => r.velCv, 3, med);
show('accent ratio (on-beat / off-beat vel)', (r) => r.accentRatio, 2, med);
show('strum spread: share of chord hits spread', (r) => r.spreadShare);
show('strum spread ms (where present)', (r) => r.spreadMs, 1, med);
show('down-strum share (where spread)', (r) => r.downShare);
show('down share on 8th slots', (r) => r.downOnEighth);
show('down share on 16th slots', (r) => r.downOnSixteenth);
for (const k of ['1', '2', '3', '4', '5', '6+']) show('size of hit = ' + k + ' notes', (r) => r.size[k] ?? 0);
for (const k of ['single', 'power', 'dyad', 'triad', 'triad+', 'sus2', 'sus4', 'add9', 'seventh', 'other']) show('quality ' + k, (r) => r.qual[k] ?? 0);
show('lowest note median (midi)', (r) => r.lowMed, 0, med);
show('top note median (midi)', (r) => r.topMed, 0, med);
show('hit span median (semitones)', (r) => r.spanMed, 0, med);
for (const k of ['staccato', 'mid', 'ring']) show('length: ' + k, (r) => r.len[k]);
show('held pads (>=3 beats)', (r) => r.heldPadShare);
for (const k of ['strum', 'pick', 'chug', 'riff', 'mixed']) show('bar kind ' + k, (r) => r.barKind[k]);
for (let j = 0; j < 4; j++) show('bar identical to previous: bar position ' + j + ' of 4', (r) => (r.same[j][0] > 3 ? r.same[j][1] / r.same[j][0] : NaN));
show('bar pattern seen in previous 4 bars', (r) => r.any4);
show('unique patterns / active bars', (r) => r.uniquePatterns);
show('top pattern share of bars', (r) => r.topPatternShare);
show('lick bars share of chordal bars', (r) => (r.chordalBars ? r.lickBars / r.chordalBars : NaN));
show('songs with any lick bar', (r) => (r.lickBars ? 1 : 0));
for (let j = 0; j < 4; j++) show('lick position bar ' + (j + 1) + ' of 4', (r) => (r.lickBars ? r.lickPos[j] / r.lickBars : NaN));
show('chord changes landing on slot 0', (r) => r.changeSlot[0]);
show('chord changes on beats 2-4', (r) => r.changeSlot[4] + r.changeSlot[8] + r.changeSlot[12]);
show('chord changes pushed an 8th (slots 2,6,10,14)', (r) => r.changeSlot[14] + r.changeSlot[10] + r.changeSlot[6] + r.changeSlot[2]);
show('chord changes odd 16ths', (r) => r.changeSlot[15] + r.changeSlot[11] + r.changeSlot[7] + r.changeSlot[3] + r.changeSlot[1] + r.changeSlot[5] + r.changeSlot[9] + r.changeSlot[13]);
show('bars with a hit on slot 14', (r) => r.push14);
show('bars with no hit on beat 1', (r) => r.noBeat1);
show('8-bar blocks whose density moves >20%', (r) => r.blockMoved);
show('8-bar blocks whose loudness moves >8%', (r) => r.velBlockMoved);
show('bpm (median)', (r) => r.bpm, 0, med);
show('guitar tracks per song', (r) => r.nGuitar, 2);
show('songs with 2+ guitar tracks', (r) => (r.nGuitar >= 2 ? 1 : 0));
show('songs with acoustic', (r) => r.hasAcoustic);
show('songs with electric', (r) => r.hasElectric);
show('both acoustic + electric', (r) => (r.hasAcoustic && r.hasElectric ? 1 : 0));
const progName = (p) => (p >= 24 && p <= 26 ? 'acoustic' : p === 27 ? 'clean' : p === 28 ? 'muted' : p === 29 ? 'overdrive' : p === 30 ? 'distortion' : p === 31 ? 'harmonics' : 'other');
console.log('\n## main track program (all genres)');
for (const [lbl, rs] of [['real', real], ['app', app]]) {
  const c = {}; for (const r of rs) c[progName(r.prog)] = (c[progName(r.prog)] || 0) + 1 / rs.length;
  console.log(lbl, Object.entries(c).map(([k, v]) => k + ' ' + v.toFixed(2)).join('  '));
}
const slotRows = (title, kind, genres) => {
  console.log('\n## ' + title + ' (share of hits by 16th slot, %)');
  for (const g of genres) for (const [lbl, G2] of [['real', R], ['app', A]]) {
    const rs = (G2[g] || []).filter((r) => r.kind === kind); if (!rs.length) continue;
    console.log((g + ' ' + lbl).padEnd(14), ('(' + rs.length + ')').padEnd(7), Array.from({ length: 16 }, (_, i) => (100 * avg(rs.map((r) => r.slotHist[i]))).toFixed(0).padStart(3)).join(''));
  }
};
slotRows('slot histogram, chordal main tracks', 'chordal', ['all', 'pop', 'rock', 'hardrock', 'funk', 'metal', 'grunge']);
slotRows('slot histogram, single-note main tracks', 'single', ['all', 'hardrock', 'metal', 'grunge', 'altmetal']);
const topPatterns = (rs, n) => {
  const c = {};
  for (const r of rs) for (const [p, k] of Object.entries(r.patterns || {})) { const e = (c[p] ??= { songs: 0, bars: 0 }); e.songs++; e.bars += k; }
  const tot = rs.reduce((s, r) => s + r.activeBars, 0);
  return Object.entries(c).sort((a, b) => b[1].songs - a[1].songs).slice(0, n).map(([p, e]) => ({ p, songs: e.songs, share: e.bars / tot, of: rs.length }));
};
const grid = (p) => Array.from({ length: 16 }, (_, i) => (p.split(',').includes(String(i)) ? 'x' : '.')).join('').replace(/(.{4})(?=.)/g, '$1 ');
for (const [lbl, rs] of [['real', real.filter((r) => r.kind === 'chordal')], ['app', app.filter((r) => r.kind === 'chordal')]]) {
  console.log('\n## top 1-bar rhythms in ' + lbl + ' chordal tracks (songs using it of ' + rs.length + ' / share of bars)');
  for (const t of topPatterns(rs, 16)) console.log(grid(t.p), String(t.songs).padStart(5), (t.share * 100).toFixed(1) + '%');
}
