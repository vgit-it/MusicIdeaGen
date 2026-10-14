// The Guide line's own section of the page (experiment): add it, lean in or out of the chords, hear it
// with or without the band, reroll it, see it drawn over the song, download it as MIDI.

import { Midi } from '@tonejs/midi';
import type { Engine } from '../audio/engine';
import type { Idea } from '../idea';
import type { Mood } from '../tension';
import { type GuideLine, type Lean, noteName, writeGuide } from './line';
import { GuideSynth } from './synth';

export interface GuidePanel {
  /** New music (an idea, or a track's sections), and the song's mood (undefined: auto). */
  update(list: Idea[], mood: Mood | undefined): void;
}

const seg = (id: string, opts: [string, string][], on: string) =>
  `<div class="seg" id="${id}">${opts.map(([v, l]) => `<button data-v="${v}" class="${v === on ? 'on' : ''}">${l}</button>`).join('')}</div>`;

export function buildGuidePanel(root: HTMLElement, engine: Engine): GuidePanel {
  let on = false, lean: Lean = 'in', band = true, salt = 0, level = 70;
  let list: Idea[] = [];
  let mood: Mood | undefined;
  let line: GuideLine | null = null;
  let synth: GuideSynth | null = null;

  root.innerHTML = `
    <h2>Guide line <span class="exp">experiment</span></h2>
    <p class="hint">One note line through the whole song, in its key, shaped by the mood (the track's Mood). Mostly small steps; big leaps only after a pause. Separate from the vocals for now.</p>
    <button id="g-add" class="small">+ Add guide line</button>
    <div id="g-body" hidden>
      <div class="guiderow">
        <label>Chords ${seg('g-lean', [['in', 'Lean in'], ['out', 'Lean out']], lean)}</label>
        <label>Hear ${seg('g-band', [['band', 'With band'], ['alone', 'Line only']], 'band')}</label>
      </div>
      <div class="guiderow">
        <label class="grow">Volume <input type="range" id="g-vol" min="0" max="100" value="${level}"></label>
        <button id="g-reroll" class="small" title="Another line, same mood">Reroll</button>
        <button id="g-midi" class="small" title="The guide line as a MIDI file">MIDI</button>
        <button id="g-remove" class="small">Remove</button>
      </div>
      <div id="g-draw" class="guidedraw"></div>
      <ul class="notes" id="g-notes"></ul>
    </div>`;
  const $ = (id: string) => root.querySelector<HTMLElement>(`#${id}`)!;
  const body = $('g-body'), add = $('g-add'), draw = $('g-draw');

  const setBand = () => { engine.mixer.master.gain.rampTo(band || !on ? 0.8 : 0, 0.05); };

  const rewrite = () => {
    if (!on || !list.length) { line = null; draw.innerHTML = ''; $('g-notes').innerHTML = ''; return; }
    line = writeGuide(list, mood, lean, salt);
    $('g-notes').innerHTML = line.notes.map((n) => `<li>${n}</li>`).join('');
    drawLine();
  };

  /** The line over the song: each note a bar at its height, colour notes and leaps marked, sections divided. */
  let cursor: SVGLineElement | null = null;
  const offsets: number[] = [];
  let drawnTotal = 1, drawnW = 1000;
  const drawLine = () => {
    if (!line) return;
    let total = 0;
    offsets.length = 0;
    for (const i of list) { offsets.push(total); total += i.song.total; }
    const all = line.parts.flatMap((p, si) => p.map((n) => ({ ...n, at: offsets[si] + n.step })));
    if (!all.length) { draw.innerHTML = ''; return; }
    const lo = Math.min(...all.map((n) => n.midi)) - 1, hi = Math.max(...all.map((n) => n.midi)) + 1;
    const W = Math.max(300, draw.clientWidth || 700), H = 160, top = 14;
    drawnW = W;
    const x = (s: number) => (s / total) * W;
    const y = (m: number) => top + ((hi - m) / (hi - lo)) * (H - top - 6);
    const parts: string[] = [];
    // sections and their names
    list.forEach((i, si) => {
      const x0 = x(offsets[si]);
      if (si) parts.push(`<line x1="${x0}" x2="${x0}" y1="0" y2="${H}" class="gsec"/>`);
      if (list.length > 1) parts.push(`<text x="${x0 + 3}" y="10" class="glab">${i.section?.label ?? ''}</text>`);
    });
    // octave guides: each home note
    const homes = new Set(all.filter((n) => n.deg % 7 === 0 && !n.colour).map((n) => n.midi));
    for (const m of homes) parts.push(`<line x1="0" x2="${W}" y1="${y(m)}" y2="${y(m)}" class="ghome"/><text x="${W - 2}" y="${y(m) - 2}" class="glab" text-anchor="end">${noteName(m)}</text>`);
    // the joins, then the notes
    all.forEach((n, k) => {
      const p = all[k - 1];
      if (p && p.at + p.len === n.at) parts.push(`<line x1="${x(n.at)}" x2="${x(n.at)}" y1="${y(p.midi)}" y2="${y(n.midi)}" class="gjoin"/>`);
    });
    for (const n of all) parts.push(`<rect x="${x(n.at)}" y="${y(n.midi) - 2.5}" width="${Math.max(2, x(n.len) - 1)}" height="5" rx="2" class="${n.colour ? 'gcol' : n.leap ? 'gleap' : 'gnote'}"><title>${noteName(n.midi)}</title></rect>`);
    draw.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="The guide line over the song">${parts.join('')}<line id="g-cur" x1="-5" x2="-5" y1="0" y2="${H}" class="gcur"/></svg>
      <div class="glegend"><span class="k gnote"></span>in key <span class="k gleap"></span>leap after a pause <span class="k gcol"></span>out-of-key colour</div>`;
    cursor = draw.querySelector('#g-cur');
    drawnTotal = total;
  };

  const partFor = (idea: Idea, idx: number) => {
    if (!line) return -1;
    if (list[idx] === idea) return idx;
    return list.indexOf(idea);
  };

  engine.onStep = (idea, idx, g, time, six) => {
    if (!on || !line) return;
    const p = partFor(idea, idx);
    if (p < 0) return;
    for (const n of line.parts[p]) if (n.step === g) synth!.play(n.midi, time, n.len * six, 0.8);
    if (cursor && g % 4 === 0) {
      const xx = ((offsets[p] + g) / drawnTotal) * drawnW;
      setTimeout(() => { cursor?.setAttribute('x1', `${xx}`); cursor?.setAttribute('x2', `${xx}`); }, Math.max(0, (time - engine.mixer.master.context.now()) * 1000));
    }
  };
  engine.onStop = () => { synth?.releaseAll(); cursor?.setAttribute('x1', '-5'); cursor?.setAttribute('x2', '-5'); };

  const pickSeg = (id: string, f: (v: string) => void) => {
    const el = $(id);
    el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      el.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      f(b.dataset.v!);
    });
  };
  pickSeg('g-lean', (v) => { lean = v as Lean; rewrite(); });
  pickSeg('g-band', (v) => { band = v === 'band'; setBand(); });
  const setOn = (v: boolean) => {
    on = v;
    body.hidden = !on;
    add.hidden = on;
    if (on) { synth ??= new GuideSynth(engine.mixer.sectionLevel); synth.setLevel(level); } else synth?.releaseAll();
    setBand();
    rewrite();
  };
  add.addEventListener('click', () => setOn(true));
  $('g-remove').addEventListener('click', () => setOn(false));
  $('g-vol').addEventListener('input', (e) => { level = +(e.target as HTMLInputElement).value; synth?.setLevel(level); });
  $('g-reroll').addEventListener('click', () => { salt++; rewrite(); });
  $('g-midi').addEventListener('click', () => {
    if (!line) return;
    const midi = new Midi();
    const bpm = list[0].song.bpm;
    midi.header.setTempo(bpm);
    midi.header.update();
    const t = midi.addTrack();
    t.name = 'Guide line';
    const ppq = midi.header.ppq, step = ppq / 4;
    let off = 0;
    line.parts.forEach((p, si) => {
      for (const n of p) t.addNote({ midi: n.midi, ticks: Math.round((off + n.step) * step), durationTicks: Math.round(n.len * step), velocity: 0.8 });
      off += list[si].song.total;
    });
    const url = URL.createObjectURL(new Blob([new Uint8Array(midi.toArray())], { type: 'audio/midi' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'guide-line.mid';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  });

  return {
    update(l, m) {
      // the same music again (a redraw): keep the line
      if (l.length === list.length && l.every((x, i) => x === list[i]) && m === mood) return;
      list = l;
      mood = m;
      rewrite();
    },
  };
}
