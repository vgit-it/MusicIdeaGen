// The demo singer's voice: a Klatt formant synthesizer (klatt-syn, MIT, Christian d'Heureuse) driven
// frame by frame from the sung notes (research: docs/VOCAL.md). Each sung line is rendered ahead of
// time into a buffer, so it plays the same live, in exports and on phones.
// - a glottal pulse (with the synth's slow flutter) through five oral formants: sung vowel targets for a
//   low (tenor-baritone) or high (alto) voice, F1 kept above the pitch on high notes, diphthongs held
//   on their first vowel and glided at the end
// - consonants as a singer places them: onsets before the beat so the vowel lands on it, codas at the
//   end of the note; stops (closure, burst, aspiration), fricatives (shaped noise), nasals (the nasal
//   pole and zero), liquids and glides (formant targets), with formant transitions into the vowel
// - pitch: glides between legato notes (quicker in fast runs), scoops up into the notes the singer slides
//   into, vibrato that grows on long notes, falls off the ends of lines; a breath of aspiration at phrase ends

import { type FrameParms, Generator } from 'klatt-syn';
import type { Cons, Syllable, Vowel } from '../parts/lyrics';

export const SING_RATE = 22050;
const FRAME = 0.004;

type F3 = [number, number, number];
/** Sung vowel formants (F1-F3, low voice; front vowels' F2 a little darker than speech). [vowel, glide target] */
const VOWELS: Record<Vowel, [F3, F3?]> = {
  IY: [[280, 2100, 2900]], IH: [[400, 1850, 2550]], EY: [[470, 1950, 2600], [400, 1850, 2550]], EH: [[540, 1720, 2500]],
  AE: [[650, 1650, 2450]], AA: [[700, 1100, 2550]], AO: [[580, 880, 2500]], OW: [[490, 920, 2450], [450, 1050, 2350]],
  UH: [[450, 1050, 2350]], UW: [[330, 880, 2300]], AH: [[620, 1200, 2500]], AX: [[500, 1400, 2500]],
  AY: [[700, 1150, 2550], [420, 1800, 2550]], AW: [[700, 1150, 2550], [450, 1050, 2350]], OY: [[580, 880, 2500], [420, 1800, 2550]],
};

type Kind = 'stop' | 'fric' | 'nasal' | 'liquid' | 'h' | 'affric';
interface ConsSpec { kind: Kind; voiced: boolean; f: F3; /** stop/fricative noise shape */ shape?: 'lab' | 'alv' | 'vel' | 's' | 'sh' | 'flat'; anti?: number; dur: number }
const CONS: Record<Cons, ConsSpec> = {
  P: { kind: 'stop', voiced: false, f: [250, 900, 2300], shape: 'lab', dur: 0.075 }, B: { kind: 'stop', voiced: true, f: [250, 900, 2300], shape: 'lab', dur: 0.06 },
  T: { kind: 'stop', voiced: false, f: [280, 1750, 2700], shape: 'alv', dur: 0.075 }, D: { kind: 'stop', voiced: true, f: [280, 1750, 2700], shape: 'alv', dur: 0.06 },
  K: { kind: 'stop', voiced: false, f: [300, 1900, 2400], shape: 'vel', dur: 0.08 }, G: { kind: 'stop', voiced: true, f: [300, 1900, 2400], shape: 'vel', dur: 0.065 },
  M: { kind: 'nasal', voiced: true, f: [260, 1100, 2400], anti: 750, dur: 0.07 }, N: { kind: 'nasal', voiced: true, f: [260, 1500, 2600], anti: 1450, dur: 0.065 },
  NG: { kind: 'nasal', voiced: true, f: [260, 2100, 2700], anti: 2600, dur: 0.07 },
  F: { kind: 'fric', voiced: false, f: [300, 1000, 2300], shape: 'flat', dur: 0.08 }, V: { kind: 'fric', voiced: true, f: [300, 1000, 2300], shape: 'flat', dur: 0.06 },
  TH: { kind: 'fric', voiced: false, f: [350, 1500, 2600], shape: 'flat', dur: 0.08 }, DH: { kind: 'fric', voiced: true, f: [350, 1500, 2600], shape: 'flat', dur: 0.045 },
  S: { kind: 'fric', voiced: false, f: [320, 1700, 2700], shape: 's', dur: 0.09 }, Z: { kind: 'fric', voiced: true, f: [320, 1700, 2700], shape: 's', dur: 0.07 },
  SH: { kind: 'fric', voiced: false, f: [300, 1700, 2400], shape: 'sh', dur: 0.09 },
  CH: { kind: 'affric', voiced: false, f: [300, 1800, 2400], shape: 'sh', dur: 0.1 }, JH: { kind: 'affric', voiced: true, f: [300, 1800, 2400], shape: 'sh', dur: 0.08 },
  HH: { kind: 'h', voiced: false, f: [500, 1400, 2500], dur: 0.06 },
  L: { kind: 'liquid', voiced: true, f: [360, 1150, 2800], dur: 0.06 }, R: { kind: 'liquid', voiced: true, f: [350, 1150, 1650], dur: 0.065 },
  W: { kind: 'liquid', voiced: true, f: [300, 700, 2200], dur: 0.07 }, Y: { kind: 'liquid', voiced: true, f: [260, 2200, 3000], dur: 0.06 },
};

