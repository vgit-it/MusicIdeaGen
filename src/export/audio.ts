// Audio export: renders an idea or a track faster than real time with the same instruments,
// amps and mix as playback, then encodes it as WAV or MP3, or as stems.
//
// A track is split into pieces at section boundaries that render side by side (each in its own
// offline context, so on its own processor core). Each piece starts two bars early so ringing notes,
// echoes and compressors carry over, and the pieces are crossfaded just before each section's downbeat.

import * as Tone from 'tone';
import { Engine, type EngineSettings } from '../audio/engine';
import { MIX_PARTS, type MixPart } from '../audio/mixer';
import type { Idea } from '../idea';

/** Seconds after the last bar, so the final chord rings out. */
const TAIL = 5;
/** The offline clock starts this far in (see Engine.startOffline). */
const LEAD = 0.05;
/** Bars of the previous section played before a piece (discarded). */
const PRE_BARS = 2;
/** Crossfade between pieces, ending at the section's downbeat. */
const XFADE = 0.03;
/** Aim for pieces at least this long (seconds of music). */
const MIN_PIECE = 12;

export interface Rendered {
  sampleRate: number;
  /** The full mix, left and right. */
  mix: Float32Array[];
  /** Each part on its own (after its fader, before the shared reverb and master bus); layers only when added. */
  stems?: Partial<Record<MixPart, Float32Array[]>>;
}

interface Piece {
  /** Sections played, with the previous one first when there's a pre-roll. */
  list: Idea[];
  fromStep: number;
  /** Seconds of pre-roll at the start (discarded). */
  pre: number;
  /** Seconds of this piece's own music. */
  music: number;
}

/** Group sections into at most `n` pieces of similar length. */
function plan(list: Idea[], n: number, sec: (steps: number) => number): Piece[] {
  const total = list.reduce((a, i) => a + i.song.total, 0);
  const target = sec(total) / n;
  const groups: Idea[][] = [[]];
  let acc = 0;
  for (const s of list) {
    const g = groups[groups.length - 1];
    if (g.length && acc >= target && groups.length < n) { groups.push([s]); acc = sec(s.song.total); continue; }
    g.push(s);
    acc += sec(s.song.total);
  }
  let at = 0;
  return groups.map((g) => {
    const prev = at > 0 ? list[at - 1] : null;
    at += g.length;
    const music = sec(g.reduce((a, i) => a + i.song.total, 0));
    if (!prev) return { list: g, fromStep: 0, pre: 0, music };
    const preSteps = prev.song.bars.slice(-PRE_BARS).reduce((a, b) => a + b.len, 0);
    return { list: [prev, ...g], fromStep: prev.song.total - preSteps, pre: sec(preSteps), music };
  });
}

/** Build one piece's offline context (rendered later, alongside the others). */
async function buildPiece(p: Piece, seconds: number, channels: number, rate: number, settings: EngineSettings, withStems: boolean, parts: MixPart[]) {
  const live = Tone.getContext();
  const ctx = new Tone.OfflineContext(channels, seconds, rate);
  Tone.setContext(ctx);
  try {
    const engine = new Engine(true);
    engine.applySettings(settings, withStems);
    await engine.mixer.ready;
    engine.setList(p.list, false, 0);
    await engine.loadAll();
    if (withStems) {
      const raw = ctx.rawContext;
      const merger = raw.createChannelMerger(channels);
      merger.connect(raw.destination);
      const route = (node: Tone.ToneAudioNode, ch: number) => {
        // always stereo (a mono part is spread to both sides), then into its pair of channels
        const up = raw.createGain();
        up.channelCount = 2;
        up.channelCountMode = 'explicit';
        up.channelInterpretation = 'speakers';
        const split = raw.createChannelSplitter(2);
        node.connect(up);
        up.connect(split);
        split.connect(merger, 0, ch);
        split.connect(merger, 1, ch + 1);
      };
      engine.mixer.out.disconnect();
      route(engine.mixer.out, 0);
      parts.forEach((part, i) => route(engine.mixer.stem(part), 2 + i * 2));
    }
    engine.startOffline(p.fromStep);
  } finally {
    Tone.setContext(live);
  }
  return ctx;
}

