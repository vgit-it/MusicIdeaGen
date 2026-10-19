// The lead singer (docs/VOCAL.md, "The main vocal"): sings each section's lead vocal as it's sung (idea.sung,
// src/parts/leadvocal.ts: the vocal's tune with new words, more bends, carried over into a solo now and then), in the
// singer's voice (Auto: the song's own genre voice, or the woman's when the singer sings high), with human feel.
// Each line rendered once in the background (singPool.ts), polished like the vocals, started on the step that leaves
// room for its lead-in. Was the Guide card's singer (the experiment); now the main vocal, live and in exports.

import * as Tone from 'tone';
import type { Idea } from '../idea';
import type { Genre } from '../genres';
import { type Timbre, leadHigh } from '../parts/singers';
import { FOF_RATE } from './fof';
import { CHARACTERS, type Character, fofFor, fofHighVoice } from './voices';
import { polishVoice } from './polish';
import { polishFor, type TimbreChoice, type VocalChoice } from './singer';
import { SING_RATE, type SungNote } from './sing';
import { type RenderJob, singPool } from './singPool';
import { DOWN } from '../guide/line';
import { feelFor, feelSung, inhale } from '../guide/feel';
import { lagFor, perform } from './feel';
import { inContext } from './context';

/** Seconds of lead-in before a line's first note (onset consonants, a breath). */
const PRE = 0.3;
/** The highest the woman's voice sings the line (G5): a line written higher than an octave under it is sung as written. */
const WOMAN_TOP = 79;
/** The singer's level (dB): as the Guide card had it (its fader at 70). */
const LEVEL = -4.2;

const isCharacter = (v: string): v is Character => v in CHARACTERS;

type Voice = Timbre | Character | 'tenor';
interface Placed { key: string; notes: SungNote[]; t0: number; idea: Idea; energy: number; sung: Voice; breath: number }

export class LeadVoice {
  readonly kind = 'singer';
  /** The singer: Auto (the song's), a low or high voice, or off. */
  choice: VocalChoice = 'auto';
  /** The voice: Auto (the song's own genre voice), or one of the singer's voices. */
  timbre: TimbreChoice = 'auto';
  /** (always polished: kept for the engine's Prepare button) */
  polish = false;
  private ctx = Tone.getContext();
  private vol!: Tone.Volume;
  private bufs = new Map<string, AudioBuffer>();
  private byIdea = new WeakMap<Idea, { sig: string; byStep: Map<number, Placed[]> }>();
  private queue: Placed[] = [];
  /** Lines being made in the background workers, by key; and which idea each belongs to. */
  private pending = new Map<string, Promise<void>>();
  private pendingOf = new Map<string, Idea>();
  private sources = new Set<AudioBufferSourceNode>();
  /** Bumped on a stop: a line arriving late doesn't start after it. */
  private session = 0;

  constructor(out: Tone.InputNode) {
    inContext(this.ctx, () => { this.vol = new Tone.Volume(LEVEL).connect(out); });
  }

  /** The step's time in seconds, swung as the band plays it. */
  private static at(idea: Idea, g: number) {
    const six = 15 / idea.song.bpm;
    const w = Math.floor(g);
    const t = (x: number) => x * six + (x % 2 ? (idea.song.swing * (2 / 3) + (idea.lilt ?? 0)) * six : 0);
    return w === g ? t(g) : t(w) + (g - w) * (t(w + 1) - t(w));
  }

  /** Every line asked for so far made (an offline render waits for this). */
  async load(): Promise<void> {
    while (this.pending.size) await Promise.allSettled([...this.pending.values()]);
  }

  /** Before playing from `idea`: its lines first, waited for (at most `maxMs`). */
  async readyFor(idea: Idea, maxMs = 8000): Promise<void> {
    if (this.choice === 'off') return;
    const keys = new Set([...this.pendingOf].filter(([, i]) => i === idea).map(([k]) => k));
    if (!keys.size) return;
    singPool().hurry((j) => keys.has((j as RenderJob & { key?: string }).key ?? ''));
    const wait = Promise.allSettled([...keys].map((k) => this.pending.get(k)).filter(Boolean));
    await Promise.race([wait, new Promise((r) => setTimeout(r, maxMs))]);
  }

  /** (the lines are polished as they're made) */
  async polishAll() { await this.load(); }

