// The Guide line's own section of the page (experiment): add it, lean in or out of the chords, hear it
// with or without the band, reroll it, see it drawn over the song, download it as MIDI. Generate & play and
// Play from here too, to try new songs quickly (Paul).

import { Midi } from '@tonejs/midi';
import type { Engine } from '../audio/engine';
import type { Idea } from '../idea';
import type { Mood } from '../tension';
import type { HighVoice } from '../parts/singers';
import { FLICK_LEVELS, type Flicks, type GuideLine, type GuideNote, type Lean, noteName, writeGuide } from './line';
import { GuideSynth } from './synth';
import { type GuideSing, GuideVoice } from './voice';
import { TIMBRE_CHOICES } from '../audio/singer';
import { type GuideSungLine, guideWords } from './words';

export interface GuidePanel {
  /** New music (an idea, or a track's sections), and the song's mood (undefined: auto). */
  /** `singer`: the vocal's high voice, if it sings high (the Voice's Auto follows it). */
  update(list: Idea[], mood: Mood | undefined, singer?: HighVoice | null): void;
  /** The Play button's label follows the page's. */
  setPlaying(on: boolean): void;
}

/** The page's own Generate and Play, so the line can be tried on new songs without scrolling up. */
export interface GuideControls {
  /** A new song (as the page's Generate), then playing it from the start. */
  generateAndPlay(): Promise<void>;
  /** Play or stop (as the page's Play). */
  togglePlay(): Promise<void>;
}

const seg = (id: string, opts: [string, string][], on: string) =>
  `<div class="seg" id="${id}">${opts.map(([v, l]) => `<button data-v="${v}" class="${v === on ? 'on' : ''}">${l}</button>`).join('')}</div>`;

