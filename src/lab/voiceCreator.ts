// The voice creator (voice-creator.html, dev only): Paul tunes a FOF voice by hand (Paul: "give me the
// controls to tune these parameters in a voice creator"). Start from any genre's voice or character,
// move the sliders, hear a song sample, a held note or a climb; save voices in the browser, and copy
// the settings back to Claude to make one a voice in the app (voices.ts).

import { lagFor, perform } from '../audio/feel';
import { FOF_RATE, type FofVoice, renderFof } from '../audio/fof';
import { polishVoice } from '../audio/polish';
import type { SungNote } from '../audio/sing';
import { CHARACTERS, type Character, VOICES, fofFor } from '../audio/voices';
import { generate } from '../generator';
import type { Genre } from '../genres';
import type { Syllable, Vowel } from '../parts/lyrics';
import { buildTrack, defaultTrackOptions } from '../track';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = (m: number) => `${NAMES[m % 12]}${Math.floor(m / 12) - 1}`;

type Key = keyof FofVoice;
interface Spec { key: Key; label: string; min: number; max: number; step: number; def: number; tip: string; fmt?: (x: number) => string }
const pct = (x: number) => `${Math.round(x * 100)}`;
const GROUPS: [string, Spec[]][] = [
  ['Size and weight', [
    { key: 'tract', label: 'Throat length', min: 0.86, max: 1.08, step: 0.01, def: 1, tip: 'Lower: a bigger, darker person. Higher: smaller, lighter.', fmt: (x) => x.toFixed(2) },
    { key: 'body', label: 'Low end', min: 0, max: 12, step: 0.5, def: 5, tip: 'The chest and body under the voice (dB).', fmt: (x) => `${x}` },
    { key: 'heft', label: 'Weight up high', min: 0, max: 1, step: 0.05, def: 0, tip: 'Keeps the chest weight on high, pushed notes (no thinning out).', fmt: pct },
    { key: 'bw', label: 'Resonance width', min: 0.9, max: 1.8, step: 0.05, def: 1, tip: 'Wider: less ringing, softer. Narrower: purer, more ring.', fmt: (x) => x.toFixed(2) },
  ]],
  ['Grit', [
    { key: 'grit', label: 'Rasp', min: 0, max: 1, step: 0.05, def: 0, tip: 'Bluesy roughness, growing as the voice pushes.', fmt: pct },
    { key: 'distort', label: 'Scream', min: 0, max: 1, step: 0.05, def: 0, tip: 'A distorted scream on pushed notes (loud, or up past the break).', fmt: pct },
    { key: 'fry', label: 'Vocal fry', min: 0, max: 1, step: 0.05, def: 0, tip: 'A creak into and out of each line, and on the lowest notes.', fmt: pct },
    { key: 'breath', label: 'Breath', min: -45, max: -15, step: 1, def: -24, tip: 'Air in the tone (dB). Higher: breathier.', fmt: (x) => `${x}` },
  ]],
  ['Placement and bite', [
    { key: 'twang', label: 'Forward ring', min: 0, max: 1, step: 0.05, def: 0, tip: 'Twang, "in the mask": the 2.5-4 kHz bite that cuts through guitars.', fmt: pct },
    { key: 'edge', label: 'Edge', min: 0, max: 1, step: 0.05, def: 0, tip: 'Pressed, brighter folds; fills the upper mids.', fmt: pct },
    { key: 'nasal', label: 'Nasal', min: 0, max: 0.6, step: 0.02, def: 0, tip: 'A little of the nose in every vowel.', fmt: pct },
    { key: 'bright', label: 'Brightness', min: -3, max: 3, step: 0.25, def: 0, tip: 'Overall treble (dB per octave).', fmt: (x) => x.toFixed(2) },
    { key: 'cover', label: 'Round vowels', min: 0, max: 1, step: 0.05, def: 0, tip: 'Darker, rounder, more "aw" (a lowered larynx). Classical-leaning.', fmt: pct },
    { key: 'spread', label: 'Open vowels', min: 0, max: 1, step: 0.05, def: 0, tip: 'Lips spread, vowels open and speech-like.', fmt: pct },
    { key: 'raw', label: 'Raw (untrained)', min: 0, max: 1, step: 0.05, def: 0, tip: 'The throat rising with the pitch, as a rock singer\'s does.', fmt: pct },
    { key: 'plain', label: 'Less operatic', min: 0, max: 1, step: 0.05, def: 0, tip: 'Less vibrato and less ring up top.', fmt: pct },
  ]],
  ['Delivery', [
    { key: 'soft', label: 'Softness', min: 0, max: 1, step: 0.05, def: 0, tip: 'A singer, not someone shouting.', fmt: pct },
    { key: 'softPushed', label: 'Soft when pushing', min: 0, max: 1, step: 0.05, def: 0, tip: 'Softness on the loud and low notes. Lower: full-throated pushes.', fmt: pct },
    { key: 'expr', label: 'Expression', min: 0, max: 1, step: 0.05, def: 0, tip: 'The tone moving with the moment: breathy starts, strain up high, weight on key words.', fmt: pct },
    { key: 'human', label: 'Human unevenness', min: 0, max: 1, step: 0.05, def: 1, tip: 'The small wobbles of a real voice.', fmt: pct },
    { key: 'scoop', label: 'Scoops', min: 0, max: 1, step: 0.05, def: 0, tip: 'Sliding up into notes from below.', fmt: pct },
    { key: 'sag', label: 'Sags', min: 0, max: 1, step: 0.05, def: 0, tip: 'Held notes drooping a little at their end.', fmt: pct },
  ]],
  ['Vibrato and pitch', [
    { key: 'vib', label: 'Vibrato depth', min: 0, max: 60, step: 1, def: 30, tip: 'Cents, on held notes.', fmt: (x) => `${x}` },
    { key: 'vibHz', label: 'Vibrato speed', min: 4, max: 7, step: 0.1, def: 5.6, tip: 'Slow and wide is a wobble; quick and narrow a tight one (Hz).', fmt: (x) => x.toFixed(1) },
    { key: 'drift', label: 'Pitch wander', min: 0, max: 15, step: 0.5, def: 4, tip: 'A slow drift in pitch (cents).', fmt: (x) => `${x}` },
  ]],
  ['Range', [
    { key: 'brk', label: 'Break', min: 55, max: 72, step: 1, def: 64, tip: 'Where the voice changes gear into its way up.', fmt: noteName },
  ]],
];
const SPECS = GROUPS.flatMap(([, s]) => s);
const UPS: [NonNullable<FofVoice['up']>, string][] = [['belt', 'Power belt'], ['scream', 'Scream'], ['squeal', 'Squeal'], ['falsetto', 'Falsetto']];

