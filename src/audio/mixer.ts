// Per-part strips (volume, mute, solo) into a shared reverb and master bus.

import * as Tone from 'tone';

export type MixPart = 'chords' | 'drums' | 'bass';
export const MIX_PARTS: MixPart[] = ['chords', 'drums', 'bass'];

const REVERB_SEND: Record<MixPart, number> = { chords: -12, drums: -20, bass: -40 };

/** Slider 0-100 -> decibels (squared curve feels natural). */
export const sliderToDb = (v: number) => (v <= 0 ? -Infinity : 20 * Math.log10((v / 100) ** 2));

interface Strip {
  volume: Tone.Volume;
  /** 0 or 1: mute/solo switch, after the fader so it also silences the reverb send. */
  gate: Tone.Gain;
  mute: boolean;
  solo: boolean;
}

export class Mixer {
  readonly master: Tone.Gain;
  private strips = {} as Record<MixPart, Strip>;

  constructor() {
    const limiter = new Tone.Limiter(-1).toDestination();
    const comp = new Tone.Compressor({ threshold: -16, ratio: 2.5, attack: 0.02, release: 0.2 }).connect(limiter);
    this.master = new Tone.Gain(1.8).connect(comp);

    const reverb = new Tone.Reverb({ decay: 1.8, wet: 1 });
    const fx = new Tone.Volume(-6).chain(reverb, this.master);

    for (const p of MIX_PARTS) {
      const volume = new Tone.Volume(0);
      const gate = new Tone.Gain(1);
      volume.connect(gate);
      gate.connect(this.master);
      gate.connect(new Tone.Volume(REVERB_SEND[p]).connect(fx));
      this.strips[p] = { volume, gate, mute: false, solo: false };
    }
  }

  /** Where a part's instrument should connect. */
  input(part: MixPart): Tone.InputNode {
    return this.strips[part].volume;
  }

  /** Tap after mute/solo (for meters). */
  output(part: MixPart): Tone.ToneAudioNode {
    return this.strips[part].gate;
  }

  setVolume(part: MixPart, slider: number) {
    this.strips[part].volume.volume.value = sliderToDb(slider);
  }

  setMute(part: MixPart, on: boolean) {
    this.strips[part].mute = on;
    this.updateGates();
  }

  setSolo(part: MixPart, on: boolean) {
    this.strips[part].solo = on;
    this.updateGates();
  }

  private updateGates() {
    const anySolo = MIX_PARTS.some((p) => this.strips[p].solo);
    for (const p of MIX_PARTS) {
      const s = this.strips[p];
      const open = !s.mute && (!anySolo || s.solo);
      s.gate.gain.rampTo(open ? 1 : 0, 0.02);
    }
  }
}