/**
 * A note to sing, in seconds from the line's start (its vowel lands at `t`); `slide`: scooped up into from
 * so many semitones below; `fall`: falls off its end by so many (left out: the line's own way).
 */
export interface SungNote { t: number; end: number; midi: number; vel: number; syl: Syllable; slide?: number; fall?: number }

export interface VoiceShape {
  high: boolean;
  /** 0-1: how much it scoops into lines and falls off their ends (by the song's style). */
  slides: number;
  /** A fixed random-ish identity (tract length, vibrato rate). */
  seed: number;
  /** Another person (the backing singer): vocal tract length (x), more breath (dB), vibrato depth (x). */
  person?: { tract: number; breath: number; vibrato: number };
}

/** A segment of the line's timeline: a consonant, or a vowel (with an optional glide target at its end). */
interface Seg { t0: number; t1: number; cons?: ConsSpec; vowel?: [F3, F3?]; next?: F3; midi: number; vel: number }

const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12);
const lerp = (a: number, b: number, x: number) => a + (b - a) * Math.max(0, Math.min(1, x));
const lerp3 = (a: F3, b: F3, x: number): F3 => [lerp(a[0], b[0], x), lerp(a[1], b[1], x), lerp(a[2], b[2], x)];

/** Lay the line out as segments: onset consonants before each note's vowel, codas at its end. */
function layout(notes: SungNote[]): Seg[] {
  const segs: Seg[] = [];
  notes.forEach((n, i) => {
    const room = Math.max(0.03, Math.min(0.2, (n.t - (i > 0 ? notes[i - 1].t : n.t - 0.4)) * 0.45));
    // (a diphthong sung over a run glides only on its last note)
    const vow: [F3, F3?] = notes[i + 1]?.syl.text === '~' ? [VOWELS[n.syl.vowel][0]] : VOWELS[n.syl.vowel];
    const firstF = vow[0];
    // onset consonants before the beat (shrunk to fit the room the last note leaves)
    const on = n.syl.onset.map((c) => CONS[c]);
    const want = on.reduce((a, c) => a + c.dur, 0);
    const k = want > room ? room / want : 1;
    let t = n.t - want * k;
    for (const c of on) { segs.push({ t0: t, t1: t + c.dur * k, cons: c, next: firstF, midi: n.midi, vel: n.vel }); t += c.dur * k; }
    // the vowel, then the coda at the note's end (no longer than 40% of the note)
    const len = n.end - n.t;
    const coda = n.syl.coda.map((c) => CONS[c]);
    const cw = coda.reduce((a, c) => a + c.dur * 0.8, 0);
    const kc = cw > len * 0.4 ? (len * 0.4) / cw : 1;
    const vEnd = n.end - cw * kc;
    segs.push({ t0: n.t, t1: vEnd, vowel: vow, midi: n.midi, vel: n.vel });
    let tc = vEnd;
    for (const c of coda) { segs.push({ t0: tc, t1: tc + c.dur * 0.8 * kc, cons: c, midi: n.midi, vel: n.vel }); tc += c.dur * 0.8 * kc; }
  });
  // nothing overlaps: a segment ends where the next starts
  segs.sort((a, b) => a.t0 - b.t0);
  for (let i = 0; i + 1 < segs.length; i++) if (segs[i].t1 > segs[i + 1].t0) segs[i].t1 = Math.max(segs[i].t0 + 0.005, segs[i + 1].t0);
  return segs;
}