/* ---- presets: each genre's voice, and each character on the rock voice */

const GENRES = Object.keys(VOICES) as Genre[];
const PRESETS: Record<string, { label: string; v: Partial<FofVoice> }> = {};
for (const g of GENRES) PRESETS[g] = { label: `${VOICES[g].label} voice`, v: fofFor(g, 17, false) };
for (const c of Object.keys(CHARACTERS) as Character[]) PRESETS[c] = { label: `${CHARACTERS[c].label} (on Rock)`, v: fofFor('rock', 17, false, c) };
const clean = (v: Partial<FofVoice>): Partial<FofVoice> => { const o = { ...v }; delete o.seed; delete o.high; delete o.energy; return o; };

const state = { preset: 'cornell', v: clean(PRESETS.cornell.v) as Partial<FofVoice>, material: 'song', pitch: 57, vowel: 'AA' as Vowel, effort: 0.8 };
// (left out, a setting is the engine's own: soft when pushing follows the softness)
const read = (v: Partial<FofVoice>, s: Spec): number => (v[s.key] as number | undefined) ?? (s.key === 'softPushed' ? v.soft ?? 0 : s.def);
const valueOf = (s: Spec) => read(state.v, s);
const presetValue = (s: Spec) => read(PRESETS[state.preset].v, s);

/* ---- the sliders */

function buildSliders() {
  const box = $('groups');
  box.innerHTML = '';
  for (const [name, specs] of GROUPS) {
    const card = document.createElement('section');
    card.className = 'card';
    card.innerHTML = `<h2>${name}</h2>`;
    for (const s of specs) {
      const row = document.createElement('div');
      row.className = 'slider';
      row.dataset.key = s.key;
      row.innerHTML = `<label for="s-${s.key}">${s.label}</label><input type="range" id="s-${s.key}" min="${s.min}" max="${s.max}" step="${s.step}"><span class="val"></span><span class="tip">${s.tip}</span>`;
      const input = row.querySelector('input')!;
      input.addEventListener('input', () => { (state.v as Record<string, unknown>)[s.key] = Number(input.value); show(); });
      input.addEventListener('change', () => replay());
      card.append(row);
    }
    if (name === 'Range') {
      const up = document.createElement('label');
      up.className = 'f';
      up.innerHTML = `Way up past the break <select id="wayUp">${UPS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select>`;
      card.append(up);
      up.querySelector('select')!.addEventListener('change', (e) => { state.v.up = (e.target as HTMLSelectElement).value as FofVoice['up']; show(); replay(); });
    }
    box.append(card);
  }
}

