// The band view page (docs/BAND-VIEW.md): write a song, build its track, play it with the engine and
// draw the band playing it, frame by frame off the audio clock.

import * as Tone from 'tone';
import { Engine } from '../audio/engine';
import { generate, randomSeeds } from '../generator';
import { GENRE_LABEL, GENRE_LIST, type GenreSel } from '../genres';
import { TIMBRE_CHOICES, type TimbreChoice, type VocalChoice } from '../audio/singer';
import { type LayerSettings } from '../audio/engine';
import { LAYER_PARTS } from '../audio/mixer';
import type { GenOptions, Idea, Seeds } from '../idea';
import { HIGH_VOICES, leadHigh } from '../parts/singers';
import { type Track, type TrackOptions, buildTrack, defaultTrackOptions } from '../track';
import { StepClock } from './clock';
import { type Lineup, PERSONAS, PERSONA_LABEL, PLAYERS, PLAYER_LABEL, type Persona, type Player, pickCast } from './persona';
import { type Score, buildScore, lastAt } from './score';
import { type Cast, H, Stage, W, loadCast, renderCheck, walkOn } from './stage';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('stage'), check = $<HTMLCanvasElement>('check');
const ctx = canvas.getContext('2d')!, cctx = check.getContext('2d')!;
const playBtn = $<HTMLButtonElement>('play'), genreSel = $<HTMLSelectElement>('genre'), fromSel = $<HTMLSelectElement>('from');
const status = (s: string) => { $('status').textContent = s; };

for (const g of ['random', ...GENRE_LIST]) genreSel.add(new Option(g === 'random' ? 'Any genre' : GENRE_LABEL[g as keyof typeof GENRE_LABEL], g));
genreSel.value = 'rock';

const engine = new Engine();
engine.setVocal('auto');
// (band.html?mute: silent, for automated checks)
if (new URLSearchParams(location.search).has('mute')) Tone.getDestination().mute = true;
// (for checks from the console)
Object.assign(window, { bandDebug: () => ({ engine, score, clock, track, renderAt: (t: number, pre?: number) => stage?.render(ctx, t, undefined, pre), stage, newSong, freeze: (t: number | null) => { frozen = t; } }) });
let cast: Cast | null = null;
let track: Track | null = null;
let score: Score | null = null;
let stage: Stage | null = null;
let clock: StepClock | null = null;
let offs: number[] = [];
let delay = 0;
/** A moment held still (checks: bandDebug().freeze(step)). */
let frozen: number | null = null;
let shownLabel = '';
/** Who the players are: picked for the song (Auto), or chosen per player. */
let lineup: Lineup | null = null;
const chosen = Object.fromEntries(PLAYERS.map((p) => [p, 'auto'])) as Record<Player, Persona | 'auto'>;
let genreNow = 'rock';
/** The walk-on under way: when it started (audio clock) and its timers; and the ending pose held after the song. */
let walk: { at: number; timers: number[] } | null = null;
let endHold: { t: number; until: number } | null = null;
const walkOnBox = $<HTMLInputElement>('walkon');
/** The drummer's count-in: sticks clicked together. */
let sticks: Tone.MetalSynth | null = null;

engine.onStep = (_idea, idx, g, time) => clock?.record(offs[idx] + g, time);
engine.onEnd = () => {
  // the band holds its ending pose a few seconds after the last chord
  if (score) endHold = { t: score.steps - 0.01, until: performance.now() + 5000 };
  engine.stop();
};
engine.onStop = () => { playBtn.textContent = 'Play'; clock?.reset(); };

function cancelWalk() {
  for (const id of walk?.timers ?? []) clearTimeout(id);
  walk = null;
}

/**
 * Play from the top with the walk-on: the band walks on, the singer waves, the drummer counts in four
 * (heard as stick clicks), and the song starts on the fifth beat.
 */
function startWithWalkOn() {
  if (!score) return;
  const raw = Tone.getContext().rawContext as AudioContext;
  const at = raw.currentTime + 0.05;
  const on = walkOn(score);
  sticks ??= new Tone.MetalSynth({ envelope: { attack: 0.001, decay: 0.05, release: 0.02 }, harmonicity: 5.1, modulationIndex: 16, resonance: 3600, octaves: 0.6 }).toDestination();
  sticks.volume.value = -16;
  for (let k = 0; k < 4; k++) sticks.triggerAttackRelease(400, 0.03, at + on.countAt + k * on.beat, k ? 0.7 : 1);
  // (the engine starts its clock a little after it's asked, by its look-ahead and a tenth of a second)
  const lead = Tone.getContext().lookAhead + 0.1;
  const timers = [window.setTimeout(() => { if (walk) void engine.start(); }, Math.max(0, (at + on.start - lead - raw.currentTime) * 1000))];
  walk = { at, timers };
}
let songInfo = '';
engine.onStatus = (s) => status(s || songInfo);

