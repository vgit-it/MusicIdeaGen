// Band video (docs/BAND-VIDEO.md): the band view as a video file with the real-amp sound.
// Made offline, faster than real time: the audio the way the audio export renders it, then every
// video frame drawn by the stage from where the song is at that moment (the step times worked out
// from the engine's own timing), encoded in the browser and packed into an MP4 (or WebM).

import * as Tone from 'tone';
import {
  AudioBufferSource, BufferTarget, CanvasSource, Mp4OutputFormat, Output, WebMOutputFormat,
  canEncodeAudio, getFirstEncodableAudioCodec, getFirstEncodableVideoCodec,
  type AudioCodec, type OutputFormat, type VideoCodec,
} from 'mediabunny';
import { Engine, type EngineSettings } from '../audio/engine';
import { LEAD, type Rendered, renderAudio } from '../export/audio';
import type { Idea } from '../idea';
import { StepClock } from './clock';
import { type Score, lastAt } from './score';
import { H, type Stage, W } from './stage';

/** The sizes offered: the height in pixels, the picture is letterboxed into 16:9. */
export const VIDEO_SIZES = { 360: { w: 640, h: 360, bitrate: 1.5e6 }, 720: { w: 1280, h: 720, bitrate: 4e6 } } as const;
export type VideoHeight = keyof typeof VIDEO_SIZES;

export const VIDEO_FPS = 30;
/** Audio bitrate. */
const AUDIO_BITRATE = 192e3;
/** The video starts this long before the first beat, so a note played a hair early isn't cut. */
const PRE = 0.03;

/* ------------------------------------------------------------ when each step sounds */

/**
 * The audio time (seconds into the rendered audio) of every step of the track, plus the end: the
 * engine's own timing worked out. The clock starts `LEAD` in, Tone's swing delays every odd 16th by
 * two thirds of a 16th times the swing, and the band's lilt delays the odd 16ths of a section.
 */
export function stepTimes(sections: Idea[]): Float64Array {
  const six = 15 / sections[0].song.bpm, swing = sections[0].song.swing;
  const out = new Float64Array(sections.reduce((a, s) => a + s.song.total, 0) + 1);
  let k = 0;
  for (const idea of sections) {
    for (let g = 0; g < idea.song.total; g++, k++) {
      out[k] = LEAD + k * six + (k & 1 ? swing * (2 / 3) * six : 0) + (g & 1 ? (idea.lilt ?? 0) * six : 0);
    }
  }
  out[k] = LEAD + k * six;
  return out;
}

/** The same times as the engine reports them rendering offline (a check of `stepTimes`; the whole track is played). */
export async function measureStepTimes(list: Idea[], settings: EngineSettings): Promise<Float64Array> {
  const six = 15 / list[0].song.bpm;
  const steps = list.reduce((a, s) => a + s.song.total, 0);
  const live = Tone.getContext();
  const ctx = new Tone.OfflineContext(2, LEAD + steps * six + 1, live.sampleRate);
  Tone.setContext(ctx);
  const out = new Float64Array(steps + 1).fill(NaN);
  try {
    const engine = new Engine(true);
    engine.applySettings(settings, false);
    await engine.mixer.ready;
    engine.setList(list, false, 0);
    await engine.loadAll();
    engine.reportOffline = true;
    const offs: number[] = [];
    let n = 0;
    for (const s of list) { offs.push(n); n += s.song.total; }
    engine.onStep = (_idea, idx, g, time) => { out[offs[idx] + g] = time; };
    engine.startOffline(0);
  } finally {
    Tone.setContext(live);
  }
  await ctx.render(false);
  return out;
}

/* ------------------------------------------------------------ what this browser can make */

export interface VideoPlan { container: 'mp4' | 'webm'; video: VideoCodec; audio: AudioCodec; viaExtension: boolean }

/**
 * The best file this browser can make: MP4 (H.264 + AAC, the AAC from a small encoder where the browser
 * has none), else WebM (VP9 or VP8 + Opus), else null.
 */
