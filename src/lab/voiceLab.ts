// The voice lab page (voice-lab.html, dev only): Paul mixes the three registers by hand at each pitch,
// hears it at once, saves mixes at a few pitches and plays a scale or the clips' phrase moving between
// them, then copies the settings back (docs/VOICES.md).

import { renderLine, type SungNote, type VoiceRecipe } from '../audio/sing';
import type { Genre } from '../genres';
import type { Cons, Syllable, Vowel } from '../parts/lyrics';
import { BASE, VOICES, type WayUp, autoShares, voiceDown } from '../audio/voices';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = (m: number) => `${NAMES[m % 12]}${Math.floor(m / 12) - 1}`;
const syl = (onset: Cons[], vowel: Vowel, coda: Cons[] = []): Syllable => ({ onset, vowel, coda, stress: false, text: '', wordStart: true });

type Point = [number, number, number, number];
const state = {
  voice: 'rock' as Genre, up: 'belt' as WayUp, vowel: 'AA' as Vowel, effort: 0.85, pitch: 52,
  mix: [50, 50, 0] as [number, number, number],
  grit: 0.5, airy: -20, drive: 0.2, vib: 0.35, edge: 0.6, ring: 0,
  points: [] as Point[],
};

/* ---- the voice */

function lab(points: Point[] | undefined): VoiceRecipe {
  const v = VOICES[state.voice];
  return {
    // (the lab always mixes the three registers, even for the voices that don't: that's what it's for)
    ...BASE, ...v.recipe, brk: v.brk, high: state.up, three: true,
    grit: state.grit, airy: state.airy, drive: state.drive, vib: state.vib, edge: state.edge, ring: state.ring,
    regPoints: points,
  };
}
const shares = (): [number, number, number] => {
  const s = state.mix[0] + state.mix[1] + state.mix[2] || 1;
  return [state.mix[0] / s, state.mix[1] / s, state.mix[2] / s];
};
/** The saved mixes; with none, the engine's Auto (by pitch, vowel and how hard each note is sung). */
function savedOrAuto(): Point[] | undefined {
  return state.points.length ? state.points : undefined;
}

/* ---- sound */

