// The Lakh MIDI collection's songs with a lead vocal line, read once for the studies (docs/STUDY-LAKH.md):
// the realism targets (lakh-targets.ts) and the pattern library (lakh-patterns.ts). Same song selection as
// lakh-measure.cjs: one version per song, 4/4, a lead track (named, or found by how it sings; NAMED_ONLY=1 for the old way), one note at a time, in voice range.
import fs from 'node:fs';
import path from 'node:path';
import { parseMidi } from 'midi-file';
export const LEAD = /^(melody|melodie|melody 1|vocals?|lead ?vo(cal|x)s?|vocal-lin|solo vox|vox|voice|vocals? 1|lead|lead vocal)$/i;
// the app's genres, by artist folder (case and "&"/"and" ignored)
export const G: Record<string, string[]> = {
  metal: ['Metallica', 'Iron_Maiden', 'Black_Sabbath', 'Megadeth', 'Judas_Priest', 'Ozzy_Osbourne', 'Slayer', 'Pantera', 'Motorhead', 'Dio', 'Anthrax', 'Sepultura', 'Rammstein', 'Helloween', 'Manowar', 'Accept', 'Testament'],
  altmetal: ['Korn', 'Tool', 'Deftones', 'Rage_Against_the_Machine', 'Disturbed', 'Slipknot', 'System_of_a_Down', 'Linkin_Park', 'Limp_Bizkit', 'Godsmack', 'Papa_Roach', 'Marilyn_Manson', 'Faith_No_More', 'Nine_Inch_Nails', 'Creed', 'Staind', 'P.O.D.', 'Incubus'],
  grunge: ['Nirvana', 'Pearl_Jam', 'Soundgarden', 'Alice_in_Chains', 'Stone_Temple_Pilots', 'Foo_Fighters', 'Smashing_Pumpkins', 'Bush', 'Silverchair', 'Hole', 'Mudhoney', 'Screaming_Trees', 'Temple_of_the_Dog', 'The_Smashing_Pumpkins', 'Live', 'Collective_Soul', 'Local_H', 'Our_Lady_Peace', 'Veruca_Salt', 'Meat_Puppets', 'Filter', 'Audioslave', 'Mad_Season'],
  hardrock: ['AC_DC', 'Led_Zeppelin', 'Deep_Purple', 'Aerosmith', 'Van_Halen', 'Kiss', 'Def_Leppard', 'Bon_Jovi', 'Scorpions', 'Whitesnake', 'Guns_N_Roses', 'Motley_Crue', 'Europe', 'Rainbow', 'Thin_Lizzy', 'Uriah_Heep', 'Twisted_Sister', 'Skid_Row', 'Poison', 'Cinderella'],
  rock: ['The_Beatles', 'The_Rolling_Stones', 'U2', 'Queen', 'Green_Day', 'Oasis', 'Radiohead', 'The_Who', 'Pink_Floyd', 'R.E.M.', 'Bruce_Springsteen', 'Eagles', 'Dire_Straits', 'The_Police', 'Creedence_Clearwater_Revival', 'Tom_Petty_and_the_Heartbreakers', 'The_Doors', 'Blur', 'The_Kinks', 'ZZ_Top', 'The_Cure', 'Bryan_Adams', 'Fleetwood_Mac'],
  pop: ['Madonna', 'ABBA', 'Britney_Spears', 'Backstreet_Boys', 'Spice_Girls', 'Kylie_Minogue', 'Whitney_Houston', 'Mariah_Carey', 'Celine_Dion', 'Elton_John', 'George_Michael', 'Phil_Collins', 'Roxette', 'Duran_Duran', 'Pet_Shop_Boys', 'Madness', 'Lionel_Richie', 'Cyndi_Lauper', 'Wham!', 'Robbie_Williams', 'Take_That', 'Westlife', 'Shania_Twain'],
  funk: ['James_Brown', 'Stevie_Wonder', 'Earth,_Wind_and_Fire', 'Kool_and_the_Gang', 'Prince', 'Chic', 'Sly_and_the_Family_Stone', 'Sly', 'Parliament', 'Rick_James', 'Commodores', 'Jamiroquai', 'Tower_of_Power', 'Average_White_Band', 'Red_Hot_Chili_Peppers', 'Michael_Jackson', 'Bee_Gees', 'Wild_Cherry', 'KC_and_the_Sunshine_Band', 'Cameo', 'The_Gap_Band', 'Ohio_Players', 'War'],
};
// fan files often name the singer's track oddly ("Eddie", "Staley", "Alice In Chains-", "WinJammer Demo"): a track
// named for a voice or a singer first, then a named lead track, else a track that sings: not named for an instrument, not a guitar
// or bass sound, one note at a time, in voice range
const VOX = /vo(c|x|ice)|sing|melod|lyric|eddie|vedder|staley|layne|cornell|kurdt|kurt|cobain|weiland|grohl/i;
const NOT_LEAD_VOX = /back|bk|bg|harm|double|ditto|ooh|\bII\b|vocals? ?2|vox 2|guitar|gtr|bass/i;
const INSTR = /gu?i?ta|gtr|grt|bass|b@|drum|perc|piano|organ|orgn|string|\bstr\b|cello|viol|harp|key|synth|solo|riff|rh?yth|wah|noise|effect|interlude|back|bk |harm|ooh|double|ditto|pad|tab|seq|track|mandolin|timpani|glock|xylo|wood|lead|fill|rake/i;
const sings = (ns: N[]) => {
  if (ns.length < 80 || ns.length > 900) return false;
  let ov = 0; for (let i = 1; i < ns.length; i++) if (ns[i].s < ns[i - 1].e - 0.05 && ns[i].s - ns[i - 1].s < 0.05) ov++;
  if (ov / ns.length > 0.1) return false;
  const ps = ns.map((n) => n.p).sort((x, y) => x - y);
  return ps[Math.floor(ps.length * 0.05)] >= 45 && ps[Math.floor(ps.length * 0.95)] <= 86 && ps[ps.length >> 1] >= 55 && ps[ps.length >> 1] <= 80;
};
interface Tr { name: string; ns: N[]; ch: number; prog: number }
function findVox(T: Tr[]): number {
  const most = (ok: (t: Tr) => boolean) => { let b = -1; T.forEach((t, i) => { if (t.ch !== 9 && ok(t) && sings(t.ns) && (b < 0 || t.ns.length > T[b].ns.length)) b = i; }); return b; };
  let i = most((t) => VOX.test(t.name) && !NOT_LEAD_VOX.test(t.name));
  if (i < 0) i = T.findIndex((t) => LEAD.test(t.name) && t.ns.length > 40 && t.ch !== 9);
  if (i < 0) i = most((t) => !INSTR.test(t.name) && !VOX.test(t.name) && !(t.prog >= 24 && t.prog <= 39) && t.prog < 112);
  return i;
}
export const norm = (a: string) => a.toLowerCase().replace(/&/g, 'and').replace(/['\s]/g, '_');
export const genreOf: Record<string, string> = {};
for (const [g, l] of Object.entries(G)) for (const a of l) genreOf[norm(a)] = g;

export const MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
export const MIN = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
export const corr = (a: number[], b: number[]) => { const ma = a.reduce((s, x) => s + x) / 12, mb = b.reduce((s, x) => s + x) / 12; let n = 0, da = 0, db = 0; for (let i = 0; i < 12; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; } return n / Math.sqrt(da * db); };

export interface N { s: number; e: number; p: number }
export interface LakhSong {
  artist: string;
  /** The app's genre (artists tagged by hand), if any. */
  genre?: string;
  /** The lead line, in beats. */
  mel: N[];
  tonic: number;
  minor: boolean;
  /** Per 16th: the band's pitch classes sounding, and its lowest note (MIDI). */
  slots: Set<number>[];
  low: number[];
  /** The words, when the file has them (karaoke text or lyric events): each syllable's time (beats) and text, as written (line marks kept). */
  words?: { t: number; text: string }[];
  /** The tempo (beats a minute) at the start. */
  bpm: number;
}

/** Every usable song, in folder order. */
export function forEachSong(root: string, cb: (s: LakhSong) => void): number {
  const seen = new Set<string>();
  let files = 0;
  for (const a of fs.readdirSync(root)) {
    const d = path.join(root, a);
    if (!fs.statSync(d).isDirectory()) continue;
    const g = genreOf[norm(a)];
    for (const f of fs.readdirSync(d)) {
      if (!/\.mid$/i.test(f)) continue;
      const key = `${a}/${f}`.replace(/\.\d+\.mid$/i, '.mid').toLowerCase();
      if (seen.has(key)) continue;
      let m; try { m = parseMidi(fs.readFileSync(path.join(d, f))); } catch { continue; }
      files++;
      const ppq = (m.header as { ticksPerBeat?: number }).ticksPerBeat;
      if (!ppq) continue;
      let ts = '', bpm = 0;
      const T = m.tracks.map((t) => {
        let tick = 0, name = '', ch = -1, prog = -1; const on: Record<number, number> = {}, ns: N[] = [], lyr: { t: number; text: string }[] = [], txt: { t: number; text: string }[] = [];
        for (const e of t as any[]) {
          tick += e.deltaTime;
          if (e.type === 'trackName' && !name) name = (e.text || '').trim();
          else if (e.type === 'timeSignature' && !ts) ts = `${e.numerator}/${e.denominator}`;
          else if (e.type === 'setTempo' && !bpm) bpm = 60000000 / e.microsecondsPerBeat;
          else if (e.type === 'lyrics' && e.text) lyr.push({ t: tick / ppq, text: e.text });
          else if (e.type === 'text' && e.text && !e.text.startsWith('@')) txt.push({ t: tick / ppq, text: e.text });
          else if (e.type === 'programChange' && prog < 0) prog = e.programNumber;
          else if (e.type === 'noteOn' && e.velocity > 0) { on[e.channel * 128 + e.noteNumber] = tick; ch = e.channel; }
          else if (e.type === 'noteOff' || (e.type === 'noteOn' && e.velocity === 0)) { const k = e.channel * 128 + e.noteNumber; if (on[k] !== undefined) { ns.push({ s: on[k] / ppq, e: tick / ppq, p: e.noteNumber }); delete on[k]; } }
        }
        ns.sort((x, y) => x.s - y.s);
        return { name, ns, ch, prog, lyr, txt };
      });
      if (ts && ts !== '4/4') continue;
      const vi = process.env.NAMED_ONLY ? T.findIndex((t) => LEAD.test(t.name) && t.ns.length > 40 && t.ch !== 9) : findVox(T);
      if (vi < 0) continue;
      seen.add(key);
      const mel = T[vi].ns;
      let ov = 0; for (let i = 1; i < mel.length; i++) if (mel[i].s < mel[i - 1].e - 0.05 && mel[i].s - mel[i - 1].s < 0.05) ov++;
      if (ov / mel.length > 0.1) continue;
      const ps = mel.map((n) => n.p).sort((x, y) => x - y);
      if (ps[Math.floor(ps.length * 0.05)] < 45 || ps[Math.floor(ps.length * 0.95)] > 86) continue;
      const band = T.filter((t, i) => i !== vi && t.ch !== 9 && !LEAD.test(t.name) && !/vo(cal|x|ice)|melod|harm|back/i.test(t.name) && !VOX.test(t.name)).flatMap((t) => t.ns);
      if (band.length < 100) continue;
      const pc = new Array(12).fill(0); for (const n of band.concat(mel)) pc[n.p % 12] += n.e - n.s;
      let best = -2, tonic = 0, minor = false;
      for (let k = 0; k < 12; k++) { const rot = pc.slice(k).concat(pc.slice(0, k)); const x = corr(rot, MAJ), y = corr(rot, MIN); if (x > best) { best = x; tonic = k; minor = false; } if (y > best) { best = y; tonic = k; minor = true; } }
      const slots: Set<number>[] = [], low: number[] = [];
      for (const n of band) for (let s = Math.ceil((n.s - 0.02) * 4); s < n.e * 4 - 0.08 && s < 40000; s++) { (slots[s] ??= new Set()).add(n.p % 12); if (!low[s] || n.p < low[s]) low[s] = n.p; }
      // (the words: the track with the most lyric events, else karaoke text)
      const wt = [...T].sort((x, y) => y.lyr.length - x.lyr.length)[0], kt = [...T].sort((x, y) => y.txt.length - x.txt.length)[0];
      const words = wt.lyr.length > 50 ? wt.lyr : kt.txt.length > 50 ? kt.txt : undefined;
      cb({ artist: a, genre: g, mel, tonic, minor, slots, low, bpm: bpm || 120, ...(words ? { words } : {}) });
    }
  }
  return files;
}

export interface Line { t0: number; t1: number; key: string; syl: number }
/** The words as lines (by the karaoke marks: "/" or "\" before a line, or a line break after), with their times. */
export function linesOf(words: { t: number; text: string }[]): Line[] {
  const out: Line[] = [];
  let cur: { t: number; text: string }[] = [];
  const flush = () => {
    if (!cur.length) return;
    const key = cur.map((w) => w.text).join('').toLowerCase().replace(/[^a-z]/g, '');
    out.push({ t0: cur[0].t, t1: cur[cur.length - 1].t, key, syl: cur.length });
    cur = [];
  };
  for (const w of words) {
    const lead = /^[\\/]/.test(w.text), trail = /[\r\n]\s*$/.test(w.text);
    if (lead) flush();
    cur.push({ t: w.t, text: w.text.replace(/[\\/\r\n]/g, '') });
    if (trail) flush();
  }
  flush();
  return out.filter((l) => l.key.length >= 4);
}
