// Guitar prep: renders the driven guitar parts with real amps ahead of playback, one section (item)
// at a time, starting from the one playing now. The engine plays a prepared section from its buffer
// and the rest live (on the app's own amp), so playback never waits. Exports use them too.
// (How the real amps are rendered: realamp.ts.)
//
// Each item renders with the one before it as a lead-in (ringing notes and compressors carry over)
// and the one after it in view (strums that ring over the bar line), like the audio export's pieces.

import * as Tone from 'tone';
import type { Idea } from '../idea';
import { Engine, type EngineSettings } from './engine';
import { LANES, REAL_RATE, capturedAmps, mixAmps, startCapture, warmUpRealAmps } from './realamp';
import { loadCab } from './samples';

/** The rendered guitars of one item. */
export interface Prepared {
  /** Stereo, as they go into their mixer strips (before the fader); null when that part plays live. */
  chords: AudioBuffer | null;
  guitar2: AudioBuffer | null;
  /** Seconds into the buffers where the item's first step falls. */
  offset: number;
}

/** What an item plays on, and its neighbours: a prepared item is only used while these still hold. */
export interface PrepItem {
  key: string;
  list: Idea[];
  /** Index of the item in `list` (after its lead-in). */
  at: number;
  /** Which parts need real amps. */
  chords: boolean;
  guitar2: boolean;
  /** Ring out at the end (the track's last item). */
  last: boolean;
  /** Most driven amps its render can build (each gets a channel). */
  amps: number;
}

/** The offline clock starts this far in (see Engine.startOffline). */
const LEAD = 0.05;
/** Bars of the item before played as a lead-in (discarded). */
const PRE_BARS = 2;
/** Ring-out after a track's last item. */
const TAIL = 5;
/** Past the item's end, so the next one can crossfade in. */
const OVER = 0.15;

export class GuitarPrep {
  private done = new Map<string, Prepared | null>();
  private queue: PrepItem[] = [];
  /** Keys of the latest plan, and of renders under way. */
  private wanted = new Set<string>();
  private inflight = new Set<string>();
  private running = 0;
  /** Renders side by side (each offline render on its own processor core, as are the amp workers). */
  private readonly lanes = LANES;
  /** Waiting for renders to finish. */
  private listeners = new Set<() => void>();
  /** Rendering started or stopped. */
  onBusy: (busy: boolean) => void = () => {};

  /** `gentle`: while music plays, renders pause now and then so live playback keeps its timing. */
  constructor(private readonly settings: () => EngineSettings, private readonly gentle: () => boolean = () => false) {}

  /** Prepare these items, in order (earlier plans are dropped; finished items still in the plan are kept). */
  plan(items: PrepItem[]) {
    this.wanted = new Set(items.map((i) => i.key));
    for (const k of this.done.keys()) if (!this.wanted.has(k)) this.done.delete(k);
    this.queue = items.filter((i) => !this.done.has(i.key) && !this.inflight.has(i.key));
    // the first item (what plays next) gets the whole computer, so it's ready as soon as possible
    this.first = !!this.queue.length && this.queue[0].key === items[0]?.key;
    this.pump();
  }

  /** A prepared item (null: it failed, play live; undefined: not ready yet). */
  get(key: string): Prepared | null | undefined {
    return this.done.get(key);
  }

  get busy(): boolean {
    return this.running > 0 || this.queue.length > 0;
  }

  /** The first item of the plan is rendering on its own. */
  private first = false;

  private pump() {
    const was = this.running > 0;
    this.pumpNow();
    if (was !== this.running > 0) this.onBusy(this.running > 0);
  }

  private pumpNow() {
    while (this.running < (this.first ? 1 : this.lanes) && this.queue.length) {
      const item = this.queue.shift()!;
      this.running++;
      this.inflight.add(item.key);
      this.render(item)
        .catch((e) => { console.warn('Guitar prep failed:', e); return null; })
        .then((r) => {
          this.running--;
          this.inflight.delete(item.key);
          this.first = false;
          if (this.wanted.has(item.key)) this.done.set(item.key, r);
          for (const l of [...this.listeners]) l();
          this.pump();
        });
    }
  }

