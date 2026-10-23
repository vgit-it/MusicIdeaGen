// The lick lab page (lick-lab.html, dev only): pick a key and a jam, tap a lick, hear it over the band.
// The jam is a real idea (chords, drums, strumming, bass) from the generator with the key, mode and chords set;
// the lick is placed over it the way Guitar 2 places it and played by the app's own engine and hands.
// Three lists: the named licks (src/parts/licks.ts), the real note shapes (src/realism/solo-licks.json) in a
// real lick rhythm, and the real lick rhythms (src/realism/licks.json) with notes walked by the real odds.

import '../audio/live';
import shapeData from '../realism/solo-licks.json';
import { Engine } from '../audio/engine';
import type { ChordInstrumentId } from '../audio/instruments';
import { buildIdea, planSong, withSheet } from '../generator';
import type { GenOptions, GuitarHit, Idea, Seeds, SheetCell } from '../idea';
import type { LickKind } from '../players/lead';
import { MINORISH } from '../parts/guitar2';
import { LIBRARY, type LibLick, type PlacedNote, lickFit, placeLibLick, placedHit } from '../parts/licks';
import { RHYTHMS, type Rhythm, realLick } from '../parts/reallicks';
import { Rng } from '../rng';
import { NOTE_NAMES, QUALITIES, SCALES, chordName, degreeChord, type Mode } from '../theory';
import * as Tone from 'tone';
import { TUNINGS } from '../theory/fretboard';
import { PROGRESSIONS } from '../verse/verse';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const mod = (n: number, m: number) => ((n % m) + m) % m;

/* ---- the lists */

const WHO_LABEL: Record<LickKind, string> = { sung: 'Melodic', blues: 'Bluesy', run: 'Shredder', simple: 'Raw', muted: 'Funky' };
const WHO_ORDER: LickKind[] = ['sung', 'blues', 'run', 'simple', 'muted'];
const DEGREE = ['1', '♭2', '2', '♭3', '3', '4', '♭5', '5', '♭6', '6', '♭7', '7'];

interface Shape { minor: boolean; deg: number; steps: number[]; n: number; songs: number }
const SHAPES: Shape[] = (shapeData.shapes as [string, number, number[], number, number[]][])
  .map(([m, deg, steps, songs]) => ({ minor: m === 'm', deg, steps, n: steps.length + 1, songs }))
  .sort((a, b) => b.songs - a.songs);
const shapeNotes = (s: Shape) => { const rel = [s.deg]; for (const d of s.steps) rel.push(rel[rel.length - 1] + d); return rel; };
const RHYTHMS_BY_SONGS = [...RHYTHMS].sort((a, b) => b.songs - a.songs);

/** A rhythm drawn on the 16th grid: x on a note, a dot between, a gap each beat. */
function grid(r: Rhythm): string {
  const len = r.ons[r.ons.length - 1] + 1;
  let s = '';
  for (let i = 0; i < len; i++) s += (i && i % 4 === 0 ? ' ' : '') + (r.ons.includes(i) ? 'x' : '·');
  return s;
}

function techniques(l: LibLick): string {
  const t = new Set<string>();
  for (const n of l.notes) {
    if (n.dyad === 0) t.add('unison bend');
    else if (n.dyad !== undefined) t.add('double-stop');
    if (n.bend && n.dyad !== 0) t.add('bend');
    if (n.unbend) t.add(n.bend ? 'let down' : 'pre-bend');
    if (n.trill) t.add('trill');
    if (n.tremolo) t.add('tremolo');
    if (n.rake) t.add('rake');
    if (n.dead) t.add('ghost');
    if (n.art === 'slide') t.add('slide');
    if (n.art === 'legato') t.add('legato');
  }
  return [...t].join(' · ');
}

/* ---- the jam */

const keySel = $<HTMLSelectElement>('key');
const modeSel = $<HTMLSelectElement>('mode');
const progSel = $<HTMLSelectElement>('prog');
NOTE_NAMES.forEach((n, i) => keySel.add(new Option(n, String(i), i === 9, i === 9)));
(Object.keys(SCALES) as Mode[]).forEach((m) => modeSel.add(new Option(m, m, m === 'minor', m === 'minor')));
const WHO_SEL = $<HTMLSelectElement>('who');
WHO_ORDER.forEach((w) => WHO_SEL.add(new Option(WHO_LABEL[w], w)));

