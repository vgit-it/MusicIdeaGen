// The voice creator (voice-creator.html, dev only): Paul tunes a FOF voice by hand (Paul: "give me the
// controls to tune these parameters in a voice creator"). Start from any genre's voice or character,
// move the sliders, hear a song sample, a held note or a climb; save voices in the browser, and copy
// the settings back to Claude to make one a voice in the app (voices.ts). Sung as the app sings: the
// voice as fofFor makes it (life, the consonants' settings and all), the singer's feel with the rush
// of a loud chorus, the line's level ridden (in renderFof), the genre's compression.

import { lagFor, perform } from '../audio/feel';
import { initScaleCheck } from './scaleCheck';
import { initQuiz } from './quiz';
import { initWords } from './words';
import { FOF_RATE, type FofVoice, renderFof } from '../audio/fof';
import { reverbIR } from '../audio/mixer';
import { polishVoice } from '../audio/polish';
import { VOCAL_COMP } from '../audio/singer';
import { HIGH_VOICES, type HighVoice } from '../parts/singers';
import type { SungNote } from '../audio/sing';
import { CHARACTERS, type Character, VOICES, fofFor, fofHigh, highLift } from '../audio/voices';
import { generate } from '../generator';
import type { Genre } from '../genres';
import type { Syllable, Vowel } from '../parts/lyrics';
import { buildTrack, defaultTrackOptions } from '../track';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = (m: number) => `${NAMES[m % 12]}${Math.floor(m / 12) - 1}`;

