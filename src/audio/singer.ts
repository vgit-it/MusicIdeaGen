// The demo singer as an instrument: each sung line is rendered ahead into a buffer (sing.ts) and
// started on time, a little before its first note so the onset consonants and a breath come first.
// Lines render in the background, a few at a time, as soon as a list is set; an offline render waits
// for all of them. Through a vocal chain: rumble cut, a little presence, gentle compression.

import * as Tone from 'tone';
import type { Genre } from '../genres';
import type { Idea } from '../idea';
import type { VoiceType } from '../parts/vocal';
import { inContext } from './context';
import { SING_RATE, type SungNote, renderLine } from './sing';

export type VocalChoice = 'auto' | VoiceType | 'off';
export const VOCAL_CHOICES: { id: VocalChoice; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'low', label: 'Low voice' },
  { id: 'high', label: 'High voice' },
  { id: 'off', label: 'Off' },
];

/** Seconds of lead-in before a line's first note (onset consonants, a breath). */
const PRE = 0.3;

/** How much each style slides into and off notes. */
const SLIDES: Record<Genre, number> = { rock: 0.6, pop: 0.4, funk: 0.3, hardrock: 0.5, metal: 0.3, grunge: 0.7, altmetal: 0.5 };

interface Line { first: number; key: string; notes: SungNote[]; t0: number }

export class Singer {
  readonly kind = 'singer';
  state: 'ready' = 'ready';
  choice: VocalChoice = 'auto';
  private ctx = Tone.getContext();
  private input!: Tone.Gain;
  private bufs = new Map<string, AudioBuffer>();
  private lines = new WeakMap<Idea, { six: number; voice: VoiceType; byStep: Map<number, Line[]> }>();
  private sources = new Set<AudioBufferSourceNode>();
  private queue: { key: string; notes: SungNote[]; voice: VoiceType; slides: number }[] = [];
  private working: Promise<void> | null = null;

  constructor(out: Tone.InputNode) {
    inContext(this.ctx, () => {
      const comp = new Tone.Compressor({ threshold: -20, ratio: 3, attack: 0.008, release: 0.12 }).connect(out);
      const presence = new Tone.Filter({ type: 'peaking', frequency: 2900, Q: 1.2, gain: 3 }).connect(comp);
      const mud = new Tone.Filter({ type: 'peaking', frequency: 320, Q: 1, gain: -2 }).connect(presence);
      const hp = new Tone.Filter({ type: 'highpass', frequency: 110, Q: 0.7 }).connect(mud);
      this.input = new Tone.Gain(1).connect(hp);
    });
  }

  load(): Promise<void> {
    return this.working ?? Promise.resolve();
  }

  private voiceOf(idea: Idea): VoiceType {
    return this.choice === 'low' || this.choice === 'high' ? this.choice : idea.vocalVoice ?? 'low';
  }

  /** An idea's lines at this tempo, indexed by the step that starts them. */
  private linesFor(idea: Idea, six: number) {
    const voice = this.voiceOf(idea);
    const got = this.lines.get(idea);
    if (got && got.six === six && got.voice === voice) return got;
    const { song } = idea;
    // the band's swing and lilt move the off-beat 16ths, as the engine plays them
    const at = (g: number) => g * six + (g % 2 ? (song.swing * (2 / 3) + (idea.lilt ?? 0)) * six : 0);
    const groups: NonNullable<Idea['vocal']>[] = [];
    for (const n of idea.vocal ?? []) {
      if (n.start || !groups.length) groups.push([]);
      groups[groups.length - 1].push(n);
    }
    const byStep = new Map<number, Line[]>();
    const slides = SLIDES[song.partGenres.strum];
    for (const L of groups) {
      const t0 = at(L[0].step);
      const notes: SungNote[] = L.map((n) => ({ t: at(n.step) - t0, end: at(n.step + n.len) - t0, midi: n.midi, vel: n.vel, syl: n.syl }));
      const key = `${voice}|${six.toFixed(5)}|${slides}|${notes.map((n) => `${n.t.toFixed(4)},${n.end.toFixed(4)},${n.midi},${n.vel},${n.syl.onset.join('')}${n.syl.vowel}${n.syl.coda.join('')}`).join(';')}`;
      // started a little ahead of its first note, from the step that leaves room for the lead-in
      const first = Math.max(0, L[0].step - Math.ceil(PRE / six));
      const line: Line = { first, key, notes, t0 };
      (byStep.get(first) ?? byStep.set(first, []).get(first)!).push(line);
      if (!this.bufs.has(key)) this.queue.push({ key, notes, voice, slides });
    }
    const entry = { six, voice, byStep };
    this.lines.set(idea, entry);
    return entry;
  }

  /** Render every line the list sings (in the background; `load()` waits for it). */
  prepare(list: Idea[], six: (idea: Idea) => number) {
    if (this.choice === 'off') return;
    for (const idea of list) if (idea.vocal?.length) this.linesFor(idea, six(idea));
    if (!this.working && this.queue.length) this.working = this.work();
  }

  private async work() {
    while (this.queue.length) {
      const job = this.queue.shift()!;
      if (!this.bufs.has(job.key)) this.bufs.set(job.key, this.render(job));
      // (a breather between lines, so playback never waits on it)
      await new Promise((r) => setTimeout(r, 0));
    }
    this.working = null;
  }

  private render(job: { notes: SungNote[]; voice: VoiceType; slides: number; key: string }): AudioBuffer {
    let seed = 0;
    for (let i = 0; i < job.key.length; i += 7) seed = (seed * 31 + job.key.charCodeAt(i)) >>> 0;
    const pcm = renderLine(job.notes, { high: job.voice === 'high', slides: job.slides, seed: seed % 97 }, PRE);
    const raw = this.ctx.rawContext as unknown as BaseAudioContext;
    const buf = raw.createBuffer(1, pcm.length, SING_RATE);
    buf.copyToChannel(pcm as Float32Array<ArrayBuffer>, 0);
    return buf;
  }

  /** Start the lines that begin at step `g` of `idea` (the tick's audio time `time`). */
  playStep(idea: Idea, g: number, time: number, six: number) {
    if (this.choice === 'off' || !idea.vocal?.length) return;
    const lines = this.linesFor(idea, six).byStep.get(g);
    if (!lines) return;
    const raw = this.ctx.rawContext as unknown as BaseAudioContext;
    const at = (s: number) => s * six + (s % 2 ? (idea.song.swing * (2 / 3) + (idea.lilt ?? 0)) * six : 0);
    for (const line of lines) {
      // (not rendered yet: render it now, it's short)
      let buf = this.bufs.get(line.key);
      if (!buf) {
        buf = this.render({ key: line.key, notes: line.notes, voice: this.voiceOf(idea), slides: SLIDES[idea.song.partGenres.strum] });
        this.bufs.set(line.key, buf);
      }
      const start = time + (line.t0 - PRE - at(g));
      const src = raw.createBufferSource();
      src.buffer = buf;
      Tone.connect(src, this.input);
      const when = Math.max(time, start);
      src.start(when, Math.max(0, when - start));
      this.sources.add(src);
      src.onended = () => { src.disconnect(); this.sources.delete(src); };
    }
  }

  releaseAll(time = this.ctx.now()) {
    for (const s of this.sources) { try { s.stop(time); } catch { /* already stopped */ } }
  }
}