/** Render ideas played back to back (one idea, or a track's sections). `onProgress` gets 0–1 as pieces finish. */
export async function renderAudio(
  list: Idea[], settings: EngineSettings, withStems: boolean, onProgress: (p: number) => void = () => {},
): Promise<Rendered> {
  const bpm = list[0].song.bpm;
  const sec = (steps: number) => (steps * 15) / bpm;
  const totalMusic = sec(list.reduce((a, i) => a + i.song.total, 0));
  // stems: one pass (the mix + a stereo pair per part), so the instruments only play once; added layers only
  const parts = MIX_PARTS.filter((p) => (p !== 'keys' && p !== 'pad') || settings.layers[p]);
  const channels = withStems ? 2 + parts.length * 2 : 2;
  // the live context's sample rate: the samples and cabinet impulse responses were decoded at it,
  // and a convolver only accepts an impulse response at its own rate
  const rate = Tone.getContext().sampleRate;
  const cores = Math.max(1, (navigator.hardwareConcurrency || 2) - 1);
  const n = Math.max(1, Math.min(cores, 8, list.length, Math.floor(totalMusic / MIN_PIECE)));
  const pieces = plan(list, n, sec);

  // build one at a time (the audio library sets up one context at a time), then render them together
  const ctxs: Tone.OfflineContext[] = [];
  for (const [i, p] of pieces.entries()) {
    const last = i === pieces.length - 1;
    ctxs.push(await buildPiece(p, LEAD + p.pre + p.music + (last ? TAIL : 0.1), channels, rate, settings, withStems, parts));
  }
  let done = 0;
  // render(false): step the offline clock without timer pauses. With pauses, a hidden or covered
  // window (where browsers slow timers to once a second) made rendering crawl at real-time speed
  const buffers = await Promise.all(ctxs.map((c) => c.render(false).then((b) => {
    onProgress(++done / ctxs.length);
    return b.get()!;
  })));

  // stitch: each piece takes over at its section boundary (after its pre-roll), crossfaded from the one before
  const length = Math.round((LEAD + totalMusic + TAIL) * rate);
  const outCh = Array.from({ length: channels }, () => new Float32Array(length));
  const xf = Math.round(XFADE * rate);
  let start = 0; // seconds of music before this piece
  pieces.forEach((p, i) => {
    const buf = buffers[i];
    const g0 = i === 0 ? 0 : Math.round((LEAD + start) * rate); // where this piece takes over (global sample)
    const l0 = i === 0 ? 0 : Math.round((LEAD + p.pre) * rate); // the same moment inside the piece
    const end = i === pieces.length - 1 ? length : Math.round((LEAD + start + p.music) * rate);
    for (let c = 0; c < channels; c++) {
      const src = buf.getChannelData(c), dst = outCh[c];
      // crossfade over the moments just before the boundary (the piece before is already in place)
      for (let k = 0; i > 0 && k < xf; k++) {
        const g = g0 - xf + k, l = l0 - xf + k;
        if (g < 0 || l < 0) continue;
        const a = k / xf;
        dst[g] = dst[g] * (1 - a) + src[l] * a;
      }
      for (let g = g0; g < end; g++) {
        const l = g - g0 + l0;
        if (l < src.length) dst[g] = src[l];
      }
    }
    start += p.music;
  });

  const out: Rendered = { sampleRate: rate, mix: [outCh[0], outCh[1]] };
  if (withStems) out.stems = Object.fromEntries(parts.map((part, i) => [part, [outCh[2 + i * 2], outCh[3 + i * 2]]])) as Rendered['stems'];

  // fade the last second of the tail, and keep everything below clipping (stems share one gain, so they still add up)
  const fade = (chs: Float32Array[]) => {
    const m = Math.min(chs[0].length, rate);
    for (const c of chs) for (let i = 0; i < m; i++) c[c.length - m + i] *= 1 - i / m;
  };
  const peak = (chs: Float32Array[]) => chs.reduce((m, c) => { for (let i = 0; i < c.length; i++) { const v = Math.abs(c[i]); if (v > m) m = v; } return m; }, 0);
  const scale = (chs: Float32Array[], g: number) => { for (const c of chs) for (let i = 0; i < c.length; i++) c[i] *= g; };
  const CEILING = 0.97; // about -0.3 dBFS
  master(out.mix, rate);
  fade(out.mix);
  const pm = peak(out.mix);
  if (pm > CEILING) scale(out.mix, CEILING / pm);
  if (out.stems) {
    const all = Object.values(out.stems).flat();
    fade(all);
    const ps = peak(all);
    if (ps > CEILING) scale(all, CEILING / ps);
  }
  return out;
}

