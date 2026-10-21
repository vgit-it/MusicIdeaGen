// The realism measures (docs/STUDY-LAKH.md, docs/REALISM.md): one vocal line measured the same way whether
// it comes from a real song's MIDI (scripts/study/lakh-targets.ts) or from the app (scripts/realism-lab.ts, src/guide/real.ts).
// Only numbers come out: counts per bucket and a few per-song figures, never the notes.

/** A sung note, in beats (quarter notes) from the song's start; MIDI pitch. */
export interface RNote { s: number; e: number; p: number }
export interface RSong {
  notes: RNote[];
  tonic: number;
  minor: boolean;
  /** The pitch classes the band sounds at a beat (chords, bass). */
  bandAt: (beat: number) => Set<number>;
}
export type Hist = Record<string, number>;
export interface SongMeasure { hist: Record<string, Hist>; chordTone: number; strongCT: number; range: number; repeat2bar: number }
/** A genre's profile: each measure's spread (fractions summing to 1) and per-song averages. */
export interface Profile {
  songs: number;
  hist: Record<string, Hist>;
  chordTone: number;
  strongCT: number;
  /** Semitones, p5 to p95 of a song's notes: median, p10, p90 over songs. */
  range: [number, number, number];
  repeat2bar: number;
  /** Per song, the middle half of real songs (p25, p75): same note again, strong notes on the chord, range, 2-bar repeats, phrases peaking early. */
  iqr?: Record<SongKey, [number, number]>;
}
export type SongKey = 'same' | 'strongCT' | 'range' | 'repeat2bar' | 'early';
/** One song's figures for the per-song measures. */
export function songFigures(m: SongMeasure): Record<SongKey, number> {
  const share = (h: Hist | undefined, k: string) => { const t = Object.values(h ?? {}).reduce((a, b) => a + b, 0); return t ? (h![k] ?? 0) / t : 0; };
  return { same: share(m.hist.interval, 'repeat'), strongCT: m.strongCT, range: m.range, repeat2bar: m.repeat2bar, early: share(m.hist.peakWhere, 'early') };
}

export const HISTS = ['interval', 'afterLeap', 'onset16', 'phraseBars', 'phraseSpan', 'peakWhere', 'phraseEndDegree'] as const;
export const HIST_LABEL: Record<string, string> = {
  interval: 'steps and leaps', afterLeap: 'after a leap', onset16: 'onsets in the beat', phraseBars: 'phrase lengths',
  phraseSpan: 'phrase spans', peakWhere: 'phrase top', phraseEndDegree: 'phrase ends',
};
const MAJ_SC = [0, 2, 4, 5, 7, 9, 11], MIN_SC = [0, 2, 3, 5, 7, 8, 10];
const mod = (n: number, m: number) => ((n % m) + m) % m;

export function measureSong(song: RSong): SongMeasure {
  const mel = song.notes;
  const H: Record<string, Hist> = {};
  const inc = (k: string, v: string) => { (H[k] ??= {})[v] = (H[k][v] ?? 0) + 1; };
  const SC = song.minor ? MIN_SC : MAJ_SC;
  const deg = (p: number) => SC.indexOf(mod(p - song.tonic, 12));
  let chordTone = 0, strong = 0, strongCT = 0;
  for (let i = 0; i < mel.length; i++) {
    const n = mel[i], pos = n.s % 4;
    const isCT = song.bandAt(n.s).has(mod(n.p, 12));
    if (isCT) chordTone++;
    if (Math.abs(pos - Math.round(pos)) < 0.06 && Math.round(pos) % 2 === 0) { strong++; if (isCT) strongCT++; }
    inc('onset16', ['beat', 'e', '&', 'a'][Math.round((n.s % 1) * 4) % 4]);
    if (!i || n.s - mel[i - 1].e >= 1) continue;
    const iv = n.p - mel[i - 1].p, a = Math.abs(iv);
    inc('interval', a === 0 ? 'repeat' : a <= 2 ? 'step' : a <= 4 ? 'third' : a <= 7 ? '4th-5th' : a <= 12 ? '6th-octave' : 'over octave');
    if (a > 4 && i + 1 < mel.length && mel[i + 1].s - n.e < 1) { const nx = mel[i + 1].p - n.p; inc('afterLeap', nx === 0 ? 'repeat' : Math.sign(nx) !== Math.sign(iv) ? 'turns back' : 'keeps going'); }
  }
  // phrases: split by a rest of a beat or more
  let st = 0;
  for (let i = 1; i <= mel.length; i++) {
    if (i < mel.length && mel[i].s - mel[i - 1].e < 1) continue;
    const p = mel.slice(st, i); st = i;
    const len = p[p.length - 1].e - p[0].s;
    inc('phraseBars', len < 2 ? '<0.5' : len < 4 ? '0.5-1' : len < 8 ? '1-2' : len < 16 ? '2-4' : '4+');
    const last = p[p.length - 1], d = deg(last.p);
    inc('phraseEndDegree', d < 0 ? 'off-key' : String(d + 1));
    const sp = Math.max(...p.map((n) => n.p)) - Math.min(...p.map((n) => n.p));
    inc('phraseSpan', sp <= 4 ? '≤3rd' : sp <= 7 ? '4th-5th' : sp <= 12 ? '≤octave' : '>octave');
    if (p.length < 3) continue;
    const top = p.reduce((a, b) => (b.p > a.p ? b : a)), x = (top.s - p[0].s) / Math.max(0.01, last.s - p[0].s);
    inc('peakWhere', x < 0.33 ? 'early' : x < 0.66 ? 'middle' : 'late');
  }
  const ps = mel.map((n) => n.p).sort((a, b) => a - b);
  const range = ps[Math.floor(ps.length * 0.95)] - ps[Math.floor(ps.length * 0.05)];
  // 2-bar stretches (rhythm and steps) that come back somewhere in the song
  const win: Record<string, number> = {};
  const end = mel.length ? mel[mel.length - 1].e : 0;
  for (let b = 0; b < end; b += 8) {
    const w = mel.filter((n) => n.s >= b && n.s < b + 8);
    if (w.length < 3) continue;
    const sig = w.map((n, i) => `${Math.round((n.s - b) * 4)}:${i ? n.p - w[i - 1].p : 0}`).join(',');
    win[sig] = (win[sig] ?? 0) + 1;
  }
  const tot = Object.values(win).reduce((a, b) => a + b, 0), rep = Object.values(win).filter((c) => c > 1).reduce((a, b) => a + b, 0);
  return { hist: H, chordTone: chordTone / Math.max(1, mel.length), strongCT: strong ? strongCT / strong : 0, range, repeat2bar: tot ? rep / tot : 0 };
}

