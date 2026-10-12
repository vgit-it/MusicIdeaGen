// Shows the current idea: summary pills, notes, bar grid and step lanes.

import { GENRE_LABEL } from '../genres';
import type { ChordSheet, GuitarHit, Idea } from '../idea';
import type { LayerPart } from '../audio/mixer';
import type { Layer } from '../parts/layers';
import { NOTE_NAMES, chordName } from '../theory';
import { CELLS_PER_BAR, numeral } from '../parts/sheet';
import type { GuitarVoicing } from '../theory/guitar';
import { MOOD_LABEL } from '../tension';
import { type Track, trackSeconds } from '../track';

const $ = (id: string) => document.getElementById(id)!;

const shapeText = (v: GuitarVoicing) =>
  v.frets.map((f) => (f === null ? 'x' : f > 9 ? `(${f})` : String(f))).join('');

/** `layers`: the added layers' parts (piano, pad, strings, percussion). */
export function renderIdea(
  idea: Idea, shapes: GuitarVoicing[] | null, instrumentLabel: string, guitar2Label: string,
  layers: Partial<Record<LayerPart, Layer | null>> = {},
  /**
   * Chords you can set here (null: not here): the sheet, which of its bars this bar is (track sections
   * repeat a block's bars: bar i is `from + i % n`), and the bar open in the chord editor (-1: none).
   */
  edit: { sheet: ChordSheet | undefined; from: number; n: number; selected: number } | null = null,
) {
  const { song, chords, drums } = idea;
  const editable = !!edit;
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
    const nums = shapeIdx.map((t) => numeral(chords.timeline[t].chord, song.mode)).join(' · ');
    // chords you set: the bar is marked, and (on the idea itself) tapping it opens the chord editor
    const at = edit ? edit.from + (i % edit.n) : -1;
    const sheet = edit?.sheet;
    const set = !!sheet && [0, 1].some((k) => (sheet[at * CELLS_PER_BAR + k] ?? null) !== null);
    const tag = editable ? 'button' : 'div';
    return `<${tag} class="bar${set ? ' set' : ''}${editable ? ' edit' : ''}${edit && at === edit.selected ? ' sel' : ''}" id="bar${i}" data-bar="${i}" data-at="${at}">` +
      `<div class="n"><span>Bar ${i + 1}${set ? ' <b class="pin" title="Set by you">●</b>' : ''}</span><i>${b.meter}</i></div>` +
      `<div class="c">${held}${names}</div><div class="num">${nums}</div>${shape}</${tag}>`;
  }).join('');

  const lane = <T>(arr: T[], f: (v: T) => string) =>
    song.bars.map((b) => Array.from({ length: b.len }, (_, j) => f(arr[b.start + j])).join('')).join('|');
  const hats = drums.hat.map((v, i) => (drums.hatOpen[i] ? 'o' : v ? 'x' : '.'));
  // riff ideas: n = note, C = power chord, p = palm mute, x = dead scratch, a = clean arpeggio note
  const guitar = new Array<string>(song.total).fill('.');
  const sym = (h: GuitarHit) => (h.clean ? 'a' : h.mute === 'palm' ? 'p' : h.mute === 'dead' ? 'x' : h.notes.length > 1 ? 'C' : 'n');
  for (const h of idea.guitar ?? []) guitar[h.step] = sym(h);
  // strummed parts: picked notes (an arpeggio, a lick between chords) show in the strum lane
  const strum = [...idea.strum] as string[];
  for (const h of idea.rhythmPick ?? []) strum[h.step] = sym(h);
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
  // the singer: o = a note, - = held; under it the words, a syllable from each note (cut short before the next)
  const vocal = idea.vocal ?? [];
  const voc = new Array<string>(song.total).fill('.');
  const words = new Array<string>(song.total).fill(' ');
  vocal.forEach((n, i) => {
    for (let g = n.step + 1; g < Math.min(song.total, n.step + n.len); g++) voc[g] = '-';
    voc[n.step] = 'o';
    const room = (vocal[i + 1]?.step ?? song.total) - n.step;
    [...n.syl.text].slice(0, Math.max(1, room)).forEach((ch, k) => { if (n.step + k < song.total) words[n.step + k] = ch; });
  });
  $('lanes').textContent = [
    vocal.length ? `Vocal ${lane(voc, (v) => v)}` : '',
    vocal.length ? `Words ${lane(words, (v) => v)}` : '',
    idea.guitar ? `Gtr   ${lane(guitar, (v) => v)}` : `Strum ${lane(strum, (v) => v)}`,
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
  renderTension(track);
  $('sections').innerHTML = track.sections.map((s, i) => {
    const { label, energy } = s.section!;
    const n = s.song.bars.length;
    const dots = [1, 2, 3, 4, 5].map((k) => `<i${k <= energy ? ' class="on"' : ''}></i>`).join('');
    return `<button class="sec" data-i="${i}" style="--e:${energy}" title="${label}: energy ${energy} of 5">` +
      `<span class="sl">${label}</span><span class="ss">${soundOf(s)}</span><span class="sb">${n} bars</span>` +
      `<span class="en" aria-label="Energy ${energy} of 5">${dots}</span></button>`;
  }).join('');
}