function fillProgs() {
  progSel.innerHTML = '';
  progSel.add(new Option('One chord (the easiest to hear a lick on)', '-1'));
  PROGRESSIONS[modeSel.value as Mode].forEach((p, i) => progSel.add(new Option(p.name, String(i))));
}

let bandSeed = 'jam';
let seeds: Seeds = seedsOf(bandSeed);
function seedsOf(s: string): Seeds { return { song: s, chords: s, drums: s, strum: s, bass: s, guitar2: s }; }

const engine = new Engine();
let jam: Idea | null = null;
let jamKey = '';
/** The chord of each bar (index 0-7), for the slots and the picture. */
let barChords: string[] = [];

function buildJam(): Idea {
  const mode = modeSel.value as Mode;
  const key = Number(keySel.value);
  const p = Number(progSel.value);
  const degrees = p < 0 ? [0] : PROGRESSIONS[mode][p].degrees;
  const chords = degrees.map((d) => degreeChord(SCALES[mode], d));
  // a chord every 2 bars (the progression looped to fill 8 bars)
  const sheet: SheetCell[] = [];
  for (let b = 0; b < 8; b++) { const c = chords[Math.floor(b / 2) % chords.length]; sheet.push([c.root, c.q], [c.root, c.q]); }
  const opts: GenOptions = { genre: $<HTMLSelectElement>('genre').value as 'rock', meter: '4/4', weirdness: 0, bpm: Number($<HTMLInputElement>('bpm').value), key, mode, chords: sheet };
  const song = planSong(new Rng(seeds.song), opts);
  const idea = buildIdea(opts, seeds, song, withSheet(opts, seeds, song));
  idea.guitar2 = [];
  barChords = Array.from({ length: 8 }, (_, b) => chordName(key, idea.chords.timeline[idea.chords.chordIdx[b * 16]].chord));
  return idea;
}

/* ---- placing a lick over the jam */

type Pick =
  | { kind: 'lib'; lick: LibLick }
  | { kind: 'shape'; shape: Shape }
  | { kind: 'rhythm'; rhythm: Rhythm };
let pick: Pick | null = null;
let take = 1;

const LO = 62, HI = 81;

function placeShape(rng: Rng, shape: Shape, rhythm: Rhythm, key: number, end: number, prev: number): PlacedNote[] {
  const rel = shapeNotes(shape);
  let best = key, bestScore = Infinity;
  for (let k = -1; k <= 7; k++) {
    const ms = rel.map((r) => key + 12 * k + r);
    const over = Math.max(0, LO - Math.min(...ms)) + Math.max(0, Math.max(...ms) - HI);
    const score = over * 10 + Math.abs(ms[0] - prev);
    if (score < bestScore) { bestScore = score; best = key + 12 * k; }
  }
  const last = rhythm.ons[rhythm.ons.length - 1];
  let at = end - last - rhythm.tail;
  at -= mod(at - rhythm.off, 4);
  at = Math.max(0, at);
  const steps = rhythm.ons.map((o) => at + o);
  return rel.map((r, i) => {
    const len = i + 1 < steps.length ? steps[i + 1] - steps[i] : Math.max(2, end - steps[i]);
    return { step: steps[i], midi: best + r, len, vel: 0.85 + (i === 0 ? 0.04 : 0) + (rng.next() - 0.5) * 0.05, bend: 0, art: i === 0 ? 'pick' : len <= 1 ? 'legato' : 'pick' };
  });
}

/** Rhythms that fit a shape's note count, most common first. */
const rhythmsFor = (n: number) => RHYTHMS_BY_SONGS.filter((r) => r.ons.length === n);

interface Played { hits: GuitarHit[]; slots: number; played: number; why: string[] }

