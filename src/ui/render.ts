// Shows the current idea: summary pills, notes, bar grid and step lanes.

import type { Idea } from '../idea';
import { NOTE_NAMES, chordName } from '../theory';
import type { GuitarVoicing } from '../theory/guitar';

const $ = (id: string) => document.getElementById(id)!;

const shapeText = (v: GuitarVoicing) =>
  v.frets.map((f) => (f === null ? 'x' : f > 9 ? `(${f})` : String(f))).join('');

export function renderIdea(idea: Idea, shapes: GuitarVoicing[] | null, instrumentLabel: string) {
  const { song, chords, drums } = idea;
  const name = (i: number) => chordName(song.key, chords.timeline[i].chord);
  const gLabel = song.genreSel === 'random' ? `Random → ${song.genre}` : song.genre;

  $('meta').innerHTML = [
    `Genre <b>${gLabel}</b>`,
    `Key <b>${NOTE_NAMES[song.key]} ${song.mode}</b>`,
    `Time <b>${song.meterLabel}</b>`,
    `Tempo <b>${song.bpm}</b>`,
    `Weirdness <b>${Math.round(song.w * 100)}</b>`,
    `Chords on <b>${instrumentLabel}</b>`,
  ].map((t) => `<span class="pill">${t}</span>`).join('') +
    `<span class="pill seed" title="Seed (for sharing later)">#${idea.seeds.song}</span>`;

  $('notes').innerHTML = idea.notes.map((n) => `<li>${n}</li>`).join('');

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
  $('lanes').textContent = [
    `Strum ${lane(idea.strum, (v) => v)}`,
    `Kick  ${lane(drums.kick, (v) => (v ? 'x' : '.'))}`,
    `Snare ${lane(drums.snare, (v) => (!v ? '.' : v < 0.3 ? 'g' : 'x'))}`,
    `Toms  ${lane(drums.tom, (v) => (v ? String(v) : '.'))}`,
    `Hat   ${lane(hats, (v) => v)}`,
    drums.ride.some(Boolean) ? `Ride  ${lane(drums.ride, (v) => (v ? 'x' : '.'))}` : '',
    `Crash ${lane(drums.crash, (v) => (v ? '*' : '.'))}`,
    `Bass  ${lane(idea.bass, (v) => (v ? 'o' : '.'))}`,
  ].filter(Boolean).join('\n');
}

export function highlightBar(bar: number) {
  document.querySelectorAll('.bar.now').forEach((el) => el.classList.remove('now'));
  document.getElementById(`bar${bar}`)?.classList.add('now');
}