/** A song from the main app's share link (its address hash): the same idea, track, parts and singer. */
interface Shared { o: GenOptions; s: Seeds; t?: TrackOptions; l?: LayerSettings; v?: VocalChoice; b?: VocalChoice; w?: TimbreChoice }
function readLink(): Shared | null {
  try {
    const h = location.hash.slice(1);
    if (!h) return null;
    const d = JSON.parse(decodeURIComponent(atob(h))) as Shared;
    return d.o && d.s?.song ? d : null;
  } catch {
    return null;
  }
}
let linked = readLink();

function newSong() {
  if (engine.playing) engine.stop();
  const shared = linked;
  linked = null; // (Generate after that makes new songs)
  let idea: Idea;
  if (shared) {
    for (const p of LAYER_PARTS) if (shared.l?.[p]) engine.setLayer(p, shared.l[p]!);
    for (const p of shared.l?.throughout ?? []) engine.setLayerThroughout(p, true);
    if (shared.b) engine.setBackingVocal(shared.b);
    if (shared.w && TIMBRE_CHOICES.some((c) => c.id === shared.w)) engine.setVocalTimbre(shared.w);
    if (shared.v) engine.setVocal(shared.v);
    genreSel.value = shared.o.genre;
    idea = generate(shared.o, shared.s);
  } else {
    const opts: GenOptions = { genre: genreSel.value as GenreSel, meter: '4/4', weirdness: 0.3 };
    const seeds = randomSeeds();
    idea = generate(opts, seeds);
    // (the tune written for whoever sings it, as the main app does)
    const h = leadHigh(idea, engine.vocal, engine.vocalTimbre);
    if (h) idea = generate({ ...opts, vocalLift: HIGH_VOICES[h].lift || undefined, vocalSinger: h }, seeds);
  }
  track = buildTrack(idea, shared?.t ?? defaultTrackOptions(idea));
  offs = [];
  let n = 0;
  for (const s of track.sections) { offs.push(n); n += s.song.total; }
  engine.setList(track.sections, false, 0);
  fromSel.replaceChildren(...track.sections.map((x, i) => new Option(`From ${x.section?.label ?? i + 1}`, String(i))));
  score = buildScore(track.sections, (i) => engine.shapesFor(i));
  clock = new StepClock(score.steps, score.six);
  genreNow = idea.song.genre;
  lineup = pickCast(track.sections, score, track.mood, track.opts.seeds.band ?? `${track.source.seeds.song}-band`);
  applyCast();
  const secs = Math.round(score.steps * score.six);
  status(songInfo = `${GENRE_LABEL[idea.song.genre]}, ${idea.song.bpm} bpm, ${track.sections.length} sections, ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}. ${score.vocal.lines.length} sung lines, ${score.lead.length} lead notes, ${score.drums.limbs.A.length + score.drums.limbs.B.length} stick hits.`);
}

/** Put the band on stage as they are now (each player's character: their own pick, or the song's). */
function applyCast() {
  if (!cast || !score || !lineup) return;
  const who = Object.fromEntries(PLAYERS.map((p) => [p, chosen[p] === 'auto' ? lineup!.who[p] : chosen[p]])) as Record<Player, Persona>;
  stage = new Stage(cast, score, genreNow, who);
  for (const p of PLAYERS) {
    const sel = $<HTMLSelectElement>(`who-${p}`);
    sel.options[0].text = `Auto (${PERSONA_LABEL[lineup.who[p]]})`;
    sel.title = `Auto: ${lineup.why[p]}`;
  }
  $('castwhy').textContent = PLAYERS.map((p) => `${PLAYER_LABEL[p]}: ${PERSONA_LABEL[who[p]]}${chosen[p] === 'auto' ? ` (${lineup!.why[p]})` : ''}`).join(' · ');
}