function lead(idea: Idea): Played {
  const { song, chords } = idea;
  const key = song.key, minor = MINORISH.includes(song.mode);
  const rng = new Rng(`lick-${take}`);
  const fit = lickFit(song, chords, null);
  const t = TUNINGS.standard;
  const bars = Number($<HTMLSelectElement>('slot').value);
  const changes = new Set(chords.timeline.map((e) => e.step));
  const hits: GuitarHit[] = [];
  const why: string[] = [];
  let played = 0, prev = 60 + mod(key - 60, 12) + 7;
  const slots = 4;
  if (!pick) return { hits, slots, played, why };
  const who: LickKind = pick.kind === 'lib' ? pick.lick.who[0] : (WHO_SEL.value as LickKind);
  for (let s = 0; s < slots; s++) {
    const start = s * 32, end = start + 16 * bars;
    let notes: PlacedNote[] | null = null;
    if (pick.kind === 'lib') {
      const l = pick.lick;
      const c = chords.timeline[chords.chordIdx[start]].chord;
      const qs = QUALITIES[c.q] as readonly number[];
      const isMin = qs.includes(3) && !qs.includes(4);
      if (l.q !== 'any' && (l.q === 'min') !== isMin) why.push(`bar ${start / 16 + 1}: a ${l.q === 'min' ? 'minor' : 'major'} lick, ${chordName(key, c)} doesn't suit`);
      else {
        notes = placeLibLick(rng, fit, key, l, end, LO, HI, prev, 'any', who, 0.85);
        if (!notes) why.push(`bar ${start / 16 + 1}: doesn't fit over ${chordName(key, c)}`);
      }
    } else if (pick.kind === 'shape') {
      const options = rhythmsFor(pick.shape.n);
      const chosen = $<HTMLSelectElement>('rhy').value;
      const r = options.find((x) => x.key === chosen) ?? options[0];
      if (!r) why.push(`no real rhythm with ${pick.shape.n} notes`);
      else notes = placeShape(rng, pick.shape, r, key, end, prev);
    } else {
      const used = new Set(RHYTHMS.map((r) => r.key));
      used.delete(pick.rhythm.key);
      const got = realLick(rng, { key, minor, genre: song.genre, who, speed: null, start, end, lo: LO, hi: HI, prev, close: 'any', vel: 0.85, fit, changes, used });
      if (!got) why.push(`bar ${start / 16 + 1}: this rhythm doesn't fit a ${bars}-bar slot over ${chordName(key, chords.timeline[chords.chordIdx[start]].chord)}`);
      else notes = got.map((n) => ({ ...n, bend: 0 }));
    }
    if (!notes) continue;
    played++;
    prev = notes[notes.length - 1].midi;
    for (const n of notes) hits.push(placedHit(n, t, 9, false));
  }
  return { hits, slots, played, why };
}

/* ---- picture */

const canvas = $<HTMLCanvasElement>('roll');
let hitsNow: GuitarHit[] = [];
let playG = -1;
function draw() {
  const dpr = devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const g = canvas.getContext('2d')!;
  g.scale(dpr, dpr);
  const css = getComputedStyle(document.documentElement);
  const ink = getComputedStyle(document.body).color, accent = css.getPropertyValue('--accent'), muted = css.getPropertyValue('--muted');
  const top = 26, total = 128, sw = w / total;
  const ms = hitsNow.flatMap((x) => x.notes);
  const lo = (ms.length ? Math.min(...ms) : 60) - 3, hi = (ms.length ? Math.max(...ms) : 76) + 5;
  const nh = (h - top) / (hi - lo + 1);
  g.font = '12px system-ui'; g.textBaseline = 'middle';
  for (let b = 0; b < 8; b++) {
    g.fillStyle = muted; g.globalAlpha = 0.35; g.fillRect(b * 16 * sw, top, 1, h - top);
    g.globalAlpha = 1; g.fillStyle = ink;
    if (barChords[b] && barChords[b] !== barChords[b - 1]) g.fillText(barChords[b], b * 16 * sw + 5, 12);
  }
  for (const x of hitsNow) {
    const on = playG >= x.step && playG < x.step + x.len;
    const top2 = Math.max(...x.notes);
    x.notes.forEach((m) => {
      g.fillStyle = on ? ink : accent;
      g.fillRect(x.step * sw + 1, top + (hi - m) * nh, Math.max(2, x.len * sw - 2), nh - 1);
    });
    const bend = Math.max(x.bend ?? 0, x.lateBend ?? 0);
    if (bend || x.unbend) {
      g.strokeStyle = ink; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(x.step * sw + 3, top + (hi - top2 + (bend || x.unbend || 0)) * nh); g.lineTo(x.step * sw + 3, top + (hi - top2) * nh); g.stroke();
    }
  }
  if (playG >= 0) { g.fillStyle = ink; g.globalAlpha = 0.5; g.fillRect(playG * sw, top, 1.5, h - top); g.globalAlpha = 1; }
}
addEventListener('resize', draw);

