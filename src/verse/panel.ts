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
import { DEFAULT_RANGE, quarterOf, type BandNote, type BendAmount, type Gap, type Range } from './verse';
import type { Built } from './build';
import { accentsOf, barOf, buildSection, chordsKey, chorusMaster, hookSig, isChorus, personalityOf, type SectionOptions } from './section';
import type { Variation } from './form';
import { describe, dialsFor } from './personality';

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
  // (human feel, as the main vocal has it: glides, scoops, swells into words, fades at word ends, a breath in; Auto voice only)
  let humanFeel = true;
  // (every note from the key's pentatonic scale)
  let pentatonic = false;
  let singer: Singer | null = null;
  let out: Tone.Gain | null = null;
  const six = () => 15 / Tone.getTransport().bpm.value;
  let cache = new WeakMap<Idea, Built>();
  let meta = true;
  let variation: Variation = 'some';
  let range: Range = { ...DEFAULT_RANGE };

  root.innerHTML = `
    <h2>Verse melody <span class="exp">experiment</span></h2>
    <p class="hint">A new vocal melody writer, built one rule at a time. Plays over the band. Rule 1: an 8th note on the 5th of every chord. Rule 2: phrases of 1–4 bars with a break after each (¼ bar up to a whole bar). Rule 3: runs of 16th notes (⅛, ¼ or ½ bar), fewer in high-energy verses. Rule 4: each bar sits on the root, 3rd or 5th, or moves between them (1→3, 5→3 ...). Rule 5: some long notes. Rule 6: smooth steps between bars. Rule 7: small 8th and 16th breaks; never more than 4 of one kind of note in a row. Rule 8: a bar's core note, now and then one scale step up or down from it. Rule 9: inside a phrase, the end of a bar walks by scale steps into the next bar's core note. Rule 10: now and then a bar is three even notes, a third of a bar each. Rule 11: some phrases end on a held core note, a beat to a bar long. The band's drums and chords are one factor in the choices below (a nudge, never a rule). Rule 14: the form, meta-phrases (4+4, 8+8...) with the second answering the first and varying. Rule 13: bends (scoops, and held endings fading out in volume) at good spots, Auto voice only. Rule 15: bends inside held notes, to the next chord note or the next bar's core note, likelier on longer notes and after repeated notes. Rule 16: the chorus, with its own hook (a chant, a long-note anthem, a leap and fall, or pushed rhythm), its height, and its own ways of ending phrases; every song draws a personality, so two songs rarely share much. Rule 17: the chorus holds plain 8ths into longer notes (fewer, longer notes, more bends). Rule 20 (a constraint): no short stray bit of singing, under a quarter bar, with silence either side. Rule 19: a chorus phrase often opens on one long note (scooped or bent now and then), with shorter notes after it. Rule 18: every chorus of a song is the song's last chorus's melody over its own chords, and 25–45% of it (drawn per song, mostly nearer 25) is left without vocals. Throughout: a lean (not a rule) to more notes in the 1st and 3rd quarter of a bar, longer notes or silence in the 2nd and 4th.</p>
    <button id="v-add" class="small">+ Add verse melody</button>
    <div id="v-body" hidden>
      <div class="guiderow">
        <button id="v-gen" class="primary small" title="A new song (as Generate above), played from the start">Generate &amp; play</button>
        <button id="v-play" class="secondary small">Play</button>
        <label title="Auto voice: the song's own singer sings the line on 'la'. Synth: a plain tone. Mute the main vocal above to hear the line alone">Sound <select id="v-sing" class="gsing"><option value="sing">Auto voice</option><option value="synth">Synth</option></select></label>
        <label title="Words: the line sung as pseudo-English words set to its rhythm and breaks. La: every note on 'la'">Sing <select id="v-words" class="gsing"><option value="words">Words</option><option value="la">La</option></select></label>
        <label title="Bends: the voice scoops into some notes (from below or above) and fades out some held endings (in volume, not pitch). Only the Auto voice bends, not the synth">Bends <select id="v-bends" class="gsing"><option value="off">Off</option><option value="some" selected>Some</option><option value="lots">Lots</option></select></label>
        <label title="Human feel: the voice sings as the main vocal does: gliding between notes, scooping into some words, swelling into words and fading at their ends, a breath in before a line. Auto voice only">Human feel <select id="v-feel" class="gsing"><option value="on" selected>On</option><option value="off">Off</option></select></label>
        <label title="Notes: All, or only the key's pentatonic scale (major pentatonic 1 2 3 5 6, or minor 1 b3 4 5 b7). Pentatonic limits every note, the chord notes, steps, neighbours, walks, endings and bends included: a chord note outside the scale gives way to another chord note in it, or the nearest scale note">Notes <select id="v-pent" class="gsing"><option value="all" selected>All</option><option value="pent">Pentatonic only</option></select></label>
        <label title="Meta-phrases: the bars are grouped (8 bars: 4+4; 16: 8+8, each 4+4) and the second half answers the first with variations. Off: one long verse with no grouping">Meta-phrases <select id="v-meta" class="gsing"><option value="on" selected>On</option><option value="off">Off</option></select></label>
        <label title="How much the answering half changes: Little keeps almost everything, Lots changes most things (the phrasing mostly stays)">Variation <select id="v-var" class="gsing"><option value="little">Little</option><option value="some" selected>Some</option><option value="lots">Lots</option></select></label>
        <label class="grow">Volume <input type="range" id="v-vol" min="0" max="100" value="${level}"></label>
        <button id="v-remove" class="small">Remove</button>
      </div>
      <div class="guiderow" style="display:none" title="The line stays between Bottom and Top, and strays into the extended zone only when that saves a big leap. It never goes past the extended limits.">
        <label class="grange">Bottom <input type="range" id="v-lo" min="40" max="84" value="${range.lo}"> <b id="v-lo-o"></b></label>
        <label class="grange">Top <input type="range" id="v-hi" min="52" max="96" value="${range.hi}"> <b id="v-hi-o"></b></label>
        <label class="grange">Extended bottom <input type="range" id="v-xlo" min="36" max="84" value="${range.xlo}"> <b id="v-xlo-o"></b></label>
        <label class="grange">Extended top <input type="range" id="v-xhi" min="52" max="100" value="${range.xhi}"> <b id="v-xhi-o"></b></label>
      </div>
      <p class="hint" id="v-lyrics" style="white-space:pre-line"></p>
      <p class="hint" id="v-info" style="white-space:pre-line"></p>
    </div>`;
  const $ = (id: string) => root.querySelector<HTMLElement>('#' + id)!;

  /** How hard the band hits on each 16th step: one more factor in the line's rhythm. */
  const accents = new WeakMap<Idea, number[]>();
  const accOf = (idea: Idea): number[] => {
    let a = accents.get(idea);
    if (!a) { a = accentsOf(idea); accents.set(idea, a); }
    return a;
  };
  const opts = (): SectionOptions => ({ range, bends, meta, variation, pentatonic });
  const persFor = personalityOf;
  const hookSigOf = (idea: Idea) => hookSig(idea, opts());
  let hooks = new Map<string, Built>();
  let hookWords = new Map<string, Words>();
  /** The verse or chorus over an idea, built leaf by leaf (build.ts): the form, then the rules in each leaf. Same song, same line. */
  const builtFor = (idea: Idea): Built => {
    let b = cache.get(idea);
    if (!b) {
      // (a chorus is built like the song's last one: its melody over this chorus's chords; two with the same chords are one build)
      const master = isChorus(idea) ? chorusMaster(list, idea, opts()) : idea;
      const sig = isChorus(idea) ? `${hookSigOf(idea)}|${chordsKey(idea)}` : '';
      b = sig ? hooks.get(sig) : undefined;
      if (!b) {
        b = buildSection(idea, opts(), accOf(master), master !== idea ? master : undefined);
        if (sig) hooks.set(sig, b);
      }
      cache.set(idea, b);
    }
    return b;
  };
  const notesFor = (idea: Idea): BandNote[] => builtFor(idea).notes;
  /** The idea with the verse line as its vocal (what the singer sings): 'la' on each note, a breath every 4 bars. */
  let sung = new WeakMap<Idea, Idea>();
  let wordsCache = new WeakMap<Idea, Words>();
  const la: VocalNote['syl'] = { onset: ['L'], vowel: 'AA', coda: [], stress: false, text: 'la', wordStart: true };
  /** The words for an idea's verse or chorus: set to the line's rhythm and breaks, in the song's mood and genre. A chorus repeats its lines more. */
  const wordsFor = (idea: Idea): Words => {
    let w = wordsCache.get(idea);
    if (!w) {
      // (choruses with the same rhythm sing the same words; one over other chords that moves a note has its own)
      const chorus = isChorus(idea), sig = chorus ? `${hookSigOf(idea)}|${notesFor(idea).map((n) => `${n.step}:${n.len}`).join(',')}` : '';
      w = chorus ? hookWords.get(sig) : undefined;
      if (!w) {
        w = writeWords(notesFor(idea), builtFor(idea).phrases, barOf(idea), { mood: autoMood(idea.song, idea.seeds.song), genre: idea.song.genre }, range.hi + dialsFor(chorus ? 'chorus' : 'verse', persFor(idea)).lift - 4, chorus ? hookSigOf(idea) : `${idea.seeds.song}|${idea.seeds.chords}`, accOf(idea), chorus ? 0.9 : 0.6);
        if (chorus) hookWords.set(sig, w);
      }
      wordsCache.set(idea, w);
    }
    return w;
  };
  /** A held ending's fall: it dies away in volume over the last half of the note (or of its tail, if a bend split it). */
  const fadeOf = (n: BandNote, len: number): Partial<VocalNote> => (n.fadeBy ? { fade: Math.min(len, Math.max(1, Math.round(n.len / 2))), fadeBy: n.fadeBy } : {});
  const singable = (idea: Idea): Idea => {
    let d = sung.get(idea);
    if (!d) {
      const w = wordsOn ? wordsFor(idea) : null;
      const vocal: VocalNote[] = notesFor(idea).flatMap((n, i) => {
        const syl = w ? w.syls[i] : la, vel = w && !w.syls[i].stress ? 0.68 : 0.82;
        const head: VocalNote = { step: n.step, len: n.len, midi: n.midi, vel, syl, start: w ? w.starts[i] : n.step % 64 === 0, ...(n.slide ? { slide: n.slide } : {}), ...fadeOf(n, n.len) };
        if (n.bendTo === undefined) return [head];
        // (an 8th bends from its first moment: one note, scooped into from its own pitch, slowly)
        if (n.bendAt === 0) return [{ ...head, midi: n.bendTo, slide: n.bendTo - n.midi, slideLen: n.bendLen }];
        // (a bend inside the note: it holds, then the same word goes on to the new pitch, gliding to it)
        head.len = n.bendAt!;
        delete head.fade;
        delete head.fadeBy;
        head.syl = { ...syl, coda: [] };
        const tail: VocalNote = { step: n.step + n.bendAt!, len: n.len - n.bendAt!, midi: n.bendTo, vel, syl: { onset: [], vowel: syl.vowel, coda: syl.coda, stress: false, text: '~', wordStart: false }, start: false, bend: n.bendLen, ...fadeOf(n, n.len - n.bendAt!) };
        return [head, tail];
      });
      d = { ...idea, vocal, backing: undefined, vocalDouble: false, sung: undefined, section: undefined };
      sung.set(idea, d);
    }
    return d;
  };
  const prepare = () => { if (on && sing && singer) singer.prepare(list.filter(sings).map(singable), six); };
  const sings = (idea: Idea) => !idea.section || idea.section.kind === 'verse' || idea.section.kind === 'chorus';

  const pos = (step: number, bar: number) => +(step / bar + 1).toFixed(2);
  const at = (g: Gap, bar: number) => `${pos(g.step, bar)} (${bar / g.len > 6 ? '⅛' : bar / g.len > 3 ? '¼' : '½'} bar)`;
  /** "walks: 2→3 (2 steps), ...": the bars whose end walks into the next bar's core. */
  const walks = (notes: BandNote[], bar: number) => {
    const by = new Map<number, number>();
    for (const n of notes) if (n.walk) by.set(Math.floor(n.step / bar), (by.get(Math.floor(n.step / bar)) ?? 0) + 1);
    return by.size ? `walks into bar ${[...by].map(([b, c]) => `${b + 2} (${c} step${c > 1 ? 's' : ''})`).join(', ')}` : 'no walks';
  };
  /** What the card shows about one section: its form, phrases, notes and the rules' choices. */
  const report = (first: Idea): string[] => {
    const bar = barOf(first), built = builtFor(first), { phrases, breaks, runs, holds, bars, leaves } = built;
    const notes = built.notes;
    return [
      `Form: ${leaves.map((l) => `${l.name} (bars ${l.from + 1}–${l.from + l.bars}${l.source === null ? '' : `, varies ${leaves.find((x) => x.id === l.source)!.name}: ${l.varied.join(', ') || 'nothing'}`})`).join(' · ')}`,
      `Phrases (bar from–to): ${phrases.map((p) => `${pos(p.step, bar)}–${pos(p.step + p.len, bar)}`).join(' · ')}`,
      `Breaks after: ${breaks.map((g) => `${+(g.len / (bar / 4)).toFixed(2)} beat${g.len === bar / 4 ? '' : 's'}`).join(' · ')}`,
      `Chord note per bar: ${bars.join(' · ')}`,
      `Range ${notes.length ? `${noteName(Math.min(...notes.map((n) => n.midi)))}–${noteName(Math.max(...notes.map((n) => n.midi)))}` : "none"}, ${notes.filter((n) => n.midi < range.lo || n.midi > range.hi).length} notes in the extended zone`,
      `${notes.length} notes (${notes.filter((n) => n.nb).length} neighbour, ${walks(notes, bar)}, ${notes.filter((n) => n.third).length / 3} third-bar shapes) · energy ${first.section?.energy ?? 3} · 16th runs: ${runs.length ? runs.map((g) => at(g, bar)).join(', ') : 'none'}`,
      `On the band's hits: ${Math.round((100 * notes.filter((n) => accOf(first)[Math.floor(n.step + 1e-6)] >= 0.5).length) / Math.max(1, notes.length))}% of notes start on a drum or chord hit (${Math.round((100 * accOf(first).filter((a) => a >= 0.5).length) / accOf(first).length)}% of steps are one)`,
      `Bends (${notes.filter((n) => n.bend).length}): ${notes.filter((n) => n.bend).map((n) => `${pos(n.step, bar)} ${n.bend} ${n.fadeBy ? `fades out ${n.fadeBy} dB` : n.slide! > 0 ? `from ${n.slide} below` : `from ${-n.slide!} above`}`).join(', ') || 'none'}`,
      `Bends inside notes (${notes.filter((n) => n.inner).length}): ${notes.filter((n) => n.inner).map((n) => `${pos(n.step, bar)} ${n.inner} (${n.bendTo! > n.midi ? '+' : ''}${n.bendTo! - n.midi}, note ${+(n.len / (bar / 4)).toFixed(1)} beats, ${n.bendAt === 0 ? 'bends from its start' : `bends after ${+(n.bendAt! / (bar / 4)).toFixed(2)} beats`})`).join(', ') || 'none'}`,
      `Notes starting in each quarter of the bar: ${[0, 1, 2, 3].map((q) => notes.filter((n) => quarterOf(n.step, bar) === q).length).join(' · ')}`,
      `Phrase endings (${notes.filter((n) => n.end).length} of ${phrases.length} phrases): ${notes.filter((n) => n.end).map((n) => `${pos(n.step + n.len, bar)} ${n.style ?? 'held'} (${+(n.len / (bar / 4)).toFixed(1)} beats)`).join(', ') || 'none'}`,
      `Long notes: ${holds.length ? holds.map((g) => `${pos(g.step, bar)} (${+(g.len / (bar / 4)).toFixed(1)} ${g.len === bar / 4 ? 'beat' : 'beats'})`).join(', ') : 'none'}`,
    ];
  };

  const info = () => {
    const verse = list.find((i) => sings(i) && !isChorus(i)), chorus = list.find(isChorus), any = verse ?? chorus;
    if (!any) { $('v-info').textContent = 'No verse in this song.'; $('v-lyrics').textContent = ''; return; }
    $('v-lyrics').textContent = wordsOn ? [verse && ['VERSE', verse], chorus && ['CHORUS', chorus]].filter((x): x is [string, Idea] => !!x).map(([t, i]) => `${t}\n${wordsFor(i).lines.map((l, k) => `${k + 1}  ${l}`).join('\n')}`).join('\n\n') : '';
    const lines = [`This song: ${describe(persFor(any))}`];
    if (verse) lines.push('', 'VERSE', ...report(verse));
    if (chorus) lines.push('', 'CHORUS', `Chorus range lifted ${dialsFor('chorus', persFor(chorus)).lift} semitones`, ...report(chorus));
    $('v-info').textContent = lines.join('\n');
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
      if (!singer) { out = new Tone.Gain((level / 100) ** 2).connect(engine.mixer.sectionLevel); singer = new Singer(out, 'lead'); singer.humanFeel = humanFeel; }
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
    cache = new WeakMap(); sung = new WeakMap(); wordsCache = new WeakMap(); hooks = new Map(); hookWords = new Map();
    info(); prepare();
  };
  for (const k of ['lo', 'hi', 'xlo', 'xhi'] as const) $('v-' + k).addEventListener('input', (e) => setRange(k, +(e.target as HTMLInputElement).value));
  showRange();
  $('v-words').addEventListener('change', (e) => { wordsOn = (e.target as HTMLSelectElement).value === 'words'; sung = new WeakMap(); singer?.releaseAll(); info(); prepare(); });
  $('v-bends').addEventListener('change', (e) => { bends = (e.target as HTMLSelectElement).value as BendAmount; cache = new WeakMap(); sung = new WeakMap(); wordsCache = new WeakMap(); hooks = new Map(); hookWords = new Map(); singer?.releaseAll(); info(); prepare(); });
  const rebuild = () => { cache = new WeakMap(); sung = new WeakMap(); wordsCache = new WeakMap(); hooks = new Map(); hookWords = new Map(); singer?.releaseAll(); info(); prepare(); };
  $('v-feel').addEventListener('change', (e) => { humanFeel = (e.target as HTMLSelectElement).value === 'on'; if (singer) singer.humanFeel = humanFeel; singer?.releaseAll(); prepare(); });
  $('v-pent').addEventListener('change', (e) => { pentatonic = (e.target as HTMLSelectElement).value === 'pent'; rebuild(); });
  $('v-meta').addEventListener('change', (e) => { meta = (e.target as HTMLSelectElement).value === 'on'; rebuild(); });
  $('v-var').addEventListener('change', (e) => { variation = (e.target as HTMLSelectElement).value as Variation; rebuild(); });
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
