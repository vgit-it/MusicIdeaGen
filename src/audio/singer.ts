// The demo singer as an instrument: each sung line is rendered ahead into a buffer (sing.ts) and
// started on time, a little before its first note so the onset consonants and a breath come first.
// Lines render in the background, a few at a time, as soon as a list is set; an offline render waits
// for all of them. Through a vocal chain: rumble cut, a little presence, gentle compression.
// Two of them: the lead singer (the lead, its double, the ad-libs) and the backing singer (harmonies,
// the gang, oohs), another person with their own voice, on their own mixer strip.
// The lead's voice: clear (the first one) or a genre's voice (voices.ts; on Auto, the song's genre's);
// the backing singer stays clear.

import * as Tone from 'tone';
import type { Genre } from '../genres';
import type { Idea } from '../idea';
import { type HighVoice, type Timbre, leadHigh } from '../parts/singers';
import { type VoiceType, backingVoice } from '../parts/vocal';
import { stepAt } from '../rhythm';
import { inContext } from './context';
import { lagFor, perform } from './feel';
import { FOF_RATE, renderFof } from './fof';
import { type PolishOpts, type VocalComp, type VocalFx, polishVoice } from './polish';
import { Rng } from '../rng';
import { CHARACTERS, type Character, VOICES, fofFor, fofHighVoice } from './voices';
import { SING_RATE, type SungNote, renderLine } from './sing';

export type VocalChoice = 'auto' | VoiceType | 'off';
export const VOCAL_CHOICES: { id: VocalChoice; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'low', label: 'Low voice' },
  { id: 'high', label: 'High voice' },
  { id: 'off', label: 'Off' },
];
export const BACKING_CHOICES: { id: VocalChoice; label: string }[] = [
  { id: 'auto', label: 'Auto (a second singer)' },
  { id: 'low', label: 'Low voice' },
  { id: 'high', label: 'High voice' },
  { id: 'off', label: 'Off' },
];

export type TimbreChoice = 'auto' | Timbre | Character;
/** The voice a line is sung in: the clear voice, a genre's, or a character on top of the song's. */
type Sung = Timbre | Character | 'tenor';
const isCharacter = (t: Sung): t is Character => t in CHARACTERS;
export const TIMBRE_CHOICES: { id: TimbreChoice; label: string }[] = [
  { id: 'auto', label: 'Auto (the genre’s voice)' },
  { id: 'clear', label: 'Clear (the first voice)' },
  ...(Object.keys(VOICES) as Genre[]).map((g) => ({ id: g, label: `${VOICES[g].label} voice` })),
  ...(Object.keys(CHARACTERS) as Character[]).map((c) => ({ id: c, label: `${CHARACTERS[c].label} voice` })),
];

export type SingerRole = 'lead' | 'backing';
/** The backing singer: a different person from the lead (another vocal tract length, breathier, less vibrato). */
const BACKING_PERSON = { tract: 1.06, breath: 5, vibrato: 0.55 };

/** Each genre's vocal compression (polish.ts), and the effect it sprinkles on a section. */
export const VOCAL_COMP: Record<Genre, VocalComp> = { rock: 'natural', pop: 'radio', funk: 'tight', hardrock: 'heavy', metal: 'heavy', grunge: 'dark', altmetal: 'heavy' };
const VOCAL_FX: Partial<Record<Genre, VocalFx>> = { pop: 'telephone', grunge: 'megaphone', altmetal: 'radio' };

/**
 * How an idea's lines are polished: its genre's compression; the effect on the first verse's lead lines
 * in about 6 songs in 10 (sprinkled: the full voice comes in after it), but not on a pushed line (`loud`):
 * the effect's drive over a belt or a scream turned it into noise (Paul: "the screams and all are
 * becoming noise"; its clarity measured 5-9 dB down).
 */
export function polishFor(idea: Idea, lead: boolean, loud = false): PolishOpts {
  const g = idea.song.genre;
  const fx = VOCAL_FX[g];
  const first = idea.section?.kind === 'verse' && (idea.section.label === 'Verse' || idea.section.label === 'Verse 1');
  const on = !!fx && lead && !loud && first && new Rng(`${idea.seeds.song}-vocalfx`).chance(0.6);
  return { comp: VOCAL_COMP[g], ...(on ? { fx } : {}) };
}

/** Seconds of lead-in before a line's first note (onset consonants, a breath). */
const PRE = 0.3;

/** How much each style slides into and off notes. */
const SLIDES: Record<Genre, number> = { rock: 0.6, pop: 0.4, funk: 0.3, hardrock: 0.5, metal: 0.3, grunge: 0.7, altmetal: 0.5 };