/** A setting's key: a FofVoice field, or one inside its consonants' settings ('cons.blend', 'stops.burst'). */
type Key = string;
interface Spec { key: Key; label: string; min: number; max: number; step: number; def: number; tip: string; fmt?: (x: number) => string }
const getAt = (v: Partial<FofVoice>, key: Key): unknown => key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], v);
function setAt(v: Partial<FofVoice>, key: Key, x: unknown) {
  const [a, b] = key.split('.');
  const o = v as Record<string, unknown>;
  if (b === undefined) { o[a] = x; return; }
  o[a] = { ...(o[a] as object | undefined), [b]: x };
}
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
    { key: 'life', label: 'Life', min: 0, max: 1, step: 0.05, def: 0, tip: 'A real performance\'s last touches: vibrato easing in, vowels opening up high, held notes shaped, phrases building to their top.', fmt: pct },
  ]],
  ['Consonants', [
    { key: 'cons.blend', label: 'S and f blend', min: 0, max: 0.12, step: 0.005, def: 0, tip: 'The vowel fading into s, f, t, k (seconds); 0: the voice stops at once.', fmt: (x) => x.toFixed(3) },
    { key: 'cons.short', label: 'Consonant length', min: 0.3, max: 1, step: 0.05, def: 1, tip: 'Starting s, t, k... shortened toward the beat (x).', fmt: (x) => x.toFixed(2) },
    { key: 'cons.level', label: 'Hiss level', min: -15, max: 3, step: 0.5, def: 0, tip: 'How loud s, f, sh, t, k are (dB).', fmt: (x) => `${x}` },
    { key: 'cons.dark', label: 'Hiss colour', min: 0.5, max: 1, step: 0.05, def: 1, tip: 'Lower: darker s and f, less fizz.', fmt: (x) => x.toFixed(2) },
    { key: 'stops.burst', label: 'P, t, k burst', min: -30, max: 0, step: 1, def: 0, tip: 'How hard p, t, k, b, d, g pop (dB).', fmt: (x) => `${x}` },
    { key: 'stops.initial', label: 'Bite on word-start p, t, k', min: 0, max: 24, step: 1, def: 0, tip: 'Extra burst and breath on the p, t or k that starts a stressed word ("pat", not "spat"), dB.', fmt: (x) => `${x}` },
    { key: 'stops.final', label: 'Release of word-end p, t, k', min: 0, max: 24, step: 1, def: 0, tip: 'Extra burst on the p, t, k, b, d or g that ends a word ("cap", "cat", "cab"), dB.', fmt: (x) => `${x}` },
    { key: 'stops.asp', label: 'Breath after p, t, k', min: -24, max: 0, step: 1, def: 0, tip: 'The puff after p, t, k (dB).', fmt: (x) => `${x}` },
  ]],
  ['Vibrato and pitch', [
    { key: 'vib', label: 'Vibrato depth', min: 0, max: 60, step: 1, def: 30, tip: 'Cents, on held notes.', fmt: (x) => `${x}` },
    { key: 'vibHz', label: 'Vibrato speed', min: 4, max: 7, step: 0.1, def: 5.6, tip: 'Slow and wide is a wobble; quick and narrow a tight one (Hz).', fmt: (x) => x.toFixed(1) },
    { key: 'drift', label: 'Pitch wander', min: 0, max: 15, step: 0.5, def: 4, tip: 'A slow drift in pitch (cents).', fmt: (x) => `${x}` },
  ]],
  ['Low notes, ee and falsetto', [
    { key: 'lowBuzz', label: 'Low-note body', min: 0, max: 1.5, step: 0.05, def: 0, tip: 'Deep notes keep their overtones (not one low hum), so they carry on small speakers.', fmt: pct },
    { key: 'lowTop', label: 'Low-note body up to', min: 48, max: 74, step: 1, def: 58, tip: 'The sounding note it works up to (fully an octave under, easing out toward it).', fmt: noteName },
    { key: 'closeFill', label: '"ee" and "oo" fill', min: 0, max: 2, step: 0.05, def: 0, tip: 'Stops close vowels turning into one pure whistling tone at low and middle pitches.', fmt: pct },
    { key: 'falFill', label: 'Falsetto fill', min: 0, max: 1.5, step: 0.05, def: 0, tip: 'A falsetto (the way up, for a voice that goes into one) kept from one bare, hissy tone: overtones in, less breath.', fmt: pct },
  ]],
  ['Range', [
    { key: 'brk', label: 'Break', min: 55, max: 72, step: 1, def: 64, tip: 'Where the voice changes gear into its way up (the low voice\'s; a high singer\'s is lifted by Break lift).', fmt: noteName },
  ]],
  ['Singer', [
    { key: 'shift', label: 'Sings higher by', min: 0, max: 14, step: 1, def: 0, tip: 'Semitones above the low voice\'s tune (5: a 4th up, 12: an octave).', fmt: (x) => `${x}` },
    { key: 'size', label: 'Person size', min: 0.94, max: 1.25, step: 0.01, def: 1, tip: 'Higher: a smaller person (formants up; a woman is about 1.16).', fmt: (x) => x.toFixed(2) },
    { key: 'brkUp', label: 'Break lift', min: 0, max: 14, step: 1, def: 0, tip: 'How much higher this singer\'s break sits (semitones).', fmt: (x) => `${x}` },
  ]],
];
const SPECS = GROUPS.flatMap(([, s]) => s);
const UPS: [NonNullable<FofVoice['up']>, string][] = [['belt', 'Power belt'], ['scream', 'Scream'], ['squeal', 'Squeal'], ['falsetto', 'Falsetto']];

/* ---- presets: each genre's voice, and each character on the rock voice */

const GENRES = Object.keys(VOICES) as Genre[];
/** The singers: the low voice; the high voice as the app sings it now (the same person an octave up); the high singers on trial (fofHigh). */
type Singer = 'low' | 'high' | 'tenor' | 'female';
const SINGERS: [Singer, string][] = [['low', 'Low voice'], ['high', 'High voice (as the app sings it now: the same person, an octave up)'], ['tenor', 'High: a tenor (a 4th up)'], ['female', 'High: a woman (an octave up)']];
const PRESETS: Record<string, { label: string; g: Genre; c?: Character }> = {};
for (const g of GENRES) PRESETS[g] = { label: `${VOICES[g].label} voice`, g };
for (const c of Object.keys(CHARACTERS) as Character[]) PRESETS[c] = { label: `${CHARACTERS[c].label} (on Rock)`, g: 'rock', c };
const clean = (v: Partial<FofVoice>): Partial<FofVoice> => { const o = { ...v }; delete o.seed; delete o.high; delete o.energy; return o; };
/** A voice as a singer sings it (the high voice's defaults written out: an octave up, a touch smaller, its break 10 up, lips not spread). */
function presetV(key: string, singer: Singer): Partial<FofVoice> {
  const { g, c } = PRESETS[key];
  if (singer === 'tenor' || singer === 'female') return clean(fofHigh(g, 17, singer, c));
  // (the app's high voice: the genre's own high singer if it has one, its tunes' lift heard here as a
  // shift; or the same person an octave up)
  if (singer === 'high') { const v = fofFor(g, 17, true, c); return clean({ shift: 12, size: 1.04, brkUp: 10, ...v, ...(c ? {} : { shift: (v.shift ?? 12) + highLift(g) }) }); }
  return clean(fofFor(g, 17, false, c));
}