function blankFrame(): FrameParms {
  return {
    duration: FRAME, f0: 0, flutterLevel: 0.25, openPhaseRatio: 0.6, breathinessDb: -30, tiltDb: 4, gainDb: 0, agcRmsLevel: 0,
    nasalFormantFreq: 270, nasalFormantBw: 100, oralFormantFreq: [500, 1500, 2500, 3300, 3750, 4900], oralFormantBw: [70, 90, 130, 200, 250, 1000],
    cascadeEnabled: true, cascadeVoicingDb: -99, cascadeAspirationDb: -99, cascadeAspirationMod: 0.5, nasalAntiformantFreq: 270, nasalAntiformantBw: 100,
    parallelEnabled: false, parallelVoicingDb: -99, parallelAspirationDb: -99, parallelAspirationMod: 0.5, fricationDb: -99, fricationMod: 0.5,
    parallelBypassDb: -99, nasalFormantDb: -99, oralFormantDb: [-99, -99, -99, -99, -99, -99],
  };
}

/** The parallel (noise) branch's shape for a fricative or a stop's burst: [formant freqs F2-F6 and their levels]. */
function noiseShape(fr: FrameParms, shape: NonNullable<ConsSpec['shape']>, vowelF2: number, high: boolean) {
  fr.parallelEnabled = true;
  const up = high ? 1.15 : 1;
  if (shape === 's') { fr.oralFormantFreq = [fr.oralFormantFreq[0], 1700, 2600, 3900 * up, 5300 * up, 6800 * up]; fr.oralFormantDb = [-99, -99, -99, -18, -4, -2]; fr.oralFormantBw = [70, 90, 200, 400, 500, 900]; }
  else if (shape === 'sh') { fr.oralFormantFreq = [fr.oralFormantFreq[0], 1800, 2600 * up, 3300 * up, 4300 * up, 5600]; fr.oralFormantDb = [-99, -99, -4, -6, -12, -20]; fr.oralFormantBw = [70, 90, 250, 350, 450, 900]; }
  else if (shape === 'alv') { fr.oralFormantFreq = [fr.oralFormantFreq[0], 1700, 2700, 3600 * up, 4600 * up, 6000]; fr.oralFormantDb = [-99, -99, -99, -10, -6, -6]; fr.oralFormantBw = [70, 90, 200, 400, 500, 900]; }
  else if (shape === 'vel') { fr.oralFormantFreq = [fr.oralFormantFreq[0], vowelF2, 2500, 3300, 4200, 5600]; fr.oralFormantDb = [-99, -4, -10, -99, -99, -99]; fr.oralFormantBw = [70, 200, 300, 400, 500, 900]; }
  else fr.parallelBypassDb = shape === 'lab' ? -14 : -20;
}

/**
 * Render a sung line into samples (SING_RATE, mono). `pre`: seconds of lead-in before the first vowel
 * (where its onset consonants and a breath go); the buffer's time 0 is `pre` before notes' time 0.
 */
