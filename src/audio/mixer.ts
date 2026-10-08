// Per-part strips (volume, mute, solo) into a shared reverb and master bus.

import * as Tone from 'tone';

export type MixPart = 'chords' | 'guitar2' | 'drums' | 'bass' | 'keys' | 'pad';
export const MIX_PARTS: MixPart[] = ['chords', 'guitar2', 'drums', 'bass', 'keys', 'pad'];
/** Parts you add and remove (the rest always play). */
export type LayerPart = 'keys' | 'pad';

const REVERB_SEND: Record<MixPart, number> = { chords: -12, guitar2: -9, drums: -16, bass: -40, keys: -11, pad: -7 };
/** Fixed level per part, before the fader: Guitar 2's melodies sit just forward of the rhythm part (a band member, not a lead vocal). */
const TRIM: Record<MixPart, number> = { chords: 0, guitar2: 1.5, drums: 0, bass: 0, keys: 5, pad: 5 };
/** Tempo-synced echo (dotted 8th), only on the second guitar. */
const DELAY_SEND: Record<MixPart, number> = { chords: -Infinity, guitar2: -9, drums: -Infinity, bass: -Infinity, keys: -Infinity, pad: -Infinity };

const irCache = new Map<number, AudioBuffer>();

/**
 * Room reverb impulse response: stereo noise fading out exponentially (-60 dB at 1.8 s), the same
 * recipe as Tone's Reverb. Made once in code and shared: Tone's Reverb renders its own each time,
 * which slowed down audio exports (one per piece).
 */
function reverbIR(sampleRate: number): AudioBuffer {
  let ir = irCache.get(sampleRate);
  if (!ir) {
    const decay = 1.8, pre = 0.01;
    const length = Math.round((decay + pre) * sampleRate);
    ir = new AudioBuffer({ length, numberOfChannels: 2, sampleRate });
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = Math.round(pre * sampleRate); i < length; i++) {
        const t = i / sampleRate - pre;
        d[i] = (Math.random() * 2 - 1) * 10 ** ((-3 * t) / decay);
      }
    }
    irCache.set(sampleRate, ir);
  }
  return ir;
}

/** Slider 0-100 -> decibels (squared curve feels natural). */
export const sliderToDb = (v: number) => (v <= 0 ? -Infinity : 20 * Math.log10((v / 100) ** 2));

interface Strip {
  volume: Tone.Volume;
  /** 0 or 1: mute/solo switch, after the fader so it also silences the reverb send. */
  gate: Tone.Gain;
  mute: boolean;
  solo: boolean;
  /** Fader position (0-100). */
  slider: number;
}

/** Faders, mutes and solos, so an offline render can copy what you hear. */
export type MixState = Record<MixPart, { slider: number; mute: boolean; solo: boolean }>;

export class Mixer {
  readonly master: Tone.Gain;
  /** Overall output level (the master volume slider); after everything else. */
  readonly out = new Tone.Volume(0).toDestination();
  private strips = {} as Record<MixPart, Strip>;
  private delay = new Tone.FeedbackDelay({ delayTime: 0.375, feedback: 0.32, wet: 1 });
  /** Resolves when the mixer is ready to render (kept for offline renders; the reverb is ready at once now). */
  readonly ready: Promise<void>;
  /** Per-part taps for stems, which follow the section level too. */
  private stems: Tone.Gain[] = [];

  /**
   * Track sections: overall level by energy, after the limiter so the compressors
   * can't even it out again (verses really are quieter than choruses).
   */
  readonly sectionLevel = new Tone.Gain(1).connect(this.out);

  constructor() {
    const limiter = new Tone.Limiter(-1).connect(this.sectionLevel);
    const comp = new Tone.Compressor({ threshold: -16, ratio: 2.5, attack: 0.02, release: 0.2 }).connect(limiter);
    this.master = new Tone.Gain(0.8).connect(comp);

    const reverb = new Tone.Convolver({ normalize: true });
    reverb.buffer = new Tone.ToneAudioBuffer(reverbIR(reverb.context.sampleRate));
    this.ready = Promise.resolve();
    const fx = new Tone.Volume(-6).chain(reverb, this.master);
    // echoes are darker than the dry signal, and get a little reverb too
    const echo = new Tone.Filter({ type: 'lowpass', frequency: 3500 });
    this.delay.chain(echo, this.master);
    echo.connect(fx);

    for (const p of MIX_PARTS) {
      const volume = new Tone.Volume(0);
      const gate = new Tone.Gain(1);
      volume.chain(new Tone.Volume(TRIM[p]), gate);
      gate.connect(this.master);
      gate.connect(new Tone.Volume(REVERB_SEND[p]).connect(fx));
      if (DELAY_SEND[p] > -Infinity) gate.connect(new Tone.Volume(DELAY_SEND[p]).connect(this.delay));
      this.strips[p] = { volume, gate, mute: false, solo: false, slider: 80 };
    }
  }

  state(): MixState {
    return Object.fromEntries(MIX_PARTS.map((p) => {
      const { slider, mute, solo } = this.strips[p];
      return [p, { slider, mute, solo }];
    })) as MixState;
  }

  restore(s: MixState) {
    for (const p of MIX_PARTS) {
      this.setVolume(p, s[p].slider);
      this.strips[p].mute = s[p].mute;
      this.strips[p].solo = s[p].solo;
    }
    this.updateGates();
  }

  /** A part on its own (after its fader, before the shared reverb and master bus), for stems. */
  stem(part: MixPart): Tone.Gain {
    const g = new Tone.Gain(this.sectionLevel.gain.value);
    this.strips[part].gate.connect(g);
    this.stems.push(g);
    return g;
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
    this.strips[part].slider = slider;
    this.strips[part].volume.volume.value = sliderToDb(slider);
  }

  /** Keep the echo on the beat: a dotted 8th at this tempo. */
  setTempo(bpm: number) {
    this.delay.delayTime.rampTo((60 / bpm) * 0.75, 0.05);
  }

  private levelDb = 0;

  /**
   * Glide to a section's level (dB) at an audio time: quickly up (a section arrives), slowly down, so a
   * quieter section settles in while the last chord and crash of the louder one ring out.
   */
  setSectionLevel(db: number, time: number, glide = db < this.levelDb - 0.1 ? 0.35 : 0.06) {
    this.levelDb = db;
    for (const g of [this.sectionLevel, ...this.stems]) g.gain.setTargetAtTime(Tone.dbToGain(db), time, glide);
  }

  setMasterVolume(slider: number) {
    this.out.volume.value = sliderToDb(slider);
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