function show() {
  for (const s of SPECS) {
    const row = document.querySelector<HTMLElement>(`.slider[data-key="${s.key}"]`)!;
    const input = row.querySelector('input')!;
    const x = valueOf(s);
    input.value = String(x);
    row.querySelector('.val')!.textContent = (s.fmt ?? String)(x);
    row.classList.toggle('changed', Math.abs(x - presetValue(s)) > 1e-9);
  }
  const up = document.getElementById('wayUp') as HTMLSelectElement | null;
  if (up) up.value = state.v.up ?? 'belt';
  $('note').textContent = noteName(state.pitch);
  $('heldOpts').style.display = state.material === 'held' ? '' : 'none';
  $<HTMLTextAreaElement>('json').value = settingsText();
}

function changed(): Partial<FofVoice> {
  const out: Record<string, unknown> = {};
  for (const s of SPECS) if (Math.abs(valueOf(s) - presetValue(s)) > 1e-9) out[s.key] = valueOf(s);
  if ((state.v.up ?? 'belt') !== (PRESETS[state.preset].v.up ?? 'belt')) out.up = state.v.up;
  return out as Partial<FofVoice>;
}
function settingsText() {
  const full: Record<string, unknown> = {};
  for (const s of SPECS) full[s.key] = valueOf(s);
  full.up = state.v.up ?? 'belt';
  return JSON.stringify({ from: PRESETS[state.preset].label, changed: changed(), full }, null, 1);
}

/* ---- what to sing */

const syl = (vowel: Vowel, onset: Syllable['onset'] = []): Syllable => ({ onset, vowel, coda: [], stress: true, text: '', wordStart: true });
let songCache: { lines: SungNote[][]; verse: number } | null = null;
/** The timbre lab's sample: a rock song's two verse lines (soft) and three chorus lines (pushed, a long high note). */
function song() {
  if (songCache) return songCache;
  const seed = 'rasp-3';
  const idea = generate({ genre: 'rock', meter: '4/4', weirdness: 0.3 } as Parameters<typeof generate>[0], {
    song: seed, chords: `${seed}c`, drums: `${seed}d`, strum: `${seed}s`, bass: `${seed}b`, vocal: `${seed}v`,
  });
  const track = buildTrack(idea, defaultTrackOptions(idea)) as unknown as { sections?: typeof idea[] } & (typeof idea)[];
  const sections = track.sections ?? track;
  const out: Record<string, SungNote[][]> = {};
  for (const kind of ['verse', 'chorus']) {
    const sec = sections.find((s) => s.section?.kind === kind && s.vocal?.length);
    if (!sec) continue;
    const groups: NonNullable<typeof sec.vocal>[] = [];
    for (const n of sec.vocal!) { if (n.start || !groups.length) groups.push([]); groups[groups.length - 1].push(n); }
    const six = 15 / sec.song.bpm;
    out[kind] = groups.map((L) => perform(L.map((n) => ({ t: (n.step - L[0].step) * six, end: (n.step + n.len - L[0].step) * six, midi: n.midi, vel: n.vel, syl: n.syl, slide: n.slide, fall: n.fall })), lagFor(idea.seeds.vocal ?? idea.seeds.song), L[0].step + L.length * 7));
  }
  const cut = (l: SungNote[]) => { const k = l.findIndex((n) => n.end - l[0].t > 5); return k < 0 ? l : l.slice(0, Math.max(3, k)); };
  const verse = (out.verse ?? []).slice(0, 2).map(cut), chorus = (out.chorus ?? []).slice(0, 3).map(cut);
  const lines = [...verse.map((L) => L.map((n) => ({ ...n, vel: Math.min(n.vel, 0.7) }))), ...chorus.map((L) => L.map((n) => ({ ...n, vel: Math.max(n.vel, 0.85) })))];
  songCache = { lines, verse: verse.length };
  return songCache;
}

function material(): { lines: SungNote[][]; energy: number[]; level: number[] } {
  if (state.material === 'held') {
    return { lines: [[{ t: 0, end: 1.8, midi: state.pitch, vel: state.effort, syl: syl(state.vowel) }]], energy: [state.effort > 0.85 ? 0.85 : 0.5], level: [0.85] };
  }
  if (state.material === 'climb') {
    const steps = [45, 48, 52, 55, 57, 60, 62, 64, 65, 67, 69, 72, 69, 67, 64, 60, 57, 52, 48];
    const notes = steps.map((m, i): SungNote => ({ t: i * 0.6, end: i * 0.6 + 0.5, midi: m, vel: 0.65 + 0.3 * Math.min(1, Math.max(0, (m - 45) / 27)), syl: syl(i % 3 === 2 ? 'AA' : 'EH', ['Y']) }));
    return { lines: [notes], energy: [0.7], level: [0.85] };
  }
  const s = song();
  return { lines: s.lines, energy: s.lines.map((_, i) => (i < s.verse ? 0.3 : 0.85)), level: s.lines.map((_, i) => (i < s.verse ? 0.6 : 0.85)) };
}