export async function planVideo(size: VideoHeight, sampleRate: number, force?: VideoPlan): Promise<VideoPlan | null> {
  if (force) return force;
  const { w, h, bitrate } = VIDEO_SIZES[size];
  const v = { width: w, height: h, bitrate, frameRate: VIDEO_FPS };
  const a = { numberOfChannels: 2, sampleRate, bitrate: AUDIO_BITRATE };
  if (typeof VideoEncoder === 'undefined') return null;
  if (await getFirstEncodableVideoCodec(['avc'], v)) {
    if (await canEncodeAudio('aac', a)) return { container: 'mp4', video: 'avc', audio: 'aac', viaExtension: false };
    // (no AAC in this browser: a small encoder in WebAssembly, loaded only now)
    return { container: 'mp4', video: 'avc', audio: 'aac', viaExtension: true };
  }
  const video = await getFirstEncodableVideoCodec(['vp9', 'vp8'], v);
  const audio = await getFirstEncodableAudioCodec(['opus', 'vorbis'], a);
  return video && audio ? { container: 'webm', video, audio, viaExtension: false } : null;
}

/* ------------------------------------------------------------ the picture */

/** The sung line as the page shows it: the syllable sounding now in bold white, the rest dimmer. */
function drawLyrics(c: CanvasRenderingContext2D, score: Score, t: number, width: number, bottom: number, size: number) {
  const lines = score.vocal.lines, line = lines[lastAt(lines, t + 2)];
  if (!line || t < 0 || t >= line.end + 4) return;
  const si = lastAt(line.syls, t);
  const runs = line.syls.map((s, k) => ({ text: (s.space ? ' ' : '') + s.text, now: k === si && t < line.end + 0.5 }));
  c.font = `700 ${size}px ui-monospace, Menlo, Consolas, monospace`;
  c.textBaseline = 'alphabetic';
  c.textAlign = 'left';
  // (a monospace font: bold and plain are the same width)
  const total = c.measureText(runs.map((r) => r.text).join('')).width;
  let font = size;
  if (total > width * 0.94) { font = size * (width * 0.94) / total; c.font = `700 ${font}px ui-monospace, Menlo, Consolas, monospace`; }
  let x = (width - Math.min(total, width * 0.94)) / 2;
  for (const r of runs) {
    const w = c.measureText(r.text).width;
    c.fillStyle = '#000';
    c.fillText(r.text, x, bottom + font * 0.08);
    c.fillStyle = r.now ? '#fff' : 'rgba(255,255,255,0.55)';
    c.fillText(r.text, x, bottom);
    x += w;
  }
}

/* ------------------------------------------------------------ the render */

export interface VideoOptions {
  stage: Stage;
  score: Score;
  /** The track's sections, and the engine whose sound and settings they play with. */
  list: Idea[];
  engine: Engine;
  size: VideoHeight;
  lyrics: boolean;
  onProgress: (phase: string, p: number) => void;
  signal?: AbortSignal;
  /** Gets the stage's own picture now and then, to show how it's going. */
  preview?: (stage: HTMLCanvasElement) => void;
  /** For `npm run video-check`: the codecs to use whatever the browser prefers, and the audio as rendered. */
  force?: VideoPlan;
  onAudio?: (audio: Rendered, stepTimes: Float64Array) => void;
}

export interface VideoFile { bytes: ArrayBuffer; extension: string; type: string; plan: VideoPlan; seconds: number; frames: number }

/** Give the page a moment (a message, not a timer: a hidden tab slows timers to once a second). */
const breathe = () => new Promise<void>((done) => {
  const ch = new MessageChannel();
  ch.port1.onmessage = () => { ch.port1.close(); done(); };
  ch.port2.postMessage(0);
});

