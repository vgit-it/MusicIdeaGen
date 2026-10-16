// Lakh MIDI study (docs/STUDY-LAKH.md). Run: node scripts/study/lakh-scan.cjs <MidiCollection> scan.json
// Pass 1: which files have a named vocal/melody track and lyrics. Writes scan.json.
const fs = require('fs'), path = require('path');
const { parseMidi } = require('midi-file');
const root = process.argv[2], out = process.argv[3];
const files = [];
for (const a of fs.readdirSync(root)) {
  const d = path.join(root, a);
  if (!fs.statSync(d).isDirectory()) continue;
  for (const f of fs.readdirSync(d)) if (/\.mid$/i.test(f)) files.push(path.join(a, f));
}
const VOC = /vocal|voice|vox|melody|melodie|singer|lead\s*voc|sing/i;
const res = [];
let bad = 0;
for (const f of files) {
  let m;
  try { m = parseMidi(fs.readFileSync(path.join(root, f))); } catch { bad++; continue; }
  let lyr = 0, karaoke = false, ts = null, keysig = null, tempos = 0;
  const tracks = m.tracks.map((t, i) => {
    let name = '', notes = 0, lo = 127, hi = 0, ch = -1, prog = -1, txt = 0;
    for (const e of t) {
      if (e.type === 'trackName' && !name) name = e.text || '';
      else if (e.type === 'lyrics') lyr++;
      else if (e.type === 'text') { txt++; if (/^@[KLT]/.test(e.text || '')) karaoke = true; }
      else if (e.type === 'timeSignature' && !ts) ts = `${e.numerator}/${e.denominator}`;
      else if (e.type === 'keySignature' && !keysig) keysig = `${e.key}${e.scale ? 'm' : ''}`;
      else if (e.type === 'setTempo') tempos++;
      else if (e.type === 'programChange' && prog < 0) prog = e.programNumber;
      else if (e.type === 'noteOn' && e.velocity > 0) { notes++; ch = e.channel; lo = Math.min(lo, e.noteNumber); hi = Math.max(hi, e.noteNumber); }
    }
    return { i, name: name.trim(), notes, lo, hi, ch, prog, txt };
  });
  const voc = tracks.filter((t) => t.notes > 30 && t.ch !== 9 && VOC.test(t.name)).map((t) => t.i);
  const wordsTrack = tracks.find((t) => /^words$/i.test(t.name) || t.txt > 50);
  res.push({ f, n: tracks.length, voc, names: tracks.filter((t) => t.notes).map((t) => t.name).slice(0, 20), lyr, karaoke, words: wordsTrack ? wordsTrack.i : -1, ts, keysig, tempos });
}
fs.writeFileSync(out, JSON.stringify(res));
const c = (p) => res.filter(p).length;
console.log({ files: files.length, parsed: res.length, bad,
  namedVocalTrack: c((r) => r.voc.length), karaoke: c((r) => r.karaoke), lyricsEvents: c((r) => r.lyr > 50),
  vocalAndWords: c((r) => r.voc.length && (r.karaoke || r.lyr > 50)),
  keySig: c((r) => r.keysig), ts: Object.entries(res.reduce((a, r) => (a[r.ts] = (a[r.ts] || 0) + 1, a), {})).sort((a, b) => b[1] - a[1]).slice(0, 6) });
// distinct songs (strip .N) with a vocal track
const songs = new Set(res.filter((r) => r.voc.length).map((r) => r.f.replace(/\.\d+\.mid$/i, '.mid').toLowerCase()));
const artists = new Set(res.filter((r) => r.voc.length).map((r) => r.f.split(path.sep)[0]));
console.log({ distinctSongsWithVocal: songs.size, artistsWithVocal: artists.size });
const nameCount = {};
for (const r of res) for (const i of r.voc) { const t = r.names; }
for (const r of res) for (const nm of r.names) if (VOC.test(nm)) { const k = nm.toLowerCase(); nameCount[k] = (nameCount[k] || 0) + 1; }
console.log(Object.entries(nameCount).sort((a, b) => b[1] - a[1]).slice(0, 25));