const state = { preset: 'cornell', singer: 'low' as Singer, v: presetV('cornell', 'low'), material: 'quick', pitch: 57, vowel: 'AA' as Vowel, effort: 0.8 };
// (left out, a setting is the engine's own: soft when pushing follows the softness)
const read = (v: Partial<FofVoice>, s: Spec): number => (getAt(v, s.key) as number | undefined) ?? (s.key === 'softPushed' ? v.soft ?? 0 : s.def);
const valueOf = (s: Spec) => read(state.v, s);
const presetValue = (s: Spec) => read(presetV(state.preset, state.singer), s);

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
      const id = `s-${s.key.replace('.', '-')}`;
      row.dataset.key = s.key;
      row.innerHTML = `<label for="${id}">${s.label}</label><input type="range" id="${id}" min="${s.min}" max="${s.max}" step="${s.step}"><span class="val"></span><span class="tip">${s.tip}</span>`;
      const input = row.querySelector('input')!;
      input.addEventListener('input', () => { setAt(state.v, s.key, Number(input.value)); show(); });
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

/** The consonant sliders again on the Words tab, to tune them while listening to words (the same settings as the Voice tab's). */
const WORD_KEYS = ['stops.initial', 'stops.final', 'stops.burst', 'stops.asp', 'cons.level', 'cons.short', 'cons.dark', 'cons.blend'];
function buildWordSliders() {
  const box = $('wSliders');
  box.innerHTML = '';
  for (const key of WORD_KEYS) {
    const s = SPECS.find((x) => x.key === key)!;
    const row = document.createElement('div');
    row.className = 'slider';
    row.dataset.key = key;
    row.innerHTML = `<label>${s.label}</label><input type="range" min="${s.min}" max="${s.max}" step="${s.step}"><span class="val"></span><span class="tip">${s.tip}</span>`;
    row.querySelector('input')!.addEventListener('input', (e) => { setAt(state.v, key, Number((e.target as HTMLInputElement).value)); show(); });
    box.append(row);
  }
  // (the app's own consonants are quiet, short and dark: one button for the clear, speech-like ones, and one to go back)
  const bar = document.createElement('div');
  bar.className = 'f';
  const set = (vals: Record<string, number>) => { for (const [k, x] of Object.entries(vals)) setAt(state.v, k, x); show(); };
  for (const [label, vals] of [['Clear consonants', { 'cons.level': 3, 'cons.short': 1, 'cons.dark': 1 }], ['Original consonants', { 'cons.level': -6, 'cons.short': 0.6, 'cons.dark': 0.75 }]] as [string, Record<string, number>][]) {
    const b = document.createElement('button');
    b.textContent = label;
    b.addEventListener('click', () => set(vals));
    bar.append(b);
  }
  box.prepend(bar);
}

function show() {
  for (const s of SPECS) {
    // (the same setting can have a second slider on the Words tab: all of them kept alike)
    for (const row of document.querySelectorAll<HTMLElement>(`.slider[data-key="${s.key}"]`)) {
      const x = valueOf(s);
      row.querySelector('input')!.value = String(x);
      row.querySelector('.val')!.textContent = (s.fmt ?? String)(x);
      row.classList.toggle('changed', Math.abs(x - presetValue(s)) > 1e-9);
    }
  }
  const up = document.getElementById('wayUp') as HTMLSelectElement | null;
  if (up) up.value = state.v.up ?? 'belt';
  const sh = (state.v.shift as number | undefined) ?? 0;
  $('note').textContent = sh ? `${noteName(state.pitch)} → ${noteName(state.pitch + sh)}` : noteName(state.pitch);
  $('heldOpts').style.display = state.material === 'held' ? '' : 'none';
  $<HTMLTextAreaElement>('json').value = settingsText();
}

