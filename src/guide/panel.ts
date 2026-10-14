// The Guide line's own section of the page (experiment): add it, lean in or out of the chords, hear it
// with or without the band, reroll it, see it drawn over the song, download it as MIDI.

import { Midi } from '@tonejs/midi';
import type { Engine } from '../audio/engine';
import type { Idea } from '../idea';
import type { Mood } from '../tension';
import type { HighVoice } from '../parts/singers';
import { FLICK_LEVELS, type Flicks, type GuideLine, type GuideNote, type Lean, noteName, writeGuide } from './line';
import { GuideSynth } from './synth';

export interface GuidePanel {
  /** New music (an idea, or a track's sections), and the song's mood (undefined: auto). */
  /** `singer`: the vocal's high voice, if it sings high (the Voice's Auto follows it). */
  update(list: Idea[], mood: Mood | undefined, singer?: HighVoice | null): void;
}

const seg = (id: string, opts: [string, string][], on: string) =>
  `<div class="seg" id="${id}">${opts.map(([v, l]) => `<button data-v="${v}" class="${v === on ? 'on' : ''}">${l}</button>`).join('')}</div>`;

export function buildGuidePanel(root: HTMLElement, engine: Engine): GuidePanel {
  let on = false, lean: Lean = 'in', band = true, salt = 0, level = 70, flicks: Flicks = 'some';
  // (the voice: Auto follows the singer; High without a high singer: the rock tenor's range)
  let voice: 'auto' | 'mid' | 'high' = 'auto';
  let singer: HighVoice | null = null;
  const highNow = (): HighVoice | null => (voice === 'mid' ? null : voice === 'high' ? singer ?? 'tenor' : singer);
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
        <label title="Auto: mid, or high if the singer sings high. High: up to its top where the song is high">Voice ${seg('g-voice', [['auto', 'Auto'], ['mid', 'Mid'], ['high', 'High']], voice)}</label>
        <label title="Quick notes on the long ones: a step or two up or down for an 8th, then back; in 2-bar clusters of frequent, moderate and sparse">Quick notes ${seg('g-flicks', FLICK_LEVELS, flicks)}</label>
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
    line = writeGuide(list, mood, lean, salt, flicks, highNow());
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
    if (!all.length) { draw.innerHTML = '<p class="gsilentmsg">The line sits out here (intros and solos always, some interludes, bridges, breakdowns and outros).</p>'; return; }
    const lo = Math.min(...all.map((n) => n.midi)) - 1, hi = Math.max(...all.map((n) => n.midi)) + 1;
    const W = Math.max(300, draw.clientWidth || 700), H = 160, top = 14;
    drawnW = W;
    const x = (s: number) => (s / total) * W;
    const y = (m: number) => top + ((hi - m) / (hi - lo)) * (H - top - 6);
    const parts: string[] = [];
    // sections and their names
    list.forEach((i, si) => {
      const x0 = x(offsets[si]);
      // (where the line sits out: greyed, marked)
      if (line!.silent[si]) parts.push(`<rect x="${x0}" y="0" width="${x(offsets[si] + i.song.total) - x0}" height="${H}" class="gsilent"/><text x="${x0 + 3}" y="${H - 4}" class="glab">silent</text>`);
      if (si) parts.push(`<line x1="${x0}" x2="${x0}" y1="0" y2="${H}" class="gsec"/>`);
      if (list.length > 1) parts.push(`<text x="${x0 + 3}" y="10" class="glab">${i.section?.label ?? ''}</text>`);
    });
    // octave guides: each home note
    const homes = new Set(all.filter((n) => n.deg % 7 === 0 && !n.colour).map((n) => n.midi));
    for (const m of homes) parts.push(`<line x1="0" x2="${W}" y1="${y(m)}" y2="${y(m)}" class="ghome"/><text x="${W - 2}" y="${y(m) - 2}" class="glab" text-anchor="end">${noteName(m)}</text>`);
    // the joins, then the notes
    all.forEach((n, k) => {
      const p = all[k - 1];
      if (p && n.bend) parts.push(`<line x1="${x(n.at)}" x2="${x(n.at + n.bend)}" y1="${y(p.midi)}" y2="${y(n.midi)}" class="gbend"/>`);
      else if (p && p.at + p.len === n.at) parts.push(`<line x1="${x(n.at)}" x2="${x(n.at)}" y1="${y(p.midi)}" y2="${y(n.midi)}" class="gjoin"/>`);
    });
    for (const n of all) parts.push(`<rect x="${x(n.at + (n.bend ?? 0))}" y="${y(n.midi) - 2.5}" width="${Math.max(2, x(n.len - (n.bend ?? 0)) - 1)}" height="5" rx="2" class="${n.colour ? 'gcol' : n.leap ? 'gleap' : 'gnote'}"><title>${noteName(n.midi)}</title></rect>`);
    // the quick notes: a dash at their height (a slope when bent to at a note's end)
    for (const n of all) for (const f of n.flicks ?? []) {
      if (f.bend) parts.push(`<line x1="${x(n.at + f.at)}" x2="${x(n.at + f.at + f.len)}" y1="${y(n.midi)}" y2="${y(f.midi)}" class="gfbend"/>`);
      else parts.push(`<rect x="${x(n.at + f.at)}" y="${y(f.midi) - 2}" width="${Math.max(2, x(f.len))}" height="4" class="${f.outKey ? 'gflickout' : 'gflick'}"><title>${noteName(f.midi)}${f.outKey ? ' (a half step, out of key)' : ''}</title></rect>`);
    }
    draw.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="The guide line over the song">${parts.join('')}<line id="g-cur" x1="-5" x2="-5" y1="0" y2="${H}" class="gcur"/></svg>
      <div class="glegend"><span class="k gnote"></span>in key <span class="k gleap"></span>leap after a pause <span class="k gcol"></span>out-of-key colour <span class="k gbendk"></span>bend <span class="k gflickk"></span>quick note <span class="k gflickoutk"></span>quick note, a half step (out of key)</div>`;
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
    const notes = line.parts[p];
    const j = notes.findIndex((n) => n.step === g);
    // (a note bent into was already played: the note before it glides there)
    if (j >= 0 && !notes[j].bend) {
      const n = notes[j];
      let k = j, len = n.len;
      const bends: { at: number; to: number; over: number }[] = [];
      while (notes[k + 1]?.bend) {
        k++;
        bends.push({ at: (notes[k].step - n.step) * six, to: notes[k].midi, over: notes[k].bend! * six });
        len += notes[k].len;
      }
      // quick notes: a jump there and back (struck), or at the note's end a bend there
      const taps: number[] = [], rests: { at: number; len: number }[] = [];
      for (const f of n.flicks ?? []) {
        bends.push({ at: f.at * six, to: f.midi, over: f.bend ? f.len * six * 0.9 : 0 });
        if (f.bend) continue;
        bends.push({ at: (f.at + f.len) * six, to: n.midi, over: 0 });
        taps.push(f.at * six);
        // (a split second's silence, then the held note struck again)
        if (f.gap) { rests.push({ at: (f.at + f.len) * six, len: f.gap * six }); taps.push((f.at + f.len + f.gap) * six); }
      }
      synth!.play(n.midi, time, len * six, 0.8, bends, taps, rests);
    }
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
  pickSeg('g-voice', (v) => { voice = v as typeof voice; rewrite(); });
  pickSeg('g-flicks', (v) => { flicks = v as Flicks; rewrite(); });
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
      // (a bend: the note before held on, its pitch bent to this one (the standard range: a whole step))
      // (quick notes: the held note cut around them)
      let held: { midi: number; start: number; end: number; flicks?: GuideNote['flicks'] } | null = null;
      const flush = () => {
        if (!held) return;
        let from = held.start;
        for (const f of held.flicks ?? []) {
          const fa = held.start + Math.round(f.at * step), fe = fa + Math.round(f.len * step);
          if (fa > from) t.addNote({ midi: held.midi, ticks: from, durationTicks: fa - from, velocity: 0.8 });
          t.addNote({ midi: f.midi, ticks: fa, durationTicks: fe - fa, velocity: 0.9 });
          from = fe + Math.round((f.gap ?? 0) * step);
        }
        if (held.end > from) t.addNote({ midi: held.midi, ticks: from, durationTicks: held.end - from, velocity: 0.8 });
      };
      for (const n of p) {
        const at = Math.round((off + n.step) * step), end = Math.round((off + n.step + n.len) * step);
        if (n.bend && held) {
          const to = Math.max(-1, Math.min(1, (n.midi - held.midi) / 2));
          for (let q = 1; q <= 8; q++) t.addPitchBend({ ticks: at + Math.round((q / 8) * n.bend * step), value: to * (q / 8) });
          held.end = end;
          continue;
        }
        if (held && t.pitchBends.length) t.addPitchBend({ ticks: at, value: 0 });
        flush();
        held = { midi: n.midi, start: at, end, flicks: n.flicks };
      }
      flush();
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
    update(l, m, h = null) {
      const sing = h ?? null;
      if (sing !== singer) { singer = sing; if (voice !== 'mid') { list = l; mood = m; rewrite(); return; } }
      // the same music again (a redraw): keep the line
      if (l.length === list.length && l.every((x, i) => x === list[i]) && m === mood) return;
      list = l;
      mood = m;
      rewrite();
    },
  };
}
