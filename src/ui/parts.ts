// Per-part strip: instrument, volume, mute, solo. Layers (piano, pad) can be added and removed.

import type { ChordChoice, Engine } from '../audio/engine';
import { MOVES, MOVE_IDS } from '../parts/moves';
import { ENERGY, ENERGY_IDS } from '../parts/energy';
import { BASS_INSTRUMENTS, type BassId, CHORD_INSTRUMENTS, DRUM_KITS, type DrumKitId } from '../audio/instruments';
import type { LayerPart, MixPart } from '../audio/mixer';
import { PAD_TONES } from '../audio/pad';
import { BACKING_CHOICES, TIMBRE_CHOICES, type TimbreChoice, VOCAL_CHOICES, type VocalChoice } from '../audio/singer';
import { KEYS_STYLES, PERC_STYLES, STRINGS_STYLES } from '../parts/layers';

interface PartDef {
  part: MixPart;
  label: string;
  options: { id: string; label: string }[];
  volume: number;
  onInstrument: (id: string) => void;
  /** A layer: starts removed, with an Add button. */
  layer?: { add: string; title: string };
}

export interface PartsPanel {
  /** Show the layers the engine has (after opening a shared link). */
  sync(): void;
}

/** `onChange`: something changed what plays or what's shown (instrument, a layer added or removed). */
/** How the tune is written, kept with the idea: its rhythm (Classic / Grid) and its pitches (Classic / Shaped). */
type VocalWriteKey = 'rhythm' | 'melody' | 'move' | 'energy';
export interface VocalWriteControl { get(k: VocalWriteKey): string; set(k: VocalWriteKey, v: string): void }