function changed(): Partial<FofVoice> {
  const out: Partial<FofVoice> = {};
  for (const s of SPECS) if (Math.abs(valueOf(s) - presetValue(s)) > 1e-9) setAt(out, s.key, valueOf(s));
  if ((state.v.up ?? 'belt') !== (presetV(state.preset, state.singer).up ?? 'belt')) out.up = state.v.up;
  return out;
}
function settingsText() {
  const full: Partial<FofVoice> = {};
  for (const s of SPECS) setAt(full, s.key, valueOf(s));
  full.up = state.v.up ?? 'belt';
  return JSON.stringify({ from: PRESETS[state.preset].label, singer: SINGERS.find(([k]) => k === state.singer)![1], changed: changed(), full }, null, 1);
}

/* ---- what to sing */

const syl = (vowel: Vowel, onset: Syllable['onset'] = []): Syllable => ({ onset, vowel, coda: [], stress: true, text: '', wordStart: true });
let songCache: { lines: SungNote[][]; verse: number } | null = null;
/** A seeded rock song's verse and chorus lines (the chorus rushing now and then, as a loud section does in the app). */
function linesOf(seed: string): Record<string, SungNote[][]> {
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
    out[kind] = groups.map((L) => perform(L.map((n) => ({ t: (n.step - L[0].step) * six, end: (n.step + n.len - L[0].step) * six, midi: n.midi, vel: n.vel, syl: n.syl, slide: n.slide, fall: n.fall })), lagFor(idea.seeds.vocal ?? idea.seeds.song), L[0].step + L.length * 7, kind === 'chorus' ? 0.7 : 0));
  }
  return out;
}
/** The timbre lab's sample: of a few songs, the one whose two verse lines (soft) and three chorus lines (pushed) span the widest range, with a long high note. */
function song() {
  if (songCache) return songCache;
  const cut = (l: SungNote[]) => { const k = l.findIndex((n) => n.end - l[0].t > 5); return k < 0 ? l : l.slice(0, Math.max(3, k)); };
  let verse: SungNote[][] = [], chorus: SungNote[][] = [], span = -1;
  for (const seed of ['rasp-1', 'rasp-2', 'rasp-3', 'rasp-4', 'rasp-5', 'flow-1', 'smoke-rock-0']) {
    const L = linesOf(seed);
    if (!L.verse || !L.chorus) continue;
    const v = L.verse.slice(0, 2).map(cut), c = L.chorus.slice(0, 3).map(cut);
    const ms = [...v, ...c].flat().map((n) => n.midi), hi = Math.max(...ms);
    const s = hi - Math.min(...ms) + (c.flat().some((n) => n.midi >= hi - 2 && n.end - n.t > 0.6) ? 3 : 0);
    if (s > span) { span = s; verse = v; chorus = c; }
  }
  const lines = [...verse.map((L) => L.map((n) => ({ ...n, vel: Math.min(n.vel, 0.7) }))), ...chorus.map((L) => L.map((n) => ({ ...n, vel: Math.max(n.vel, 0.85) })))];
  songCache = { lines, verse: verse.length };
  return songCache;
}

/**
 * The quick test (Paul: "a bit quicker while covering all the important things like lows, mids, belts,
 * screams"): four short lines, about 10 seconds, each pushing a little harder than the last, a breath
 * between them. Low and soft (a creak in, the bottom of the range, f, th, k, ld); the middle, sung
 * (s, g, d, n; ee, oh, ow; a held note for the vibrato); climbing to the break, loud (and, will, rise,
 * again: the gear change); then up past it, belted and pushed into the scream on a long "yeah" scooped
 * into, and an "oh" falling off the end. Written for the low voice; a high singer sings it up.
 */
