// Percussion layer: tambourine (down and up strokes), shaker and congas from samples, hand claps made
// here from shaped noise (no free clap recordings in the sample library). Notes use General MIDI
// percussion numbers, so the MIDI export can write them as they are.

import * as Tone from 'tone';
import { inContext } from './context';
import { type PercPiece, RoundRobin, loadPerc } from './samples';
import { SampleVoice } from './voice';

/** General MIDI numbers the percussion part uses. */
export const PERC_NOTE = { tambourine: 54, shaker: 70, clap: 39, conga: 63, congaLow: 64 } as const;

const PAN: Record<PercPiece | 'clap', number> = { tambDown: 0.4, tambUp: 0.4, shaker: -0.35, conga: 0.2, congaLow: -0.15, clap: 0 };
const LEVEL: Record<PercPiece | 'clap', number> = { tambDown: 0.7, tambUp: 0.6, shaker: 0.55, conga: 0.85, congaLow: 0.85, clap: 0.9 };

export class Percussion {
  readonly kind = 'perc';
  state: 'idle' | 'loading' | 'ready' | 'failed' = 'idle';
  private ctx = Tone.getContext();
  private bufs: Record<PercPiece, AudioBuffer[]> | null = null;
  private claps: AudioBuffer[] = [];
  private outs = {} as Record<PercPiece | 'clap', Tone.ToneAudioNode>;
  private rr = new RoundRobin();
  private loading?: Promise<void>;

  constructor(out: Tone.InputNode) {
    inContext(this.ctx, () => {
      for (const p of Object.keys(PAN) as (PercPiece | 'clap')[]) {
        const pan = new Tone.Panner(PAN[p]).connect(out);
        // shakers and tambourines: no low rumble from the room
        const hp = new Tone.Filter({ type: 'highpass', frequency: p.startsWith('conga') ? 60 : p === 'clap' ? 500 : 250, rolloff: -12 }).connect(pan);
        this.outs[p] = p === 'clap'
          ? new Tone.Filter({ type: 'peaking', frequency: 1100, gain: 4, Q: 0.8 }).connect(hp)
          : hp;
      }
    });
    this.claps = [0, 1, 2].map(() => this.makeClap());
  }

  load(): Promise<void> {
    return (this.loading ??= this.loadNow());
  }

  private async loadNow() {
    this.state = 'loading';
    try {
      this.bufs = await loadPerc();
      this.state = 'ready';
    } catch {
      this.state = 'failed';
    }
  }

  /** A hand clap: three quick bursts of noise (hands don't meet all at once), then a short room tail. */
  private makeClap(): AudioBuffer {
    const raw = this.ctx.rawContext as unknown as BaseAudioContext;
    const sr = raw.sampleRate, len = Math.floor(sr * 0.3);
    const buf = raw.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    const bursts = [0, 0.008 + Math.random() * 0.003, 0.018 + Math.random() * 0.004];
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      let env = 0;
      for (const b of bursts) if (t >= b) env = Math.max(env, Math.exp(-(t - b) / 0.004));
      env = Math.max(env, t >= bursts[2] ? 0.35 * Math.exp(-(t - bursts[2]) / 0.07) : 0);
      d[i] = (Math.random() * 2 - 1) * env;
    }
    return buf;
  }

  /** Play a General MIDI percussion note; `up`: a tambourine up stroke (the off-beats). */
  play(note: number, time: number, vel: number, up = false) {
    let piece: PercPiece | 'clap' | null = null;
    let buf: AudioBuffer | undefined;
    if (note === PERC_NOTE.clap) { piece = 'clap'; buf = this.rr.pick('clap', this.claps); }
    else if (this.bufs) {
      piece = note === PERC_NOTE.tambourine ? (up ? 'tambUp' : 'tambDown') : note === PERC_NOTE.shaker ? 'shaker'
        : note === PERC_NOTE.conga ? 'conga' : note === PERC_NOTE.congaLow ? 'congaLow' : null;
      if (piece) buf = this.rr.pick(piece, this.bufs[piece]);
    }
    if (!piece || !buf) return;
    // played by hand: never exactly on the grid
    const t = time + Math.random() * 0.008;
    const v = new SampleVoice(this.ctx, buf, this.outs[piece], { fadeOut: 0.05 });
    v.start(t, LEVEL[piece] * (0.25 + 0.75 * vel) ** 1.4);
    v.stop(t + buf.duration);
  }

  releaseAll() {
    /* one-shots: they finish on their own */
  }
}