export function buildGuidePanel(root: HTMLElement, engine: Engine, ctl: GuideControls): GuidePanel {
  let on = false, lean: Lean = 'in', band = true, salt = 0, level = 70, flicks: Flicks = 'some';
  // (the voice: Auto follows the singer; High without a high singer: the rock tenor's range)
  let voice: 'auto' | 'mid' | 'high' = 'auto';
  let singer: HighVoice | null = null;
  const highNow = (): HighVoice | null => (voice === 'mid' ? null : voice === 'high' ? singer ?? 'tenor' : singer);
  let list: Idea[] = [];
  let mood: Mood | undefined;
  let line: GuideLine | null = null;
  let synth: GuideSynth | null = null;
  // (sung: the line's words in the Cornell voice instead of the synth; Paul turns it on and off)
  let sing = false;
  let singVoice: GuideSing = 'cornell';
  let words: GuideSungLine[][] | null = null;
  let singer2: GuideVoice | null = null;

  root.innerHTML = `
    <h2>Guide line <span class="exp">experiment</span></h2>
    <p class="hint">One note line through the whole song, in its key, shaped by the mood (the track's Mood). Mostly small steps; big leaps only after a pause. Separate from the vocals for now.</p>
    <button id="g-add" class="small">+ Add guide line</button>
    <div id="g-body" hidden>
      <div class="guiderow">
        <button id="g-gen" class="primary small" title="A new song (as Generate above), played from the start">Generate &amp; play</button>
        <button id="g-play" class="secondary small">Play</button>
      </div>
      <div class="guiderow">
        <label>Chords ${seg('g-lean', [['in', 'Lean in'], ['out', 'Lean out']], lean)}</label>
        <label>Hear ${seg('g-band', [['band', 'With band'], ['alone', 'Line only']], 'band')}</label>
        <label title="Auto: mid, or high if the singer sings high. High: up to its top where the song is high">Voice ${seg('g-voice', [['auto', 'Auto'], ['mid', 'Mid'], ['high', 'High']], voice)}</label>
        <label title="Sing the line's words (the same tune) in one of the singer's voices, instead of the synth">Sing <select id="g-sing" class="gsing"><option value="off" selected>Off</option>${TIMBRE_CHOICES.map((c) => `<option value="${c.id}">${c.label}</option>`).join('')}</select></label>
        <label title="Quick notes on the long ones: a step or two up or down for an 8th, then back; in 2-bar clusters of frequent, moderate and sparse">Quick notes ${seg('g-flicks', FLICK_LEVELS, flicks)}</label>
      </div>
      <div class="guiderow">
        <label class="grow">Volume <input type="range" id="g-vol" min="0" max="100" value="${level}"></label>
        <button id="g-reroll" class="small" title="Another line, same mood">Reroll</button>
        <button id="g-midi" class="small" title="The guide line as a MIDI file">MIDI</button>
        <button id="g-remove" class="small">Remove</button>
      </div>
      <div id="g-draw" class="guidedraw"></div>
      <div id="g-words" class="guidewords"></div>
      <ul class="notes" id="g-notes"></ul>
    </div>`;
  const $ = (id: string) => root.querySelector<HTMLElement>(`#${id}`)!;
  const body = $('g-body'), add = $('g-add'), draw = $('g-draw');

  const setBand = () => { engine.mixer.master.gain.rampTo(band || !on ? 0.8 : 0, 0.05); };

  const rewrite = () => {
    if (!on || !list.length) { line = null; words = null; draw.innerHTML = ''; $('g-notes').innerHTML = ''; $('g-words').innerHTML = ''; return; }
    line = writeGuide(list, mood, lean, salt, flicks, highNow());
    words = guideWords(list, line, salt);
    $('g-words').innerHTML = words.map((lines, si) => (lines.length ? `<p><b>${list[si].section?.label ?? 'Words'}</b> ${lines.map((l) => l.text).join(' / ')}</p>` : '')).join('');
    if (sing) { singer2 ??= new GuideVoice(engine.mixer.sectionLevel); singer2.setLevel(level); singer2.set(list, words, singVoice, highNow()); }
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
    // pushes (a tick up) and pulls (a tick down) on the held notes
    for (const n of all) for (const m of n.marks ?? []) {
      const xx = x(n.at + m.at), yy = y(n.midi);
      // (a pull's silence: a gap in the note)
      if (m.back) parts.push(`<rect x="${x(n.at + m.at + 1)}" y="${yy - 3.5}" width="${Math.max(1, x(m.back - 1))}" height="7" class="gquiet"/>`);
      parts.push(m.kind === 'push'
        ? `<line x1="${xx}" x2="${xx}" y1="${yy - 9}" y2="${yy - 3}" class="gpush"><title>push</title></line>`
        : `<line x1="${xx}" x2="${xx}" y1="${yy + 3}" y2="${yy + 9}" class="gpull"><title>pull</title></line>`);
    }
    draw.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="The guide line over the song">${parts.join('')}<line id="g-cur" x1="-5" x2="-5" y1="0" y2="${H}" class="gcur"/></svg>
      <div class="glegend"><span class="k gnote"></span>in key <span class="k gleap"></span>leap after a pause <span class="k gcol"></span>out-of-key colour <span class="k gbendk"></span>bend <span class="k gflickk"></span>quick note <span class="k gflickoutk"></span>quick note, a half step (out of key) <span class="k gpushk"></span>push <span class="k gpullk"></span>pull (then silence to the next beat)</div>`;
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
    if (sing && singer2) singer2.playStep(p, g, time);
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
      // (a pull: silence, the note struck again on the next beat)
      for (const m of n.marks ?? []) if (m.back && m.at + m.back < n.len) taps.push((m.at + m.back) * six);
      if (!sing) synth!.play(n.midi, time, len * six, 0.8, bends, taps, rests, (n.marks ?? []).map((m) => ({ at: m.at * six, kind: m.kind })));
    }
    if (cursor && g % 4 === 0) {
      const xx = ((offsets[p] + g) / drawnTotal) * drawnW;
      setTimeout(() => { cursor?.setAttribute('x1', `${xx}`); cursor?.setAttribute('x2', `${xx}`); }, Math.max(0, (time - engine.mixer.master.context.now()) * 1000));
    }
  };
  engine.onStop = () => { synth?.releaseAll(); singer2?.releaseAll(); cursor?.setAttribute('x1', '-5'); cursor?.setAttribute('x2', '-5'); };

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
  $('g-sing').addEventListener('change', (e) => {
    const v = (e.target as HTMLSelectElement).value;
    sing = v !== 'off';
    if (sing) singVoice = v as GuideSing;
    singer2?.releaseAll();
    if (sing) synth?.releaseAll();
    rewrite();
  });
  pickSeg('g-band', (v) => { band = v === 'band'; setBand(); });
  const setOn = (v: boolean) => {
    on = v;
    body.hidden = !on;
    add.hidden = on;
    if (on) { synth ??= new GuideSynth(engine.mixer.sectionLevel); synth.setLevel(level); } else { synth?.releaseAll(); singer2?.releaseAll(); }
    setBand();
    rewrite();
  };
  add.addEventListener('click', () => setOn(true));
  $('g-remove').addEventListener('click', () => setOn(false));
  $('g-vol').addEventListener('input', (e) => { level = +(e.target as HTMLInputElement).value; synth?.setLevel(level); singer2?.setLevel(level); });
  $('g-reroll').addEventListener('click', () => { salt++; rewrite(); });
  $('g-gen').addEventListener('click', () => { void ctl.generateAndPlay(); });
  $('g-play').addEventListener('click', () => { void ctl.togglePlay(); });
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
      // (pushes and pulls: the held note struck again there, louder or softer)
      let held: { midi: number; start: number; end: number; flicks?: GuideNote['flicks']; marks?: GuideNote['marks'] } | null = null;
      const flush = () => {
        if (!held) return;
        let from = held.start, vel = 0.8;
        const h = held;
        const evs = [...(h.flicks ?? []).map((f) => ({ at: f.at, f })), ...(h.marks ?? []).map((m) => ({ at: m.at, m }))].sort((a, b) => a.at - b.at);
        for (const e of evs) {
          const ea = h.start + Math.round(e.at * step);
          if (ea > from) t.addNote({ midi: h.midi, ticks: from, durationTicks: ea - from, velocity: vel });
          if ('m' in e) {
            // (a pull: a soft 16th, silence, the note back on the next beat)
            if (e.m!.back) { const fe = Math.min(h.end, ea + Math.round(step)); t.addNote({ midi: h.midi, ticks: ea, durationTicks: fe - ea, velocity: 0.3 }); from = h.start + Math.round((e.m!.at + e.m!.back) * step); vel = 0.8; continue; }
            from = ea; vel = e.m!.kind === 'push' ? 1 : 0.3; continue;
          }
          const f = e.f!, fe = ea + Math.round(f.len * step);
          t.addNote({ midi: f.midi, ticks: ea, durationTicks: fe - ea, velocity: 0.9 });
          from = fe + Math.round((f.gap ?? 0) * step);
          vel = 0.8;
        }
        if (h.end > from) t.addNote({ midi: h.midi, ticks: from, durationTicks: h.end - from, velocity: vel });
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
        held = { midi: n.midi, start: at, end, flicks: n.flicks, marks: n.marks };
      }
      flush();
      // (the words, as lyrics, each syllable at its note; the carried-on ones left out)
      for (const L of words?.[si] ?? []) for (const x of L.notes) if (x.syl.text !== '~') midi.header.meta.push({ type: 'lyrics', text: (x.syl.wordStart ? ' ' : '') + x.syl.text, ticks: Math.round((off + x.step) * step) });
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
    setPlaying(v) {
      const b = $('g-play');
      b.textContent = v ? 'Stop' : 'Play';
      b.classList.toggle('on', v);
    },
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
