// Lead guitar study (docs/STUDY-LEAD.md): the table per genre, real vs app. Run: node scripts/study/lead-report.cjs lead-study.json
const recs = require(require('path').resolve(process.argv[2] ?? 'lead-study.json'));
const G = ['all', 'pop', 'rock', 'hardrock', 'grunge', 'metal', 'altmetal', 'funk'];
const pct = (x) => (x == null || isNaN(x) ? '-' : Math.round(x * 100) + '%');
const num = (x, d = 1) => (x == null || isNaN(x) ? '-' : x.toFixed(d));
const mean = (a) => { a = a.filter((x) => x != null && !isNaN(x)); return a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN; };
const med = (a) => { a = a.filter((x) => x != null && !isNaN(x)).sort((x, y) => x - y); return a.length ? a[a.length >> 1] : NaN; };
const rows = [
  ['songs with a singer', (r) => r.length, (x) => x],
  ['  with a lead guitar', (r) => mean(r.map((x) => x.has)), pct],
  ['  lead named lead/solo', (r) => mean(r.filter((x) => x.has).map((x) => x.named)), pct],
  ['  2+ lead lines', (r) => mean(r.filter((x) => x.has).map((x) => +(x.leads > 1))), pct],
  ['  2nd line in the same bars', (r) => mean(r.filter((x) => x.has).map((x) => x.second)), pct],
  ['  twin leads (3rds/6ths)', (r) => mean(r.filter((x) => x.has).map((x) => x.twin)), pct],
  ['  a guitar doubling the singer', (r) => mean(r.map((x) => x.doubles)), pct],
  ['bars the lead plays', (r) => med(r.map((x) => x.presence)), pct],
  ['lead notes while singing', (r) => med(r.map((x) => x.withVox)), pct],
  ['sung bars with lead notes', (r) => med(r.map((x) => x.voxBarsFilled)), pct],
  ['songs with a solo (4+ bars)', (r) => mean(r.map((x) => +(x.solos > 0))), pct],
  ['  solos a song (with any)', (r) => mean(r.filter((x) => x.solos).map((x) => x.solos)), num],
  ['  solo length, bars', (r) => med(r.flatMap((x) => x.soloBars ?? [])), (x) => x],
  ['  solo starts at (song %)', (r) => med(r.flatMap((x) => x.soloAt ?? [])), pct],
  ['  solos at the start', (r) => { const w = r.flatMap((x) => x.soloWhere ? [x.soloWhere] : []); const t = w.reduce((s, x) => s + x[0] + x[1] + x[2], 0); return w.reduce((s, x) => s + x[0], 0) / t; }, pct],
  ['  in the middle', (r) => { const w = r.flatMap((x) => x.soloWhere ? [x.soloWhere] : []); const t = w.reduce((s, x) => s + x[0] + x[1] + x[2], 0); return w.reduce((s, x) => s + x[1], 0) / t; }, pct],
  ['  at the end', (r) => { const w = r.flatMap((x) => x.soloWhere ? [x.soloWhere] : []); const t = w.reduce((s, x) => s + x[0] + x[1] + x[2], 0); return w.reduce((s, x) => s + x[2], 0) / t; }, pct],
  ['sung lines answered in the gap', (r) => mean(r.map((x) => x.answered)), pct],
  ['notes a bar (bars it plays)', (r) => med(r.map((x) => x.nps)), num],
  ['  in solos', (r) => med(r.map((x) => x.npsSolo)), num],
  ['  under the singer', (r) => med(r.map((x) => x.npsVerse)), num],
  ['fastest bar, notes/sec', (r) => med(r.map((x) => x.fastest)), num],
  ['notes in fast runs (4+ 16ths)', (r) => med(r.map((x) => x.fast)), pct],
  ['length: 32nd or less', (r) => mean(r.map((x) => x.len?.[0])), pct],
  ['  16th', (r) => mean(r.map((x) => x.len?.[1])), pct],
  ['  8th', (r) => mean(r.map((x) => x.len?.[2])), pct],
  ['  quarter', (r) => mean(r.map((x) => x.len?.[3])), pct],
  ['  half+', (r) => mean(r.map((x) => x.len?.[4])), pct],
  ['starts: on the beat', (r) => mean(r.map((x) => x.pos?.[0])), pct],
  ['  e', (r) => mean(r.map((x) => x.pos?.[1])), pct],
  ['  &', (r) => mean(r.map((x) => x.pos?.[2])), pct],
  ['  a', (r) => mean(r.map((x) => x.pos?.[3])), pct],
  ['  triplet', (r) => mean(r.map((x) => x.pos?.[4])), pct],
  ['  off the grid', (r) => mean(r.map((x) => x.pos?.[5])), pct],
  ['steps: same note', (r) => mean(r.map((x) => x.step?.[0])), pct],
  ['  1-2', (r) => mean(r.map((x) => x.step?.[1])), pct],
  ['  3-4', (r) => mean(r.map((x) => x.step?.[2])), pct],
  ['  5-7', (r) => mean(r.map((x) => x.step?.[3])), pct],
  ['  octave-ish 8+', (r) => mean(r.map((x) => x.step?.[4])), pct],
  ['  moves going up', (r) => mean(r.map((x) => x.up)), pct],
  ['phrase: notes', (r) => med(r.map((x) => x.phraseNotes)), (x) => x],
  ['phrase: beats', (r) => med(r.map((x) => x.phraseBeats)), num],
  ['range (p5-p95, semitones)', (r) => med(r.map((x) => x.range)), (x) => x],
  ['middle note (MIDI)', (r) => med(r.map((x) => x.height)), (x) => x],
  ['  above the singer', (r) => med(r.map((x) => x.aboveVox)), (x) => x],
  ['on guitar/bass notes', (r) => mean(r.map((x) => x.onGtr)), pct],
  ['on the band\'s notes', (r) => mean(r.map((x) => x.onBand)), pct],
  ['  held notes (8th+)', (r) => mean(r.map((x) => x.onBandHeld)), pct],
  ['in the key\'s scale', (r) => mean(r.map((x) => x.inScale)), pct],
  ['in the key\'s pentatonic', (r) => mean(r.map((x) => x.inPenta)), pct],
  ['blue notes (b5, b3/b7 in major)', (r) => mean(r.map((x) => x.blue)), pct],
  ['grace notes (a 32nd, a step)', (r) => mean(r.map((x) => x.grace)), pct],
  ['double-stops', (r) => mean(r.map((x) => x.dbl)), pct],
  ['notes bent (pitch bend)', (r) => mean(r.map((x) => x.bent)), pct],
  ['  songs with any bends', (r) => mean(r.map((x) => +(x.bent > 0))), pct],
  ['2-bar stretches repeated', (r) => mean(r.map((x) => x.repeat2)), pct],
  ['bars: licks (1-5 notes)', (r) => mean(r.map((x) => x.barKind?.[0])), pct],
  ['  lines (6+)', (r) => mean(r.map((x) => x.barKind?.[1])), pct],
  ['  arpeggios', (r) => mean(r.map((x) => x.barKind?.[2])), pct],
  ['tempo', (r) => med(r.map((x) => x.bpm)), (x) => Math.round(x)],
];
const pick = (side, g) => recs.filter((r) => r.side === side && (g === 'all' || r.genre === g));
const head = ['', ...G.flatMap((g) => [g, 'app'])];
console.log(head.map((h, i) => (i ? h.slice(0, 8).padStart(8) : h.padEnd(32))).join(''));
for (const [label, f, fmt] of rows) {
  const cells = G.flatMap((g) => {
    const real = pick('real', g), app = pick('app', g);
    const lr = label.startsWith('songs with a singer') || label.includes('with a lead') || label.includes('doubling') ? real : real.filter((x) => x.has);
    const la = label.startsWith('songs with a singer') || label.includes('with a lead') || label.includes('doubling') ? app : app.filter((x) => x.has);
    return [fmt(f(lr)), fmt(f(la))];
  });
  console.log(label.padEnd(32) + cells.map((c) => String(c).padStart(8)).join(''));
}
const tech = recs.filter((r) => r.appTech);
console.log('\napp techniques (share of Guitar 2 notes):', Object.fromEntries(Object.keys(tech[0].appTech).map((k) => [k, pct(mean(tech.map((r) => r.appTech[k])))])));
