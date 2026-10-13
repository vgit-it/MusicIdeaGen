// A FOF singer (a trial: Paul, "the voice is not working, let's build it up from scratch"). FOF is
// IRCAM's CHANT method (Rodet, 1984), made for the singing voice: instead of a buzz sent through
// resonant filters (the formant synth in sing.ts, whose filters ring on from one sound into the next:
// a suspect for its "underwater" sound), every pulse of the vocal folds starts one short burst per
// formant, a decaying sine already at the formant's pitch, width and level. The vowel is the sum of
// those bursts; each pulse reads the vowel as it is at that moment, so sounds change cleanly from one
// pulse to the next. Breath and consonants are shaped noise.
// Sundberg's rules of sung performance on top: vibrato only on held notes (in after a moment), pitch
// glides between legato notes, F1 kept above the pitch, brighter and sharper-edged when louder.

import { type ConsSpec, EDGE_VOWEL, type F3, type Seg, type SungNote, joinNotes, layout } from './sing';

export const FOF_RATE = 44100;

export interface FofVoice {
  seed: number;
  high?: boolean;
  /** Vocal tract length (x formant frequencies; under 1: a bigger, darker voice). */
  tract?: number;
  /** Formant widths (x): wider is softer and less "pure". */
  bw?: number;
  /** Vibrato depth in cents (held notes), and drift (a slow wander in pitch, cents). */
  vib?: number;
  /** Vibrato rate (Hz; left out: about 5.4-5.9). Slow and wide is a wobble; quick and narrow a tight one. */
  vibHz?: number;
  drift?: number;
  /** Breath in the tone (dB, about -30 quiet to -14 very breathy). */
  breath?: number;
  /** Rasp 0-1 (grows on loud notes). */
  grit?: number;
  /** Brightness (dB per octave; + brighter). */
  bright?: number;
  /** Low end: the glottal formant's level (dB). */
  body?: number;
  /** Edge 0-1 (as the voice lab's, Paul: "excellent"): pressed folds, a flatter tilt, the 1.5-4 kHz range filled; by vowel. */
  edge?: number;
  /**
   * How human, 0-1 (left out: 1; 0: machine-steady, the first trial). The small unevenness of a real
   * voice, Paul: "sounding a bit like a robot": pulse to pulse (jitter about 0.5%, shimmer about 5%,
   * the vowel's formants a little different each pulse), slowly (pitch, loudness and the vowel's shape
   * wandering), note by note (each vibrato its own, a start a touch
   * under the note settling in, a swell on held notes), and breath up in the highs.
   */
  human?: number;
  /** Covered vowels 0-1: every vowel rounded and darkened toward "aw" / "oh" (a low larynx; "yeah" sung "yaow"). */
  cover?: number;
  /** Nasal 0-1: a little of the nose in every vowel (a pinched, sneering tone). */
  nasal?: number;
  /** Scoops 0-1: notes started from under the pitch and slid up into, more often and from further. */
  scoop?: number;
  /** Sags 0-1: held notes let droop a little at their end. */
  sag?: number;
  /**
   * Expression 0-1 (left out: 0, one tone throughout): the singer's tone moving with the moment, as a
   * real singer's does: by the section's energy (verses closer and breathier, choruses open and edgy),
   * a little different each line, soft breathy or hard punchy starts, the tone thinning into breath at
   * a line's end, straining up high (now and then a little crack), rounder down low, weight on key words.
   */
  expr?: number;
  /**
   * Plain 0-1 (left out: 0): less of the trained, operatic sound (Paul: "reduce some of that opera
   * voice"): vibrato only on the longer notes, later and narrower, some held straight; less ring up
   * top (the 3-5 kHz "singer's formant" cluster wider and quieter); no swell on held notes.
   */
  plain?: number;
  /**
   * Raw 0-1 (left out: 0): an untrained rock singer, not a trained one (Paul: "in the mid-high range
   * it's sounding like an opera singer, not because of vibrato but timbre"). A trained singer keeps the
   * throat low and the vowels round all the way up; a rock singer lets the throat rise with the pitch:
   * from about an octave under the break, the formants up (brighter, nearer a yell), the vowels
   * kept open and speech-like (no covering), wider formants (less pure), more twang and edge.
   */
  raw?: number;
  /** The line's section energy, 0 (quiet verse) to 1 (the biggest chorus); left out: 0.5. */
  energy?: number;
  /** Their break (MIDI, about E4) and their way up past it. */
  brk?: number;
  up?: 'belt' | 'falsetto' | 'scream' | 'squeal';
}

const lerp = (a: number, b: number, x: number) => a + (b - a) * Math.max(0, Math.min(1, x));
const lerp3 = (a: F3, b: F3, x: number): F3 => [lerp(a[0], b[0], x), lerp(a[1], b[1], x), lerp(a[2], b[2], x)];
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth01 = (x: number) => { const k = clamp01(x); return k * k * (3 - 2 * k); };
const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12);
const db = (x: number) => 10 ** (x / 20);
/** How long a fall off a line's end takes: up to 0.3 s, at most half the note. */
const fallLen = (n: { t: number; end: number }) => Math.max(0.06, Math.min(0.3, (n.end - n.t) * 0.5));