/* ---- putting it together */

const status = $('status');
const playBtn = $<HTMLButtonElement>('play');
const realBtn = $<HTMLButtonElement>('real');
const realHint = $('realHint');
let preparing = false;

function refresh(rebuild: boolean) {
  const k = [keySel.value, modeSel.value, progSel.value, $<HTMLSelectElement>('genre').value, $<HTMLInputElement>('bpm').value, bandSeed].join('|');
  if (rebuild || !jam || k !== jamKey) { jam = buildJam(); jamKey = k; }
  const p = lead(jam);
  jam.guitar2 = p.hits;
  hitsNow = p.hits;
  engine.setIdea(jam, true);
  draw();
  const nn = p.hits.reduce((a, x) => a + x.notes.length, 0);
  $('info').textContent = !pick ? 'Tap a lick below.'
    : `${p.played} of ${p.slots} chords played · ${nn} notes${p.why.length ? ' · ' + p.why[0] : ''}`;
  showReal();
}

function showReal() {
  if (!jam) return;
  const st = engine.realStateFor([jam]);
  realBtn.textContent = preparing ? 'Preparing… tap to cancel' : engine.realAmpsOn && st === 'ready' ? 'Real sound on · tap to go back' : 'Prepare real sound';
  realHint.textContent = st === 'failed' ? 'Real amps can\'t run here; the simple amp plays.'
    : engine.realAmpsOn && st !== 'ready' ? 'Lick changed since: prepare again for the real sound.'
    : 'Runs the lead and bass through the real amps. Redo it after you pick another lick.';
}

realBtn.onclick = async () => {
  if (!jam) return;
  if (preparing) { engine.setRealAmps(false); return; }
  if (engine.realAmpsOn && engine.realStateFor([jam]) === 'ready') { engine.setRealAmps(false); showReal(); return; }
  if (engine.playing) { engine.stop(); setPlaying(false); }
  preparing = true;
  await engine.prepareRealAmps([jam], (p) => { realBtn.textContent = `Preparing… ${Math.round(p * 100)}% · tap to cancel`; });
  preparing = false;
  showReal();
};

function setPlaying(on: boolean) { playBtn.textContent = on ? 'Stop' : 'Play'; }

async function play() {
  if (!jam) return;
  if (engine.playing) { engine.stop(); setPlaying(false); return; }
  refresh(false);
  await engine.start();
  setPlaying(true);
}
playBtn.onclick = play;
$('take').onclick = () => { take++; refresh(false); };
$('reroll').onclick = () => { bandSeed = Math.random().toString(36).slice(2, 7); seeds = seedsOf(bandSeed); refresh(true); };

engine.onStatus = (m) => { status.textContent = m; };
engine.onStep = (_i, _idx, g, time) => {
  const delay = Math.max(0, (time - Tone.getContext().now()) * 1000);
  setTimeout(() => { if (engine.playing) { playG = g; draw(); } }, delay);
};
engine.onStop = () => { playG = -1; draw(); setPlaying(false); };

/* ---- the lists */

let tab: 'lib' | 'shape' | 'rhythm' = 'lib';
const listEl = $('list');

function fitsMode(q: LibLick['q']): boolean {
  if (!$<HTMLInputElement>('fitOnly').checked || q === 'any') return true;
  return (q === 'min') === MINORISH.includes(modeSel.value as Mode);
}