/* ------------------------------------------------------------ mastering */

/** Loudness of finished files (LUFS, integrated): about where rock releases sit. */
const TARGET_LUFS = -10.5;
/** Peaks stay below this (about -1.4 dBFS, so MP3 encoding can't push them over). */
const PEAK_CEILING = 0.85;
/** Never more than this much gain (dB), so quiet material isn't crushed. */
const MAX_BOOST = 9;

/** Integrated loudness (ITU-R BS.1770: K-weighting, 400 ms blocks, absolute and relative gates). */
export function lufs(chs: Float32Array[], rate: number): number {
  // K-weighting: a high shelf (head) and a high-pass (RLB), coefficients for the sample rate
  const shelf = biquad('highshelf', 1500, 4, Math.SQRT1_2, rate);
  const hp = biquad('highpass', 38, 0, 0.5, rate);
  const block = Math.round(0.4 * rate), hop = Math.round(0.1 * rate);
  const n = chs[0].length;
  const sq = new Float64Array(n);
  for (const c of chs) {
    const y = filter(hp, filter(shelf, c));
    for (let i = 0; i < n; i++) sq[i] += y[i] * y[i];
  }
  // running sum for block energies
  const cum = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) cum[i + 1] = cum[i] + sq[i];
  const blocks: number[] = [];
  for (let s = 0; s + block <= n; s += hop) blocks.push((cum[s + block] - cum[s]) / block);
  const loud = (z: number) => -0.691 + 10 * Math.log10(z + 1e-20);
  const abs = blocks.filter((z) => loud(z) > -70);
  if (!abs.length) return -70;
  const rel = loud(abs.reduce((a, z) => a + z, 0) / abs.length) - 10;
  const gated = abs.filter((z) => loud(z) > rel);
  return loud(gated.reduce((a, z) => a + z, 0) / gated.length);
}

interface Biquad { b0: number; b1: number; b2: number; a1: number; a2: number }