interface Job { key: string; notes: SungNote[]; voice: VoiceType; timbre: Sung; base: Genre; slides: number; variant: number; energy: number }
interface Line { first: number; key: string; notes: SungNote[]; t0: number; pan: number; gain: number; delay: number }

/** The voices around the lead: where each sits (pan), how loud, how late (a double is a second take), which take. */
const STREAMS = {
  lead: { pan: 0, gain: 1, delay: 0, variant: 0 },
  double: { pan: 0.45, gain: 0.5, delay: 0.017, variant: 1 },
  harmony: { pan: -0.45, gain: 0.55, delay: 0.009, variant: 2 },
  gang: { pan: -0.5, gain: 0.5, delay: 0.012, variant: 3 },
  ooh: { pan: -0.3, gain: 0.36, delay: 0, variant: 4 },
  adlib: { pan: 0.25, gain: 0.72, delay: 0, variant: 5 },
} as const;
type Stream = keyof typeof STREAMS;
const ROLE_STREAMS: Record<SingerRole, Stream[]> = { lead: ['lead', 'double', 'adlib'], backing: ['harmony', 'gang', 'ooh'] };

export class Singer {
  readonly kind = 'singer';
  state: 'ready' = 'ready';
  choice: VocalChoice = 'auto';
  /** The lead singer's choice (the backing singer picks its voice around the lead's). */
  leadChoice: VocalChoice = 'auto';
  /** The lead's voice (the backing singer's is always clear). */
  timbre: TimbreChoice = 'auto';
  private hp!: Tone.Filter;
  private ctx = Tone.getContext();
  private input!: Tone.Gain;
  private bufs = new Map<string, AudioBuffer>();
  /** Lines polished (polish.ts: cleaned up, through a vocal chain), once the sound is prepared. */
  private pol = new Map<string, AudioBuffer>();
  /** How each line is polished (its genre's compression, an effect). */
  private polOpts = new Map<string, PolishOpts>();
  /** Sing the polished lines (on with the Prepare button, and in exports made with it on). */
  polish = false;
  private lines = new WeakMap<Idea, { six: number; voice: VoiceType; timbre: Sung; byStep: Map<number, Line[]> }>();
  private sources = new Map<AudioBufferSourceNode, GainNode>();
  private queue: Job[] = [];
  private working: Promise<void> | null = null;

  constructor(out: Tone.InputNode, readonly role: SingerRole = 'lead') {
    const back = role === 'backing';
    inContext(this.ctx, () => {
      const comp = new Tone.Compressor({ threshold: -20, ratio: 3, attack: 0.008, release: 0.12 }).connect(out);
      // (backing vocals thinner and softer up top, so they sit behind the lead)
      const presence = new Tone.Filter({ type: 'peaking', frequency: 2900, Q: 1.2, gain: back ? -1.5 : 3 }).connect(comp);
      const mud = new Tone.Filter({ type: 'peaking', frequency: 320, Q: 1, gain: back ? -4 : -2 }).connect(presence);
      this.hp = new Tone.Filter({ type: 'highpass', frequency: back ? 170 : 110, Q: 0.7 }).connect(mud);
      this.input = new Tone.Gain(1).connect(this.hp);
    });
  }

  load(): Promise<void> {
    return this.working ?? Promise.resolve();
  }

  private voiceOf(idea: Idea): VoiceType {
    if (this.role === 'backing') return backingVoice(idea, this.leadChoice, this.choice);
    // (a high singer: the tenor an octave up as the high voice; Chester at the written pitch, the woman her own octave)
    const h = this.highOf(idea);
    if (h) return h === 'tenor' ? 'high' : 'low';
    return this.choice === 'low' || this.choice === 'high' ? this.choice : idea.vocalVoice ?? 'low';
  }

  /** The lead's high singer, if it's sung high (singers.ts: Chester, the rock tenor or the woman). */
  private highOf(idea: Idea): HighVoice | null {
    return this.role === 'lead' ? leadHigh(idea, this.choice, this.timbre) : null;
  }

  /** The genre voice a character sings on top of: the song's singer's own, or rock. */
  private baseOf(idea: Idea): Genre {
    return idea.vocalTimbre && idea.vocalTimbre !== 'clear' ? idea.vocalTimbre : 'rock';
  }

  private timbreOf(idea: Idea): Sung {
    if (this.role === 'backing') return 'clear';
    const h = this.highOf(idea);
    if (h) return h === 'chester' ? 'scream' : h;
    return this.timbre === 'auto' ? idea.vocalTimbre ?? 'clear' : this.timbre;
  }

