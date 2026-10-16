// The Guide line sung (experiment): the line's words (words.ts) sung in any of the singer's voices (Paul:
// "give me the other voices in there too"): the Cornell voice he tuned, the other characters, each genre's
// voice (Auto: the song's own; the woman's when the line is sung high), or the clear first voice. Each line
// rendered once in the background and kept, polished like the vocals, started on the step that leaves room
// for its lead-in.

import * as Tone from 'tone';
import type { Idea } from '../idea';
import type { Genre } from '../genres';
import type { HighVoice, Timbre } from '../parts/singers';
import { FOF_RATE } from '../audio/fof';
import { CHARACTERS, type Character, fofFor } from '../audio/voices';
import { polishVoice } from '../audio/polish';
import { polishFor } from '../audio/singer';
import { SING_RATE, type SungNote } from '../audio/sing';
import { type RenderJob, singPool } from '../audio/singPool';
import type { GuideSungLine } from './words';
import { DOWN } from './line';
import { feelFor, feelSung, inhale } from './feel';

/** Seconds of lead-in before a line's first note (onset consonants, a breath). */
const PRE = 0.3;
/** The highest the woman's voice sings the line (G5): a line written higher than an octave under it is sung as written. */
const WOMAN_TOP = 79;

/** Which voice sings the line: Auto (the song's genre voice), the clear voice, a genre's, or a character. */
export type GuideSing = 'auto' | Timbre | Character;
const isCharacter = (v: string): v is Character => v in CHARACTERS;

interface Placed { key: string; notes: SungNote[]; t0: number; idea: Idea; energy: number; sung: Timbre | Character; breath: number }

export class GuideVoice {
  private ctx = Tone.getContext();
  private vol: Tone.Volume;
  private bufs = new Map<string, AudioBuffer>();
  private byStep: Map<number, Placed[]>[] = [];
  private queue: Placed[] = [];
  /** Lines being made in the background workers (singPool.ts), by key. */
  private pending = new Map<string, Promise<void>>();
  private sources = new Set<AudioBufferSourceNode>();
  /** Bumped on a stop: a line arriving late doesn't start after it. */
  private session = 0;

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
  set(list: Idea[], words: GuideSungLine[][], choice: GuideSing, high: HighVoice | null, feel = false, carryFade = false) {
    const top = Math.max(0, ...words.flat().flatMap((l) => l.notes.map((n) => n.midi)));
    this.byStep = words.map((lines, si) => {
      const idea = list[si];
      // (Auto: the song's own genre voice, or the woman's when the line is sung high)
      const sung: Timbre | Character = choice !== 'auto' ? choice : high === 'woman' ? 'woman' : idea.song.genre;
      // (the woman sings the line an octave up, in her own range, unless it's already written up there)
      const shift = sung === 'woman' && top + DOWN <= WOMAN_TOP ? DOWN : 0;
      const six = 15 / idea.song.bpm;
      const energy = idea.section ? (idea.section.energy - 1) / 4 : 0.5;
      const m = new Map<number, Placed[]>();
      // (human feel: this singer's, at this section's energy)
      const fl = feel ? feelFor(sung === 'clear' ? 'clear' : sung, energy, idea.song.bpm) : null;
      let lastEnd = -Infinity;
      for (const L of lines) {
        if (!L.notes.length) continue;
        const t0 = GuideVoice.at(idea, L.notes[0].step);
        // (a breath in before a line after a rest of half a second or more)
        const restBefore = t0 - lastEnd;
        lastEnd = GuideVoice.at(idea, L.notes[L.notes.length - 1].step + L.notes[L.notes.length - 1].len);
        let notes: SungNote[] = L.notes.map((n) => ({ t: GuideVoice.at(idea, n.step) - t0, end: GuideVoice.at(idea, n.step + n.len) - t0, midi: n.midi + shift, vel: n.vel, syl: n.syl,
          // (a bend: glided into over its length, as the line plays it)
          ...(n.bend ? { bend: GuideVoice.at(idea, n.step + n.bend) - GuideVoice.at(idea, n.step) } : {}),
          // (the Vocal tune's Bends: the vocal's own scoop in and fall off)
          ...(n.slide ? { slide: n.slide } : {}), ...(n.fall ? { fall: n.fall } : {}) }));
        // (a short breath between words, Paul: the word before let go a moment early; the tune's timing kept)
        for (let j = 1; j < notes.length; j++) {
          const p = notes[j - 1], q = notes[j];
          if (q.syl.wordStart && q.syl.text !== '~' && Math.abs(p.end - q.t) < 1e-6) p.end -= Math.min(0.05, 0.2 * (p.end - p.t));
        }
        if (fl) notes = feelSung(notes, fl, si * 1000 + L.notes[0].step);
        // (Vocal tune: the section's last line carried on into a section it sits out fades away over the part past this one's end)
        if (carryFade && L === lines[lines.length - 1] && !words[si + 1]?.length) {
          const last = notes[notes.length - 1], past = notes[notes.length - 1].end - (GuideVoice.at(idea, idea.song.total) - t0);
          if (past > 0.3) notes[notes.length - 1] = { ...last, fade: Math.max(last.fade ?? 0, Math.min(past, last.end - last.t - 0.05)) };
        }
        const breath = fl && restBefore >= 0.5 ? fl.breath : 0;
        const key = `${sung}|${idea.song.genre}|${energy}|${six.toFixed(5)}|${notes.map((n) => `${n.t.toFixed(4)},${n.end.toFixed(4)},${n.midi},${n.vel},${n.bend?.toFixed(3) ?? ""},${n.fade?.toFixed(2) ?? ''},${n.slide ?? ''},${n.fall ?? ''},${n.syl.onset.join('')}${n.syl.vowel}${n.syl.coda.join('')}`).join(';')}${fl ? `|feel${breath}|${notes.map((n) => `${n.t.toFixed(4)},${n.vel.toFixed(3)},${n.slide?.toFixed(3) ?? ''},${n.fall?.toFixed(3) ?? ''},${n.swell?.toFixed(3) ?? ''},${n.fade?.toFixed(3) ?? ''},${n.sharp?.toFixed(1) ?? ''}`).join(';')}` : ''}`;
        const p: Placed = { key, notes, t0, idea, energy, sung, breath };
        // (a line starting between steps (the Vocal tune's triplets): from the step before)
        const first = Math.max(0, Math.floor(L.notes[0].step - Math.ceil(PRE / six)));
        (m.get(first) ?? m.set(first, []).get(first)!).push(p);
        if (!this.bufs.has(key)) this.queue.push(p);
      }
      return m;
    });
    this.work();
  }