let ctx: AudioContext | null = null;
let playing: AudioBufferSourceNode | null = null;
function play(samples: Float32Array, rate: number) {
  ctx ??= new AudioContext();
  playing?.stop();
  const buf = ctx.createBuffer(1, samples.length, rate);
  buf.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.value = 0.9;
  src.connect(g).connect(ctx.destination);
  src.start();
  playing = src;
}
const PRE = 0.3;
const sing = (notes: SungNote[], l: VoiceRecipe) => renderLine(notes, { high: false, slides: 0, seed: 11, recipe: l }, PRE);
function join(parts: Float32Array[], rate: number): Float32Array {
  const gap = Math.round(0.35 * rate);
  const out = new Float32Array(parts.reduce((a, p) => a + p.length + gap, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length + gap; }
  return out;
}

function playNote(only?: 0 | 1 | 2) {
  const [d, m, h] = only === undefined ? shares() : ([0, 1, 2].map((i) => (i === only ? 1 : 0)) as [number, number, number]);
  const l = lab([[state.pitch, d, m, h]]);
  play(sing([{ t: 0, end: 1.6, midi: state.pitch, vel: state.effort, syl: syl([], state.vowel) }], l), l.rate!);
}

function playScale() {
  const ps = state.points.map((p) => p[0]);
  const lo = ps.length >= 2 ? Math.min(...ps) : state.pitch - 7, hi = ps.length >= 2 ? Math.max(...ps) : state.pitch + 7;
  const l = lab(savedOrAuto());
  const notes: SungNote[] = [];
  for (let m = lo, t = 0; m <= hi; m++, t += 0.42) notes.push({ t, end: t + (m === hi ? 1.2 : 0.42), midi: m, vel: state.effort, syl: syl(m === lo ? [] : [], state.vowel) });
  // (one breath: the notes joined on the vowel)
  notes.forEach((n, i) => { if (i) n.syl = { ...n.syl, text: '~' }; });
  play(sing(notes, l), l.rate!);
}

/** The clips' phrase: their low line, the climb past the break, the wail to C5. */
function playPhrase() {
  const l = lab(savedOrAuto());
  const L1: [Syllable, number, number, number, number][] = [
    [syl([], 'AY', ['V']), 55, 0, 0.25, 0.85], [syl(['B'], 'IH', ['N']), 57, 0.25, 0.5, 0.75], [syl(['W'], 'AO'), 59, 0.5, 0.75, 0.85],
    [syl(['K'], 'IH', ['NG']), 57, 0.75, 1, 0.75], [syl([], 'AO', ['L']), 55, 1, 1.25, 0.85], [syl(['N'], 'AY', ['T']), 59, 1.25, 1.5, 0.75],
    [syl(['L'], 'AO', ['NG']), 60, 1.5, 2.6, 0.85]];
  const L2: typeof L1 = [[syl(['HH'], 'OW', ['L', 'D']), 62, 0, 0.375, 0.85], [syl([], 'AA', ['N']), 64, 0.375, 0.75, 0.75], [syl(['T'], 'UW'), 66, 0.75, 1, 0.85],
    [syl(['M'], 'IY'), 67, 1, 1.25, 0.85], [syl(['N'], 'AW'), 69, 1.25, 2.9, 0.95]];
  const L3: typeof L1 = [[syl(['Y'], 'EH'), 67, 0, 0.375, 0.9], [syl([], 'EH'), 69, 0.375, 0.75, 0.9], [syl([], 'EH', ['Y']), 71, 0.75, 1.1, 0.95],
    [syl(['Y'], 'EH'), 72, 1.1, 3.0, 0.95]];
  const lines = [[L1, voiceDown(state.voice)], [L2, 0], [L3, 0]] as const;
  play(join(lines.map(([L, down]) => sing(L.map(([s, m, t, end, vel]) => ({ t, end, midi: m - down, vel, syl: s })), l)), l.rate!), l.rate!);
}

/* ---- the page */

const sliders: [string, string, (v: number) => void, () => number, (v: number) => string][] = [
  ['grit', 'vgrit', (v) => { state.grit = v / 100; }, () => state.grit * 100, (v) => `${v}`],
  // (breath: up to 12 dB more than before; Paul had it at the old top)
  ['breath', 'vbreath', (v) => { state.airy = -32 + (v / 100) * 36; }, () => ((state.airy + 32) / 36) * 100, (v) => `${v}`],
  ['drive', 'vdrive', (v) => { state.drive = (v / 100) * 0.6; }, () => (state.drive / 0.6) * 100, (v) => `${v}`],
  ['vib', 'vvib', (v) => { state.vib = v / 100; }, () => state.vib * 100, (v) => `${v}`],
  ['edge', 'vedge', (v) => { state.edge = v / 100; }, () => state.edge * 100, (v) => `${v}`],
  ['ring', 'vring', (v) => { state.ring = v / 100; }, () => state.ring * 100, (v) => `${v}`],
];

function render() {
  const v = VOICES[state.voice];
  $('note').textContent = noteName(state.pitch);
  $<HTMLInputElement>('pitch').value = String(state.pitch);
  const x = state.pitch - v.brk;
  $('brkHint').textContent = `This voice's break: ${noteName(v.brk)} · this note is ${x === 0 ? 'at the break' : `${Math.abs(x)} ${Math.abs(x) === 1 ? 'note' : 'notes'} ${x > 0 ? 'above' : 'below'} it`}`;
  const [d, m, h] = shares();
  (['D', 'M', 'H'] as const).forEach((k, i) => {
    $<HTMLInputElement>(`r${k}`).value = String(state.mix[i]);
    $(`v${k}`).textContent = `${Math.round([d, m, h][i] * 100)}%`;
    $(`b${k}`).style.width = `${[d, m, h][i] * 100}%`;
  });
  for (const [id, vid, , get] of sliders) {
    const val = Math.round(get());
    $<HTMLInputElement>(id).value = String(val);
    $(vid).textContent = String(val);
  }
  const box = $('points');
  box.innerHTML = '';
  if (!state.points.length) box.innerHTML = '<span class="hint">None yet. Without saved mixes, scales and the phrase use Auto.</span>';
  for (const p of [...state.points].sort((a, b) => a[0] - b[0])) {
    const c = document.createElement('span');
    c.className = 'chip';
    c.innerHTML = `<button class="go" title="Go to this pitch and mix">${noteName(p[0])}: ${Math.round(p[1] * 100)} / ${Math.round(p[2] * 100)} / ${Math.round(p[3] * 100)}</button><button title="Remove">×</button>`;
    const [go, rm] = c.querySelectorAll('button');
    go.onclick = () => { state.pitch = p[0]; state.mix = [Math.round(p[1] * 100), Math.round(p[2] * 100), Math.round(p[3] * 100)]; render(); live(); };
    rm.onclick = () => { state.points = state.points.filter((q) => q !== p); render(); };
    box.appendChild(c);
  }
  $<HTMLTextAreaElement>('out').value = JSON.stringify({
    voice: v.label, wayUp: state.up, vowel: state.vowel, effort: state.effort,
    grit: +state.grit.toFixed(2), breath: Math.round(((state.airy + 32) / 36) * 100), drive: +state.drive.toFixed(2), vibrato: +state.vib.toFixed(2), edge: +state.edge.toFixed(2), ring: +state.ring.toFixed(2),
    now: { pitch: noteName(state.pitch), deep: +d.toFixed(2), mid: +m.toFixed(2), high: +h.toFixed(2) },
    saved: [...state.points].sort((a, b) => a[0] - b[0]).map((p) => ({ pitch: noteName(p[0]), midi: p[0], deep: +p[1].toFixed(2), mid: +p[2].toFixed(2), high: +p[3].toFixed(2) })),
  }, null, 1);
}

let liveTimer = 0;
function live() {
  if (!$<HTMLInputElement>('live').checked) return;
  clearTimeout(liveTimer);
  liveTimer = window.setTimeout(playNote, 120);
}

function setPitch(p: number) {
  state.pitch = Math.max(40, Math.min(76, p));
  render();
  live();
}

// voices
const vs = $<HTMLSelectElement>('voice');
vs.innerHTML = Object.entries(VOICES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
function useVoice(k: Genre) {
  state.voice = k as Genre;
  const v = { ...BASE, ...VOICES[k].recipe };
  state.up = VOICES[k].up;
  state.grit = v.grit ?? 0.5; state.airy = v.airy ?? -20; state.drive = v.drive ?? 0.2; state.vib = v.vib ?? 0.35;
  $<HTMLSelectElement>('up').value = state.up;
  state.mix = autoShares(VOICES[k], state.pitch, state.vowel, state.effort).map((s) => Math.round(s * 100)) as [number, number, number];
}
vs.onchange = () => { useVoice(vs.value as Genre); render(); live(); };
$<HTMLSelectElement>('up').onchange = (e) => { state.up = (e.target as HTMLSelectElement).value as WayUp; render(); live(); };
$<HTMLSelectElement>('vowel').onchange = (e) => { state.vowel = (e.target as HTMLSelectElement).value as Vowel; render(); live(); };
$<HTMLSelectElement>('effort').onchange = (e) => { state.effort = +(e.target as HTMLSelectElement).value; render(); live(); };

// pitch
$('down').onclick = () => setPitch(state.pitch - 1);
$('upBtn').onclick = () => setPitch(state.pitch + 1);
$<HTMLInputElement>('pitch').oninput = (e) => setPitch(+(e.target as HTMLInputElement).value);
document.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).tagName === 'TEXTAREA') return;
  if (e.key === 'ArrowUp') { e.preventDefault(); setPitch(state.pitch + 1); }
  if (e.key === 'ArrowDown') { e.preventDefault(); setPitch(state.pitch - 1); }
});