function quick(): SungNote[][] {
  const w = (onset: Syllable['onset'], vowel: Vowel, coda: Syllable['coda'] = []): Syllable => ({ onset, vowel, coda, stress: true, text: '', wordStart: true });
  // [start, length (s), written pitch, how hard, syllable, scooped from below, falling off]
  type N = [number, number, number, number, Syllable, number?, number?];
  const line = (ns: N[]): SungNote[] => ns.map(([t, len, midi, vel, s, slide, fall]) => ({ t, end: t + len, midi, vel, syl: s, slide, fall }));
  return [
    // low and soft: "I feel the cold"
    line([[0, 0.24, 45, 0.62, w([], 'AY')], [0.25, 0.49, 47, 0.64, w(['F'], 'IY', ['L'])], [0.75, 0.24, 45, 0.6, w(['DH'], 'AX')], [1, 1.1, 43, 0.65, w(['K'], 'OW', ['L', 'D'])]]),
    // the middle: "sun goes down on me"
    line([[0, 0.24, 50, 0.75, w(['S'], 'AH', ['N'])], [0.25, 0.24, 52, 0.75, w(['G'], 'OW', ['Z'])], [0.5, 0.74, 53, 0.8, w(['D'], 'AW', ['N'])], [1.25, 0.24, 52, 0.75, w([], 'AA', ['N'])], [1.5, 1.1, 50, 0.8, w(['M'], 'IY')]]),
    // climbing to the break, loud: "and I will rise again"
    line([[0, 0.24, 55, 0.86, w([], 'AE', ['N', 'D'])], [0.25, 0.24, 57, 0.88, w([], 'AY')], [0.5, 0.24, 59, 0.9, w(['W'], 'IH', ['L'])], [0.75, 0.49, 60, 0.92, w(['R'], 'AY', ['Z'])], [1.25, 0.24, 62, 0.92, w([], 'AX')], [1.5, 0.8, 64, 0.95, w(['G'], 'EY', ['N'])]]),
    // past the break, belted into the scream: "yeah, oh"
    line([[0, 1.4, 67, 0.98, w(['Y'], 'EH'), 2], [1.45, 0.9, 64, 0.95, w([], 'OW'), undefined, 5]]),
  ];
}

