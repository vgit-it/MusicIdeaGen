// Rhythm guitar study, cover: when no guitar plays a bar, what plays the chords? (docs/STUDY-RHYTHM.md)
// Run: node scripts/study/rhythm-cover.cjs <MidiCollection> <out.json>
// Per bar with no guitar, inside the song's span: is another chord instrument playing (piano, organ, strings, pad, synth,
// brass, other)? Numbers only. Genres by the same hand-picked artist lists as rhythm-measure.cjs.
const fs = require('fs'), path = require('path');
const { parseMidi } = require('midi-file');
const root = process.argv[2], out = process.argv[3];
const G = {
  metal: ['Metallica', 'Iron_Maiden', 'Black_Sabbath', 'Megadeth', 'Judas_Priest', 'Ozzy_Osbourne', 'Slayer', 'Pantera', 'Motorhead', 'Dio', 'Anthrax', 'Korn', 'Tool', 'Deftones', 'Rage_Against_the_Machine', 'Disturbed', 'Slipknot', 'Sepultura'],
  grunge: ['Nirvana', 'Pearl_Jam', 'Soundgarden', 'Alice_in_Chains', 'Stone_Temple_Pilots', 'Foo_Fighters', 'Smashing_Pumpkins', 'Bush', 'Silverchair', 'Hole'],
  hardrock: ['AC_DC', 'Led_Zeppelin', 'Deep_Purple', 'Aerosmith', 'Van_Halen', 'Kiss', 'Def_Leppard', 'Bon_Jovi', 'Scorpions', 'Whitesnake', 'Guns_N_Roses', 'Motley_Crue', 'Europe', 'Rainbow', 'Thin_Lizzy', 'Uriah_Heep', 'Twisted_Sister', 'Skid_Row', 'Poison', 'Cinderella'],
  rock: ['The_Beatles', 'The_Rolling_Stones', 'U2', 'Queen', 'Green_Day', 'Oasis', 'Radiohead', 'The_Who', 'Pink_Floyd', 'R.E.M.', 'Bruce_Springsteen', 'Eagles', 'Dire_Straits', 'The_Police', 'Creedence_Clearwater_Revival', 'Tom_Petty_and_the_Heartbreakers', 'The_Doors', 'Blur', 'The_Kinks', 'ZZ_Top', 'The_Cure', 'Red_Hot_Chili_Peppers', 'Bryan_Adams', 'Fleetwood_Mac'],
  pop: ['Madonna', 'Michael_Jackson', 'ABBA', 'Britney_Spears', 'Backstreet_Boys', 'Spice_Girls', 'Kylie_Minogue', 'Whitney_Houston', 'Mariah_Carey', 'Celine_Dion', 'Elton_John', 'George_Michael', 'Phil_Collins', 'Roxette', 'Duran_Duran', 'Pet_Shop_Boys', 'Madness', 'Bee_Gees', 'Lionel_Richie', 'Cyndi_Lauper', 'Wham!', 'Robbie_Williams', 'Take_That', 'Westlife', 'Shania_Twain'],
  funk: ['James_Brown', 'Stevie_Wonder', 'Earth,_Wind_&_Fire', 'Kool_&_the_Gang', 'Prince', 'Chic', 'Sly_&_the_Family_Stone', 'Parliament', 'Rick_James', 'The_Commodores', 'Jamiroquai', 'Tower_of_Power', 'Average_White_Band'],
};
const genreOf = (dir) => { const a = dir.replace(/ /g, '_').replace(/'/g, ''); for (const [g, l] of Object.entries(G)) if (l.includes(a)) return g; return 'other'; };
const BASS = /bass|bajo|basso/i, LEADN = /lead|solo|melod|vocal|vox|voice|sing/i, GUIT = /guit|gtr|git|rhythm|strum|acous|\bgt\b/i;
const family = (p) => (p < 8 ? 'piano' : p < 16 ? 'chromperc' : p < 24 ? 'organ' : p < 32 ? 'guitar' : p < 40 ? 'bass' : p < 56 ? 'strings' : p < 64 ? 'brass' : p < 80 ? 'winds' : p < 88 ? 'synthlead' : p < 104 ? 'pad' : 'other');

const files = [];
for (const a of fs.readdirSync(root)) {
  const d = path.join(root, a);
  if (!fs.statSync(d).isDirectory()) continue;
  const seen = new Set();
  for (const f of fs.readdirSync(d).sort()) {
    if (!/\.mid$/i.test(f)) continue;
    const key = f.replace(/\.\d+\.mid$/i, '.mid').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key); files.push([a, f]);
  }
}
const FAMS = ['piano', 'organ', 'strings', 'pad', 'synthlead', 'brass', 'winds', 'chromperc', 'other'];
const recs = [];
for (const [a, f] of files) {
  let m; try { m = parseMidi(fs.readFileSync(path.join(root, a, f))); } catch { continue; }
  const ppq = m.header.ticksPerBeat; if (!ppq) continue;
  let ts = null;
  const tracks = [];
  m.tracks.forEach((t) => {
    let tick = 0, name = '', prog = -1, ch = -1; const ns = [];
    for (const e of t) {
      tick += e.deltaTime;
      if (e.type === 'trackName' && !name) name = (e.text || '').trim();
      else if (e.type === 'timeSignature' && !ts) ts = `${e.numerator}/${e.denominator}`;
      else if (e.type === 'programChange' && prog < 0) prog = e.programNumber;
      else if (e.type === 'noteOn' && e.velocity > 0) { ch = e.channel; ns.push({ s: tick / ppq, p: e.noteNumber }); }
    }
    tracks.push({ name, prog, ch, ns });
  });
  if (ts && ts !== '4/4') continue;
  const live = tracks.filter((t) => t.ns.length >= 30 && t.ch !== 9);
  const guit = live.filter((t) => ((t.prog >= 24 && t.prog <= 31) || (GUIT.test(t.name) && t.prog < 32)) && !BASS.test(t.name) && !LEADN.test(t.name));
  if (!guit.length) continue;
  const others = live.filter((t) => !guit.includes(t) && !BASS.test(t.name) && !(t.prog >= 32 && t.prog <= 39) && !LEADN.test(t.name) && !(t.prog >= 24 && t.prog <= 31));
  const hasBass = live.some((t) => BASS.test(t.name) || (t.prog >= 32 && t.prog <= 39));
  const all = live.flatMap((t) => t.ns);
  const nBars = Math.floor(Math.max(...all.map((n) => n.s)) / 4) + 1;
  if (nBars < 16 || nBars > 400) continue;
  const barsOf = (t) => { const b = Array.from({ length: nBars }, () => []); for (const n of t.ns) b[Math.floor(n.s / 4)].push(n); return b; };
  const gB = guit.map(barsOf);
  const gPlays = (i) => gB.some((b) => b[i].length);
  const firstG = Array.from({ length: nBars }, (_, i) => i).find(gPlays), lastG = nBars - 1 - [...Array(nBars).keys()].reverse().findIndex(gPlays);
  // chordal instruments per bar: a track whose notes in the bar come mostly together (2+ at once) or ring as a pad
  const cov = others.map((t) => {
    const b = barsOf(t);
    return { fam: family(t.prog), plays: b.map((ns) => {
      if (ns.length < 2) return false;
      let together = 0; for (let k = 1; k < ns.length; k++) if (Math.abs(ns[k].s - ns[k - 1].s) < 0.15) together++;
      return together >= Math.max(1, ns.length * 0.3) || (t.prog >= 88 && t.prog < 104 || t.prog >= 40 && t.prog < 56);
    }) };
  });
  const r = { genre: genreOf(a), bars: nBars, firstG, lastG, silent: 0, silentMid: 0, silentIntro: 0, cover: 0, coverMid: 0, coverIntro: 0, fam: {}, famMid: {}, famIntro: {}, none: 0, noneMid: 0, noneIntro: 0, nothingBass: 0, hasBass: hasBass ? 1 : 0, nCover: cov.length, songCover: 0 };
  for (let i = 0; i < nBars; i++) {
    if (gPlays(i)) continue;
    if (i > lastG) continue; // the end is not a gap
    const where = i < firstG ? 'Intro' : 'Mid';
    r.silent++; r['silent' + where]++;
    const here = cov.filter((c) => c.plays[i]);
    if (here.length) { r.cover++; r['cover' + where]++; for (const fm of new Set(here.map((c) => c.fam))) { r.fam[fm] = (r.fam[fm] || 0) + 1; r['fam' + where][fm] = (r['fam' + where][fm] || 0) + 1; } }
    else { r.none++; r['none' + where]++; }
  }
  recs.push(r);
}
fs.writeFileSync(out, JSON.stringify(recs));
const show = (label, rs) => {
  const s = rs.reduce((x, r) => x + r.silent, 0), c = rs.reduce((x, r) => x + r.cover, 0);
  const sm = rs.reduce((x, r) => x + r.silentMid, 0), cm = rs.reduce((x, r) => x + r.coverMid, 0);
  const si = rs.reduce((x, r) => x + r.silentIntro, 0), ci = rs.reduce((x, r) => x + r.coverIntro, 0);
  const fam = (k) => FAMS.map((fm) => `${fm} ${(100 * rs.reduce((x, r) => x + (r[k][fm] || 0), 0) / Math.max(1, k === 'famMid' ? sm : k === 'famIntro' ? si : s)).toFixed(0)}`).filter((x) => !/ 0$/.test(x)).join(', ');
  console.log(label.padEnd(9), 'songs', String(rs.length).padStart(5), '| guitar-silent bars', (s / rs.reduce((x, r) => x + r.bars, 0)).toFixed(2), '| chord cover in them: all', (c / Math.max(1, s)).toFixed(2), 'mid', (cm / Math.max(1, sm)).toFixed(2), 'intro', (ci / Math.max(1, si)).toFixed(2));
  console.log(' '.repeat(9), 'mid by instrument (% of silent mid bars):', fam('famMid'));
  console.log(' '.repeat(9), 'intro by instrument (% of silent intro bars):', fam('famIntro'));
};
console.log('guitar-silent bars: is a chord instrument playing instead?');
show('all', recs);
for (const g of ['pop', 'rock', 'hardrock', 'grunge', 'metal', 'funk']) show(g, recs.filter((r) => r.genre === g));
// songs that sit out 4+ bars in the middle: how many of those have a cover for most of it
const gap = recs.filter((r) => r.silentMid >= 4);
console.log('\nsongs with 4+ silent bars in the middle:', gap.length, 'of', recs.length, '; of those, covered in most of them (>=60% of the bars):', (gap.filter((r) => r.coverMid / r.silentMid >= 0.6).length / gap.length).toFixed(2), '; not covered at all (<10%):', (gap.filter((r) => r.coverMid / r.silentMid < 0.1).length / gap.length).toFixed(2));
for (const g of ['pop', 'rock', 'hardrock', 'grunge', 'metal', 'funk']) { const a = gap.filter((r) => r.genre === g); if (a.length) console.log('  ', g.padEnd(9), a.length, 'songs; covered mostly', (a.filter((r) => r.coverMid / r.silentMid >= 0.6).length / a.length).toFixed(2), '; not covered', (a.filter((r) => r.coverMid / r.silentMid < 0.1).length / a.length).toFixed(2)); }