// registers
(['D', 'M', 'H'] as const).forEach((k, i) => {
  const el = $<HTMLInputElement>(`r${k}`);
  el.oninput = () => { state.mix[i] = +el.value; render(); };
  el.onchange = () => live();
});
$('auto').onclick = () => { state.mix = autoShares(VOICES[state.voice], state.pitch, state.vowel, state.effort).map((s) => Math.round(s * 100)) as [number, number, number]; render(); live(); };
$('save').onclick = () => {
  const [d, m, h] = shares();
  state.points = state.points.filter((p) => p[0] !== state.pitch).concat([[state.pitch, d, m, h]]);
  render();
};
$('clear').onclick = () => { state.points = []; render(); };

// character
for (const [id, , set] of sliders) {
  const el = $<HTMLInputElement>(id);
  el.oninput = () => { set(+el.value); render(); };
  el.onchange = () => live();
}

// play, copy
$('play').onclick = () => playNote();
$('soloD').onclick = () => playNote(0);
$('soloM').onclick = () => playNote(1);
$('soloH').onclick = () => playNote(2);
$('scale').onclick = playScale;
$('phrase').onclick = playPhrase;
$('copy').onclick = async () => {
  const t = $<HTMLTextAreaElement>('out');
  try { await navigator.clipboard.writeText(t.value); } catch { t.select(); document.execCommand('copy'); }
  $('copied').textContent = 'Copied. Paste it into the chat.';
};

useVoice('rock');
render();