  /** Render every line the list sings (in the background). */
  prepare(list: Idea[], _six?: (idea: Idea) => number) {
    if (this.choice === 'off') return;
    list.forEach((idea, i) => this.linesFor(idea, list[i + 1] ?? null, i * 10000));
    this.work();
  }

  /** An idea's lines, indexed by the step that starts them (`next`: the section after, for a carried-over line's fade). */
  private linesFor(idea: Idea, next: Idea | null, order = 0) {
    const sig = `${this.choice}|${this.timbre}|${next ? (next.sung?.length ?? 0) : -1}`;
    const got = this.byIdea.get(idea);
    if (got && got.sig === sig) return got.byStep;
    const lines = idea.sung ?? [];
    const high = leadHigh(idea, this.choice, this.timbre);
    // (the verse melody writer's lead is sung as the experiment sang it: its high voices, at a middling energy, laid back behind the beat)
    const verse = idea.opts?.vocalWriter !== 'classic';
    // (Auto: the song's own genre voice, or the high singer's when the singer sings high)
    const sung: Voice = this.timbre !== 'auto' ? this.timbre : high === 'woman' ? 'woman' : verse && high === 'chester' ? 'scream' : verse && high === 'tenor' ? 'tenor' : idea.song.genre;
    // (the woman sings the line an octave up, in her own range, unless the song's line is already up there)
    const shift = sung === 'woman' && (idea.sungTop ?? 0) + DOWN <= WOMAN_TOP ? DOWN : 0;
    const six = 15 / idea.song.bpm;
    const energy = idea.section && !verse ? (idea.section.energy - 1) / 4 : 0.5;
    const lag = verse ? Math.max(0, lagFor(idea.seeds.vocal ?? idea.seeds.song) + (idea.vocalLay ?? 0)) : 0;
    const byStep = new Map<number, Placed[]>();
    // (human feel: this singer's, at this section's energy)
    const fl = feelFor(sung === 'clear' ? 'clear' : sung === 'tenor' ? idea.song.genre : sung, energy, idea.song.bpm);
    const at = (g: number) => LeadVoice.at(idea, g);
    let lastEnd = -Infinity;
    for (const L of lines) {
      if (!L.notes.length) continue;
      const t0 = at(L.notes[0].step);
      // (a breath in before a line after a rest of half a second or more)
      const restBefore = t0 - lastEnd;
      lastEnd = at(L.notes[L.notes.length - 1].step + L.notes[L.notes.length - 1].len);
      let notes: SungNote[] = L.notes.map((n) => ({ t: at(n.step) - t0, end: at(n.step + n.len) - t0, midi: n.midi + shift, vel: n.vel, syl: n.syl,
        ...(n.bend ? { bend: at(n.step + n.bend) - at(n.step) } : {}),
        ...(n.slide ? { slide: n.slide } : {}), ...(n.fall ? { fall: n.fall } : {}),
        ...(n.slideLen ? { slideLen: at(n.step + n.slideLen) - at(n.step) } : {}), ...(n.fade ? { fade: at(n.step + n.len) - at(n.step + n.len - n.fade), fadeBy: n.fadeBy } : {}) }));
      // (laid back behind the beat, long-short after a stressed word, slowing at the line's end: as the experiment's singer)
      if (verse) notes = perform(notes, lag, L.notes[0].step + L.notes.length * 7, 0);
      // (a short breath between words: the word before let go a moment early; the tune's timing kept)
      for (let j = 1; j < notes.length; j++) {
        const p = notes[j - 1], q = notes[j];
        if (q.syl.wordStart && q.syl.text !== '~' && Math.abs(p.end - q.t) < 1e-6) p.end -= Math.min(0.05, 0.2 * (p.end - p.t));
      }
      const pre = notes;
      notes = feelSung(notes, fl, order + L.notes[0].step).map((n, j) => {
        const b = pre[j];
        // (the verse melody's own fade at a held ending is the longer one: it keeps it, and its depth; no extra fall on top)
        if (b.fade) { if (b.fade >= (n.fade ?? 0)) { n.fade = b.fade; n.fadeBy = b.fadeBy; } if (b.fall === undefined) delete n.fall; }
        return n;
      });
      // (the section's last line carried on into a section it sits out fades away over the part past this one's end)
      if (!verse && L === lines[lines.length - 1] && !next?.sung?.length) {
        const last = notes[notes.length - 1], past = last.end - (at(idea.song.total) - t0);
        if (past > 0.3) notes[notes.length - 1] = { ...last, fade: Math.max(last.fade ?? 0, Math.min(past, last.end - last.t - 0.05)), fadeBy: undefined };
      }
      const breath = restBefore >= 0.5 ? fl.breath : 0;
      const key = `${sung}|${idea.song.genre}|${energy}|${six.toFixed(5)}|${notes.map((n) => `${n.t.toFixed(4)},${n.end.toFixed(4)},${n.midi},${n.vel},${n.bend?.toFixed(3) ?? ''},${n.fade?.toFixed(2) ?? ''},${n.fadeBy ?? ''},${n.gain ?? ''},${n.slide ?? ''},${n.slideLen?.toFixed(3) ?? ''},${n.fall ?? ''},${n.syl.onset.join('')}${n.syl.vowel}${n.syl.coda.join('')}`).join(';')}|${breath.toFixed(2)}`;
      const p: Placed = { key, notes, t0, idea, energy, sung, breath };
      // (a line starting between steps: from the step before)
      const first = Math.max(0, Math.floor(L.notes[0].step - Math.ceil(PRE / six)));
      (byStep.get(first) ?? byStep.set(first, []).get(first)!).push(p);
      if (!this.bufs.has(key)) { this.queue.push(p); this.pendingOf.set(key, idea); }
    }
    this.byIdea.set(idea, { sig, byStep });
    return byStep;
  }