  /** Wait until these items are prepared (or failed). */
  async all(keys: string[], onProgress: (p: number) => void = () => {}): Promise<void> {
    for (;;) {
      const done = keys.filter((k) => this.done.has(k)).length;
      onProgress(keys.length ? done / keys.length : 1);
      if (done === keys.length) return;
      await new Promise<void>((res) => {
        const l = () => { this.listeners.delete(l); res(); };
        this.listeners.add(l);
      });
    }
  }

  private async render(item: PrepItem): Promise<Prepared | null> {
    if (!(await warmUpRealAmps())) return null;
    const { list, at } = item;
    const bpm = list[at].song.bpm;
    const sec = (steps: number) => (steps * 15) / bpm;
    const prev = at > 0 ? list[at - 1] : null;
    const preSteps = prev ? prev.song.bars.slice(-PRE_BARS).reduce((a, b) => a + b.len, 0) : 0;
    const pre = sec(preSteps);
    const seconds = LEAD + pre + sec(list[at].song.total) + (item.last ? TAIL : OVER);

    // channels: each part's strip input (clean takes and other sounds), then each driven amp's dry input
    const live = Tone.getContext();
    const channels = 4 + item.amps;
    const ctx = new Tone.OfflineContext(channels, seconds, REAL_RATE);
    const raw = ctx.rawContext;
    const merger = raw.createChannelMerger(channels);
    merger.connect(raw.destination);
    startCapture(ctx, merger, 4, item.amps);
    Tone.setContext(ctx);
    let engine: Engine;
    try {
      engine = new Engine(true);
      engine.guitarsOnly = true;
      engine.applySettings(this.settings(), true);
      engine.setVolume('chords', 100);
      engine.setVolume('guitar2', 100);
      engine.setList(list, false, 0);
    } finally {
      Tone.setContext(live);
    }
    await engine.loadAll();
    Tone.setContext(ctx);
    try {
      engine.mixer.out.disconnect();
      (['chords', 'guitar2'] as const).forEach((part, i) => {
        const up = raw.createGain();
        up.channelCount = 2;
        up.channelCountMode = 'explicit';
        up.channelInterpretation = 'speakers';
        const split = raw.createChannelSplitter(2);
        Tone.connect(engine.mixer.input(part) as Tone.ToneAudioNode, up);
        up.connect(split);
        split.connect(merger, 0, i * 2);
        split.connect(merger, 1, i * 2 + 1);
      });
      engine.startOffline(prev ? prev.song.total - preSteps : 0);
    } finally {
      Tone.setContext(live);
    }
    const out = await renderGently(ctx, this.gentle());
    const mixed = await mixAmps(out, capturedAmps(ctx), [0, 1, 2, 3].map((c) => out.getChannelData(c)), await loadCab('dist'));
    const pair = (i: number) => {
      const b = new AudioBuffer({ length: out.length, numberOfChannels: 2, sampleRate: REAL_RATE });
      b.copyToChannel(mixed[i * 2] as Float32Array<ArrayBuffer>, 0);
      b.copyToChannel(mixed[i * 2 + 1] as Float32Array<ArrayBuffer>, 1);
      return b;
    };
    return { chords: item.chords ? pair(0) : null, guitar2: item.guitar2 ? pair(1) : null, offset: LEAD + pre };
  }
}

/** Pass control back to the page (a message, not a timer: timers slow to once a second in a hidden tab). */
const yieldNow = () => new Promise<void>((res) => {
  const ch = new MessageChannel();
  ch.port1.onmessage = () => res();
  ch.port2.postMessage(0);
});

/**
 * Tone's offline render, stepping its clock (which plays the notes into the render) with a break
 * every few milliseconds while music plays: live notes are scheduled only a moment ahead, and a
 * render that held up the page for half a second made them late.
 */
async function renderGently(ctx: Tone.OfflineContext, gentle: boolean): Promise<AudioBuffer> {
  if (!gentle) return (await ctx.render(false)).get()!;
  const c = ctx as unknown as { _duration: number; _currentTime: number; emit(e: string): void; _context: { startRendering(): Promise<AudioBuffer> } };
  let t = performance.now();
  while (c._duration - c._currentTime >= 0) {
    c.emit('tick');
    c._currentTime += 128 / ctx.sampleRate;
    if (performance.now() - t > 12) { await yieldNow(); t = performance.now(); }
  }
  return c._context.startRendering();
}