export async function renderVideo(o: VideoOptions): Promise<VideoFile> {
  const { stage, score, list, engine, size } = o;
  const { w: outW, h: outH, bitrate } = VIDEO_SIZES[size];
  const aborted = () => { if (o.signal?.aborted) throw new DOMException('Cancelled', 'AbortError'); };

  // 1. the sound: the real sound on (the guitars through the amps, the singer polished), then the whole mix
  o.onProgress('Preparing real amps', 0);
  await engine.prepareRealAmps(list, (p) => o.onProgress('Preparing real amps', p));
  aborted();
  const prepared = await engine.prepareFor(list);
  o.onProgress('Rendering audio', 0);
  const audio = await renderAudio(list, engine.settings(), false, (p) => o.onProgress('Rendering audio', p), prepared);
  aborted();
  const rate = audio.sampleRate, mix = audio.mix;

  // 2. what this browser can make
  const plan = await planVideo(size, rate, o.force);
  if (!plan) throw new Error('This browser can\'t make video files (it has no video encoder).');
  if (plan.viaExtension) (await import('@mediabunny/aac-encoder')).registerAacEncoder();

  // 3. when each step sounds, and the picture's canvases
  const times = stepTimes(list);
  o.onAudio?.(audio, times);
  const clock = new StepClock(score.steps, score.six);
  times.forEach((t, k) => clock.record(k, t));
  const k = outH / H; // whole-number blow-up of the stage (2x for 360p, 4x for 720p), then a smooth fit to the width
  const sc = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const big = Object.assign(document.createElement('canvas'), { width: W * k, height: H * k });
  const out = Object.assign(document.createElement('canvas'), { width: outW, height: outH });
  const sctx = sc.getContext('2d')!, bctx = big.getContext('2d')!, octx = out.getContext('2d', { alpha: false })!;
  const picH = Math.round((H * outW) / W / 2) * 2, picTop = Math.floor((outH - picH) / 2);
  const text = Math.round(outH * 0.05);
  const was = stage.full;
  stage.full = true;

  const drawFrame = (v: number) => {
    const raw = clock.at(v + LEAD - PRE);
    // (before the first step: the first; after the last: the band's ending pose)
    const t = raw < 0 ? 0 : Math.min(raw, score.steps - 0.01);
    stage.render(sctx, t, v);
    bctx.imageSmoothingEnabled = false;
    bctx.drawImage(sc, 0, 0, W * k, H * k);
    octx.fillStyle = '#000';
    octx.fillRect(0, 0, outW, outH);
    octx.imageSmoothingEnabled = true;
    octx.imageSmoothingQuality = 'high';
    octx.drawImage(big, 0, 0, W * k, H * k, 0, picTop, outW, picH);
    if (o.lyrics) drawLyrics(octx, score, t, outW, picTop + picH - Math.round(outH * 0.03), text);
  };

  // 4. the file
  const format: OutputFormat = plan.container === 'mp4' ? new Mp4OutputFormat() : new WebMOutputFormat();
  const output = new Output({ format, target: new BufferTarget() });
  const videoSource = new CanvasSource(out, { codec: plan.video, bitrate, keyFrameInterval: 2 });
  const audioSource = new AudioBufferSource({ codec: plan.audio, bitrate: AUDIO_BITRATE });
  output.addVideoTrack(videoSource, { frameRate: VIDEO_FPS });
  output.addAudioTrack(audioSource);
  const first = Math.round((LEAD - PRE) * rate);
  const seconds = (mix[0].length - first) / rate;
  const frames = Math.floor(seconds * VIDEO_FPS);
  let audioAt = first;
  /** Audio goes in a second at a time, a second ahead of the picture, so the two stay interleaved. */
  const feedAudio = async (untilSec: number) => {
    const end = Math.min(mix[0].length, first + Math.round(untilSec * rate));
    while (audioAt < end) {
      const n = Math.min(end - audioAt, rate);
      const buf = new AudioBuffer({ length: n, numberOfChannels: 2, sampleRate: rate });
      for (let c = 0; c < 2; c++) buf.copyToChannel(mix[c].subarray(audioAt, audioAt + n) as Float32Array<ArrayBuffer>, c);
      await audioSource.add(buf);
      audioAt += n;
    }
  };

  try {
    await output.start();
    o.onProgress('Drawing frames', 0);
    for (let n = 0; n < frames; n++) {
      aborted();
      const v = n / VIDEO_FPS;
      if (n % VIDEO_FPS === 0) await feedAudio(v + 2);
      drawFrame(v);
      await videoSource.add(v, 1 / VIDEO_FPS);
      if (n % 6 === 0) {
        o.preview?.(sc);
        o.onProgress('Drawing frames', n / frames);
        await breathe();
      }
    }
    await feedAudio(seconds + 1);
    o.onProgress('Finishing the file', 1);
    await output.finalize();
  } catch (e) {
    try { await output.cancel(); } catch { /* already */ }
    throw e;
  } finally {
    stage.full = was;
  }
  const bytes = (output.target as BufferTarget).buffer!;
  return {
    bytes, plan, seconds, frames,
    extension: plan.container, type: plan.container === 'mp4' ? 'video/mp4' : 'video/webm',
  };
}