function choose(p: Pick, btn: HTMLElement) {
  pick = p;
  listEl.querySelectorAll('button.on').forEach((b) => b.classList.remove('on'));
  btn.classList.add('on');
  if (p.kind === 'shape') fillRhythms(p.shape);
  take++;
  refresh(false);
  if (!engine.playing && !playBtn.disabled) void play();
}

function add(label: string, tag: string, p: Pick, mono = false) {
  const b = document.createElement('button');
  const a = document.createElement('span'); a.textContent = label; if (mono) a.className = 'mono';
  const s = document.createElement('small'); s.textContent = tag;
  b.append(a, s);
  b.onclick = () => choose(p, b);
  listEl.append(b);
}

function head(t: string) { const h = document.createElement('h3'); h.textContent = t; listEl.append(h); }

function fillRhythms(shape: Shape | null) {
  const sel = $<HTMLSelectElement>('rhy');
  sel.innerHTML = '';
  if (!shape) return;
  const rs = rhythmsFor(shape.n).slice(0, 40);
  rs.forEach((r) => sel.add(new Option(`${grid(r)}  (${r.songs} songs)`, r.key)));
}

function fillList() {
  listEl.innerHTML = '';
  pick = null;
  $('whoF').hidden = tab !== 'rhythm';
  $('rhyF').hidden = tab !== 'shape';
  $('fitOnly').closest('label')!.hidden = tab !== 'lib';
  if (tab === 'lib') {
    for (const w of WHO_ORDER) {
      const ls = LIBRARY.filter((l) => l.who[0] === w && fitsMode(l.q));
      if (!ls.length) continue;
      head(WHO_LABEL[w]);
      for (const l of ls) add(l.name, `${l.speed}${techniques(l) ? ' · ' + techniques(l) : ''}`, { kind: 'lib', lick: l });
    }
  } else if (tab === 'shape') {
    const minor = MINORISH.includes(modeSel.value as Mode);
    head(`Note shapes real solos share (${minor ? 'minor' : 'major'}), most common first`);
    for (const s of SHAPES.filter((x) => x.minor === minor).slice(0, 80)) {
      add(shapeNotes(s).map((r) => DEGREE[mod(r, 12)]).join(' → '), `${s.songs} songs`, { kind: 'shape', shape: s });
    }
    fillRhythms(null);
  } else {
    head('Lick rhythms real songs share (x is a note, a gap is a beat); the notes are walked by real odds, New take for another');
    for (const r of RHYTHMS_BY_SONGS.slice(0, 120)) add(grid(r), `${r.speed} · ${r.songs} songs`, { kind: 'rhythm', rhythm: r }, true);
  }
}

document.querySelectorAll<HTMLButtonElement>('.tabs button').forEach((b) => {
  b.onclick = () => {
    document.querySelectorAll('.tabs button').forEach((x) => x.classList.remove('on'));
    b.classList.add('on');
    tab = b.dataset.tab as typeof tab;
    fillList();
    refresh(false);
  };
});

for (const id of ['key', 'bpm', 'genre', 'slot', 'who', 'rhy']) $(id).addEventListener('change', () => refresh(false));
modeSel.addEventListener('change', () => { fillProgs(); fillList(); refresh(true); });
progSel.addEventListener('change', () => refresh(true));
$('fitOnly').addEventListener('change', () => { fillList(); refresh(false); });
$('lead').addEventListener('change', () => engine.setGuitar2Instrument($<HTMLSelectElement>('lead').value as ChordInstrumentId));
$('back').addEventListener('change', () => engine.setChordInstrument($<HTMLSelectElement>('back').value as ChordInstrumentId));
const levels = () => {
  engine.setVolume('guitar2', Number($<HTMLInputElement>('vLead').value));
  for (const p of ['chords', 'drums', 'bass'] as const) engine.setVolume(p, Number($<HTMLInputElement>('vBand').value));
};
$('vLead').addEventListener('input', levels);
$('vBand').addEventListener('input', levels);

fillProgs();
fillList();
engine.setGuitar2Instrument('electric-crunch');
engine.setChordInstrument('electric-clean');
levels();
refresh(true);
void engine.loadCore().then(() => { playBtn.disabled = false; status.textContent = ''; });