  /** Hand the waiting lines to the background workers, in the song's order. */
  private work() {
    let order = 0;
    for (const p of this.queue.splice(0)) {
      if (this.bufs.has(p.key) || this.pending.has(p.key)) continue;
      const { job, seed } = this.spec(p);
      const key = p.key;
      this.pending.set(key, singPool().render(Object.assign(job, { key }), order++).then((d) => { this.bufs.set(key, this.finish(p, d.pcm, job.rate, seed)); })
        .finally(() => { this.pending.delete(key); this.pendingOf.delete(key); }));
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
      : { kind: 'fof', notes: p.notes, pre: PRE, rate, fof: { ...(p.sung === 'tenor' ? fofHighVoice('tenor', base, v) : isCharacter(p.sung) ? fofFor(base, v, p.sung === 'woman', p.sung) : fofFor(p.sung as Genre, v, false)), energy: p.energy } };
    return { job, seed };
  }

  /** The made line: a breath in before it (human feel), polished like the vocals. */
  private finish(p: Placed, raw: Float32Array, rate: number, seed: number): AudioBuffer {
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

  /** Start the lines that begin at step `g` of `idea` (the tick's audio time `time`). */
  playStep(idea: Idea, g: number, time: number, _six?: number) {
    if (this.choice === 'off') return;
    const byStep = this.byIdea.get(idea)?.byStep ?? this.linesFor(idea, null);
    const lines = byStep.get(g);
    if (!lines) return;
    const raw = this.ctx.rawContext as unknown as BaseAudioContext;
    for (const p of lines) {
      const start = time + (p.t0 - PRE - LeadVoice.at(p.idea, g));
      const buf = this.bufs.get(p.key);
      if (!buf) {
        // (still being made: never made on the spot; it comes in once it's ready)
        if (!this.pending.has(p.key)) { this.queue.push(p); this.work(); }
        const s = this.session;
        void this.pending.get(p.key)?.then(() => { if (s === this.session && this.bufs.has(p.key)) this.start(this.bufs.get(p.key)!, start, this.ctx.now() + 0.05, raw); });
        continue;
      }
      this.start(buf, start, time, raw);
    }
  }

  private start(buf: AudioBuffer, start: number, time: number, raw: BaseAudioContext) {
    if (start + buf.duration <= time) return;
    const src = raw.createBufferSource();
    src.buffer = buf;
    Tone.connect(src, this.vol);
    const when = Math.max(time, start);
    src.start(when, Math.max(0, when - start));
    this.sources.add(src);
    src.onended = () => { src.disconnect(); this.sources.delete(src); };
  }

  releaseAll(time?: number, fade = 0) {
    this.session++;
    for (const s of this.sources) { try { s.stop(time !== undefined ? time + fade : undefined); } catch { /* already stopped */ } }
    this.sources.clear();
  }
}
