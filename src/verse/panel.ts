// The new verse melody writer's own card (experiment): plays over the band the generator made, with the
// band's own samples. Rule 1: an 8th note on the 5th of every chord. Verse sections (and a lone idea) only.

import type { Engine } from '../audio/engine';
import type { Idea } from '../idea';
import * as Tone from 'tone';
import { Singer } from '../audio/singer';
import type { VocalNote } from '../parts/vocal';
import { VerseSynth } from './synth';
import { NOTE_NAMES } from '../theory';
import { DEFAULT_RANGE, addNeighbours, foldIntoRange, limitSame, planPhrases, randomHolds, randomRuns, randomTones, verseOverBand, smallBreaks, thirdBars, voiceLead, walkToNext, withGaps, withHolds, withRuns, type BandNote, type BarTone, type Range, type Gap, type ChordNote } from './verse';

export interface VersePanel {
  /** Show the song's verse notes again after new music. */
  update(list: Idea[]): void;
  setPlaying(on: boolean): void;
}

export interface VerseControls {
  generateAndPlay(): Promise<void>;
  /** Play or stop, from the song's start. */
  playFromStart(): Promise<void>;
}

export function buildVersePanel(root: HTMLElement, engine: Engine, ctl: VerseControls): VersePanel {
  let on = false, level = 70, list: Idea[] = [];
  let synth: VerseSynth | null = null;
  // (sung: the song's own Auto voice on the line, as "la"; off: the synth)
  let sing = true;
  let singer: Singer | null = null;
  let out: Tone.Gain | null = null;
  const six = () => 15 / Tone.getTransport().bpm.value;
  let cache = new WeakMap<Idea, BandNote[]>();
  let range: Range = { ...DEFAULT_RANGE };
  const gapCache = new WeakMap<Idea, { phrases: Gap[]; breaks: Gap[]; runs: Gap[]; holds: Gap[]; tones: ChordNote[]; bars: BarTone[] }>();

  root.innerHTML = `
    <h2>Verse melody <span class="exp">experiment</span></h2>
    <p class="hint">A new vocal melody writer, built one rule at a time. Plays over the band. Rule 1: an 8th note on the 5th of every chord. Rule 2: phrases of 1–4 bars with a break after each (¼ bar up to a whole bar). Rule 3: runs of 16th notes (⅛, ¼ or ½ bar), fewer in high-energy verses. Rule 4: each bar sits on the root, 3rd or 5th, or moves between them (1→3, 5→3 ...). Rule 5: some long notes. Rule 6: smooth steps between bars. Rule 7: small 8th and 16th breaks; never more than 4 of one kind of note in a row. Rule 8: a bar's core note, now and then one scale step up or down from it. Rule 9: inside a phrase, the end of a bar walks by scale steps into the next bar's core note. Rule 10: now and then a bar is three even notes, a third of a bar each.</p>
    <button id="v-add" class="small">+ Add verse melody</button>
    <div id="v-body" hidden>
      <div class="guiderow">
        <button id="v-gen" class="primary small" title="A new song (as Generate above), played from the start">Generate &amp; play</button>
        <button id="v-play" class="secondary small">Play</button>
        <label title="Auto voice: the song's own singer sings the line on 'la'. Synth: a plain tone. Mute the main vocal above to hear the line alone">Sound <select id="v-sing" class="gsing"><option value="sing">Auto voice</option><option value="synth">Synth</option></select></label>
        <label class="grow">Volume <input type="range" id="v-vol" min="0" max="100" value="${level}"></label>
        <button id="v-remove" class="small">Remove</button>
      </div>
      <div class="guiderow" title="The line stays between Bottom and Top, and strays into the extended zone only when that saves a big leap. It never goes past the extended limits.">
        <label class="grange">Bottom <input type="range" id="v-lo" min="40" max="84" value="${range.lo}"> <b id="v-lo-o"></b></label>
        <label class="grange">Top <input type="range" id="v-hi" min="52" max="96" value="${range.hi}"> <b id="v-hi-o"></b></label>
        <label class="grange">Extended bottom <input type="range" id="v-xlo" min="36" max="84" value="${range.xlo}"> <b id="v-xlo-o"></b></label>
        <label class="grange">Extended top <input type="range" id="v-xhi" min="52" max="100" value="${range.xhi}"> <b id="v-xhi-o"></b></label>
      </div>
      <p class="hint" id="v-info" style="white-space:pre-line"></p>
    </div>`;
  const $ = (id: string) => root.querySelector<HTMLElement>('#' + id)!;

  const chordsOf = (idea: Idea) => idea.chords.chordIdx.map((i) => idea.chords.timeline[i].chord);
  /** The gaps, 16th-note runs, long notes and chord notes in an idea's verse (the same every time for the same song). */
  const planFor = (idea: Idea) => {
    let p = gapCache.get(idea);
    if (!p) {
      const total = idea.chords.chordIdx.length, bar = barOf(idea), seed = `${idea.seeds.song}|${idea.seeds.chords}`;
      const { phrases, breaks } = planPhrases(total, bar, seed);
      const runs = randomRuns(total, bar, idea.section?.energy ?? 3, breaks, seed);
      const { tones, bars } = randomTones(total, bar, seed);
      p = { phrases, breaks, runs, holds: randomHolds(total, bar, breaks, runs, tones, chordsOf(idea), seed), tones, bars };
      gapCache.set(idea, p);
    }
    return p;
  };
  /** The verse over an idea: 8ths on the chosen chord note, 16ths in the runs, long notes, nothing in the gaps, led by step. */
  const notesFor = (idea: Idea): BandNote[] => {
    let n = cache.get(idea);
    if (!n) {
      const chordAt = chordsOf(idea), { key, mode } = idea.song, { phrases, breaks, runs, holds, tones } = planFor(idea), seed = `${idea.seeds.song}|${idea.seeds.chords}`;
      const plain = withRuns(withGaps(verseOverBand(key, chordAt, tones), breaks), runs, key, chordAt, tones);
      n = thirdBars(limitSame(smallBreaks(foldIntoRange(walkToNext(addNeighbours(voiceLead(withHolds(plain, holds), range), key, mode, barOf(idea), seed), phrases, key, mode, barOf(idea), seed), range), phrases, seed)), phrases, barOf(idea), seed);
      cache.set(idea, n);
    }
    return n;
  };
  /** The idea with the verse line as its vocal (what the singer sings): 'la' on each note, a breath every 4 bars. */
  let sung = new WeakMap<Idea, Idea>();
  const la: VocalNote['syl'] = { onset: ['L'], vowel: 'AA', coda: [], stress: false, text: 'la', wordStart: true };
  const singable = (idea: Idea): Idea => {
    let d = sung.get(idea);
    if (!d) {
      const vocal: VocalNote[] = notesFor(idea).map((n) => ({ step: n.step, len: n.len, midi: n.midi, vel: 0.8, syl: la, start: n.step % 64 === 0 }));
      d = { ...idea, vocal, backing: undefined, vocalDouble: false, sung: undefined, section: undefined };
      sung.set(idea, d);
    }
    return d;
  };
  const prepare = () => { if (on && sing && singer) singer.prepare(list.filter(sings).map(singable), six); };
  const sings = (idea: Idea) => !idea.section || idea.section.kind === 'verse';

  const barOf = (idea: Idea) => Math.max(4, Math.round(idea.chords.chordIdx.length / 8));
  const pos = (step: number, bar: number) => +(step / bar + 1).toFixed(2);
  const at = (g: Gap, bar: number) => `${pos(g.step, bar)} (${bar / g.len > 6 ? '⅛' : bar / g.len > 3 ? '¼' : '½'} bar)`;
  /** "walks: 2→3 (2 steps), ...": the bars whose end walks into the next bar's core. */
  const walks = (notes: BandNote[], bar: number) => {
    const by = new Map<number, number>();
    for (const n of notes) if (n.walk) by.set(Math.floor(n.step / bar), (by.get(Math.floor(n.step / bar)) ?? 0) + 1);
    return by.size ? `walks into bar ${[...by].map(([b, c]) => `${b + 2} (${c} step${c > 1 ? 's' : ''})`).join(', ')}` : 'no walks';
  };
  const info = () => {
    const first = list.find(sings);
    if (!first) { $('v-info').textContent = 'No verse in this song.'; return; }
    const bar = barOf(first), { phrases, breaks, runs, holds, bars } = planFor(first);
    const notes = notesFor(first);
    $('v-info').textContent = [
      `Phrases (bar from–to): ${phrases.map((p) => `${pos(p.step, bar)}–${pos(p.step + p.len, bar)}`).join(' · ')}`,
      `Breaks after: ${breaks.map((g) => `${+(g.len / (bar / 4)).toFixed(2)} beat${g.len === bar / 4 ? '' : 's'}`).join(' · ')}`,
      `Chord note per bar: ${bars.join(' · ')}`,
      `Range ${notes.length ? `${noteName(Math.min(...notes.map((n) => n.midi)))}–${noteName(Math.max(...notes.map((n) => n.midi)))}` : "none"}, ${notes.filter((n) => n.midi < range.lo || n.midi > range.hi).length} notes in the extended zone`,
      `${notes.length} notes (${notes.filter((n) => n.nb).length} neighbour, ${walks(notes, bar)}, ${notes.filter((n) => n.third).length / 3} third-bar shapes) · energy ${first.section?.energy ?? 3} · 16th runs: ${runs.length ? runs.map((g) => at(g, bar)).join(', ') : 'none'}`,
      `Long notes: ${holds.length ? holds.map((g) => `${pos(g.step, bar)} (${+(g.len / (bar / 4)).toFixed(1)} ${g.len === bar / 4 ? 'beat' : 'beats'})`).join(', ') : 'none'}`,
    ].join('\n');
  };

  // (chained: the Guide line card listens to the same steps)
  const before = engine.onStep;
  engine.onStep = (idea, idx, g, time, six) => {
    before?.(idea, idx, g, time, six);
    if (!on || !sings(idea)) return;
    if (sing && singer) { singer.playStep(singable(idea), g, time, six); return; }
    // (a third-bar note sits between the steps: played a fraction of a step late)
    if (synth) for (const n of notesFor(idea)) if (Math.floor(n.step + 1e-6) === g) synth.play(n.midi, time + Math.max(0, n.step - g) * six, n.len * six, 0.85);
  };

  const setOn = (v: boolean) => {
    on = v;
    $('v-body').hidden = !v;
    $('v-add').hidden = v;
    if (v) {
      synth ??= new VerseSynth(engine.mixer.sectionLevel); synth.setLevel(level);
      if (!singer) { out = new Tone.Gain((level / 100) ** 2).connect(engine.mixer.sectionLevel); singer = new Singer(out, 'lead'); }
      prepare();
    } else { synth?.releaseAll(); singer?.releaseAll(); }
    info();
  };
  $('v-add').addEventListener('click', () => setOn(true));
  $('v-remove').addEventListener('click', () => setOn(false));
  $('v-gen').addEventListener('click', () => { void ctl.generateAndPlay(); });
  $('v-play').addEventListener('click', () => { void ctl.playFromStart(); });
  const noteName = (m: number) => NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
  const showRange = () => {
    for (const k of ['lo', 'hi', 'xlo', 'xhi'] as const) {
      ($('v-' + k) as HTMLInputElement).value = String(range[k]);
      $(`v-${k}-o`).textContent = noteName(range[k]);
    }
  };
  /** Keep the four limits in order (the main range at least an octave, the extended limits outside it). */
  const setRange = (k: keyof Range, v: number) => {
    range[k] = v;
    if (k === 'lo' && range.hi < v + 12) range.hi = v + 12;
    if (k === 'hi' && range.lo > v - 12) range.lo = v - 12;
    range.xlo = Math.min(range.xlo, range.lo);
    range.xhi = Math.max(range.xhi, range.hi);
    showRange();
    cache = new WeakMap(); sung = new WeakMap();
    info(); prepare();
  };
  for (const k of ['lo', 'hi', 'xlo', 'xhi'] as const) $('v-' + k).addEventListener('input', (e) => setRange(k, +(e.target as HTMLInputElement).value));
  showRange();
  $('v-vol').addEventListener('input', (e) => { level = +(e.target as HTMLInputElement).value; synth?.setLevel(level); if (out) out.gain.value = (level / 100) ** 2; });
  $('v-sing').addEventListener('change', (e) => { sing = (e.target as HTMLSelectElement).value === 'sing'; synth?.releaseAll(); singer?.releaseAll(); prepare(); });

  return {
    update(l) { list = l; info(); prepare(); },
    setPlaying(v) {
      const b = $('v-play');
      b.textContent = v ? 'Stop' : 'Play';
      b.classList.toggle('on', v);
      if (!v) { synth?.releaseAll(); singer?.releaseAll(); } else prepare();
    },
  };
}
