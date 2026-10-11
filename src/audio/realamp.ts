// Real amps: recordings of real guitar amps (Neural Amp Modeler, public/amp/) instead of the app's
// own amp. Marshall JCM2000: crunch channel for Crunch, high gain for Distortion; a Fender Twin
// Reverb for Clean (and the clean channel of the driven guitars). They're too heavy to run live on phones, so the guitars are prepared ahead, on request (prep.ts):
//   1. an offline render records the dry guitar going into each driven amp (captureAmp)
//   2. Web Workers run the amp models over those recordings, side by side (one per processor core:
//      inside an offline render they'd all share one thread)
//   3. a second offline pass adds the cabinet, EQ, level and pan (mixAmps)

import * as Tone from 'tone';

export type RealTone = 'crunch' | 'dist' | 'clean';

const BASE = `${import.meta.env.BASE_URL}amp/`;
const MODELS: Record<RealTone, string> = { crunch: 'marshall-crunch.nam', dist: 'marshall-high.nam', clean: 'fender-clean.nam' };
/** The models' own sample rate. */
export const REAL_RATE = 48000;

/**
 * How each amp is played: the dry guitar's level going in (how hard it's driven), the EQ after the
 * cabinet and the output level (about as loud as the app's own amp). Crunch: the Marshall's crunch
 * channel, pushed. Distortion: its high-gain channel, with the harsh 2.7 kHz and the fizz above
 * 6.5 kHz trimmed. Guitar 2 drives them a little less (clearer single notes), with a rounder top
 * (its melodies sit high, and came out sharp and piercing with the rhythm EQ). Clean: a Fender Twin
 * Reverb (bright channel: 4 dB off the top, the same top as the app's clean amp); the model plays very
 * quietly (about 21 dB under its input), hence its level.
 */
type Eq = [BiquadFilterType, number, number, number][];
interface RealAmpSettings { drive: number; leadDrive: number; eq: Eq; leadEq: Eq; level: number; leadLevel: number }
export const REAL_AMP: Record<RealTone, RealAmpSettings> = {
  crunch: { drive: 0.66, leadDrive: 0.8, eq: [['highpass', 90, 0, 0.7], ['lowpass', 9000, 0, 0.7]], leadEq: [['highpass', 90, 0, 0.7], ['highshelf', 3000, -4, 0.7], ['lowpass', 6000, 0, 0.7]], level: 5.6, leadLevel: 9.1 },
  clean: { drive: 0.5, leadDrive: 0.5, eq: [['highpass', 75, 0, 0.7], ['highshelf', 3000, -4, 0.7], ['lowpass', 7500, 0, 0.7]], leadEq: [['highpass', 75, 0, 0.7], ['highshelf', 3000, -4, 0.7], ['lowpass', 7500, 0, 0.7]], level: 146, leadLevel: 146 },
  dist: { drive: 0.33, leadDrive: 0.4, eq: [['highpass', 100, 0, 0.7], ['peaking', 2700, -3, 1.2], ['lowpass', 6500, 0, 0.7]], leadEq: [['highpass', 100, 0, 0.7], ['peaking', 3200, -4, 1], ['lowpass', 4500, 0, 0.7]], level: 5.6, leadLevel: 8.3 },
};

/** Can this browser run them at all? */
export const realAmpsSupported = () => typeof Worker !== 'undefined' && typeof OfflineAudioContext !== 'undefined';

/* ---- the amp workers */

interface Lane { worker: Worker; ready: Promise<void>; busy: boolean }
let lanes: Promise<Lane[]> | null = null;
/** They failed to start here (e.g. an older browser without fast vector maths): don't keep trying. */
let broken = false;
const waiting: (() => void)[] = [];
let jobId = 0;

/** Workers side by side (leaving a core for the page and the audio). */
export const LANES = Math.max(1, Math.min(3, (typeof navigator !== 'undefined' && navigator.hardwareConcurrency || 2) - 1));