  /** An idea's lines at this tempo, indexed by the step that starts them. */
  private linesFor(idea: Idea, six: number) {
    const voice = this.voiceOf(idea);
    const timbre = this.timbreOf(idea);
    const got = this.lines.get(idea);
    if (got && got.six === six && got.voice === voice && got.timbre === timbre) return got;
    const { song } = idea;
    // the band's swing and lilt move the off-beat 16ths, as the engine plays them
    const at = stepAt((g) => g * six + (g % 2 ? (song.swing * (2 / 3) + (idea.lilt ?? 0)) * six : 0));
    const byStep = new Map<number, Line[]>();
    const lag = lagFor(idea.seeds.vocal ?? idea.seeds.song);
    const slides = SLIDES[song.partGenres.strum];
    // (the section's energy, 0-1: the singer's tone moves with it)
    const energy = idea.section ? (idea.section.energy - 1) / 4 : 0.5;
    const base = this.baseOf(idea);
    // (in loud sections the singer rushes now and then, ahead of the beat; feel.ts)
    const rush = Math.max(0, Math.min(1, (energy - 0.5) * 2));
    // the lead, its double (choruses) and ad-libs; or the backing vocals by role; each as its own lines
    const mine = ROLE_STREAMS[this.role];
    const streams: [Stream, NonNullable<Idea['vocal']>][] = [];
    if (mine.includes('lead')) streams.push(['lead', idea.vocal ?? []]);
    if (mine.includes('double') && idea.vocalDouble) streams.push(['double', idea.vocal ?? []]);
    for (const role of ['harmony', 'gang', 'ooh', 'adlib'] as const) {
      const ns = mine.includes(role) ? (idea.backing ?? []).filter((n) => n.role === role) : [];
      if (ns.length) streams.push([role, ns]);
    }
    for (const [stream, ns] of streams) {
      const S = STREAMS[stream];
      const groups: NonNullable<Idea['vocal']>[] = [];
      for (const n of ns) {
        if (n.start || !groups.length) groups.push([]);
        groups[groups.length - 1].push(n);
      }
      for (const L of groups) {
        const t0 = at(L[0].step);
        // (as the singer feels it: laid back, long-short, slowing at the end; feel.ts)
        const notes: SungNote[] = perform(L.map((n) => ({ t: at(n.step) - t0, end: at(n.step + n.len) - t0, midi: n.midi, vel: n.vel, syl: n.syl, slide: n.slide, fall: n.fall })), lag, L[0].step + L.length * 7, rush);
        const popts = polishFor(idea, this.role === 'lead' && stream !== 'adlib', notes.some((n) => n.vel >= 0.85));
        // (an effect is part of the line: the same tune in another verse is another line)
        const key = `${voice}|${S.variant}|${timbre}|${energy}|${base}|${popts.fx ?? ''}|${six.toFixed(5)}|${slides}|${notes.map((n) => `${n.t.toFixed(4)},${n.end.toFixed(4)},${n.midi},${n.vel},${n.syl.onset.join('')}${n.syl.vowel}${n.syl.coda.join('')},${n.slide ?? ''},${n.fall ?? ''}`).join(';')}`;
        // started a little ahead of its first note, from the step that leaves room for the lead-in
        const first = Math.max(0, L[0].step - Math.ceil(PRE / six));
        const line: Line = { first, key, notes, t0, pan: S.pan, gain: S.gain, delay: S.delay };
        this.polOpts.set(key, popts);
        (byStep.get(first) ?? byStep.set(first, []).get(first)!).push(line);
        if (!this.bufs.has(key)) this.queue.push({ key, notes, voice, timbre, slides: stream === 'lead' || stream === 'adlib' ? slides : slides * 0.4, variant: S.variant, energy, base });
      }
    }
    const entry = { six, voice, timbre, byStep };
    this.lines.set(idea, entry);
    return entry;
  }

  /** Render every line the list sings (in the background; `load()` waits for it). */
  prepare(list: Idea[], six: (idea: Idea) => number) {
    if (this.choice === 'off') return;
    for (const idea of list) if (idea.vocal?.length || idea.backing?.length) this.linesFor(idea, six(idea));
    if (!this.working && this.queue.length) this.working = this.work();
  }

  private async work() {
    while (this.queue.length) {
      const job = this.queue.shift()!;
      if (!this.bufs.has(job.key)) this.bufs.set(job.key, this.render(job));
      if (this.polish) this.polished(job.key);
      // (a breather between lines, so playback never waits on it)
      await new Promise((r) => setTimeout(r, 0));
    }
    this.working = null;
  }

