// The verse lab page (verse-lab.html, dev only): the new verse melody writer (src/verse/), one rule at a time.
// Plain WebAudio: a soft pad for the chords, a bass root, a bright tone for the tune.

import { NOTE_NAMES, SCALES, chordName, pianoVoicing, type Mode } from '../theory';
import { BARS, PROGRESSIONS, STEPS_PER_BAR, chordsFor, writeVerse, type Verse } from '../verse/verse';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const midiHz = (m: number) => 440 * 2 ** ((m - 69) / 12);

const keySel = $<HTMLSelectElement>('key');
const modeSel = $<HTMLSelectElement>('mode');
const progSel = $<HTMLSelectElement>('prog');
NOTE_NAMES.forEach((n, i) => keySel.add(new Option(n, String(i), i === 0, i === 0)));
(Object.keys(SCALES) as Mode[]).forEach((m) => modeSel.add(new Option(m, m, m === 'major', m === 'major')));

function fillProgs() {
  progSel.innerHTML = '';
  PROGRESSIONS[modeSel.value as Mode].forEach((p, i) => progSel.add(new Option(p.name, String(i))));
}

function build(): Verse {
  const mode = modeSel.value as Mode;
  const prog = PROGRESSIONS[mode][Number(progSel.value)];
  const chords = chordsFor(mode, prog.degrees, Number($<HTMLSelectElement>('each').value));
  return writeVerse({ key: Number(keySel.value), mode, chords, seed: $<HTMLInputElement>('seed').value });
}

/* ---- picture: chord names on top, one block per note */

const canvas = $<HTMLCanvasElement>('roll');
function draw(v: Verse, at = -1) {
  const dpr = devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const g = canvas.getContext('2d')!;
  g.scale(dpr, dpr);
  const css = getComputedStyle(document.body);
  const ink = css.color, accent = getComputedStyle(document.documentElement).getPropertyValue('--accent');
  const muted = getComputedStyle(document.documentElement).getPropertyValue('--muted');
  const top = 26, total = BARS * STEPS_PER_BAR, sw = w / total;
  const lo = Math.min(...v.notes.map((n) => n.midi)) - 4, hi = Math.max(...v.notes.map((n) => n.midi)) + 4;
  const nh = (h - top) / (hi - lo + 1);
  g.font = '12px system-ui'; g.textBaseline = 'middle';
  for (let b = 0; b < BARS; b++) {
    g.fillStyle = muted; g.globalAlpha = 0.35; g.fillRect(b * STEPS_PER_BAR * sw, top, 1, h - top);
    g.globalAlpha = 1; g.fillStyle = ink;
    const c = v.input.chords[b];
    if (b === 0 || chordName(v.input.key, c) !== chordName(v.input.key, v.input.chords[b - 1])) g.fillText(chordName(v.input.key, c), b * STEPS_PER_BAR * sw + 5, 12);
  }
  for (const n of v.notes) {
    g.fillStyle = n.step === at ? ink : accent;
    g.fillRect(n.step * sw + 1, top + (hi - n.midi) * nh, n.len * sw - 2, nh - 1);
  }
}

/* ---- sound */

let ctx: AudioContext | null = null;
let stopAt: (() => void) | null = null;
let raf = 0;

function tone(c: AudioContext, out: AudioNode, type: OscillatorType, hz: number, t: number, dur: number, gain: number) {
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.value = hz;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out);
  o.start(t); o.stop(t + dur + 0.05);
}

function play(v: Verse) {
  stop();
  ctx ??= new AudioContext();
  const c = ctx;
  void c.resume();
  const master = c.createGain();
  master.gain.value = 0.5;
  master.connect(c.destination);
  const eighth = 60 / Number($<HTMLInputElement>('bpm').value) / 2;
  const t0 = c.currentTime + 0.15;
  if ($<HTMLInputElement>('chordsOn').checked) {
    for (let b = 0; b < BARS; b++) {
      const ch = v.input.chords[b], t = t0 + b * STEPS_PER_BAR * eighth, d = STEPS_PER_BAR * eighth;
      for (const m of pianoVoicing(v.input.key, ch)) tone(c, master, 'triangle', midiHz(m), t, d, 0.07);
      tone(c, master, 'sine', midiHz(36 + ((v.input.key + ch.root) % 12)), t, d, 0.2);
    }
  }
  for (const n of v.notes) tone(c, master, 'sawtooth', midiHz(n.midi), t0 + n.step * eighth, n.len * eighth * 0.9, 0.12);
  const end = t0 + BARS * STEPS_PER_BAR * eighth;
  const tick = () => {
    const s = Math.floor((c.currentTime - t0) / eighth);
    draw(v, s >= 0 && s < BARS * STEPS_PER_BAR ? s : -1);
    if (c.currentTime < end + 0.3) raf = requestAnimationFrame(tick); else draw(v);
  };
  raf = requestAnimationFrame(tick);
  stopAt = () => { master.disconnect(); };
}
function stop() {
  cancelAnimationFrame(raf);
  stopAt?.(); stopAt = null;
  show();
}

let verse: Verse;
function show() {
  verse = build();
  draw(verse);
  const m = verse.notes;
  $('info').textContent = `${m.length} notes · tune sits on ${[...new Set(m.map((n) => NOTE_NAMES[n.midi % 12]))].join(', ')}`;
}

for (const id of ['key', 'mode', 'prog', 'each', 'seed']) $(id).addEventListener('change', () => { if (id === 'mode') fillProgs(); stop(); });
$('play').addEventListener('click', () => { verse = build(); play(verse); });
$('stop').addEventListener('click', stop);
addEventListener('resize', () => draw(verse));
fillProgs();
show();