function startLanes(): Promise<Lane[]> {
  lanes ??= (async () => {
    const get = async (f: string) => {
      const r = await fetch(BASE + f);
      if (!r.ok) throw new Error(`${f}: ${r.status}`);
      return r;
    };
    const [wasm, crunch, dist, clean] = await Promise.all([
      get('nam.wasm').then((r) => r.arrayBuffer()), ...(['crunch', 'dist', 'clean'] as const).map((t) => get(MODELS[t]).then((r) => r.text())),
    ]) as [ArrayBuffer, string, string, string];
    return Array.from({ length: LANES }, () => {
      const worker = new Worker(`${BASE}nam-worker.js`);
      const ready = new Promise<void>((res, rej) => {
        worker.onmessage = (e) => (e.data.ready ? res() : rej(new Error(e.data.error)));
        worker.onerror = (e) => rej(new Error(e.message || 'amp worker failed'));
      });
      worker.postMessage({ init: { wasm, models: { crunch, dist, clean } } });
      return { worker, ready, busy: false };
    });
  })();
  lanes.catch(() => { lanes = null; }); // allow a retry
  return lanes;
}

/** Load the amps (workers and models) ahead of time. False if they can't run here. */
export async function warmUpRealAmps(): Promise<boolean> {
  if (!realAmpsSupported() || broken) return false;
  try {
    await Promise.all((await startLanes()).map((l) => l.ready));
    return true;
  } catch (e) {
    console.warn('Real amps unavailable:', e);
    // a download can fail for a moment (try again later); a worker that won't start won't
    if (!(e instanceof TypeError)) broken = true;
    return false;
  }
}

/** Run a dry guitar recording (at REAL_RATE) through an amp model, on the next free worker. */
async function runAmp(tone: RealTone, input: Float32Array): Promise<Float32Array> {
  const all = await startLanes();
  await Promise.all(all.map((l) => l.ready));
  let lane = all.find((l) => !l.busy);
  while (!lane) {
    await new Promise<void>((res) => waiting.push(res));
    lane = all.find((l) => !l.busy);
  }
  lane.busy = true;
  const id = ++jobId;
  try {
    return await new Promise<Float32Array>((res, rej) => {
      lane!.worker.onmessage = (e) => {
        if (e.data.id !== id) return;
        if (e.data.error) rej(new Error(e.data.error)); else res(e.data.output);
      };
      lane!.worker.postMessage({ id, model: tone, input, rate: REAL_RATE }, [input.buffer]);
    });
  } finally {
    lane.busy = false;
    waiting.shift()?.();
  }
}

/* ---- capturing the dry guitar in an offline render */

/** An amp whose dry input an offline render records. */
export interface CapturedAmp {
  tone: RealTone;
  /** Guitar 2's lead voicing (drives the amp less). */
  lead: boolean;
  /** Guitar 2's (else the rhythm part's): where its take goes. */
  guitar2: boolean;
  /** Where the amp's take sits (read once the render is built). */
  pan: () => number;
  /** Its channel in the render. */
  channel: number;
}

interface Capture { merger: ChannelMergerNode; first: number; max: number; amps: CapturedAmp[] }
const captures = new WeakMap<Tone.BaseContext, Capture>();

/** Record driven amps' inputs in this offline context, into `merger` from channel `first` (up to `max` amps). */
export function startCapture(ctx: Tone.BaseContext, merger: ChannelMergerNode, first: number, max: number) {
  captures.set(ctx, { merger, first, max, amps: [] });
}

/** The amps recorded in a context. */
export const capturedAmps = (ctx: Tone.BaseContext) => captures.get(ctx)?.amps ?? [];

/**
 * In a capturing context: where a driven amp's dry input should go instead of the amp (its own
 * channel), or null (no capture here, or no channels left: the app's own amp plays).
 */