export function renderLine(notes: SungNote[], voice: VoiceShape, pre: number): Float32Array {
  const segs = layout(notes.map((n) => ({ ...n, t: n.t + pre, end: n.end + pre })));
  const endT = segs[segs.length - 1].t1 + 0.25;
  const gen = new Generator({ sampleRate: SING_RATE, glottalSourceType: 1 });
  const frameLen = Math.round(FRAME * SING_RATE);
  const nFrames = Math.ceil(endT / FRAME);
  const out = new Float32Array(nFrames * frameLen);
  const buf = new Float64Array(frameLen);
  const fscale = voice.high ? 1.17 : 1;
  const tract = (0.97 + (voice.seed % 7) * 0.01) * (voice.person?.tract ?? 1);
  const vibDepth = voice.person?.vibrato ?? 1;
  const F45 = voice.high ? [4100, 4800, 5700] : [3300, 3750, 4900];
  const vibHz = 5.2 + (voice.seed % 5) * 0.15;
  const scale = (f: F3): F3 => [f[0] * fscale * tract, f[1] * fscale * tract, f[2] * fscale * tract];
  const firstVowelT = segs.find((s) => s.vowel)?.t0 ?? pre;
  // which notes slide in or fall off (deterministic per line)
  const scoop = voice.slides > 0.3 && (voice.seed + notes.length) % 3 === 0;
  const fall = voice.slides > 0.2 && (voice.seed + notes.length) % 2 === 0;
  const vowelNotes = notes.map((n) => ({ ...n, t: n.t + pre, end: n.end + pre }));
  let si = 0;
  let lastF: F3 = scale(segs[0].next ?? [500, 1500, 2500]);
  for (let fi = 0; fi < nFrames; fi++) {
    const t = fi * FRAME;
    while (si + 1 < segs.length && segs[si + 1].t0 <= t) { lastF = currentF(segs[si], segs[si].t1); si++; }
    const s = segs[si];
    const fr = blankFrame();
    // pitch: the note sounding (or about to), a glide over the change, vibrato on long notes
    let ni = 0;
    for (let k = 0; k < vowelNotes.length; k++) if (vowelNotes[k].t - 0.03 <= t) ni = k;
    const note = vowelNotes[ni];
    let midi = note.midi + (voice.high ? 12 : 0);
    const prevN = vowelNotes[ni - 1];
    const into = t - note.t, held = note.end - note.t;
    if (note.slide) {
      // a scoop up into the note (easing in), over up to a fifth of a second
      const sd = Math.min(0.22, held * 0.35);
      midi -= note.slide * (1 - Math.max(0, Math.min(1, (into + 0.02) / sd))) ** 2;
    } else if (prevN && prevN.end >= note.t - 0.12) {
      // a glide from the last note (quicker between the quick notes of a run)
      const gl = Math.min(0.09, Math.max(0.025, (note.t - prevN.t) * 0.4));
      if (t < note.t + gl * 0.67) midi = lerp(prevN.midi + (voice.high ? 12 : 0), midi, (t - (note.t - gl / 3)) / gl);
    }
    if (ni === 0 && note.slide === undefined && scoop && t < note.t + 0.1) midi -= lerp(1, 0, (t - note.t + 0.02) / 0.12);
    if (held > 0.45 && into > 0.3) midi += (Math.min(1, (into - 0.3) / 0.25) * (0.28 + 0.1 * note.vel) * vibDepth) * Math.sin(2 * Math.PI * vibHz * into);
    const lastNote = ni === vowelNotes.length - 1;
    // a fall off the note's end (accelerating, fading), or the line's own little fall
    const fallBy = note.fall ?? (lastNote && fall ? 2 : 0);
    const fw = note.fall ? Math.min(0.3, held * 0.35) : 0.14;
    const fx = fallBy && t > note.end - fw ? Math.min(1, (t - (note.end - fw)) / fw) : 0;
    midi -= fallBy * (note.fall ? fx * fx : fx);
    fr.f0 = mtof(midi);
    // loud notes brighter (less tilt), soft ones breathier
    fr.tiltDb = lerp(9, 2, note.vel);
    fr.breathinessDb = lerp(-22, -32, note.vel) + (voice.person?.breath ?? 0);
    const F = currentF(s, t);
    // F1 never under the pitch (it would go silent), F2 clear of it too
    F[0] = Math.max(F[0], fr.f0 * 1.05);
    if (F[1] < fr.f0 * 1.9) F[1] = fr.f0 * 1.9;
    fr.oralFormantFreq = [F[0], F[1], F[2], F45[0], F45[1], F45[2]];
    const amp = lerp(-8, 0, note.vel) - (note.fall ? 9 * fx : 0);
    if (t < s.t0) fr.cascadeVoicingDb = -99;
    else if (s.vowel && t <= s.t1) {
      fr.cascadeVoicingDb = amp;
      // a breath of air as the line ends
      if (lastNote && t > s.t1 - 0.12) fr.cascadeAspirationDb = -30;
    } else if (s.cons && t <= s.t1) consonant(fr, s, t, amp, voice.high);
    else {
      // silence after the line (the last vowel's ring decays in the filters)
      fr.cascadeVoicingDb = -99;
    }
    // the very start of the line: a soft attack
    if (t < firstVowelT + 0.03 && s.vowel) fr.cascadeVoicingDb += lerp(-18, 0, (t - firstVowelT + 0.0) / 0.03);
    gen.generateFrame(fr, buf);
    for (let k = 0; k < frameLen; k++) out[fi * frameLen + k] = buf[k];
  }
  normalize(out);
  return out;

  // formants at time t: a consonant's own target (its transition into the next vowel), a vowel's (with
  // the transition from what came before and the diphthong's glide at the end)
  function currentF(sg: Seg, t: number): F3 {
    if (sg.cons) {
      const tgt = scale(sg.cons.f);
      return lerp3(lastF, tgt, (t - sg.t0) / 0.025);
    }
    const [a, b] = sg.vowel!;
    const A = scale(a);
    let f = lerp3(lastF, A, (t - sg.t0) / 0.04);
    if (b) {
      const dur = sg.t1 - sg.t0;
      const glide = Math.min(0.25, Math.max(0.08, dur * 0.25));
      f = lerp3(f, scale(b), (t - (sg.t1 - glide)) / glide);
    }
    return f;
  }
}