/**
 * The song's tension line, bar by bar, across the whole track (its sections marked, the climax dotted),
 * with its mood. The section playing (or shown) is shaded by markSection.
 */
function renderTension(track: Track) {
  const W = 1000, H = 60;
  const bars = track.sections.flatMap((s) => s.song.bars.map((b, i) => ({ len: b.len, t: s.section!.tension?.[i] ?? (s.section!.energy - 1) / 4 })));
  const total = bars.reduce((a, b) => a + b.len, 0);
  let at = 0;
  const pts: [number, number][] = [];
  for (const b of bars) {
    const y = H - 4 - b.t * (H - 8);
    pts.push([(at / total) * W, y], [((at + b.len) / total) * W, y]);
    at += b.len;
  }
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
  let x0 = 0;
  const spans = track.sections.map((s) => {
    const w = (s.song.total / total) * W;
    const r = { x: x0, w };
    x0 += w;
    return r;
  });
  const ticks = spans.slice(1).map((r) => `<line class="tick" x1="${r.x.toFixed(1)}" x2="${r.x.toFixed(1)}" y1="0" y2="${H}"/>`).join('');
  const shades = spans.map((r, i) => `<rect class="now" data-i="${i}" x="${r.x.toFixed(1)}" y="0" width="${r.w.toFixed(1)}" height="${H}" visibility="hidden"/>`).join('');
  const climax = track.sections[track.climax];
  $('tension').innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Tension: ${MOOD_LABEL[track.mood]}, climax in ${climax.section!.label}">` +
    `${shades}${ticks}<path class="area" d="${line}L${W} ${H}L0 ${H}Z"/><path class="line" d="${line}"/></svg>` +
    `<div class="cap"><span>Tension · ${MOOD_LABEL[track.mood]}${(track.opts.mood ?? 'auto') === 'auto' ? ' (Auto)' : ''}</span><span>Climax: ${climax.section!.label}</span></div>`;
}

/** Mark the section that's playing (or shown) and the one being looped. */
export function markSection(current: number, looping: number | null) {
  document.querySelectorAll<HTMLElement>('#sections .sec').forEach((el) => {
    const i = Number(el.dataset.i);
    el.classList.toggle('now', i === current);
    el.classList.toggle('loop', i === looping);
  });
  document.querySelectorAll<SVGRectElement>('#tension rect.now').forEach((el) => {
    el.setAttribute('visibility', Number(el.dataset.i) === current ? 'visible' : 'hidden');
  });
}

export function highlightBar(bar: number) {
  document.querySelectorAll('.bar.now').forEach((el) => el.classList.remove('now'));
  document.getElementById(`bar${bar}`)?.classList.add('now');
}