  /** Hand the waiting lines to the background workers, in the song's order. */
  private work() {
    let order = 0;
    for (const p of this.queue.splice(0)) {
      if (this.bufs.has(p.key) || this.pending.has(p.key)) continue;
      const { job, seed } = this.spec(p);
      this.pending.set(p.key, singPool().render(job, order++).then((d) => { this.bufs.set(p.key, this.finish(p, d.pcm, job.rate, seed)); })
        .finally(() => this.pending.delete(p.key)));
    }
  }

  /** What the background worker needs to make a line (the voice only: the breath and polish are added here, quickly). */
  private spec(p: Placed): { job: RenderJob; seed: number } {
    let seed = 0;
    for (let i = 0; i < p.key.length; i += 7) seed = (seed * 31 + p.key.charCodeAt(i)) >>> 0;
    const base = p.idea.song.genre as Genre;
    const v = seed % 97;
    // (the clear voice: the formant synth; the others: the FOF singer, a character on top of the song's genre voice)
    const clear = p.sung === 'clear';
    const rate = clear ? SING_RATE : FOF_RATE;
    const job: RenderJob = clear ? { kind: 'line', notes: p.notes, pre: PRE, rate, shape: { high: false, slides: 0.5, seed: v } }
      : { kind: 'fof', notes: p.notes, pre: PRE, rate, fof: { ...(isCharacter(p.sung) ? fofFor(base, v, p.sung === 'woman', p.sung) : fofFor(p.sung as Genre, v, false)), energy: p.energy } };
    return { job, seed };
  }

  /** The made line: a breath in before it (human feel), polished like the vocals. */
  private finish(p: Placed, raw: Float32Array, rate: number, seed: number): AudioBuffer {
    // (human feel: a breath in just before the line, in its lead-in)
    if (p.breath) {
      let peak = 0;
      for (let i = 0; i < raw.length; i++) peak = Math.max(peak, Math.abs(raw[i]));
      const len = 0.22, br = inhale(rate, len, seed), at = Math.round((PRE - len - 0.06) * rate);
      for (let i = 0; i < br.length; i++) if (at + i >= 0 && at + i < raw.length) raw[at + i] += br[i] * peak * 0.06 * p.breath;
    }
    const pcm = polishVoice(raw, rate, polishFor(p.idea, true, p.notes.some((n) => n.vel >= 0.85)));
    const ctx = this.ctx.rawContext as unknown as BaseAudioContext;
    const buf = ctx.createBuffer(1, pcm.length, rate);
    buf.copyToChannel(pcm as Float32Array<ArrayBuffer>, 0);
    return buf;
  }

  /** Start the lines that begin at step `g` of section `si` (the tick's audio time `time`). */
  playStep(si: number, g: number, time: number) {
    const lines = this.byStep[si]?.get(g);
    if (!lines) return;
    const raw = this.ctx.rawContext as unknown as BaseAudioContext;
    for (const p of lines) {
      const start = time + (p.t0 - PRE - GuideVoice.at(p.idea, g));
      const buf = this.bufs.get(p.key);
      if (!buf) {
        // (still being made: never made on the spot, which held up the band; it comes in once it's ready)
        if (!this.pending.has(p.key)) { this.queue.push(p); this.work(); }
        const s = this.session;
        void this.pending.get(p.key)?.then(() => { if (s === this.session && this.bufs.has(p.key)) this.start(this.bufs.get(p.key)!, start, this.ctx.now() + 0.05, raw); });
        continue;
      }
      this.start(buf, start, time, raw);
    }
  }

  private start(buf: AudioBuffer, start: number, time: number, raw: BaseAudioContext) {
    {
      if (start + buf.duration <= time) return;
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
    this.session++;
    for (const s of this.sources) { try { s.stop(); } catch { /* already stopped */ } }
    this.sources.clear();
  }
}