// a character picker per player
for (const p of PLAYERS) {
  const label = document.createElement('label');
  label.className = 'pick';
  label.textContent = PLAYER_LABEL[p];
  const sel = document.createElement('select');
  sel.id = `who-${p}`;
  sel.add(new Option('Auto', 'auto'));
  for (const c of PERSONAS) sel.add(new Option(PERSONA_LABEL[c], c));
  sel.onchange = () => { chosen[p] = sel.value as Persona | 'auto'; applyCast(); };
  label.append(sel);
  $('cast').append(label);
}

$('gen').onclick = async () => { await Tone.start(); newSong(); };
playBtn.onclick = async () => {
  if (engine.playing || walk) { cancelWalk(); if (engine.playing) engine.stop(); else playBtn.textContent = 'Play'; return; }
  await Tone.start();
  clock?.reset();
  endHold = null;
  const from = +fromSel.value || 0;
  if (track) engine.setList(track.sections, false, from);
  playBtn.textContent = 'Stop';
  if (walkOnBox.checked && from === 0) startWithWalkOn();
  else await engine.start();
};
$<HTMLInputElement>('sing').onchange = (e) => { engine.setVocal((e.target as HTMLInputElement).checked ? 'auto' : 'off'); };
$<HTMLInputElement>('delay').oninput = (e) => { delay = +(e.target as HTMLInputElement).value; $('dv').textContent = `${delay} ms`; };

/** The song position sounding now: the audio clock, less what the output adds (and the delay set for Bluetooth). */
function songNow(): number {
  if (!clock || !engine.playing) return -1;
  const raw = Tone.getContext().rawContext as AudioContext;
  const latency = (raw.outputLatency || raw.baseLatency || 0) + delay / 1000;
  return clock.at(raw.currentTime - latency);
}

function sizeCheck() {
  const r = check.getBoundingClientRect(), d = devicePixelRatio || 1;
  check.width = Math.round(r.width * d); check.height = Math.round(r.height * d);
  cctx.setTransform(d, 0, 0, d, 0, 0);
}
addEventListener('resize', sizeCheck);
sizeCheck();

function frame() {
  requestAnimationFrame(frame);
  if (!stage || !score) return;
  if (endHold && performance.now() > endHold.until) endHold = null;
  const t = frozen ?? (endHold ? endHold.t : songNow());
  if (t >= 0 && walk) walk = null;
  // before the song: the walk-on, or an empty stage waiting for the band (with the walk-on on)
  const raw = Tone.getContext().rawContext as AudioContext;
  const pre = t >= 0 ? undefined : walk ? raw.currentTime - walk.at : walkOnBox.checked && (+fromSel.value || 0) === 0 ? -1 : undefined;
  stage.render(ctx, t, undefined, pre);
  const m = stage.moment(Math.max(0, t));
  $('sect').textContent = t >= 0 ? `${m.section.label} · energy ${m.section.energy}` : '';
  // a banner as each section starts
  const label = t >= 0 ? m.section.label : '';
  if (label !== shownLabel) {
    shownLabel = label;
    const b = $('banner');
    b.textContent = label;
    b.classList.remove('show');
    if (label) { void b.offsetWidth; b.classList.add('show'); }
  }
  // the sung line, the syllable sounding now in bold
  const lines = score.vocal.lines, li = lastAt(lines, t + 2);
  const line = lines[li];
  if (t >= 0 && line && t < line.end + 4) {
    const si = lastAt(line.syls, t);
    $('lyric').innerHTML = line.syls.map((s, k) => (s.space ? ' ' : '') + (k === si && t < line.end + 0.5 ? `<b>${s.text}</b>` : s.text)).join('');
  } else $('lyric').textContent = '';
  $('info').textContent = t >= 0 ? `${Math.floor((t * score.six) / 60)}:${String(Math.floor(t * score.six) % 60).padStart(2, '0')}` : '';
  const showCheck = $<HTMLInputElement>('checkview').checked;
  check.style.display = showCheck ? 'block' : 'none';
  if (showCheck) renderCheck(cctx, score, Math.max(t, -1), check.clientWidth, check.clientHeight);
}

ctx.fillStyle = '#000';
ctx.fillRect(0, 0, W, H);
// the band shows up as soon as the sprites are in; Play waits for the drum and bass samples
loadCast().then((c) => {
  cast = c;
  newSong();
  requestAnimationFrame(frame);
  return engine.loadCore();
}).then(() => { playBtn.disabled = false; }).catch((e) => status(`Couldn't load: ${e}`));