function material(): { lines: SungNote[][]; energy: number[]; level: number[] } {
  if (state.material === 'quick') return { lines: quick(), energy: [0.3, 0.5, 0.8, 1], level: [0.6, 0.72, 0.85, 0.9] };
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

/** Which high singer a voice is, for their top (Chester by his scream character, a woman by her size, a tenor by singing well up). */
function highOf(v: Partial<FofVoice>): HighVoice | null {
  if (state.preset === 'scream') return 'chester';
  if ((v.shift ?? 0) >= 8 && (v.size ?? 1) >= 1.1) return 'woman';
  if ((v.shift ?? 0) >= 5) return 'tenor';
  return null;
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
  // (a high singer's notes kept under their top, as the app writes their tunes (vocal.ts, fitHigh): here
  // simply held at it; a belted or pushed note may go a little higher)
  const hv = highOf(v);
  const fit = (L: SungNote[]) => (!hv ? L : L.map((n) => {
    const lim = (n.vel >= 0.95 ? HIGH_VOICES[hv].beltTop : HIGH_VOICES[hv].top) - (v.shift ?? 0);
    return n.midi > lim ? { ...n, midi: lim } : n;
  }));
  const mixed = $<HTMLInputElement>('polish').checked, dbl = $<HTMLInputElement>('double').checked;
  const take = (seed: number) => {
    const parts = m.lines.map((L, i) => {
      let pcm = renderFof(fit(L), { ...v, seed: seed + i, energy: m.energy[i] }, PRE);
      if (mixed) pcm = polishVoice(pcm, FOF_RATE, { comp: VOCAL_COMP[(GENRES as string[]).includes(state.preset) ? (state.preset as Genre) : 'rock'] });
      return pcm.map((x) => x * m.level[i]);
    });
    const gap = Math.round(0.5 * FOF_RATE);
    const out = new Float32Array(parts.reduce((a, p) => a + p.length + gap, 0));
    let at = 0;
    for (const p of parts) { out.set(p, at); at += p.length + gap; }
    return out;
  };
  ctx ??= new AudioContext();
  stop();
  const toBuf = (pcm: Float32Array) => { const b = ctx!.createBuffer(1, pcm.length, FOF_RATE); b.copyToChannel(pcm as Float32Array<ArrayBuffer>, 0); return b; };
  const src = ctx.createBufferSource();
  src.buffer = toBuf(take(17));
  const into = mixed ? appChain(ctx) : ctx.destination;
  src.connect(into);
  // (the double: another take, half as loud, to the right and 17 ms late, as the app sings it)
  if (dbl) {
    const d = ctx.createBufferSource(), g = ctx.createGain(), p = ctx.createStereoPanner();
    d.buffer = toBuf(take(43));
    g.gain.value = 0.5; p.pan.value = 0.45;
    d.connect(g).connect(p).connect(into);
    d.start(ctx.currentTime + 0.017);
    src.onended = () => { try { d.stop(); } catch { /* (ended) */ } };
  }
  src.start();
  playing = src;
  $('status').textContent = `Sung in ${Math.round(performance.now() - t0)} ms`;
}
/**
 * The app's sound around the singer (singer.ts and mixer.ts, at the faders' defaults): the lead's EQ and
 * compressor, its level, the room reverb and the echo it sends to, the master compressor and limiter. So
 * a voice heard here is the voice heard in the app (with the band left out).
 */
let chain: { ctx: AudioContext; input: AudioNode } | null = null;
function appChain(c: AudioContext): AudioNode {
  if (chain?.ctx === c) return chain.input;
  const filt = (type: BiquadFilterType, f: number, Q: number, gain = 0) => { const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = Q; b.gain.value = gain; return b; };
  const comp = (threshold: number, ratio: number, attack: number, release: number, knee = 30) => { const k = c.createDynamicsCompressor(); k.threshold.value = threshold; k.ratio.value = ratio; k.attack.value = attack; k.release.value = release; k.knee.value = knee; return k; };
  const gain = (dB: number) => { const g = c.createGain(); g.gain.value = 10 ** (dB / 20); return g; };
  // the master bus: gain, compressor, limiter (Tone's: a hard-kneed compressor at -1 dB)
  const master = c.createGain();
  master.gain.value = 0.8;
  master.connect(comp(-16, 2.5, 0.02, 0.2)).connect(comp(-1, 20, 0.003, 0.01, 0)).connect(c.destination);
  // the room (a send, -9 dB, then -6) and the echo (a dotted 8th at 120, -18 dB, darker, into the room too)
  const room = c.createConvolver();
  room.buffer = reverbIR(c.sampleRate);
  const fx = gain(-6);
  fx.connect(room).connect(master);
  const delay = c.createDelay(2), fb = gain(20 * Math.log10(0.32)), dark = filt('lowpass', 3500, 0.7);
  delay.delayTime.value = 0.375;
  delay.connect(fb).connect(delay);
  delay.connect(dark);
  dark.connect(master); dark.connect(fx);
  // the strip: its fader at the default (80) and trim (+12 dB), to the master, the room and the echo
  const strip = gain(12 + 20 * Math.log10(0.8 ** 2));
  strip.connect(master);
  strip.connect(gain(-9)).connect(fx);
  strip.connect(gain(-18)).connect(delay);
  // the lead's own: high-pass, less mud, presence, a compressor
  const input = filt('highpass', 75, 0.7);
  input.connect(filt('peaking', 320, 1, -2)).connect(filt('peaking', 2900, 1.2, 3)).connect(comp(-20, 3, 0.008, 0.12)).connect(strip);
  chain = { ctx: c, input };
  return input;
}

let timer = 0;
function replay() {
  show();
  if (!$<HTMLInputElement>('auto').checked) return;
  clearTimeout(timer);
  timer = window.setTimeout(play, 250);
}

/* ---- saved voices (this browser only) */

interface Saved { name: string; preset: string; singer?: Singer; v: Partial<FofVoice> }
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
    go.onclick = () => { state.preset = PRESETS[s.preset] ? s.preset : 'rock'; state.singer = s.singer ?? 'low'; $<HTMLSelectElement>('preset').value = state.preset; $<HTMLSelectElement>('singer').value = state.singer; state.v = { ...s.v }; replay(); };
    del.onclick = () => { const all = loadSaved(); all.splice(i, 1); storeSaved(all); showSaved(); };
    box.append(chip);
  });
}

/* ---- wiring */