const r3 = (x: number) => Math.round(x * 1000) / 1000;
export function profile(ms: SongMeasure[]): Profile {
  const hist: Record<string, Hist> = {};
  for (const k of HISTS) {
    const sum: Hist = {};
    for (const m of ms) for (const [v, c] of Object.entries(m.hist[k] ?? {})) sum[v] = (sum[v] ?? 0) + c;
    const t = Object.values(sum).reduce((a, b) => a + b, 0) || 1;
    hist[k] = Object.fromEntries(Object.entries(sum).sort((a, b) => b[1] - a[1]).map(([v, c]) => [v, r3(c / t)]));
  }
  const av = (f: (m: SongMeasure) => number) => r3(ms.reduce((s, m) => s + f(m), 0) / Math.max(1, ms.length));
  const rs = ms.map((m) => m.range).sort((a, b) => a - b), q = (x: number) => rs[Math.floor(rs.length * x)] ?? 0;
  const figs = ms.map(songFigures);
  const iqr = Object.fromEntries((['same', 'strongCT', 'range', 'repeat2bar', 'early'] as SongKey[]).map((k) => { const a = figs.map((f) => f[k]).sort((x, y) => x - y); return [k, [r3(a[Math.floor(a.length * 0.25)] ?? 0), r3(a[Math.floor(a.length * 0.75)] ?? 0)]]; })) as Record<SongKey, [number, number]>;
  return { songs: ms.length, hist, chordTone: av((m) => m.chordTone), strongCT: av((m) => m.strongCT), range: [q(0.5), q(0.1), q(0.9)], repeat2bar: av((m) => m.repeat2bar), iqr };
}

/** How far a spread is from the target's: half the summed differences (0: the same, 1: nothing shared). */
export const tv = (a: Hist = {}, b: Hist = {}) => [...new Set([...Object.keys(a), ...Object.keys(b)])].reduce((s, k) => s + Math.abs((a[k] ?? 0) - (b[k] ?? 0)), 0) / 2;

/** Each measure's gap to the target (0..1), and the realism score: 100 minus the average gap in percent. */
export function gaps(app: Profile, real: Profile): { gaps: Record<string, number>; score: number } {
  const g: Record<string, number> = {};
  for (const k of HISTS) g[k] = tv(app.hist[k], real.hist[k]);
  g.chordTone = Math.abs(app.chordTone - real.chordTone);
  g.strongCT = Math.abs(app.strongCT - real.strongCT);
  g.range = Math.min(1, Math.abs(app.range[0] - real.range[0]) / 12);
  g.repeat2bar = Math.abs(app.repeat2bar - real.repeat2bar);
  const v = Object.values(g);
  return { gaps: g, score: Math.round(100 * (1 - v.reduce((a, b) => a + b, 0) / v.length)) };
}
