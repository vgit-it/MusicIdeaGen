// Per-part strip: instrument, volume, mute, solo. Layers (piano, pad) can be added and removed.

import type { ChordChoice, Engine } from '../audio/engine';
import { BASS_INSTRUMENTS, type BassId, CHORD_INSTRUMENTS, DRUM_KITS, type DrumKitId } from '../audio/instruments';
import type { LayerPart, MixPart } from '../audio/mixer';
import { PAD_TONES } from '../audio/pad';
import { KEYS_STYLES } from '../parts/layers';

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
export function buildPartsPanel(root: HTMLElement, engine: Engine, onChange: () => void): PartsPanel {
  const defs: PartDef[] = [
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
  ];

  root.innerHTML = '';
  const syncs: (() => void)[] = [];
  for (const d of defs) {
    const row = document.createElement('div');
    row.className = 'part' + (d.layer ? ' layer off' : '');
    row.innerHTML = `
      <span class="name">${d.label}</span>
      <select aria-label="${d.label} ${d.layer ? 'style' : 'instrument'}">${d.options.map((o) => `<option value="${o.id}">${o.label}</option>`).join('')}</select>
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
      syncs.push(() => {
        const v = engine.layerSettings[part];
        if (v) select.value = v;
        show(!!v);
      });
    }

    engine.setVolume(d.part, d.volume);
    root.appendChild(row);
  }
  return { sync: () => syncs.forEach((f) => f()) };
}
