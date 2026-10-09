// Shows the current idea: summary pills, notes, bar grid and step lanes.

import { GENRE_LABEL } from '../genres';
import type { GuitarHit, Idea } from '../idea';
import type { LayerPart } from '../audio/mixer';
import type { Layer } from '../parts/layers';
import { NOTE_NAMES, chordName } from '../theory';
import type { GuitarVoicing } from '../theory/guitar';
import { type Track, trackSeconds } from '../track';

const $ = (id: string) => document.getElementById(id)!;

const shapeText = (v: GuitarVoicing) =>
  v.frets.map((f) => (f === null ? 'x' : f > 9 ? `(${f})` : String(f))).join('');

/** `layers`: the added layers' parts (piano, pad, strings, percussion). */
export function renderIdea(
  idea: Idea, shapes: GuitarVoicing[] | null, instrumentLabel: string, guitar2Label: string,
  layers: Partial<Record<LayerPart, Layer | null>> = {},
) {
  const { song, chords, drums } = idea;
  const name = (i: number) => chordName(song.key, chords.timeline[i].chord);
  const gLabel = song.genreSel === 'random' ? `Random → ${GENRE_LABEL[song.genre]}` : GENRE_LABEL[song.genre];

  $('meta').innerHTML = [
    ...(idea.section ? [`Section <b>${idea.section.label}</b>`] : []),
    `Genre <b>${gLabel}</b>`,
    `Key <b>${NOTE_NAMES[song.key]} ${song.mode}</b>`,
    `Time <b>${song.meterLabel}</b>`,
    `Tempo <b>${song.bpm}</b>`,
    `Weirdness <b>${Math.round(song.w * 100)}</b>`,
    `Rhythm <b>${instrumentLabel}</b>`,
    `Guitar 2 <b>${guitar2Label}</b>`,
    ...(song.tuning ? [`Tuning <b>${song.tuning.name}</b>`] : []),
  ].map((t) => `<span class="pill">${t}</span>`).join('') +
    `<span class="pill seed" title="Seed (for sharing later)">#${idea.seeds.song}</span>`;

  const extra = [layers.keys?.desc, layers.pad?.desc, layers.strings?.desc, layers.perc?.desc].filter(Boolean);
  $('notes').innerHTML = [...idea.notes, ...extra].map((n) => `<li>${n}</li>`).join('');

  $('bars').innerHTML = song.bars.map((b, i) => {
    const here = chords.timeline
      .map((e, ti) => ({ ...e, ti }))
      .filter((e) => e.step >= b.start && e.step < b.start + b.len);
    const heldIdx = chords.chordIdx[b.start];
    const held = here.length && here[0].step === b.start ? '' : `<s>(${name(heldIdx)})</s> `;
    const names = here
      .map((e) => name(e.ti) + (e.step !== b.start && (e.step - b.start) % 4 ? '<s>↶</s>' : ''))
      .join(' · ');
    const shapeIdx = here.length ? here.map((e) => e.ti) : [heldIdx];
    const shape = shapes ? `<div class="shape">${shapeIdx.map((t) => shapeText(shapes[t])).join(' · ')}</div>` : '';
    return `<div class="bar" id="bar${i}"><div class="n"><span>Bar ${i + 1}</span><i>${b.meter}</i></div>` +
      `<div class="c">${held}${names}</div>${shape}</div>`;
  }).join('');

  const lane = <T>(arr: T[], f: (v: T) => string) =>
    song.bars.map((b) => Array.from({ length: b.len }, (_, j) => f(arr[b.start + j])).join('')).join('|');
  const hats = drums.hat.map((v, i) => (drums.hatOpen[i] ? 'o' : v ? 'x' : '.'));
  // riff ideas: n = note, C = power chord, p = palm mute, x = dead scratch, a = clean arpeggio note
  const guitar = new Array<string>(song.total).fill('.');
  const sym = (h: GuitarHit) => (h.clean ? 'a' : h.mute === 'palm' ? 'p' : h.mute === 'dead' ? 'x' : h.notes.length > 1 ? 'C' : 'n');
  for (const h of idea.guitar ?? []) guitar[h.step] = sym(h);
  const guitar2 = new Array<string>(song.total).fill('.');
  for (const h of idea.guitar2) guitar2[h.step] = h.swell ? '~' : sym(h);
  // layers: c = chord, n = single note, - = held
  const layerLane = (l: Layer) => {
    const out = new Array<string>(song.total).fill('.');
    for (const n of l.notes) {
      for (let g = n.step + 1; g < Math.min(song.total, n.step + n.len); g++) if (out[g] === '.') out[g] = '-';
    }
    for (const n of l.notes) if (n.step < song.total && out[n.step] !== 'c') out[n.step] = n.notes.length > 1 ? 'c' : 'n';
    return out;
  };
  $('lanes').textContent = [
    idea.guitar ? `Gtr   ${lane(guitar, (v) => v)}` : `Strum ${lane(idea.strum, (v) => v)}`,
    `Gtr 2 ${lane(guitar2, (v) => v)}`,
    `Kick  ${lane(drums.kick, (v) => (v ? 'x' : '.'))}`,
    `Snare ${lane(drums.snare, (v) => (!v ? '.' : v < 0.3 ? 'g' : 'x'))}`,
    `Toms  ${lane(drums.tom, (v) => (v ? String(v) : '.'))}`,
    `Hat   ${lane(hats, (v) => v)}`,
    drums.ride.some(Boolean) ? `Ride  ${lane(drums.ride, (v) => (v ? 'x' : '.'))}` : '',
    `Crash ${lane(drums.crash, (v) => (v ? '*' : '.'))}`,
    `Bass  ${lane(idea.bass, (v) => (v ? 'o' : '.'))}`,
    layers.keys ? `Piano ${lane(layerLane(layers.keys), (v) => v)}` : '',
    layers.pad ? `Pad   ${lane(layerLane(layers.pad), (v) => v)}` : '',
    layers.strings ? `Strng ${lane(layerLane(layers.strings), (v) => v)}` : '',
    layers.perc ? `Perc  ${lane(layerLane(layers.perc), (v) => (v === '-' ? '.' : v === 'n' ? 'x' : v))}` : '',
  ].filter(Boolean).join('\n');
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

/** The track's section strip: one block per section, tinted by energy, with the rhythm part's instrument. */
export function renderTrack(track: Track, soundOf: (section: Idea) => string) {
  $('trackinfo').textContent = `${mmss(trackSeconds(track))} · ${track.bars} bars`;
  $('sections').innerHTML = track.sections.map((s, i) => {
    const { label, energy } = s.section!;
    const n = s.song.bars.length;
    const dots = [1, 2, 3, 4, 5].map((k) => `<i${k <= energy ? ' class="on"' : ''}></i>`).join('');
    return `<button class="sec" data-i="${i}" style="--e:${energy}" title="${label}: energy ${energy} of 5">` +
      `<span class="sl">${label}</span><span class="ss">${soundOf(s)}</span><span class="sb">${n} bars</span>` +
      `<span class="en" aria-label="Energy ${energy} of 5">${dots}</span></button>`;
  }).join('');
}

/** Mark the section that's playing (or shown) and the one being looped. */
export function markSection(current: number, looping: number | null) {
  document.querySelectorAll<HTMLElement>('#sections .sec').forEach((el) => {
    const i = Number(el.dataset.i);
    el.classList.toggle('now', i === current);
    el.classList.toggle('loop', i === looping);
  });
}

export function highlightBar(bar: number) {
  document.querySelectorAll('.bar.now').forEach((el) => el.classList.remove('now'));
  document.getElementById(`bar${bar}`)?.classList.add('now');
}
