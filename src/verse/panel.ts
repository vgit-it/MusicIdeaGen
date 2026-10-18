// The new verse melody writer's own card (experiment): plays over the band the generator made, with the
// band's own samples. Rule 1: an 8th note on the 5th of every chord. Verse sections (and a lone idea) only.

import type { Engine } from '../audio/engine';
import type { Idea } from '../idea';
import * as Tone from 'tone';
import { autoMood } from '../tension';
import { writeWords, type Words } from './words';
import { Singer } from '../audio/singer';
import type { VocalNote } from '../parts/vocal';
import { VerseSynth } from './synth';
import { NOTE_NAMES } from '../theory';
import { DEFAULT_RANGE, addBends, bandAccents, quarterOf, addNeighbours, foldIntoRange, limitSame, planPhrases, randomHolds, randomRuns, randomTones, verseOverBand, phraseEndings, smallBreaks, thirdBars, voiceLead, walkToNext, withGaps, withHolds, withRuns, type BandNote, type BarTone, type BendAmount, type Range, type Gap, type ChordNote } from './verse';

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
  let wordsOn = true;
  let bends: BendAmount = 'some';
  let singer: Singer | null = null;
  let out: Tone.Gain | null = null;
  const six = () => 15 / Tone.getTransport().bpm.value;
  let cache = new WeakMap<Idea, BandNote[]>();
  let range: Range = { ...DEFAULT_RANGE };
  const gapCache = new WeakMap<Idea, { phrases: Gap[]; breaks: Gap[]; runs: Gap[]; holds: Gap[]; tones: ChordNote[]; bars: BarTone[] }>();

  root.innerHTML = `
    <h2>Verse melody <span class="exp">experiment</span></h2>
    <p class="hint">A new vocal melody writer, built one rule at a time. Plays over the band. Rule 1: an 8th note on the 5th of every chord. Rule 2: phrases of 1–4 bars with a break after each (¼ bar up to a whole bar). Rule 3: runs of 16th notes (⅛, ¼ or ½ bar), fewer in high-energy verses. Rule 4: each bar sits on the root, 3rd or 5th, or moves between them (1→3, 5→3 ...). Rule 5: some long notes. Rule 6: smooth steps between bars. Rule 7: small 8th and 16th breaks; never more than 4 of one kind of note in a row. Rule 8: a bar's core note, now and then one scale step up or down from it. Rule 9: inside a phrase, the end of a bar walks by scale steps into the next bar's core note. Rule 10: now and then a bar is three even notes, a third of a bar each. Rule 11: some phrases end on a held core note, a beat to a bar long. The band's drums and chords are one factor in the choices below (a nudge, never a rule). Rule 13: bends (scoops and falls) at good spots, Auto voice only. Throughout: a lean (not a rule) to more notes in the 1st and 3rd quarter of a bar, longer notes or silence in the 2nd and 4th.</p>
    <button id="v-add" class="small">+ Add verse melody</button>
    <div id="v-body" hidden>
      <div class="guiderow">
        <button id="v-gen" class="primary small" title="A new song (as Generate above), played from the start">Generate &amp; play</button>
        <button id="v-play" class="secondary small">Play</button>
        <label title="Auto voice: the song's own singer sings the line on 'la'. Synth: a plain tone. Mute the main vocal above to hear the line alone">Sound <select id="v-sing" class="gsing"><option value="sing">Auto voice</option><option value="synth">Synth</option></select></label>
        <label title="Words: the line sung as pseudo-English words set to its rhythm and breaks. La: every note on 'la'">Sing <select id="v-words" class="gsing"><option value="words">Words</option><option value="la">La</option></select></label>
        <label title="Bends: the voice scoops into some notes (from below or above) and falls off some held endings. Only the Auto voice bends, not the synth">Bends <select id="v-bends" class="gsing"><option value="off">Off</option><option value="some" selected>Some</option><option value="lots">Lots</option></select></label>
        <label class="grow">Volume <input type="range" id="v-vol" min="0" max="100" value="${level}"></label>
        <button id="v-remove" class="small">Remove</button>
      </div>
      <div class="guiderow" title="The line stays between Bottom and Top, and strays into the extended zone only when that saves a big leap. It never goes past the extended limits.">
        <label class="grange">Bottom <input type="range" id="v-lo" min="40" max="84" value="${range.lo}"> <b id="v-lo-o"></b></label>
        <label class="grange">Top <input type="range" id="v-hi" min="52" max="96" value="${range.hi}"> <b id="v-hi-o"></b></label>
        <label class="grange">Extended bottom <input type="range" id="v-xlo" min="36" max="84" value="${range.xlo}"> <b id="v-xlo-o"></b></label>
        <label class="grange">Extended top <input type="range" id="v-xhi" min="52" max="100" value="${range.xhi}"> <b id="v-xhi-o"></b></label>
      </div>
      <p class="hint" id="v-lyrics" style="white-space:pre-line"></p>
      <p class="hint" id="v-info" style="white-space:pre-line"></p>
    </div>`;
  const $ = (id: string) => root.querySelector<HTMLElement>('#' + id)!;

  const chordsOf = (idea: Idea) => idea.chords.chordIdx.map((i) => idea.chords.timeline[i].chord);
  /** How hard the band hits on each step (drums, chord changes, strum, bass): one more factor in the verse's rhythm. */
  const accents = new WeakMap<Idea, number[]>();
  const accOf = (idea: Idea): number[] => {
    let a = accents.get(idea);
    if (!a) {
      const { kick, snare } = idea.drums;
      a = bandAccents(idea.chords.chordIdx.length, { kick, snare, strum: idea.strum, bass: idea.bass, changes: idea.chords.timeline.map((e) => e.step) });
      accents.set(idea, a);
    }
    return a;
  };
  /** The gaps, 16th-note runs, long notes and chord notes in an idea's verse (the same every time for the same song). */
  const planFor = (idea: Idea) => {
    let p = gapCache.get(idea);
    if (!p) {
      const total = idea.chords.chordIdx.length, bar = barOf(idea), seed = `${idea.seeds.song}|${idea.seeds.chords}`;
      const { phrases, breaks } = planPhrases(total, bar, seed, accOf(idea));
      const runs = randomRuns(total, bar, idea.section?.energy ?? 3, breaks, seed, accOf(idea));
      const { tones, bars } = randomTones(total, bar, seed, accOf(idea));
      p = { phrases, breaks, runs, holds: randomHolds(total, bar, breaks, runs, tones, chordsOf(idea), seed, accOf(idea)), tones, bars };
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
      const shaped = thirdBars(phraseEndings(limitSame(smallBreaks(foldIntoRange(walkToNext(addNeighbours(voiceLead(withHolds(plain, holds), range), key, mode, barOf(idea), seed), phrases, key, mode, barOf(idea), seed), range), phrases, barOf(idea), seed, accOf(idea))), phrases, barOf(idea), seed), phrases, barOf(idea), seed);
      n = addBends(shaped, phrases, barOf(idea), { amount: bends, energy: idea.section?.energy ?? 3, genre: idea.song.genre, chordAt, tones, changes: idea.chords.timeline.map((e) => e.step) }, seed);
      cache.set(idea, n);
    }
    return n;
  };
  /** The idea with the verse line as its vocal (what the singer sings): 'la' on each note, a breath every 4 bars. */
  let sung = new WeakMap<Idea, Idea>();
  let wordsCache = new WeakMap<Idea, Words>();
  const la: VocalNote['syl'] = { onset: ['L'], vowel: 'AA', coda: [], stress: false, text: 'la', wordStart: true };
  /** The words for an idea's verse: set to the line's rhythm and breaks, in the song's mood and genre. */
  const wordsFor = (idea: Idea): Words => {
    let w = wordsCache.get(idea);
    if (!w) {
      w = writeWords(notesFor(idea), planFor(idea).phrases, barOf(idea), { mood: autoMood(idea.song, idea.seeds.song), genre: idea.song.genre }, range.hi - 4, `${idea.seeds.song}|${idea.seeds.chords}`, accOf(idea));
      wordsCache.set(idea, w);
    }
    return w;
  };
  const singable = (idea: Idea): Idea => {
    let d = sung.get(idea);
    if (!d) {
      const w = wordsOn ? wordsFor(idea) : null;
      const vocal: VocalNote[] = notesFor(idea).map((n, i) => ({ step: n.step, len: n.len, midi: n.midi, vel: w && !w.syls[i].stress ? 0.68 : 0.82, syl: w ? w.syls[i] : la, start: w ? w.starts[i] : n.step % 64 === 0, ...(n.slide ? { slide: n.slide } : {}), ...(n.fall ? { fall: n.fall } : {}) }));
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
    if (!first) { $('v-info').textContent = 'No verse in this song.'; $('v-lyrics').textContent = ''; return; }
    $('v-lyrics').textContent = wordsOn ? wordsFor(first).lines.map((l, i) => `${i + 1}  ${l}`).join('\n') : '';
    const bar = barOf(first), { phrases, breaks, runs, holds, bars } = planFor(first);
    const notes = notesFor(first);
    $('v-info').textContent = [
      `Phrases (bar from–to): ${phrases.map((p) => `${pos(p.step, bar)}–${pos(p.step + p.len, bar)}`).join(' · ')}`,
      `Breaks after: ${breaks.map((g) => `${+(g.len / (bar / 4)).toFixed(2)} beat${g.len === bar / 4 ? '' : 's'}`).join(' · ')}`,
      `Chord note per bar: ${bars.join(' · ')}`,
      `Range ${notes.length ? `${noteName(Math.min(...notes.map((n) => n.midi)))}–${noteName(Math.max(...notes.map((n) => n.midi)))}` : "none"}, ${notes.filter((n) => n.midi < range.lo || n.midi > range.hi).length} notes in the extended zone`,
      `${notes.length} notes (${notes.filter((n) => n.nb).length} neighbour, ${walks(notes, bar)}, ${notes.filter((n) => n.third).length / 3} third-bar shapes) · energy ${first.section?.energy ?? 3} · 16th runs: ${runs.length ? runs.map((g) => at(g, bar)).join(', ') : 'none'}`,
      `On the band's hits: ${Math.round((100 * notes.filter((n) => accOf(first)[Math.floor(n.step + 1e-6)] >= 0.5).length) / Math.max(1, notes.length))}% of notes start on a drum or chord hit (${Math.round((100 * accOf(first).filter((a) => a >= 0.5).length) / accOf(first).length)}% of steps are one)`,
      `Bends (${notes.filter((n) => n.bend).length}): ${notes.filter((n) => n.bend).map((n) => `${pos(n.step, bar)} ${n.bend} ${n.fall ? `falls ${n.fall}` : n.slide! > 0 ? `from ${n.slide} below` : `from ${-n.slide!} above`}`).join(', ') || 'none'}`,
      `Notes starting in each quarter of the bar: ${[0, 1, 2, 3].map((q) => notes.filter((n) => quarterOf(n.step, bar) === q).length).join(' · ')}`,
      `Held phrase endings (${notes.filter((n) => n.end).length} of ${phrases.length} phrases): ${notes.filter((n) => n.end).map((n) => `${pos(n.step + n.len, bar)} (${+(n.len / (bar / 4)).toFixed(1)} beats)`).join(', ') || 'none'}`,
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
    cache = new WeakMap(); sung = new WeakMap(); wordsCache = new WeakMap();
    info(); prepare();
  };
  for (const k of ['lo', 'hi', 'xlo', 'xhi'] as const) $('v-' + k).addEventListener('input', (e) => setRange(k, +(e.target as HTMLInputElement).value));
  showRange();
  $('v-words').addEventListener('change', (e) => { wordsOn = (e.target as HTMLSelectElement).value === 'words'; sung = new WeakMap(); singer?.releaseAll(); info(); prepare(); });
  $('v-bends').addEventListener('change', (e) => { bends = (e.target as HTMLSelectElement).value as BendAmount; cache = new WeakMap(); sung = new WeakMap(); wordsCache = new WeakMap(); singer?.releaseAll(); info(); prepare(); });
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