function rng(seed: number) {
  let a = (seed * 2654435761 + 1) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A two-pole band-pass (RBJ, 0 dB peak), its coefficients settable as the formant moves. */
class Band {
  b0 = 0; b2 = 0; a1 = 0; a2 = 0; x1 = 0; x2 = 0; y1 = 0; y2 = 0;
  set(rate: number, f: number, bw: number) {
    const w = (2 * Math.PI * Math.min(f, rate * 0.45)) / rate, al = Math.sin(w) * Math.sinh((Math.LN2 / 2) * (bw / f) * (w / Math.sin(w)));
    const a0 = 1 + al;
    this.b0 = al / a0; this.b2 = -al / a0; this.a1 = (-2 * Math.cos(w)) / a0; this.a2 = (1 - al) / a0;
    return this;
  }
  run(x: number) {
    const y = this.b0 * x + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

/** The noise colours of the consonants: [band centre, width] pairs, summed (each scaled to the same loudness). */
const NOISE: Record<'s' | 'sh' | 'flat' | 'alv' | 'lab' | 'vel', [number, number][]> = {
  s: [[6200, 3000], [8500, 3000]],
  sh: [[2900, 1200], [4200, 1800]],
  flat: [[2500, 4000], [6500, 5000]],
  alv: [[3800, 2500], [5500, 3000]],
  lab: [[900, 1400], [2200, 2500]],
  vel: [[1900, 600], [3000, 1200]],
};
type Shape = keyof typeof NOISE;
const SHAPES = Object.keys(NOISE) as Shape[];

interface Grain { re: number; im: number; cr: number; ci: number; n: number; tex: number; dur: number; rel: number }

/**
 * Sing a line (notes in seconds; `pre` seconds of lead-in before time 0), at FOF_RATE, mono: joined
 * syllables (as the formant voice's "phrased" flow: short gaps filled, consonants a little shorter).
 */
export function renderFof(notes0: SungNote[], v: FofVoice, pre: number): Float32Array {
  const fs = FOF_RATE;
  const hu = v.human ?? 1;
  const nr = rng(v.seed * 13 + notes0.length);
  // (the timing off the grid is the singer's feel, feel.ts, applied before)
  const notes = joinNotes(notes0, 'phrases').map((n) => ({ ...n, t: n.t + pre, end: n.end + pre }));
  // (each note's own vibrato: rate within about 8%, depth within about 30%; a start a little under the note)
  const noteVib = notes.map(() => ({ hz: 1 + hu * 0.08 * (nr() * 2 - 1), depth: 1 + hu * 0.3 * (nr() * 2 - 1), under: hu * (0.05 + 0.1 * nr()) }));
  const segs = layout(notes, 0.7);
  const endT = segs[segs.length - 1].t1 + 0.3;
  const N = Math.ceil(endT * fs);
  const out = new Float32Array(N);
  const rnd = rng(v.seed * 7 + notes.length);
  const gauss = () => rnd() + rnd() + rnd() - 1.5;

  // (the high voice: a smaller person, but not too far from the low one: Paul, "a bit too different";
  // was 1.17 and its break an octave up with the voice, so it sang past it most of the time)
  const fscale = (v.high ? 1.1 : 1) * (v.tract ?? 1);
  const high = (v.high ? [3600, 4150, 5250] : [3250, 3700, 4950]).map((f) => f * (v.tract ?? 1));
  const plain = v.plain ?? 0;
  const bws = [90, 110, 160, 200, 230, 500].map((b, k) => b * (v.bw ?? 1) * (k >= 3 ? 1 + 0.6 * plain : 1));
  const vibC = v.vib ?? 30, driftC = (v.drift ?? 4) + 3 * hu, grit = v.grit ?? 0, breath = v.breath ?? -24;
  const vibHz = v.vibHz ?? 5.4 + (v.seed % 5) * 0.12;
  const cover0 = v.cover ?? 0, nasal = v.nasal ?? 0, scoop = v.scoop ?? 0, sag = v.sag ?? 0;
  // (each note's scoop, by its own chance and depth: a stressed or fresh note more likely; its own random, so voices without scoops sound as before)
  const sr = rng(v.seed * 31 + notes.length);
  // expression (its own random, so a voice without it sounds as before): the section, the line, each note
  const expr = v.expr ?? 0, en = v.energy ?? 0.5;
  const er = rng(v.seed * 41 + notes.length * 3 + 1);
  const eg = () => er() + er() + er() - 1.5;
  // (the section: verses closer and breathier, darker; choruses open, brighter, edgier, pushed)
  const secBreath = expr * lerp(2, -2, en), secBright = expr * lerp(-1.5, 1.5, en), secEdge = expr * lerp(-0.08, 0.15, en), secEffort = expr * lerp(-0.12, 0.12, en);
  // (the line: never quite the same voice twice)
  const lnBreath = expr * 1.6 * eg(), lnBright = expr * 0.6 * eg(), lnEdge = expr * 0.05 * eg(), lnVib = 1 + expr * 0.25 * eg();
  const exNotes = notes.map((n, i) => {
    const after = notes[i + 1], before = notes[i - 1];
    const fresh = !before || n.t - before.end > 0.12;
    const voicedStart = !n.syl.onset.length || n.syl.onset.every((c) => /^[MNLRWYVZ]|^DH|^NG/.test(c));
    // (a start: soft with breath first, more in quiet sections; hard and punchy on strong words, more in loud ones)
    const r = er();
    const onset = !expr || !fresh || n.syl.text === '~' ? 0 : r < expr * lerp(0.45, 0.15, en) && voicedStart ? 1 : r > 1 - expr * lerp(0.1, 0.4, en) * (n.syl.stress ? 1 : 0.4) ? 2 : 0;
    // (a line's end, or a note before a breath: the tone thinning into breath)
    const ends = !after || after.t - n.end > 0.25;
    // (a key word: stressed and long)
    const key = n.syl.stress && n.end - n.t > 0.4;
    // (now and then a little crack on a long, high, pushed note)
    const crack = expr && n.end - n.t > 0.5 && er() < expr * 0.12 * en ? 0.2 + 0.4 * er() : 0;
    return { onset, ends, key, crack };
  });
  let bright = v.bright ?? 0, breathNow = breath, roughAdd = 0;
  // (plain: some held notes sung straight, no vibrato; its own random)
  const pr = rng(v.seed * 53 + notes.length * 5 + 2);
  const straight = notes.map(() => !!plain && pr() < 0.35 * plain);
  const scoops = notes.map((n, i) => {
    const chance = scoop * (n.syl.stress ? 0.8 : 0.4) * (i === 0 || n.t - notes[i - 1].end > 0.1 ? 1.3 : 1);
    return !n.slide && n.syl.text !== '~' && sr() < chance ? { by: 0.6 + 1.4 * scoop * sr(), len: 0.09 + 0.08 * scoop } : null;
  });
  const brk = (v.brk ?? 64) + (v.high ? 7 : 0), way = v.up ?? 'belt', fal = way === 'falsetto';

  // the formant track: each consonant's place, each vowel's target, a diphthong's glide at its end.
  // (Paul: "a lot of 'dwo', 'wo', 'ye'": slow, full glides between sounds heard as extra w's and y's.
  // So: a stop, fricative or nasal only leans its vowel's formants halfway toward its own place (the
  // locus) and lets go within about 35 ms; only the glides and liquids (w, y, r, l) go all the way;
  // a diphthong turns only in its last 90 ms or so.)
  const keys: { t: number; f: F3 }[] = [];
  segs.forEach((s, i) => {
    const sc = (f: F3): F3 => [f[0] * fscale, f[1] * fscale, f[2] * fscale];
    if (s.cons) {
      const glide = s.cons.kind === 'liquid';
      const near = segs.slice(i + 1).find((x) => x.vowel)?.vowel?.[0] ?? segs.slice(0, i).reverse().find((x) => x.vowel)?.vowel?.[0] ?? s.cons.f;
      const lean = glide ? 1 : 0.5;
      const f: F3 = [lerp(near[0], s.cons.f[0], glide ? 1 : 0.8), lerp(near[1], s.cons.f[1], lean), lerp(near[2], s.cons.f[2], lean)];
      keys.push({ t: (s.t0 + s.t1) / 2, f: sc(f) });
    } else if (s.vowel) {
      const [a, b] = s.vowel, len = s.t1 - s.t0;
      const afterGlide = segs[i - 1]?.cons?.kind === 'liquid';
      keys.push({ t: s.t0 + Math.min(afterGlide ? 0.05 : 0.035, len * 0.3), f: sc(a) });
      if (b) { const turn = Math.min(0.09, len * 0.3); keys.push({ t: s.t1 - turn, f: sc(a) }); keys.push({ t: s.t1, f: sc(lerp3(a, b, 0.75)) }); }
      else keys.push({ t: s.t1 - Math.min(0.025, len * 0.15), f: sc(a) });
    }
  });
  keys.sort((x, y) => x.t - y.t);
  let ki = 0;
  const formantsAt = (t: number): F3 => {
    while (ki + 1 < keys.length && keys[ki + 1].t <= t) ki++;
    const a = keys[ki], b = keys[ki + 1];
    if (!b || t <= a.t) return a.f;
    const x = smooth01((t - a.t) / (b.t - a.t));
    return [lerp(a.f[0], b.f[0], x), lerp(a.f[1], b.f[1], x), lerp(a.f[2], b.f[2], x)];
  };

  // noise colours (each band scaled so white noise comes out at about the same loudness)
  const bank = SHAPES.map((sh) => NOISE[sh].map(([f, b]) => ({ band: new Band().set(fs, f, b), g: Math.sqrt(fs / 2 / b) })));
  const asp = [new Band(), new Band(), new Band(), new Band()];
  const aspG = [1, 0.7, 0.45, 0.3];
  // (breath in the highs, above the formants: what a real voice always has and a machine doesn't)
  const air = new Band().set(fs, 6000, 6000);

  // the state: smoothed levels (linear), the pitch's phase, the grains sounding
  let vA = 0, vNasal = 0, vBar = 0, aspA = 0, raspEnv = 0;
  const fricA = SHAPES.map(() => 0);
  let phase = 0.999, periodK = 1, alt = 1;
  let drift = 0, driftTo = 0;
  // (slow wanders: pitch tremor in cents, loudness in dB, each formant as a ratio)
  let trem = 0, tremTo = 0, loud = 0, loudTo = 0;
  const fw = [0, 0, 0, 0, 0, 0], fwTo = [0, 0, 0, 0, 0, 0];
  const grains: Grain[] = [];
  let si = 0;
  const CT = 32;
  // the pitch line from note to note (Saitou et al., the F0 of singing: a voice moves to a new note as a
  // spring settles, a touch past it, and dips the other way just before it moves; Paul: "too much sudden
  // movement"): the notes' steps, eased forward (overshoot) and backward (preparation), phrase by
  // phrase (notes joined by under 0.12 s), per tick of CT samples (a little slower than Saitou's: about 90 ms
  // from one note to the next)
  const dt = CT / fs, nT = Math.ceil(N / CT) + 1;
  const pitchLine = new Float64Array(nT);
  const phrases: [number, number][] = [];
  {
    let ni = 0;
    // (bends in the line itself, so the spring smooths them too (Paul: "voice bends should be smooth"):
    // a scoop up into a note eased in and out over up to a quarter second; a fall off the line's end
    // easing away over its last part)
    for (let j = 0; j < nT; j++) {
      const t = j * dt;
      while (ni + 1 < notes.length && notes[ni + 1].t <= t) ni++;
      const n = notes[ni];
      let m = n.midi;
      if (n.slide) m -= n.slide * (1 - smooth01((t - n.t + 0.03) / Math.min(0.25, Math.max(0.08, (n.end - n.t) * 0.4))));
      if (ni === notes.length - 1 && n.fall) { const fd = fallLen(n); m -= n.fall * smooth01((t - (n.end - fd)) / fd); }
      pitchLine[j] = m;
    }
    const spring = (from: number, to: number, w: number, z: number, back: boolean) => {
      let y = pitchLine[back ? to : from], vel = 0;
      for (let k = 0; k <= to - from; k++) {
        const j = back ? to - k : from + k;
        vel += dt * (w * w * (pitchLine[j] - y) - 2 * z * w * vel);
        y += dt * vel;
        pitchLine[j] = y;
      }
    };
    let first = 0;
    for (let k = 1; k <= notes.length; k++) {
      if (k < notes.length && notes[k].t - notes[k - 1].end <= 0.12) continue;
      phrases.push([first, k - 1]);
      const a = notes[first], b = notes[k - 1], nx = notes[k];
      const from = Math.max(0, Math.floor((a.t - 0.2) / dt)), to = Math.min(nT - 1, Math.ceil(Math.min(b.end + 0.3, nx ? nx.t - 0.2 : Infinity) / dt));
      for (let j = from; j < a.t / dt; j++) pitchLine[j] = a.midi;
      // (damped more than in Saitou's model: a smaller overshoot and dip, about
      // 5%; a strong rise or dip on every note makes each syllable a contour, like a tonal language)
      spring(from, to, 26, 0.7, false);
      spring(from, to, 22, 0.75, true);
      first = k;
    }
  }
  // the level line (Paul: "smooth human-like dynamism in levels"): each phrase an arc, growing toward
  // its middle and easing at its end, by its own amount (some phrases pushed, some held back); the
  // stressed syllables a little louder, the light ones lighter; higher notes louder (as a voice is);
  // all of it gliding from note to note (about 70 ms), not stepping
  const levelLine = new Float64Array(nT);
  {
    const lv = notes.map((n) => lerp(-8, 0, n.vel));
    for (const [a, b] of phrases) {
      const t0 = notes[a].t, t1 = notes[b].end, mean = notes.slice(a, b + 1).reduce((x, n) => x + n.midi, 0) / (b - a + 1);
      const push = hu * 1.5 * (nr() * 2 - 1);
      for (let k = a; k <= b; k++) {
        const n = notes[k], x = (n.t - t0) / Math.max(0.2, t1 - t0);
        const arc = 2.5 * Math.sin(Math.PI * Math.min(1, x / 0.9) ** 0.8) - 2.5 * clamp01((x - 0.8) / 0.2);
        lv[k] += hu * (arc + (n.syl.stress ? 1 : n.syl.text === '~' ? 0 : -1.5) + 0.3 * (n.midi - mean)) + push;
      }
    }
    let ni = 0;
    for (let j = 0; j < nT; j++) { while (ni + 1 < notes.length && notes[ni + 1].t - 0.03 <= j * dt) ni++; levelLine[j] = lv[ni]; }
    const k = 1 - Math.exp(-dt / 0.07);
    // (eased forward and back: no lag)
    for (let j = 1; j < nT; j++) levelLine[j] = levelLine[j - 1] + (levelLine[j] - levelLine[j - 1]) * k;
    for (let j = nT - 2; j >= 0; j--) levelLine[j] = levelLine[j + 1] + (levelLine[j] - levelLine[j + 1]) * k;
  }
  // the control values (per CT samples)
  let f0 = 110, vT = 0, nasalT = 0, barT = 0, aspT = 0, effort = 0.5;
  // (the register: how far up past the break, 0-1; how deep below it, 0-1)
  let upW = 0, lowW = 0, edgeW = 0;
  // (the singer's ear: the level they hear, kept steady from note to note whatever the vowel and pitch do to it)
  let comp = 1;
  // (as heard on an "ah" at G3: no correction)
  const refF = [700, 1100, 2550, ...high];
  const pRef = 196 * refF.reduce((a, _, k) => a + formantLevel(refF, bws, k, 0) ** 2 / bws[k], 0);
  const fricT = SHAPES.map(() => 0);
  let F: number[] = [500, 1500, 2500, ...high];
  const B = bws.slice();
  const kUp = 1 - Math.exp(-1 / (0.012 * fs)), kDown = 1 - Math.exp(-1 / (0.025 * fs)), kFast = 1 - Math.exp(-1 / (0.006 * fs));
  const kNoise = 1 - Math.exp(-1 / (0.004 * fs));
  let lastVoiceless = false;
  let dc = 0;

  for (let i = 0; i < N; i++) {
    const t = i / fs;
    if (i % CT === 0) {
      while (si + 1 < segs.length && segs[si + 1].t0 <= t) si++;
      const s: Seg = segs[si];
      const inside = t >= s.t0 && t < s.t1;
      // the note sounding (or about to)
      let ni = 0;
      for (let k = 0; k < notes.length; k++) if (notes[k].t - 0.03 <= t) ni = k;
      const note = notes[ni], prev = notes[ni - 1];
      let midi = pitchLine[Math.floor(i / CT)] + (v.high ? 12 : 0);
      const into = t - note.t, held = note.end - note.t;
      // vibrato on held notes only, in after a moment (Sundberg); a slow drift
      if (held > 0.4 + 0.35 * plain && !straight[ni]) {
        const on = smooth01((into - Math.min(0.35 + 0.25 * plain, held * (0.35 + 0.2 * plain))) / 0.3) * (1 - 0.35 * plain);
        const nv = noteVib[ni];
        // (the rate drifting a little through the note, the depth breathing)
        const vph = 2 * Math.PI * vibHz * nv.hz * (into + hu * 0.03 * Math.sin(1.3 * into + ni));
        midi += (vibC / 100) * nv.depth * lnVib * (1 + hu * 0.15 * Math.sin(2.1 * into + 2 * ni)) * on * Math.sin(vph + v.seed);
      }
      // (a note started fresh, not glided or scooped into: a touch under, settling in over about 80 ms)
      if (!note.slide && !(prev && prev.end >= note.t - 0.12)) midi -= noteVib[ni].under * (1 - smooth01((into + 0.02) / 0.1));
      // (a scoop: from under, slid up into the note)
      const sc = scoops[ni];
      if (sc) midi -= sc.by * (1 - smooth01((into + 0.01) / sc.len));
      // (a sag: a held note let droop at its end, up to about half a semitone)
      if (sag && held > 0.45 && !note.fall) midi -= sag * 0.55 * smooth01((into - held * 0.65) / (held * 0.35));
      // (the slow wanders)
      const dtC = CT / fs;
      if (rnd() < dtC / 0.08) tremTo = hu * 2.5 * gauss();
      trem += (tremTo - trem) * (dtC / 0.06);
      midi += trem / 100;
      if (rnd() < dtC / 0.25) loudTo = hu * 0.8 * gauss();
      loud += (loudTo - loud) * (dtC / 0.2);
      for (let k = 0; k < 6; k++) { if (rnd() < dtC / 0.2) fwTo[k] = hu * 0.025 * gauss(); fw[k] += (fwTo[k] - fw[k]) * (dtC / 0.15); }
      if (rnd() < CT / fs / 0.12) driftTo = (rnd() * 2 - 1) * driftC;
      drift += (driftTo - drift) * (CT / fs / 0.15);
      f0 = mtof(midi + drift / 100);
      effort = clamp01((note.vel - 0.55) / 0.4) * 0.7 + clamp01((note.midi - 52) / 14) * 0.3;
      // the register (docs/VOICES.md): chest below the break, blending over about four semitones into
      // their way up past it; the deep notes fuller
      const place = note.midi + (v.high ? 12 : 0) - brk;
      upW = smooth01((place + 1) / 4);
      lowW = smooth01((-place - 14) / 6);
      // (expression: the section, the line, the note's start and end, a key word, the reach up high)
      let exAmp = 0, exBreath = 0, exBright = 0, exEdge = 0, exEffort = 0;
      roughAdd = 0;
      if (expr) {
        const ex = exNotes[ni];
        if (ex.onset === 1) { const k = 1 - smooth01((into + 0.02) / 0.12); exBreath += 7 * k; exAmp -= 4 * k; exBright -= 2 * k; }
        if (ex.onset === 2) { const k = 1 - smooth01(into / 0.08); exEdge += 0.25 * k; exBright += 2 * k; exAmp += 1.5 * k; }
        if (ex.ends && held > 0.2) { const k = smooth01((into - held * 0.6) / (held * 0.4)); exBreath += 4 * k; exBright -= 1.5 * k; exEffort -= 0.15 * k; }
        if (ex.key) { exAmp += 1.2; exEdge += 0.08; }
        // (reaching: past the break and pushed, the strain shows)
        const reach = smooth01((note.midi + (v.high ? 12 : 0) - brk + 2) / 5) * clamp01((note.vel - 0.6) / 0.3);
        exEdge += 0.15 * reach; exBright += 1 * reach; roughAdd = 0.15 * reach * expr;
        if (ex.crack) { const c = Math.max(0, 1 - Math.abs(into - held * ex.crack - 0.04) / 0.04); exAmp -= 7 * c; exBreath += 6 * c; exBright -= 4 * c; }
        exAmp *= expr; exBreath *= expr; exBright *= expr; exEdge *= expr; exEffort *= expr;
      }
      effort = clamp01(effort + secEffort + exEffort);
      // (raw: how far up into the rise: from about an octave under the break, all of it by the break)
      const rise = (v.raw ?? 0) * smooth01((place + 12) / 12);
      bright = (v.bright ?? 0) + secBright + lnBright + exBright + 1.5 * rise;
      breathNow = breath + secBreath + lnBreath + exBreath;
      edgeW = clamp01((v.edge ?? 0) + 0.2 * rise + (expr ? secEdge + lnEdge + exEdge : 0)) * EDGE_VOWEL[note.syl.vowel];
      // (down low: rounder, more relaxed)
      const cover = Math.min(1, cover0 + expr * 0.15 * smooth01((-place - 6) / 6)) * (1 - rise);
      for (let k = 0; k < 3; k++) B[k] = bws[k] * (1 + 0.5 * rise);
      // (a held note swells a little in and eases at its end)
      const swell = held > 0.35 ? hu * (1 - plain) * (lerp(-2, 0, into / (held * 0.4)) + lerp(0, -1.5, (into - held * 0.75) / (held * 0.25))) : 0;
      const amp = exAmp + levelLine[Math.floor(i / CT)] + (fal ? 5 * upW : 0) + swell + loud - (note.fall && ni === notes.length - 1 ? 12 * smooth01((t - (note.end - fallLen(note))) / fallLen(note)) : 0);
      // (a word starting on a vowel: a small dip so the words don't slur together)
      const dip = ni > 0 && note.syl.wordStart && !note.syl.onset.length && note.syl.text !== '~' ? 5 * Math.max(0, 1 - Math.abs(t - note.t) / 0.05) : 0;

      // what's sounding: a vowel, a consonant (by its kind), or nothing
      let voice = -Infinity, nas = 0, bar = 0, aspir = -Infinity;
      fricT.fill(0);
      lastVoiceless = false;
      if (inside && s.vowel) voice = amp - dip;
      else if (inside && s.cons) {
        const c: ConsSpec = s.cons;
        const x = (t - s.t0) / Math.max(0.005, s.t1 - s.t0);
        const shapeI = (sh: Shape) => SHAPES.indexOf(sh);
        switch (c.kind) {
          case 'liquid': voice = amp - (c.f[2] < 2000 ? 3 : 5); break;
          case 'nasal': voice = amp - 5; nas = 1; break;
          case 'h': aspir = amp - 6; lastVoiceless = true; break;
          case 'fric': case 'affric': {
            const closure = c.kind === 'affric' ? 0.3 : 0;
            if (x < closure) { lastVoiceless = !c.voiced; if (c.voiced) { voice = amp - 22; bar = 1; } break; }
            // (a fricative swells in and tapers out: s about 12 dB under the vowel, sh 14, f and th 22)
            const lvl = c.shape === 's' ? -12 : c.shape === 'sh' ? -14 : -22;
            const env = lerp(-14, 0, (x - closure) / 0.35) + lerp(0, -10, (x - 0.75) / 0.25);
            fricT[shapeI(c.shape as Shape)] = db(amp + lvl + env + (c.voiced ? -5 : 0));
            if (c.voiced) voice = amp - 10; else lastVoiceless = true;
            break;
          }
          case 'stop': {
            const closeEnd = c.voiced ? 0.7 : 0.5, burstEnd = closeEnd + 0.12;
            if (x < closeEnd) { if (c.voiced) { voice = amp - 22; bar = 1; } else lastVoiceless = true; break; }
            if (x < burstEnd) { fricT[shapeI(c.shape as Shape)] = db(amp + (c.shape === 'vel' ? -10 : -6)); lastVoiceless = !c.voiced; if (c.voiced) { voice = amp - 14; bar = 1; } break; }
            if (!c.voiced) { aspir = amp - 10; lastVoiceless = true; } else voice = amp - 3;
            break;
          }
        }
      }
      vT = voice === -Infinity ? 0 : db(voice);
      nasalT = Math.max(nas, nasal * 0.3 * (voice === -Infinity ? 0 : 1)); barT = bar;
      aspT = aspir === -Infinity ? 0 : db(aspir);
      // the formants: F1 kept above the pitch, a little up on loud notes (the mouth opens)
      const f3 = formantsAt(t).slice() as F3;
      // (covered: the front vowels' F2 pulled back most, every vowel a little rounder and darker)
      if (cover) {
        const front = clamp01((f3[1] - 1100) / 1200);
        f3[1] *= 1 - cover * (0.08 + 0.2 * front);
        f3[0] *= 1 - cover * 0.06 * clamp01((f3[0] - 550) / 250);
        f3[2] *= 1 - cover * 0.05;
      }
      let f1 = Math.max(f3[0] * (1 + 0.08 * effort), f0 * 1.15);
      // (up past the break: a belt opens the vowel so F1 rides the 2nd harmonic, the larynx up a touch;
      // falsetto keeps F1 clear above the pitch)
      if (!fal && f3[0] > 450) f1 = lerp(f1, Math.min(Math.max(2.04 * f0, f1), f1 * 1.5), upW);
      if (fal) f1 = Math.max(f1, f0 * 1.3);
      const lx = fal ? 1 : 1 + 0.04 * upW;
      // (formants kept apart: F1 riding up into F2 pushes it up, as the tongue does)
      const f2 = Math.max(f3[1] * lx, f1 + 250), f3b = Math.max(f3[2] * lx, f2 + 350);
      F = [f1, f2, f3b, ...high].map((f, k) => f * (1 + fw[k]) * (k < 3 ? 1 + 0.07 * rise : 1));
      for (let k = 0; k < 3; k++) asp[k].set(fs, F[k], Math.max(B[k] * 2, 150));
      asp[3].set(fs, F[3], 400);
    }

    // levels, smoothed (a voiceless consonant stops the voice quicker)
    vA += (vT - vA) * (vT > vA ? kUp : lastVoiceless ? kFast : kDown);
    vNasal += (nasalT - vNasal) * kNoise * 0.5;
    vBar += (barT - vBar) * kNoise * 0.5;
    aspA += (aspT - aspA) * kNoise;
    for (let k = 0; k < SHAPES.length; k++) fricA[k] += (fricT[k] - fricA[k]) * kNoise;

    // a pulse of the vocal folds: a grain per formant (and the rasp's noise)
    phase += (f0 * periodK) / fs;
    if (phase >= 1) {
      const d = (phase - 1) / ((f0 * periodK) / fs); // how far past the pulse this sample is (samples)
      phase -= 1;
      // the next period: a little jitter; on rasp, every other period a touch longer and weaker
      alt = -alt;
      const rough = Math.min(1, roughAdd + grit * effort * (fal ? 1 - upW : 1 + upW * (way === 'scream' ? 2.5 : way === 'squeal' ? 0.4 : 0.8)));
      periodK = 1 + (0.003 + 0.004 * hu) * gauss() + 0.015 * rough * alt;
      if (vA > 1e-4) {
        const shimmer = (1 + (0.04 + 0.03 * hu) * gauss() + 0.2 * rough * gauss()) * (1 - 0.18 * rough * (alt > 0 ? 1 : 0));
        // the source: about -6 dB an octave (the folds and the lips together), brighter when louder
        // (falsetto: soft-edged pulses, a steep tilt; belt and scream: sharp ones, flat; the deep notes a touch darker)
        const tiltX = (lerp(1.5, -2.5, effort) + (fal ? 6 : -1.5) * upW + 1.5 * lowW - bright - 4 * edgeW) / 6.02;
        const tex = Math.round(lerp(lerp(0.0035, 0.0016, effort), fal ? 0.005 : way === 'scream' ? 0.0012 : 0.0014, upW) * (1 - 0.35 * edgeW) * fs);
        // (a twang up past the break: the 3-4 kHz ring of a belt)
        const twang = db(upW * (fal ? 0 : way === 'squeal' ? 7 : way === 'scream' ? 4 : 3));
        // each formant's level in the vowel: the other formants' resonance at its frequency (a cascade's shape)
        const amps = F.map((_, k) => {
          let a = formantLevel(F, B, k, tiltX);
          if (k > 0) a *= db(-16 * vNasal) * db(-28 * vBar);
          if (k === 2 || k === 3) a *= twang * db(4 * edgeW);
          if (k >= 3) a *= db(-3 * plain);
          if (k === 1) a *= db(2 * edgeW);
          return a;
        });
        // (the power those grains make, each about a^2 / bandwidth, by the pulses a second; the ear's
        // correction, partial (vowels still differ a little) and easing over about 80 ms)
        let pw = 0;
        for (let k = 0; k < F.length; k++) pw += (amps[k] * amps[k]) / B[k];
        const want = ((pw * f0) / pRef + 1e-9) ** -0.35;
        comp += (want - comp) * Math.min(1, 1 / (0.08 * f0));
        for (let k = 0; k < F.length; k++) {
          const a = amps[k] * comp * vA * shimmer;
          // (each pulse's formants a touch different: no two periods alike)
          const bw = B[k] * (k === 0 ? 1 + 1.5 * vNasal : 1) * (1 + hu * 0.05 * gauss());
          const alpha = (Math.PI * bw) / fs, w = (2 * Math.PI * F[k] * (1 + hu * 0.003 * gauss())) / fs;
          const cr = Math.exp(-alpha) * Math.cos(w), ci = Math.exp(-alpha) * Math.sin(w);
          const m = Math.exp(-alpha * d);
          const durS = Math.min(0.035 * fs, (5.3 / (Math.PI * bw)) * fs) + tex;
          grains.push({ re: a * m * Math.cos(w * d), im: a * m * Math.sin(w * d), cr, ci, n: d, tex, dur: durS, rel: durS * 0.25 });
        }
        // the glottal formant: the folds' own low hump (about 1.5x the pitch, wide), which the vocal
        // tract's formants leave out: the voice's low end and its 2nd harmonic (weaker when pressed)
        {
          const fg = Math.min(f0 * 1.15, F[0] * 0.7), bg = 0.8 * f0;
          const a = 2.5 * (bg / 1000) * (fg / 1000) ** (-1 - tiltX) * db((v.body ?? 5) - 6 * effort + (fal ? 6 : -3) * upW + 4 * lowW - 3 * edgeW) * comp * vA * shimmer;
          const alpha = (Math.PI * bg) / fs, w = (2 * Math.PI * fg) / fs, m = Math.exp(-alpha * d);
          const durS = Math.min(0.035 * fs, (5.3 / (Math.PI * bg)) * fs) + tex;
          grains.push({ re: a * m * Math.cos(w * d), im: a * m * Math.sin(w * d), cr: Math.exp(-alpha) * Math.cos(w), ci: Math.exp(-alpha) * Math.sin(w), n: d, tex, dur: durS, rel: durS * 0.25 });
        }
        raspEnv = 0.18 * rough * vA;
      }
    }

    // the grains
    let y = 0;
    for (let g = grains.length - 1; g >= 0; g--) {
      const G = grains[g];
      let e = 1;
      if (G.n < G.tex) e = 0.5 - 0.5 * Math.cos((Math.PI * G.n) / G.tex);
      else if (G.n > G.dur - G.rel) e = 0.5 + 0.5 * Math.cos((Math.PI * (G.n - (G.dur - G.rel))) / G.rel);
      y += e * G.im;
      const re = G.re * G.cr - G.im * G.ci;
      G.im = G.re * G.ci + G.im * G.cr; G.re = re;
      G.n++;
      if (G.n >= G.dur) { grains[g] = grains[grains.length - 1]; grains.pop(); }
    }

    // breath: noise through the vowel's formants, stronger while the folds are open; aspiration (h, after p/t/k); the rasp
    const nz = gauss() * 1.9;
    const open = 0.35 + 0.65 * Math.sin(Math.PI * phase) ** 2;
    raspEnv *= 0.9985;
    const aIn = nz * (vA * comp * db(breathNow + (fal ? 9 : 2) * upW) * 4 * open + aspA * 1.2 + raspEnv * comp * (0.3 + open));
    let an = 0;
    for (let k = 0; k < 4; k++) an += aspG[k] * asp[k].run(aIn);
    an += air.run(nz) * vA * comp * db(breathNow - 16) * open * hu * 2.5;
    y += an;
    // the consonants' noise
    for (let k = 0; k < SHAPES.length; k++) {
      const bands = bank[k];
      let fz = 0;
      for (const b of bands) fz += b.g * b.band.run(nz);
      if (fricA[k] > 1e-5) y += fricA[k] * fz * 0.5;
    }
    // (no DC)
    dc += (y - dc) * 0.002;
    out[i] = y - dc;
  }
  normalize(out);
  return out;
}

/** A formant's level in the vowel: the other formants' resonance at its frequency (as a cascade shapes it), and the source's tilt. */
function formantLevel(F: number[], B: number[], k: number, tiltX: number) {
  let a = 1;
  for (let j = 0; j < F.length; j++) if (j !== k) {
    const fj = F[j], fk = F[k], bj = B[j];
    a *= (fj * fj) / Math.sqrt((fj * fj - fk * fk) ** 2 + (bj * fk) ** 2);
  }
  return a * (F[k] / 1000) ** -tiltX;
}

/** Bring a line to a set level (as sing.ts does), so it sits the same in the mix. */
function normalize(a: Float32Array) {
  const win = 2048;
  let best = 0, peak = 0;
  for (let i = 0; i + win <= a.length; i += win / 2) {
    let e = 0;
    for (let k = i; k < i + win; k++) e += a[k] * a[k];
    best = Math.max(best, Math.sqrt(e / win));
  }
  for (const x of a) peak = Math.max(peak, Math.abs(x));
  if (best <= 0 || peak <= 0) return;
  const g = Math.min(0.2 / best, 0.95 / peak);
  for (let i = 0; i < a.length; i++) a[i] *= g;
}