export function captureAmp(ctx: Tone.BaseContext, tone: RealTone, lead: boolean, guitar2: boolean, pan: () => number): AudioNode | null {
  const c = captures.get(ctx);
  if (!c || c.amps.length >= c.max) return null;
  const channel = c.first + c.amps.length;
  c.amps.push({ tone, lead, guitar2, pan, channel });
  const raw = ctx.rawContext as unknown as BaseAudioContext;
  const mono = raw.createGain();
  mono.channelCount = 1;
  mono.channelCountMode = 'explicit';
  mono.connect(c.merger, 0, channel);
  return mono;
}

/**
 * The captured amps through the real amps and their cabinets (the Marshalls a 4x12, the Twin its open-back 2x12), mixed into the guitars' stereo pairs:
 * returns [chords L, chords R, guitar2 L, guitar2 R], added onto `base` (the rest of each part).
 */
export async function mixAmps(rendered: AudioBuffer, amps: CapturedAmp[], base: Float32Array[], cabs: Record<RealTone, AudioBuffer>): Promise<Float32Array[]> {
  const length = rendered.length;
  // every amp at once, spread over the workers (silent ones are skipped)
  const outs = await Promise.all(amps.map(async (a) => {
    const x = rendered.getChannelData(a.channel);
    if (!x.some((v) => v !== 0)) return null;
    const r = REAL_AMP[a.tone];
    const drive = a.lead ? r.leadDrive : r.drive;
    return runAmp(a.tone, x.map((v) => v * drive));
  }));
  const ctx = new OfflineAudioContext(4, length, REAL_RATE);
  const merger = ctx.createChannelMerger(4);
  merger.connect(ctx.destination);
  const cabBufs = Object.fromEntries(Object.entries(cabs).map(([t, c]) => [t, resample(c, REAL_RATE)])) as Record<RealTone, AudioBuffer>;
  amps.forEach((a, i) => {
    const y = outs[i];
    if (!y) return;
    const buf = ctx.createBuffer(1, length, REAL_RATE);
    buf.copyToChannel(y as Float32Array<ArrayBuffer>, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const conv = ctx.createConvolver();
    conv.normalize = true;
    conv.buffer = cabBufs[a.tone];
    let node: AudioNode = conv;
    src.connect(conv);
    const r = REAL_AMP[a.tone];
    for (const [type, frequency, gain, Q] of a.lead ? r.leadEq : r.eq) {
      const f = ctx.createBiquadFilter();
      Object.assign(f, { type });
      f.frequency.value = frequency; f.gain.value = gain; f.Q.value = Q;
      node.connect(f);
      node = f;
    }
    const level = ctx.createGain();
    level.gain.value = a.lead ? r.leadLevel : r.level;
    const pan = ctx.createStereoPanner();
    pan.pan.value = a.pan();
    node.connect(level).connect(pan);
    const split = ctx.createChannelSplitter(2);
    pan.connect(split);
    const o = a.guitar2 ? 2 : 0;
    split.connect(merger, 0, o);
    split.connect(merger, 1, o + 1);
    src.start();
  });
  const out = await ctx.startRendering();
  return [0, 1, 2, 3].map((c) => {
    const d = out.getChannelData(c), b = base[c];
    for (let i = 0; i < length; i++) d[i] += b[i];
    return d;
  });
}

/** An audio buffer at another sample rate (a convolver only takes its own context's rate). */
export function resample(buf: AudioBuffer, rate: number): AudioBuffer {
  if (buf.sampleRate === rate) return buf;
  const k = buf.sampleRate / rate, length = Math.max(1, Math.round(buf.length / k));
  const out = new AudioBuffer({ length, numberOfChannels: buf.numberOfChannels, sampleRate: rate });
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const src = buf.getChannelData(c), dst = out.getChannelData(c);
    for (let i = 0; i < length; i++) {
      const x = i * k, j = Math.floor(x), f = x - j;
      dst[i] = (src[j] ?? 0) * (1 - f) + (src[j + 1] ?? 0) * f;
    }
  }
  return out;
}