/** RBJ cookbook biquad (the K-weighting filters re-derived for any sample rate). */
function biquad(type: 'highshelf' | 'highpass', f0: number, gainDb: number, q: number, rate: number): Biquad {
  const A = 10 ** (gainDb / 40), w = (2 * Math.PI * f0) / rate, cos = Math.cos(w), alpha = Math.sin(w) / (2 * q);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'highshelf') {
    const s = 2 * Math.sqrt(A) * alpha;
    b0 = A * ((A + 1) + (A - 1) * cos + s); b1 = -2 * A * ((A - 1) + (A + 1) * cos); b2 = A * ((A + 1) + (A - 1) * cos - s);
    a0 = (A + 1) - (A - 1) * cos + s; a1 = 2 * ((A - 1) - (A + 1) * cos); a2 = (A + 1) - (A - 1) * cos - s;
  } else {
    b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = (1 + cos) / 2; a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha;
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

function filter(f: Biquad, x: Float32Array | Float64Array): Float64Array {
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = f.b0 * x[i] + f.b1 * x1 + f.b2 * x2 - f.a1 * y1 - f.a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

/**
 * Look-ahead peak limiter: the gain starts coming down 5 ms before a peak (so it's never clipped
 * or distorted) and recovers over about 80 ms. Applies `gain` first. Changes the channels in place.
 */
function limit(chs: Float32Array[], rate: number, gain: number, ceiling: number) {
  const n = chs[0].length, L = Math.max(1, Math.round(0.005 * rate));
  const need = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let p = 0;
    for (const c of chs) {
      p = Math.max(p, Math.abs(c[i]));
      // the waveform can peak between samples (and an MP3 decoder rebuilds those peaks): estimate the
      // halfway point to the next sample with a cubic through four samples
      if (i > 0 && i < n - 2) p = Math.max(p, Math.abs((9 * (c[i] + c[i + 1]) - c[i - 1] - c[i + 2]) / 16));
    }
    p *= gain;
    need[i] = p > ceiling ? ceiling / p : 1;
  }
  // lowest gain needed anywhere in the next L samples (sliding-window minimum)
  const ahead = new Float32Array(n);
  const dq = new Int32Array(n);
  let h = 0, t = 0;
  for (let i = n - 1; i >= 0; i--) {
    while (t > h && need[dq[t - 1]] >= need[i]) t--;
    dq[t++] = i;
    while (dq[h] > i + L) h++;
    ahead[i] = need[dq[h]];
  }
  // ramp into it: average over the last L samples (each of them already looks ahead to the peak)
  const rel = 1 - Math.exp(-1 / (0.08 * rate));
  let sum = L, g = 1; // the window starts full of 1s (no reduction before the start)
  for (let i = 0; i < n; i++) {
    sum += ahead[i] - (i >= L ? ahead[i - L] : 1);
    const target = sum / L;
    g = target < g ? target : g + (target - g) * rel;
    const k = gain * g;
    for (const c of chs) c[i] *= k;
  }
}

/** Bring a finished mix to release loudness with peaks under the ceiling (a few passes, as limiting lowers loudness a little). */
function master(chs: Float32Array[], rate: number) {
  const before = lufs(chs, rate);
  if (before <= -70) return;
  const orig = chs.map((c) => c.slice());
  let gainDb = Math.min(MAX_BOOST, TARGET_LUFS - before);
  for (let pass = 0; pass < 3; pass++) {
    chs.forEach((c, i) => c.set(orig[i]));
    limit(chs, rate, 10 ** (gainDb / 20), PEAK_CEILING);
    if (pass < 2) gainDb = Math.min(MAX_BOOST, gainDb + (TARGET_LUFS - lufs(chs, rate)));
  }
}

/** True when a stem is silent (e.g. Guitar 2 never plays). */
export const isSilent = (chs: Float32Array[]) => chs.every((c) => c.every((v) => Math.abs(v) < 1e-5));

/** 16-bit PCM WAV. */
export function encodeWav(chs: Float32Array[], sampleRate: number): Uint8Array {
  const n = chs[0].length, nc = chs.length;
  const data = n * nc * 2;
  const buf = new ArrayBuffer(44 + data);
  const v = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + data, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, nc, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * nc * 2, true); v.setUint16(32, nc * 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, data, true);
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < nc; c++) {
      const s = Math.max(-1, Math.min(1, chs[c][i]));
      v.setInt16(o, Math.round(s * 32767), true);
      o += 2;
    }
  }
  return new Uint8Array(buf);
}

/** Let the page update between chunks of work. A message, not a timer: browsers slow timers in hidden tabs. */
const breathe = () => new Promise<void>((r) => {
  const ch = new MessageChannel();
  ch.port1.onmessage = () => r();
  ch.port2.postMessage(0);
});

const toInt16 = (c: Float32Array, from: number, to: number) => {
  const out = new Int16Array(to - from);
  for (let i = from; i < to; i++) out[i - from] = Math.round(Math.max(-1, Math.min(1, c[i])) * 32767);
  return out;
};

/**
 * MP3 (LAME, via @breezystack/lamejs). The encoder is loaded on demand as its own file.
 * Encodes in chunks and yields between them so the page stays responsive.
 */
export async function encodeMp3(chs: Float32Array[], sampleRate: number, kbps: number, onProgress: (p: number) => void): Promise<Uint8Array> {
  const { Mp3Encoder } = await import('@breezystack/lamejs');
  const enc = new Mp3Encoder(2, sampleRate, kbps);
  const parts: Uint8Array[] = [];
  const n = chs[0].length;
  const CHUNK = 1152 * 40;
  for (let i = 0; i < n; i += CHUNK) {
    const to = Math.min(n, i + CHUNK);
    const out = enc.encodeBuffer(toInt16(chs[0], i, to), toInt16(chs[1] ?? chs[0], i, to));
    if (out.length) parts.push(new Uint8Array(out));
    if ((i / CHUNK) % 8 === 0) {
      onProgress(i / n);
      await breathe();
    }
  }
  parts.push(new Uint8Array(enc.flush()));
  const bytes = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) { bytes.set(p, o); o += p.length; }
  onProgress(1);
  return bytes;
}

/** A zip of files, stored without compression (WAV doesn't compress much and storing is instant). */
export async function zipFiles(files: Record<string, Uint8Array>): Promise<Uint8Array> {
  const { zipSync } = await import('fflate');
  return zipSync(Object.fromEntries(Object.entries(files).map(([name, data]) => [name, [data, { level: 0 }]])));
}
