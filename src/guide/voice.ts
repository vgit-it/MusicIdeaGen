// The Guide line sung (experiment): the line's words (words.ts) sung by the FOF singer in the Cornell
// voice tuned by Paul (the woman's voice when the line is sung high), each line rendered once in the
// background and kept, polished like the vocals, started on the step that leaves room for its lead-in.

import * as Tone from 'tone';
import type { Idea } from '../idea';
import type { Genre } from '../genres';
import type { HighVoice } from '../parts/singers';
import { FOF_RATE, renderFof } from '../audio/fof';
import { fofFor } from '../audio/voices';
import { polishVoice } from '../audio/polish';
import { polishFor } from '../audio/singer';
import type { SungNote } from '../audio/sing';
import type { GuideSungLine } from './words';

/** Seconds of lead-in before a line's first note (onset consonants, a breath). */
const PRE = 0.3;

interface Placed { key: string; notes: SungNote[]; t0: number; idea: Idea; energy: number }

export class GuideVoice {
  private ctx = Tone.getContext();
  private vol: Tone.Volume;
  private bufs = new Map<string, AudioBuffer>();
  private byStep: Map<number, Placed[]>[] = [];
  private queue: Placed[] = [];
  private working = false;
  private sources = new Set<AudioBufferSourceNode>();
  private high: HighVoice | null = null;

  constructor(out: Tone.InputNode) {
    this.vol = new Tone.Volume(-2).connect(out);
  }

  /** Fader 0-100 (0: off). */
  setLevel(v: number) {
    this.vol.volume.value = v <= 0 ? -Infinity : 20 * Math.log10((v / 100) ** 2) + 2;
  }

  /** The step's time in seconds, swung as the band plays it. */
  private static at(idea: Idea, g: number) {
    const six = 15 / idea.song.bpm;
    return g * six + (g % 2 ? (idea.song.swing * (2 / 3) + (idea.lilt ?? 0)) * six : 0);
  }

  /** The lines to sing, per section of `list`; rendering starts in the background. */
  set(list: Idea[], words: GuideSungLine[][], high: HighVoice | null) {
    this.high = high;
    this.byStep = words.map((lines, si) => {
      const idea = list[si];
      const six = 15 / idea.song.bpm;
      const energy = idea.section ? (idea.section.energy - 1) / 4 : 0.5;
      const m = new Map<number, Placed[]>();
      for (const L of lines) {
        if (!L.notes.length) continue;
        const t0 = GuideVoice.at(idea, L.notes[0].step);
        const notes: SungNote[] = L.notes.map((n) => ({ t: GuideVoice.at(idea, n.step) - t0, end: GuideVoice.at(idea, n.step + n.len) - t0, midi: n.midi, vel: n.vel, syl: n.syl }));
        const key = `${high ?? 'cornell'}|${idea.song.genre}|${energy}|${six.toFixed(5)}|${notes.map((n) => `${n.t.toFixed(4)},${n.end.toFixed(4)},${n.midi},${n.vel},${n.syl.onset.join('')}${n.syl.vowel}${n.syl.coda.join('')}`).join(';')}`;
        const p: Placed = { key, notes, t0, idea, energy };
        const first = Math.max(0, L.notes[0].step - Math.ceil(PRE / six));
        (m.get(first) ?? m.set(first, []).get(first)!).push(p);
        if (!this.bufs.has(key)) this.queue.push(p);
      }
      return m;
    });
    if (!this.working) void this.work();
  }

  private async work() {
    this.working = true;
    while (this.queue.length) {
      const p = this.queue.shift()!;
      if (!this.bufs.has(p.key)) this.bufs.set(p.key, this.render(p));
      // (a breather between lines, so playback never waits on it)
      await new Promise((r) => setTimeout(r, 0));
    }
    this.working = false;
  }

  private render(p: Placed): AudioBuffer {
    let seed = 0;
    for (let i = 0; i < p.key.length; i += 7) seed = (seed * 31 + p.key.charCodeAt(i)) >>> 0;
    const base = p.idea.song.genre as Genre;
    // (the Cornell voice; sung high: the woman's, the Cornell voice an octave up)
    const voice = this.high === 'woman' ? fofFor(base, seed % 97, true, 'woman') : fofFor(base, seed % 97, false, 'cornell');
    const raw = renderFof(p.notes, { ...voice, energy: p.energy }, PRE);
    const pcm = polishVoice(raw, FOF_RATE, polishFor(p.idea, true, p.notes.some((n) => n.vel >= 0.85)));
    const ctx = this.ctx.rawContext as unknown as BaseAudioContext;
    const buf = ctx.createBuffer(1, pcm.length, FOF_RATE);
    buf.copyToChannel(pcm as Float32Array<ArrayBuffer>, 0);
    return buf;
  }

  /** Start the lines that begin at step `g` of section `si` (the tick's audio time `time`). */
  playStep(si: number, g: number, time: number) {
    const lines = this.byStep[si]?.get(g);
    if (!lines) return;
    const raw = this.ctx.rawContext as unknown as BaseAudioContext;
    for (const p of lines) {
      // (not rendered yet: render it now, it's short)
      let buf = this.bufs.get(p.key);
      if (!buf) { buf = this.render(p); this.bufs.set(p.key, buf); }
      const start = time + (p.t0 - PRE - GuideVoice.at(p.idea, g));
      const src = raw.createBufferSource();
      src.buffer = buf;
      Tone.connect(src, this.vol);
      const when = Math.max(time, start);
      src.start(when, Math.max(0, when - start));
      this.sources.add(src);
      src.onended = () => { src.disconnect(); this.sources.delete(src); };
    }
  }

  releaseAll() {
    for (const s of this.sources) { try { s.stop(); } catch { /* already stopped */ } }
    this.sources.clear();
  }
}
