import './style.css';
import * as Tone from 'tone';
import { Engine } from './audio/engine';
import { CHORD_INSTRUMENTS } from './audio/instruments';
import type { GenreSel } from './genres';
import { generate } from './generator';
import type { Idea } from './idea';
import { METER_CHOICES } from './rhythm';
import { buildPartsPanel } from './ui/parts';
import { highlightBar, renderIdea } from './ui/render';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const genreSel = $<HTMLSelectElement>('genre');
const meterSel = $<HTMLSelectElement>('meter');
const weird = $<HTMLInputElement>('weird');
const playBtn = $<HTMLButtonElement>('play');
const status = $('status');

meterSel.innerHTML = [
  `<option value="auto">Auto (by weirdness)</option>`,
  ...METER_CHOICES.map((m) => `<option>${m}</option>`),
  `<option value="mixed">Mixed meters</option>`,
].join('');

const engine = new Engine();
let idea: Idea | null = null;
let baseStatus = 'Loading sounds…';
const setStatus = (msg: string) => { status.textContent = msg || baseStatus; };
engine.onStatus = setStatus;
engine.onBar = highlightBar;

function render() {
  if (!idea) return;
  const label = CHORD_INSTRUMENTS.find((i) => i.id === engine.chordInstrumentId)!.label;
  renderIdea(idea, engine.guitarShapes, label);
}

function newIdea() {
  idea = generate({ genre: genreSel.value as GenreSel, meter: meterSel.value, weirdness: +weird.value / 100 });
  engine.setIdea(idea);
  render();
}

buildPartsPanel($('parts'), engine, render);

// dev-only handle for debugging in the browser console
if (import.meta.env.DEV) Object.assign(window, { engine, Tone, currentIdea: () => idea });

weird.oninput = () => { $('wv').textContent = weird.value; };

$('gen').onclick = async () => {
  await Tone.start();
  newIdea();
};

playBtn.onclick = async () => {
  if (!engine.playing) {
    await engine.start();
    playBtn.textContent = 'Stop';
    playBtn.classList.add('on');
  } else {
    engine.stop();
    playBtn.textContent = 'Play';
    playBtn.classList.remove('on');
  }
};

// boot: show an idea right away, enable Play once drums + bass are in
newIdea();
engine.loadCore().then((failed) => {
  baseStatus = failed.length
    ? `Ready — synth fallback for ${failed.join(', ')} (samples didn't load).`
    : 'Ready — tap Play.';
  if (status.textContent?.startsWith('Loading sounds')) setStatus('');
  playBtn.disabled = false;
});