/* ---- sound */

let ctx: AudioContext | null = null;
let playing: AudioBufferSourceNode | null = null;
const PRE = 0.3;
function stop() { try { playing?.stop(); } catch { /* (not started) */ } playing = null; }
async function play() {
  $('status').textContent = 'Singing…';
  await new Promise((r) => setTimeout(r, 20));
  const t0 = performance.now();
  const m = material();
  const v: FofVoice = { ...(state.v as FofVoice) };
  const parts = m.lines.map((L, i) => {
    let pcm = renderFof(L, { ...v, seed: 17 + i, energy: m.energy[i] }, PRE);
    if ($<HTMLInputElement>('polish').checked) pcm = polishVoice(pcm, FOF_RATE, { comp: 'natural' });
    return pcm.map((x) => x * m.level[i]);
  });
  const gap = Math.round(0.5 * FOF_RATE);
  const out = new Float32Array(parts.reduce((a, p) => a + p.length + gap, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length + gap; }
  ctx ??= new AudioContext();
  stop();
  const buf = ctx.createBuffer(1, out.length, FOF_RATE);
  buf.copyToChannel(out as Float32Array<ArrayBuffer>, 0);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(ctx.destination);
  src.start();
  playing = src;
  $('status').textContent = `Sung in ${Math.round(performance.now() - t0)} ms`;
}
let timer = 0;
function replay() {
  show();
  if (!$<HTMLInputElement>('auto').checked) return;
  clearTimeout(timer);
  timer = window.setTimeout(play, 250);
}

/* ---- saved voices (this browser only) */

interface Saved { name: string; preset: string; v: Partial<FofVoice> }
const KEY = 'voiceCreator.saved';
const loadSaved = (): Saved[] => { try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; } };
const storeSaved = (s: Saved[]) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* (private window) */ } };
function showSaved() {
  const box = $('saved');
  box.innerHTML = '';
  loadSaved().forEach((s, i) => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.innerHTML = `<button class="go"></button><button title="Delete">×</button>`;
    const [go, del] = chip.querySelectorAll('button');
    go.textContent = s.name;
    go.onclick = () => { state.preset = PRESETS[s.preset] ? s.preset : 'rock'; $<HTMLSelectElement>('preset').value = state.preset; state.v = { ...s.v }; replay(); };
    del.onclick = () => { const all = loadSaved(); all.splice(i, 1); storeSaved(all); showSaved(); };
    box.append(chip);
  });
}

/* ---- wiring */

const presetSel = $<HTMLSelectElement>('preset');
presetSel.innerHTML = Object.entries(PRESETS).map(([k, p]) => `<option value="${k}">${p.label}</option>`).join('');
presetSel.value = state.preset;
presetSel.onchange = () => { state.preset = presetSel.value; state.v = clean(PRESETS[state.preset].v); replay(); };
$('reset').onclick = () => { state.v = clean(PRESETS[state.preset].v); replay(); };
$<HTMLSelectElement>('material').onchange = (e) => { state.material = (e.target as HTMLSelectElement).value; replay(); };
$('down').onclick = () => { state.pitch = Math.max(40, state.pitch - 1); replay(); };
$('up1').onclick = () => { state.pitch = Math.min(79, state.pitch + 1); replay(); };
$<HTMLSelectElement>('vowel').onchange = (e) => { state.vowel = (e.target as HTMLSelectElement).value as Vowel; replay(); };
$<HTMLSelectElement>('effort').onchange = (e) => { state.effort = Number((e.target as HTMLSelectElement).value); replay(); };
$<HTMLInputElement>('polish').onchange = () => replay();
$('play').onclick = () => { void play(); };
$('stop').onclick = stop;
$('save').onclick = () => {
  const name = prompt('Name this voice', `${PRESETS[state.preset].label.split(' ')[0]} ${loadSaved().length + 1}`);
  if (!name) return;
  storeSaved([...loadSaved(), { name, preset: state.preset, v: { ...state.v } }]);
  showSaved();
};
$('copy').onclick = async () => {
  try { await navigator.clipboard.writeText(settingsText()); $('copied').textContent = 'Copied'; } catch { $<HTMLTextAreaElement>('json').select(); $('copied').textContent = 'Select and copy'; }
  setTimeout(() => { $('copied').textContent = ''; }, 2000);
};

buildSliders();
showSaved();
show();
