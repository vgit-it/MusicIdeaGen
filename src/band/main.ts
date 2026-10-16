// The band view page (docs/BAND-VIEW.md): write a song, build its track, play it with the engine and
// draw the band playing it, frame by frame off the audio clock.

import * as Tone from 'tone';
import { Engine } from '../audio/engine';
import { generate, randomSeeds } from '../generator';
import { GENRE_LABEL, GENRE_LIST, type GenreSel } from '../genres';
import type { GenOptions } from '../idea';
import { HIGH_VOICES, leadHigh } from '../parts/singers';
import { type Track, buildTrack, defaultTrackOptions } from '../track';
import { StepClock } from './clock';
import { type Score, buildScore, lastAt } from './score';
import { type Cast, H, Stage, W, loadCast, renderCheck } from './stage';

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
Object.assign(window, { bandDebug: () => ({ engine, score, clock, track, renderAt: (t: number) => stage?.render(ctx, t), newSong }) });
let cast: Cast | null = null;
let track: Track | null = null;
let score: Score | null = null;
let stage: Stage | null = null;
let clock: StepClock | null = null;
let offs: number[] = [];
let delay = 0;

engine.onStep = (_idea, idx, g, time) => clock?.record(offs[idx] + g, time);
engine.onEnd = () => { engine.stop(); };
engine.onStop = () => { playBtn.textContent = 'Play'; clock?.reset(); };
let songInfo = '';
engine.onStatus = (s) => status(s || songInfo);

function newSong() {
  if (engine.playing) engine.stop();
  const opts: GenOptions = { genre: genreSel.value as GenreSel, meter: '4/4', weirdness: 0.3 };
  const seeds = randomSeeds();
  let idea = generate(opts, seeds);
  // (the tune written for whoever sings it, as the main app does)
  const h = leadHigh(idea, engine.vocal, engine.vocalTimbre);
  if (h) idea = generate({ ...opts, vocalLift: HIGH_VOICES[h].lift || undefined, vocalSinger: h }, seeds);
  track = buildTrack(idea, defaultTrackOptions(idea));
  offs = [];
  let n = 0;
  for (const s of track.sections) { offs.push(n); n += s.song.total; }
  engine.setList(track.sections, false, 0);
  fromSel.replaceChildren(...track.sections.map((x, i) => new Option(`From ${x.section?.label ?? i + 1}`, String(i))));
  score = buildScore(track.sections, (i) => engine.shapesFor(i));
  clock = new StepClock(score.steps, score.six);
  if (cast) stage = new Stage(cast, score, idea.song.genre);
  const secs = Math.round(score.steps * score.six);
  status(songInfo = `${GENRE_LABEL[idea.song.genre]}, ${idea.song.bpm} bpm, ${track.sections.length} sections, ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}. ${score.vocal.lines.length} sung lines, ${score.lead.length} lead notes, ${score.drums.limbs.A.length + score.drums.limbs.B.length} stick hits.`);
}

$('gen').onclick = async () => { await Tone.start(); newSong(); };
playBtn.onclick = async () => {
  if (engine.playing) { engine.stop(); return; }
  clock?.reset();
  if (track) engine.setList(track.sections, false, +fromSel.value || 0);
  playBtn.textContent = 'Stop';
  await engine.start();
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
  const t = songNow();
  stage.render(ctx, t);
  const m = stage.moment(Math.max(0, t));
  $('sect').textContent = t >= 0 ? `${m.section.label} · energy ${m.section.energy}` : '';
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
Promise.all([loadCast(), engine.loadCore()]).then(([c]) => {
  cast = c;
  newSong();
  playBtn.disabled = false;
  requestAnimationFrame(frame);
}).catch((e) => status(`Couldn't load: ${e}`));