/** A consonant's frame: closure, burst and aspiration (stops), shaped noise (fricatives), murmur (nasals)... */
function consonant(fr: FrameParms, s: Seg, t: number, amp: number, high: boolean) {
  const c = s.cons!;
  const x = (t - s.t0) / Math.max(0.005, s.t1 - s.t0);
  const vowelF2 = (s.next ?? [500, 1500, 2500])[1] * (high ? 1.17 : 1);
  switch (c.kind) {
    case 'liquid':
      fr.cascadeVoicingDb = amp - (c.f[2] < 2000 ? 3 : 5);
      break;
    case 'nasal':
      fr.cascadeVoicingDb = amp - 6;
      fr.nasalFormantFreq = 270; fr.nasalFormantBw = 100;
      fr.nasalAntiformantFreq = (c.anti ?? 1000) * (high ? 1.15 : 1); fr.nasalAntiformantBw = 120;
      fr.oralFormantBw = [80, 200, 300, 300, 300, 1000];
      break;
    case 'h':
      fr.cascadeAspirationDb = amp - 4;
      break;
    case 'fric':
    case 'affric': {
      const closure = c.kind === 'affric' ? 0.3 : 0;
      if (x < closure) break; // the stop part: silence
      noiseShape(fr, c.shape!, vowelF2, high);
      // (levels measured against a sung vowel: s about 12 dB under it, sh 14, f and th 22)
      const level = c.shape === 's' ? 30 : c.shape === 'sh' ? 17 : 4;
      fr.fricationDb = amp + level + (c.voiced ? -6 : 0) + lerp(-12, 0, (x - closure) / 0.25);
      if (c.voiced) fr.cascadeVoicingDb = amp - 12;
      break;
    }
    case 'stop': {
      // closure (a low voice bar if voiced), a short burst, then aspiration before a voiceless stop's vowel
      const closeEnd = c.voiced ? 0.75 : 0.5, burstEnd = closeEnd + (c.voiced ? 0.12 : 0.14);
      if (x < closeEnd) { if (c.voiced) fr.cascadeVoicingDb = amp - 24; break; }
      if (x < burstEnd) { noiseShape(fr, c.shape!, vowelF2, high); fr.fricationDb = amp + (c.shape === 'lab' ? 16 : c.shape === 'vel' ? -6 : 18); break; }
      if (!c.voiced) fr.cascadeAspirationDb = amp - 6;
      else fr.cascadeVoicingDb = amp - 4;
      break;
    }
  }
}

/** Bring a line to a set level (the loudest stretch of singing), so every line sits the same in the mix. */
function normalize(a: Float32Array) {
  const win = 1024;
  let best = 0;
  for (let i = 0; i + win <= a.length; i += win / 2) {
    let e = 0;
    for (let k = i; k < i + win; k++) e += a[k] * a[k];
    best = Math.max(best, Math.sqrt(e / win));
  }
  let peak = 0;
  for (const v of a) peak = Math.max(peak, Math.abs(v));
  if (best <= 0 || peak <= 0) return;
  const g = Math.min(0.2 / best, 0.95 / peak);
  for (let i = 0; i < a.length; i++) a[i] *= g;
}
