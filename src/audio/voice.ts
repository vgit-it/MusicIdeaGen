// One sample playing: a buffer source and a gain (velocity, fade in, fade out).
//
// Built straight on Web Audio nodes in the instrument's own context. When the source really
// finishes (the browser's own "ended" event, live or during an offline render) the nodes are
// disconnected. Tone's buffer source signals "ended" on its own clock instead, which in an offline
// render runs before any audio is made, so finished voices either got cut before playing or piled
// up in the graph and slowed the render down more and more.

import * as Tone from 'tone';

export class SampleVoice {
  readonly playbackRate: AudioParam;
  /** Fade-out time (seconds) used by the next stop(). */
  fadeOut: number;
  onended: () => void = () => {};
  private src: AudioBufferSourceNode;
  private g: GainNode;
  private fadeIn: number;

  constructor(ctx: Tone.BaseContext, buf: AudioBuffer, out: Tone.InputNode, opts: { rate?: number; fadeIn?: number; fadeOut?: number } = {}) {
    const raw = ctx.rawContext as unknown as BaseAudioContext;
    this.src = raw.createBufferSource();
    this.src.buffer = buf;
    this.playbackRate = this.src.playbackRate;
    this.playbackRate.value = opts.rate ?? 1;
    this.g = raw.createGain();
    this.g.gain.value = 0;
    this.fadeIn = opts.fadeIn ?? 0;
    this.fadeOut = opts.fadeOut ?? 0.01;
    this.src.connect(this.g);
    Tone.connect(this.g, out);
    this.src.onended = () => {
      this.dispose();
      this.onended();
    };
  }

  start(time: number, gain: number) {
    const p = this.g.gain;
    if (this.fadeIn > 0) {
      p.setValueAtTime(0, time);
      p.linearRampToValueAtTime(gain, time + this.fadeIn);
    } else p.setValueAtTime(gain, time);
    this.src.start(time);
  }

  /** Fade out from `time` and stop (calling again moves the stop, e.g. a choke). */
  stop(time: number) {
    const p = this.g.gain;
    const fade = Math.max(0.003, this.fadeOut);
    p.cancelScheduledValues(time);
    p.setTargetAtTime(0, time, fade / 4);
    try {
      this.src.stop(time + fade);
    } catch {
      /* already finished */
    }
  }

  dispose() {
    try { this.src.disconnect(); } catch { /* already */ }
    try { this.g.disconnect(); } catch { /* already */ }
  }
}
