// The new verse melody writer's own card (experiment): plays over the band the generator made, with the
// band's own samples. Rule 1: an 8th note on the 5th of every chord. Verse sections (and a lone idea) only.

import type { Engine } from '../audio/engine';
import type { Idea } from '../idea';
import * as Tone from 'tone';
import { Singer } from '../audio/singer';
import type { VocalNote } from '../parts/vocal';
import { VerseSynth } from './synth';
import { NOTE_NAMES } from '../theory';
import { verseOverBand, type BandNote } from './verse';

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
  const cache = new WeakMap<Idea, BandNote[]>();

  root.innerHTML = `
    <h2>Verse melody <span class="exp">experiment</span></h2>
    <p class="hint">A new vocal melody writer, built one rule at a time. Plays over the band. Rule 1: an 8th note on the 5th of every chord.</p>
    <button id="v-add" class="small">+ Add verse melody</button>
    <div id="v-body" hidden>
      <div class="guiderow">
        <button id="v-gen" class="primary small" title="A new song (as Generate above), played from the start">Generate &amp; play</button>
        <button id="v-play" class="secondary small">Play</button>
        <label title="Auto voice: the song's own singer sings the line on 'la'. Synth: a plain tone. Mute the main vocal above to hear the line alone">Sound <select id="v-sing" class="gsing"><option value="sing">Auto voice</option><option value="synth">Synth</option></select></label>
        <label class="grow">Volume <input type="range" id="v-vol" min="0" max="100" value="${level}"></label>
        <button id="v-remove" class="small">Remove</button>
      </div>
      <p class="hint" id="v-info"></p>
    </div>`;
  const $ = (id: string) => root.querySelector<HTMLElement>('#' + id)!;

  /** The verse over an idea: a note per 8th on the 5th of the chord sounding. */
  const notesFor = (idea: Idea): BandNote[] => {
    let n = cache.get(idea);
    if (!n) {
      const { timeline, chordIdx } = idea.chords;
      n = verseOverBand(idea.song.key, chordIdx.map((i) => timeline[i].chord));
      cache.set(idea, n);
    }
    return n;
  };
  /** The idea with the verse line as its vocal (what the singer sings): 'la' on each note, a breath every 4 bars. */
  const sung = new WeakMap<Idea, Idea>();
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

  const info = () => {
    const first = list.find(sings);
    $('v-info').textContent = first
      ? `Sits on ${[...new Set(notesFor(first).map((n) => NOTE_NAMES[n.midi % 12]))].join(', ')} · ${notesFor(first).length} notes a verse`
      : 'No verse in this song.';
  };

  // (chained: the Guide line card listens to the same steps)
  const before = engine.onStep;
  engine.onStep = (idea, idx, g, time, six) => {
    before?.(idea, idx, g, time, six);
    if (!on || !sings(idea)) return;
    if (sing && singer) { singer.playStep(singable(idea), g, time, six); return; }
    if (synth) for (const n of notesFor(idea)) if (n.step === g) synth.play(n.midi, time, n.len * six, 0.85);
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