export function buildPartsPanel(root: HTMLElement, engine: Engine, onChange: () => void, write?: VocalWriteControl): PartsPanel {
  const defs: PartDef[] = [
    {
      part: 'vocal', label: 'Vocal (demo)', volume: 75, options: VOCAL_CHOICES,
      onInstrument: (id) => { engine.setVocal(id as VocalChoice); onChange(); },
    },
    {
      // (harmonies, the gang and oohs, sung by a second singer; the lead's ad-libs stay with the lead)
      part: 'backing', label: 'Backing vocals', volume: 65, options: BACKING_CHOICES,
      onInstrument: (id) => { engine.setBackingVocal(id as VocalChoice); onChange(); },
    },
    {
      part: 'chords', label: 'Rhythm', volume: 80,
      options: [{ id: 'auto', label: 'Auto (by genre and section)' }, ...CHORD_INSTRUMENTS],
      onInstrument: (id) => { engine.setChordInstrument(id as ChordChoice); onChange(); },
    },
    {
      part: 'guitar2', label: 'Guitar 2', volume: 80,
      options: [{ id: 'auto', label: 'Auto (by genre and section)' }, ...CHORD_INSTRUMENTS],
      onInstrument: (id) => { engine.setGuitar2Instrument(id as ChordChoice); onChange(); },
    },
    {
      part: 'drums', label: 'Drums', volume: 80, options: DRUM_KITS,
      onInstrument: (id) => engine.setDrums(id as DrumKitId),
    },
    {
      part: 'bass', label: 'Bass', volume: 80, options: BASS_INSTRUMENTS,
      onInstrument: (id) => engine.setBass(id as BassId),
    },
    {
      part: 'keys', label: 'Piano', volume: 70, options: KEYS_STYLES,
      layer: { add: '+ Add piano', title: 'A piano part on top of the band: chords, pulse, arpeggios or stabs to suit each section' },
      onInstrument: (id) => { engine.setLayer('keys', id as never); onChange(); },
    },
    {
      part: 'pad', label: 'Pad', volume: 70, options: PAD_TONES,
      layer: { add: '+ Add pad', title: 'A synth pad that holds the chords underneath everything' },
      onInstrument: (id) => { engine.setLayer('pad', id as never); onChange(); },
    },
    {
      part: 'strings', label: 'Strings', volume: 70, options: STRINGS_STYLES,
      layer: { add: '+ Add strings', title: 'A string section: held chords, swells, high violins or stabs to suit each section' },
      onInstrument: (id) => { engine.setLayer('strings', id as never); onChange(); },
    },
    {
      part: 'perc', label: 'Percussion', volume: 70, options: PERC_STYLES,
      layer: { add: '+ Add percussion', title: 'Tambourine, shaker, claps or congas, more of it in the bigger sections' },
      onInstrument: (id) => { engine.setLayer('perc', id as never); onChange(); },
    },
  ];

  root.innerHTML = '';
  const syncs: (() => void)[] = [];
  for (const d of defs) {
    const row = document.createElement('div');
    row.className = 'part' + (d.layer ? ' layer off' : '');
    row.innerHTML = `
      <span class="name">${d.label}</span>
      <span class="picks">
        <select aria-label="${d.label} ${d.layer ? 'style' : 'instrument'}">${d.options.map((o) => `<option value="${o.id}">${o.label}</option>`).join('')}</select>
        ${d.part === 'vocal' ? `<select class="timbre" aria-label="Vocal voice" title="The singer's voice: each genre has its own (made by ear: a warm rock voice that blends from low to high and changes gear past its break, grittier the harder it sings), or the clear first voice. Auto: the song's genre's voice.">${TIMBRE_CHOICES.map((o) => `<option value="${o.id}">${o.id === 'auto' ? 'Voice: Auto' : o.label}</option>`).join('')}</select><select class="vrhythm" aria-label="Vocal rhythm" title="How the vocal's rhythm is written. Classic: like speech. Grid: on the metronome's beats and 8ths (a word's syllables on 8ths; 16ths in slow songs), lines in pairs, verses busier than choruses."><option value="classic">Rhythm: Classic</option><option value="grid">Rhythm: Grid</option></select><select class="vmelody" aria-label="Vocal melody" title="How the vocal's notes are chosen. Classic: the first way. Shaped: a path of the chords' own notes with a short idea repeated and varied on it, low verses and choruses that lift, each genre's own moves."><option value="classic">Melody: Classic</option><option value="shaped">Melody: Shaped</option></select><select class="vmove" aria-label="Melody moves" title="Shaped melodies: signature moves from real songs (docs/VOCAL-MOVES.md). Auto: each song picks its own few, by genre. Or choose one to hear it (switches the melody to Shaped)."><option value="auto">Moves: Auto</option>${MOVE_IDS.map((m) => `<option value="${m}">${MOVES[m].label}</option>`).join('')}</select><select class="venergy" aria-label="Vocal energy" title="How the singer carries the song's energy (not just faster or higher). Auto: each song its own style, by genre and mood. Climber: higher and held as it builds. Puncher: short punchy words in the riff's gaps. Driver: a steady stream of words, doubled when loud. Brooder: low, long, laid back, a dark harmony. Drifter: few words, lots of space, falling lines. Switcher: quiet verses, choruses leaping way up. Off: as before."><option value="auto">Energy: Auto</option>${ENERGY_IDS.map((e) => `<option value="${e}">${ENERGY[e].label} (${ENERGY[e].like})</option>`).join('')}<option value="off">Energy: Off</option></select>` : ''}
        ${d.layer ? `<select class="use" aria-label="Where the ${d.label.toLowerCase()} plays" title="Comes and goes: the ${d.label.toLowerCase()} plays some sections and moments, not others, to suit the song. Throughout: every bar."><option value="auto">Comes and goes</option><option value="all">Throughout</option></select>` : ''}
      </span>
      <input type="range" min="0" max="100" value="${d.volume}" aria-label="${d.label} volume">
      <span class="toggles">
        <button class="toggle mute" aria-pressed="false" title="Mute">M</button>
        <button class="toggle solo" aria-pressed="false" title="Solo">S</button>
        ${d.layer ? `<button class="toggle remove" title="Remove the ${d.label.toLowerCase()}" aria-label="Remove the ${d.label.toLowerCase()}">✕</button>` : ''}
      </span>
      ${d.layer ? `<button class="small add" title="${d.layer.title}">${d.layer.add}</button>` : ''}`;
    const select = row.querySelector('select')!;
    const vol = row.querySelector('input')!;
    const mute = row.querySelector<HTMLButtonElement>('.mute')!;
    const solo = row.querySelector<HTMLButtonElement>('.solo')!;

    select.onchange = () => d.onInstrument(select.value);
    vol.oninput = () => engine.setVolume(d.part, +vol.value);
    const toggle = (btn: HTMLButtonElement, set: (on: boolean) => void) => () => {
      const on = !btn.classList.contains('on');
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-pressed', String(on));
      set(on);
    };
    mute.onclick = toggle(mute, (on) => engine.setMute(d.part, on));
    solo.onclick = toggle(solo, (on) => engine.setSolo(d.part, on));

    if (d.layer) {
      const part = d.part as LayerPart;
      const show = (on: boolean) => row.classList.toggle('off', !on);
      row.querySelector<HTMLButtonElement>('.add')!.onclick = () => {
        engine.setLayer(part, select.value as never);
        show(true);
        onChange();
      };
      row.querySelector<HTMLButtonElement>('.remove')!.onclick = () => {
        engine.setLayer(part, null);
        show(false);
        onChange();
      };
      const use = row.querySelector<HTMLSelectElement>('.use')!;
      use.onchange = () => { engine.setLayerThroughout(part, use.value === 'all'); onChange(); };
      syncs.push(() => {
        const s = engine.layerSettings;
        const v = s[part];
        if (v) select.value = v;
        use.value = s.throughout?.includes(part) ? 'all' : 'auto';
        show(!!v);
      });
    }

    if (d.part === 'vocal') {
      const timbre = row.querySelector<HTMLSelectElement>('.timbre')!;
      timbre.onchange = () => { engine.setVocalTimbre(timbre.value as TimbreChoice); onChange(); };
      const vr = row.querySelector<HTMLSelectElement>('.vrhythm')!;
      const vm = row.querySelector<HTMLSelectElement>('.vmelody')!;
      vr.onchange = () => write?.set('rhythm', vr.value);
      vm.onchange = () => write?.set('melody', vm.value);
      const mv = row.querySelector<HTMLSelectElement>('.vmove')!;
      mv.onchange = () => write?.set('move', mv.value);
      const ve = row.querySelector<HTMLSelectElement>('.venergy')!;
      ve.onchange = () => write?.set('energy', ve.value);
      const sync = () => { select.value = engine.vocal; timbre.value = engine.vocalTimbre; vr.value = write?.get('rhythm') ?? 'classic'; vm.value = write?.get('melody') ?? 'classic'; mv.value = write?.get('move') ?? 'auto'; ve.value = write?.get('energy') ?? 'auto'; };
      sync();
      syncs.push(sync);
    }
    if (d.part === 'backing') { select.value = engine.backingVocal; syncs.push(() => { select.value = engine.backingVocal; }); }
    engine.setVolume(d.part, d.volume);
    root.appendChild(row);
  }
  return { sync: () => syncs.forEach((f) => f()) };
}