const presetSel = $<HTMLSelectElement>('preset');
presetSel.innerHTML = Object.entries(PRESETS).map(([k, p]) => `<option value="${k}">${p.label}</option>`).join('');
presetSel.value = state.preset;
presetSel.onchange = () => { state.preset = presetSel.value; state.v = presetV(state.preset, state.singer); syncMirrors(); replay(); };
const singerSel = $<HTMLSelectElement>('singer');
singerSel.innerHTML = SINGERS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('');
singerSel.value = state.singer;
singerSel.onchange = () => { state.singer = singerSel.value as Singer; state.v = presetV(state.preset, state.singer); syncMirrors(); replay(); };
$('reset').onclick = () => { state.v = presetV(state.preset, state.singer); replay(); };
/** The Scale check tab's own voice and singer choice: the same state as the Voice tab's. */
const MIRRORS: [HTMLSelectElement, HTMLSelectElement][] = [['scPreset', 'scSinger'], ['wPreset', 'wSinger']].map(([p, s]) => [$<HTMLSelectElement>(p), $<HTMLSelectElement>(s)]);
for (const [p, s] of MIRRORS) { p.innerHTML = presetSel.innerHTML; s.innerHTML = singerSel.innerHTML; }
function syncMirrors() { for (const [p, s] of MIRRORS) { p.value = state.preset; s.value = state.singer; } }
syncMirrors();
$<HTMLSelectElement>('material').onchange = (e) => { state.material = (e.target as HTMLSelectElement).value; replay(); };
$('down').onclick = () => { state.pitch = Math.max(40, state.pitch - 1); replay(); };
$('up1').onclick = () => { state.pitch = Math.min(79, state.pitch + 1); replay(); };
$<HTMLSelectElement>('vowel').onchange = (e) => { state.vowel = (e.target as HTMLSelectElement).value as Vowel; replay(); };
$<HTMLSelectElement>('effort').onchange = (e) => { state.effort = Number((e.target as HTMLSelectElement).value); replay(); };
$<HTMLInputElement>('polish').onchange = () => replay();
$<HTMLInputElement>('double').onchange = () => replay();
$('play').onclick = () => { void play(); };
$('stop').onclick = stop;
$('save').onclick = () => {
  const name = prompt('Name this voice', `${PRESETS[state.preset].label.split(' ')[0]} ${loadSaved().length + 1}`);
  if (!name) return;
  storeSaved([...loadSaved(), { name, preset: state.preset, singer: state.singer, v: { ...state.v } }]);
  showSaved();
};
$('copy').onclick = async () => {
  try { await navigator.clipboard.writeText(settingsText()); $('copied').textContent = 'Copied'; } catch { $<HTMLTextAreaElement>('json').select(); $('copied').textContent = 'Select and copy'; }
  setTimeout(() => { $('copied').textContent = ''; }, 2000);
};

buildSliders();
buildWordSliders();
showSaved();
show();

/* ---- tabs: the voice, and the scale check on the voice as set here */

let scale: ReturnType<typeof initScaleCheck>;
scale = initScaleCheck(() => ({ ...state.v }), () => `${PRESETS[state.preset].label}, ${SINGERS.find(([k]) => k === state.singer)![1]}${Object.keys(changed()).length ? ' (with your changes)' : ''}`);
const voiceName = () => `${PRESETS[state.preset].label}, ${SINGERS.find(([k]) => k === state.singer)![1]}${Object.keys(changed()).length ? ' (with your changes)' : ''}`;
const words = initWords(() => ({ ...state.v }), voiceName);
initQuiz(() => ({ ...state.v }), () => Number($<HTMLInputElement>('wPitch').value));
let tabNow = 'voice';
const refresh = () => { show(); if (tabNow === 'scale') scale.measureAll(); else if (tabNow === 'words') words.show(); };
for (const [p, s] of MIRRORS) {
  p.onchange = () => { state.preset = p.value; state.v = presetV(state.preset, state.singer); presetSel.value = state.preset; singerSel.value = state.singer; syncMirrors(); refresh(); };
  s.onchange = () => { state.singer = s.value as Singer; state.v = presetV(state.preset, state.singer); presetSel.value = state.preset; singerSel.value = state.singer; syncMirrors(); refresh(); };
}
for (const id of ['scReset', 'wReset']) $(id).onclick = () => { state.v = presetV(state.preset, state.singer); refresh(); };
document.querySelectorAll<HTMLButtonElement>('#tabs button').forEach((b) => {
  b.onclick = () => {
    const tab = b.dataset.tab!;
    document.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('on', x === b));
    $('tab-voice').hidden = tab !== 'voice';
    $('tab-scale').hidden = tab !== 'scale';
    $('tab-words').hidden = tab !== 'words';
    tabNow = tab;
    document.querySelector<HTMLElement>('.dock')!.hidden = tab !== 'voice';
    clearTimeout(timer);
    stop();
    words.stop();
    if (tab === 'scale') scale.measureAll();
    if (tab === 'words') words.show();
  };
});