  /** A line's polished buffer (made now if it isn't yet: about a millisecond a second of audio). */
  private polished(key: string): AudioBuffer | undefined {
    const got = this.pol.get(key);
    if (got) return got;
    const raw = this.bufs.get(key);
    if (!raw) return undefined;
    const ctx = this.ctx.rawContext as unknown as BaseAudioContext;
    const buf = ctx.createBuffer(1, raw.length, raw.sampleRate);
    buf.copyToChannel(polishVoice(raw.getChannelData(0), raw.sampleRate, this.polOpts.get(key)) as Float32Array<ArrayBuffer>, 0);
    this.pol.set(key, buf);
    return buf;
  }

  /** Polish every line rendered so far (the rest are polished as they're rendered); with breathers. */
  async polishAll() {
    for (const key of [...this.bufs.keys()]) {
      if (this.pol.has(key)) continue;
      this.polished(key);
      await new Promise((r) => setTimeout(r, 0));
    }
    await this.working;
  }

  private render(job: Job): AudioBuffer {
    let seed = 0;
    for (let i = 0; i < job.key.length; i += 7) seed = (seed * 31 + job.key.charCodeAt(i)) >>> 0;
    // (each take its own: another vocal-tract length, vibrato rate and the odd different slide)
    const person = this.role === 'backing' ? BACKING_PERSON : undefined;
    // (a genre's voice: the FOF singer; the clear voice and the backing singer: the formant synth, as they were)
    const v = (seed + job.variant * 13) % 97;
    const fof = job.timbre !== 'clear' && this.role === 'lead';
    const pcm = fof ? renderFof(job.notes, { ...(job.timbre === 'tenor' ? fofHighVoice('tenor', job.base, v) : isCharacter(job.timbre) ? fofFor(job.base, v, job.voice === 'high', job.timbre) : fofFor(job.timbre as Genre, v, job.voice === 'high')), energy: job.energy }, PRE)
      : renderLine(job.notes, { high: job.voice === 'high', slides: job.slides, seed: v, person }, PRE);
    const raw = this.ctx.rawContext as unknown as BaseAudioContext;
    const buf = raw.createBuffer(1, pcm.length, fof ? FOF_RATE : SING_RATE);
    buf.copyToChannel(pcm as Float32Array<ArrayBuffer>, 0);
    return buf;
  }

  /** Start the lines that begin at step `g` of `idea` (the tick's audio time `time`). */
  playStep(idea: Idea, g: number, time: number, six: number) {
    if (this.choice === 'off' || !(idea.vocal?.length || idea.backing?.length)) return;
    const entry = this.linesFor(idea, six);
    const lines = entry.byStep.get(g);
    if (!lines) return;
    // (a genre's voice sings lower: it keeps more of its low end)
    if (this.role === 'lead') this.hp.frequency.value = entry.timbre === 'clear' ? 110 : 75;
    const raw = this.ctx.rawContext as unknown as BaseAudioContext;
    const at = (s: number) => s * six + (s % 2 ? (idea.song.swing * (2 / 3) + (idea.lilt ?? 0)) * six : 0);
    for (const line of lines) {
      // (not rendered yet: render it now, it's short)
      let buf = this.bufs.get(line.key);
      if (!buf) {
        buf = this.render({ key: line.key, notes: line.notes, voice: entry.voice, timbre: entry.timbre, slides: SLIDES[idea.song.partGenres.strum], variant: Number(line.key.split('|')[1]), energy: Number(line.key.split('|')[3]), base: line.key.split('|')[4] as Genre });
        this.bufs.set(line.key, buf);
      }
      if (this.polish) buf = this.polished(line.key) ?? buf;
      const start = time + (line.t0 - PRE - at(g)) + line.delay;
      const src = raw.createBufferSource();
      src.buffer = buf;
      // panned around the lead, at its level
      const pan = raw.createStereoPanner();
      pan.pan.value = line.pan;
      const gain = raw.createGain();
      gain.gain.value = line.gain;
      src.connect(gain).connect(pan);
      Tone.connect(pan, this.input);
      const when = Math.max(time, start);
      src.start(when, Math.max(0, when - start));
      this.sources.set(src, gain);
      src.onended = () => { src.disconnect(); gain.disconnect(); pan.disconnect(); this.sources.delete(src); };
    }
  }

  /** Stop every line sounding or about to (`fade`: faded out over that many seconds, no click). */
  releaseAll(time = this.ctx.now(), fade = 0) {
    for (const [s, g] of this.sources) {
      if (fade) { g.gain.cancelScheduledValues(time); g.gain.setValueAtTime(g.gain.value, time); g.gain.linearRampToValueAtTime(0, time + fade); }
      try { s.stop(time + fade); } catch { /* already stopped */ }
    }
  }
}
