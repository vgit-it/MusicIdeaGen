// Per-part strip: instrument, volume, mute, solo.

import type { ChordChoice, Engine } from '../audio/engine';
import { BASS_INSTRUMENTS, type BassId, CHORD_INSTRUMENTS, DRUM_KITS, type DrumKitId } from '../audio/instruments';
import type { MixPart } from '../audio/mixer';

interface PartDef {
  part: MixPart;
  label: string;
  options: { id: string; label: string }[];
  volume: number;
  onInstrument: (id: string) => void;
}

export function buildPartsPanel(root: HTMLElement, engine: Engine, onChordChange: () => void) {
  const defs: PartDef[] = [
    {
      part: 'chords', label: 'Chords', volume: 80,
      options: [{ id: 'auto', label: 'Auto (by genre)' }, ...CHORD_INSTRUMENTS],
      onInstrument: (id) => { engine.setChordInstrument(id as ChordChoice); onChordChange(); },
    },
    {
      part: 'drums', label: 'Drums', volume: 80, options: DRUM_KITS,
      onInstrument: (id) => engine.setDrums(id as DrumKitId),
    },
    {
      part: 'bass', label: 'Bass', volume: 80, options: BASS_INSTRUMENTS,
      onInstrument: (id) => engine.setBass(id as BassId),
    },
  ];

  root.innerHTML = '';
  for (const d of defs) {
    const row = document.createElement('div');
    row.className = 'part';
    row.innerHTML = `
      <span class="name">${d.label}</span>
      <select aria-label="${d.label} instrument">${d.options.map((o) => `<option value="${o.id}">${o.label}</option>`).join('')}</select>
      <input type="range" min="0" max="100" value="${d.volume}" aria-label="${d.label} volume">
      <span class="toggles">
        <button class="toggle mute" aria-pressed="false" title="Mute">M</button>
        <button class="toggle solo" aria-pressed="false" title="Solo">S</button>
      </span>`;
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

    engine.setVolume(d.part, d.volume);
    root.appendChild(row);
  }
}
