import './style.css';
import * as Tone from 'tone';
import { Engine, type LayerSettings } from './audio/engine';
import { CHORD_INSTRUMENTS } from './audio/instruments';
import type { GenreSel } from './genres';
import { LAYER_PARTS, type LayerPart, type MixPart } from './audio/mixer';
import { type Rendered, encodeMp3, encodeWav, isSilent, renderAudio, zipFiles } from './export/audio';
import { exportBaseName, toMidi } from './export/midi';
import { generate, randomSeeds } from './generator';
import type { ChordSheet, GenOptions, Idea, Seeds, SectionKind } from './idea';
import { METER_CHOICES } from './rhythm';
import { newSeed } from './rng';
import { SOUND_NAME, SOUND_SHORT, type SoundId, soundSlot } from './sounds';
import {
  type ChordTarget, type Choice, type IntroChoice, type OutroChoice, type Track, type TrackOptions, KIND_LABEL, buildTrack, defaultTrackOptions, rerollSeedFor,
} from './track';
import { type PartKey, buildLockPanel } from './ui/locks';
import { buildPartsPanel } from './ui/parts';
import { buildChordEditor } from './ui/chordedit';
import { hasPins } from './parts/sheet';
import { highlightBar, markSection, renderIdea, renderTrack } from './ui/render';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const genreSel = $<HTMLSelectElement>('genre');
const meterSel = $<HTMLSelectElement>('meter');
const weird = $<HTMLInputElement>('weird');
const playBtn = $<HTMLButtonElement>('play');
const trackBtn = $<HTMLButtonElement>('maketrack');
const trackCard = $('trackcard');
const status = $('status');

meterSel.innerHTML = [
  `<option value="auto">Auto (by weirdness)</option>`,
  ...METER_CHOICES.map((m) => `<option>${m}</option>`),
  `<option value="mixed">Mixed meters</option>`,
].join('');

const engine = new Engine();
let idea: Idea | null = null;
/** Track mode: the track, which section is shown/playing, and which one is looped (if any). */
let track: Track | null = null;
let shown = 0;
let looping: number | null = null;
/** Parts kept when you Generate. */
const locks = new Set<PartKey>();
let baseStatus = 'Loading sounds…';
const setStatus = (msg: string) => { status.textContent = msg || baseStatus; };
engine.onStatus = setStatus;
engine.onBar = highlightBar;

/** The section strip, labelled with the instrument each section's rhythm part plays on. */
const drawTrack = (t: Track) => renderTrack(t, (s) => SOUND_SHORT[engine.chordIdFor(s)]);

function render() {
  const cur = track ? track.sections[shown] : idea;
  if (!cur) return;
  const target = refreshEditor();
  const label = (id: string) => CHORD_INSTRUMENTS.find((i) => i.id === id)!.label;
  // the section's "Sound:" note names what actually plays (a part set by hand, or no piano rhythm under the piano layer)
  const sound = `Sound: ${SOUND_NAME[engine.chordIdFor(cur)]}${cur.guitar2.length ? `, Guitar 2 on ${SOUND_NAME[engine.guitar2IdFor(cur)]}` : ''}`;
  const shownIdea = { ...cur, notes: cur.notes.map((n) => (n.startsWith('Sound: ') ? sound : n)) };
  renderIdea(shownIdea, engine.shapesFor(cur), label(engine.chordIdFor(cur)), label(engine.guitar2IdFor(cur)),
    Object.fromEntries(LAYER_PARTS.map((p) => [p, engine.layerFor(cur, p)])),
    target ? { sheet: target.idea.opts.chords, from: target.from, n: target.n, selected: chordEditor.bar } : null);
  renderChordHead();
  if (track) {
    drawTrack(track);
    markSection(shown, looping);
    renderSectionTools();
  }
}

function setPlaying(on: boolean) {
  playBtn.textContent = on ? 'Stop' : 'Play';
  playBtn.classList.toggle('on', on);
}

/* ---- chords you set: tap a bar to open the editor; the band is rewritten around them */

const chordReset = $<HTMLButtonElement>('chordreset');

/** What the chord editor edits: the idea, or in a track the shown section's block (the chorus: the idea). */
function chordTarget(): ChordTarget | null {
  if (!idea) return null;
  if (!track) return { block: 'idea', idea, from: 0, n: idea.song.bars.length };
  return track.edit[track.sections[shown].section!.kind] ?? null;
}
function refreshEditor(): ChordTarget | null {
  const t = chordTarget();
  chordEditor.refresh(t?.idea ?? null, t?.block ?? 'none');
  return t;
}

/** New chords for what's being edited: a track block rebuilds the track, the idea rebuilds both. */
function setSheet(sheet: ChordSheet | undefined) {
  if (!idea) return;
  const t = chordTarget();
  if (track && t && t.block !== 'idea') rebuildTrack({ ...track.opts, chords: { ...track.opts.chords, [t.block]: sheet } }, shown, true);
  else showIdea(generate({ ...idea.opts, chords: sheet }, idea.seeds), true);
}

const chordEditor = buildChordEditor($('chordedit'), (sheet, msg) => {
  setSheet(sheet);
  setStatus(msg);
  setTimeout(() => setStatus(''), 4000);
}, () => render());

const BLOCK_NAME: Record<ChordTarget['block'], string> = { idea: 'chorus', verse: 'verse', pre: 'pre-chorus', bridge: 'bridge', chorus: 'chorus' };

function renderChordHead() {
  const hint = $('chordhint');
  const t = chordTarget();
  const pins = hasPins(t?.idea.opts.chords);
  chordReset.hidden = !pins;
  if (!track) {
    hint.textContent = pins
      ? 'Your chords are kept when you Generate; the rest is written around them. Tap a bar to change it.'
      : 'Tap a bar to set its chord. The rest of the band follows.';
  } else if (!t) hint.textContent = 'Chords can be set on a verse, pre-chorus, bridge or chorus.';
  else {
    const name = t.block === 'idea' ? KIND_LABEL[track.sections[shown].section!.kind].toLowerCase() : BLOCK_NAME[t.block];
    hint.textContent = `Tap a bar to set the ${name}'s chords: every ${name} plays them${t.block === 'idea' ? ' (they\'re the idea\'s chords)' : ''}.`;
  }
}

$('bars').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('button.bar');
  const at = Number(b?.dataset.at ?? -1);
  if (!b || !idea || at < 0) return;
  if (chordEditor.bar === at) chordEditor.close();
  else {
    // in a track, the section you edit loops so you hear your chords in it
    if (track && looping !== shown) { looping = shown; engine.setList([track.sections[shown]], true); }
    chordEditor.open(at);
  }
  render();
});

chordReset.onclick = () => {
  if (!idea) return;
  chordEditor.close();
  setSheet(undefined);
  setStatus('Chords back to the generator\'s.');
  setTimeout(() => setStatus(''), 3000);
};

/* ---- shareable link: the address always holds the current idea (and track) */

interface Shared { o: GenOptions; s: Seeds; t?: TrackOptions; l?: LayerSettings }

function updateLink() {
  if (!idea) return;
  const layers = engine.layerSettings;
  const data: Shared = { o: idea.opts, s: idea.seeds, ...(track ? { t: track.opts } : {}), ...(Object.keys(layers).length ? { l: layers } : {}) };
  try {
    history.replaceState(null, '', `#${btoa(encodeURIComponent(JSON.stringify(data)))}`);
  } catch { /* history blocked: no link */ }
}

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

$('copylink').onclick = async () => {
  updateLink();
  try {
    await navigator.clipboard.writeText(location.href);
    setStatus('Link copied: it opens this exact idea (and track).');
  } catch {
    setStatus('Copy the address from the address bar to share this idea.');
  }
  setTimeout(() => setStatus(''), 3000);
};

/* ---- export: the idea, or the whole track in track mode */

type ExportKind = 'midi' | 'mp3' | 'wav' | 'stems';
interface ExportFile { bytes: Uint8Array; name: string; type: string }

const STEM_NAMES: Record<MixPart, string> = {
  chords: 'rhythm-guitar', guitar2: 'guitar-2', bass: 'bass', drums: 'drums', keys: 'piano', pad: 'pad', strings: 'strings', perc: 'percussion',
};
const exportButtons = ['ex-mp3', 'ex-wav', 'ex-stems', 'ex-midi'].map((id) => $<HTMLButtonElement>(id));
let exporting = false;

/** Build an export file (no download): MIDI straight away, audio rendered offline first. */
async function buildExport(kind: ExportKind, progress: (msg: string) => void = () => {}): Promise<ExportFile | null> {
  if (!idea) return null;
  const list = track ? track.sections : [idea];
  const base = exportBaseName(idea, !!track);
  if (kind === 'midi') {
    const bytes = toMidi(list, {
      chordIdFor: (i) => engine.chordIdFor(i), guitar2IdFor: (i) => engine.guitar2IdFor(i),
      keysFor: (i) => engine.layerFor(i, 'keys'), padFor: (i) => engine.layerFor(i, 'pad'),
      stringsFor: (i) => engine.layerFor(i, 'strings'), percFor: (i) => engine.layerFor(i, 'perc'),
    });
    return { bytes, name: `${base}.mid`, type: 'audio/midi' };
  }
  const t0 = performance.now();
  let pct = -1;
  // a percentage when the browser reports progress, otherwise the time so far
  const tick = setInterval(() => {
    if (pct < 0) progress(`Rendering audio… ${Math.round((performance.now() - t0) / 1000)} s`);
  }, 500);
  progress('Rendering audio…');
  let r: Rendered;
  try {
    r = await renderAudio(list, engine.settings(), kind === 'stems', (p) => {
      pct = Math.round(p * 100);
      progress(`Rendering audio… ${pct}%`);
    });
  } finally {
    clearInterval(tick);
  }
  if (kind === 'wav') return { bytes: encodeWav(r.mix, r.sampleRate), name: `${base}.wav`, type: 'audio/wav' };
  if (kind === 'mp3') {
    const bytes = await encodeMp3(r.mix, r.sampleRate, 320, (p) => progress(`Encoding MP3… ${Math.round(p * 100)}%`));
    return { bytes, name: `${base}.mp3`, type: 'audio/mpeg' };
  }
  progress('Packing stems…');
  const files: Record<string, Uint8Array> = { [`${base}-mix.wav`]: encodeWav(r.mix, r.sampleRate) };
  for (const [part, chs] of Object.entries(r.stems!) as [MixPart, Float32Array[]][]) {
    if (!isSilent(chs)) files[`${base}-${STEM_NAMES[part]}.wav`] = encodeWav(chs, r.sampleRate);
  }
  return { bytes: await zipFiles(files), name: `${base}-stems.zip`, type: 'application/zip' };
}

function download(f: ExportFile) {
  const url = URL.createObjectURL(new Blob([new Uint8Array(f.bytes)], { type: f.type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = f.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function exportFile(kind: ExportKind) {
  if (exporting || !idea) return;
  exporting = true;
  exportButtons.forEach((b) => { b.disabled = true; });
  // rendering takes the computer's full attention: stop playback first
  if (kind !== 'midi' && engine.playing) { engine.stop(); setPlaying(false); }
  const t0 = performance.now();
  try {
    const f = await buildExport(kind, setStatus);
    if (f) {
      download(f);
      const mb = f.bytes.length / 1048576;
      const secs = Math.round((performance.now() - t0) / 1000);
      setStatus(`Saved ${f.name} (${mb < 1 ? `${Math.max(1, Math.round(mb * 1024))} KB` : `${mb.toFixed(1)} MB`}${kind === 'midi' ? '' : `, made in ${secs} s`})`);
    }
  } catch (e) {
    setStatus(`Couldn't export: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    exporting = false;
    exportButtons.forEach((b) => { b.disabled = false; });
    setTimeout(() => { if (!exporting) setStatus(''); }, 6000);
  }
}

$('ex-mp3').onclick = () => exportFile('mp3');
$('ex-wav').onclick = () => exportFile('wav');
$('ex-stems').onclick = () => exportFile('stems');
$('ex-midi').onclick = () => exportFile('midi');

/* ---- playback follows the track */

engine.onSection = (i) => {
  if (!track) return;
  shown = looping ?? i;
  render();
};

// the track played to the end: stop, and get ready to play it again from the top
engine.onEnd = () => {
  engine.stop();
  setPlaying(false);
  if (track) {
    shown = 0;
    looping = null;
    engine.setList(track.sections, false, 0);
    render();
  }
};

function leaveTrack() {
  track = null;
  looping = null;
  shown = 0;
  trackCard.hidden = true;
  trackBtn.hidden = false;
}

/** Send the track to the engine: the looped section, or the whole track from the shown section. */
function playTrack(keepPlace: boolean) {
  if (!track) return;
  if (looping !== null) engine.setList([track.sections[looping]], true, 0, keepPlace);
  else engine.setList(track.sections, false, keepPlace ? engine.position : shown, keepPlace);
}

/** Rebuild the track (same idea, new options) and keep playing at the selected section. */
function rebuildTrack(opts: TrackOptions, select = shown, keepPlace = false) {
  if (!idea) return;
  track = buildTrack(idea, opts);
  shown = Math.max(0, Math.min(select, track.sections.length - 1));
  if (looping !== null) looping = shown;
  drawTrack(track);
  syncTrackOptions();
  playTrack(keepPlace);
  render();
  updateLink();
}

/* ---- tempo: empty = Auto (the genre's own range) */

const tempo = $<HTMLInputElement>('tempo');
const TEMPO_MIN = 40, TEMPO_MAX = 240;
function readTempo(): number | undefined {
  const v = Math.round(+tempo.value);
  return tempo.value.trim() && v >= TEMPO_MIN && v <= TEMPO_MAX ? v : undefined;
}

/* ---- ideas, locks and rerolls */

const lockPanel = buildLockPanel($('locks'), locks, (k) => reroll(k), () => updateLink(),
  (k) => !(LAYER_PARTS as string[]).includes(k) || !!engine.layerSettings[k as LayerPart],
  () => hasPins(idea?.opts.chords));

function showIdea(next: Idea, keepPlace = false) {
  idea = next;
  lockPanel.update(idea);
  if (track) {
    // a new song gets fresh track seeds (keeping the structure choices); a reroll keeps them
    const same = next.seeds.song === track.source.seeds.song;
    // (chords set on its sections belong to the old song: they go too)
    track = buildTrack(idea, same ? track.opts : { ...track.opts, seeds: defaultTrackOptions(idea).seeds, chords: undefined });
    drawTrack(track);
    syncTrackOptions();
    shown = Math.min(shown, track.sections.length - 1);
    if (looping !== null) looping = Math.min(looping, track.sections.length - 1);
    if (keepPlace) playTrack(true);
    else { shown = 0; looping = null; engine.setList(track.sections, false, 0); }
  } else engine.setIdea(idea, keepPlace);
  render();
  updateLink();
}

/** Generate: new seeds for everything that isn't locked. Locking any part keeps the song too. */
function newIdea() {
  const seeds = randomSeeds();
  if (idea) {
    for (const k of locks) (seeds as unknown as Record<string, string>)[k] = idea.seeds[k] ?? seeds[k]!;
    // chords you set belong to the song's key and bars: keep it (and them)
    const sectionPins = !!track && Object.values(track.opts.chords ?? {}).some((x) => hasPins(x));
    if (locks.size || hasPins(idea.opts.chords) || sectionPins) seeds.song = idea.seeds.song;
  }
  const chords = idea && hasPins(idea.opts.chords) ? idea.opts.chords : undefined;
  showIdea(generate({ genre: genreSel.value as GenreSel, meter: meterSel.value, weirdness: +weird.value / 100, bpm: readTempo(), chords }, seeds));
}

/** One part gets new seeds; everything else stays. Playback carries on from the same spot. */
function reroll(k: PartKey) {
  if (!idea) return;
  showIdea(generate(idea.opts, { ...idea.seeds, [k]: newSeed() }), true);
}

/** Apply a tempo change to the current idea (and track) live, without regenerating. */
function retempo(bpm: number | undefined) {
  if (!idea) return;
  idea.opts = { ...idea.opts, bpm };
  // Auto: same seeds give the same idea, so this recovers its own tempo
  idea.song.bpm = bpm ?? generate(idea.opts, idea.seeds).song.bpm;
  if (track) {
    for (const s of track.sections) s.song.bpm = idea.song.bpm;
    drawTrack(track);
  }
  engine.setTempo(idea.song.bpm);
  render();
  updateLink();
}

tempo.oninput = () => { const v = readTempo(); if (v) retempo(v); };
tempo.onchange = () => {
  if (tempo.value.trim()) {
    const v = Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, Math.round(+tempo.value) || TEMPO_MIN));
    tempo.value = String(v);
    retempo(v);
  } else retempo(undefined);
};

/* ---- tracks */

async function playIfStopped() {
  if (engine.playing || playBtn.disabled) return;
  await engine.start();
  setPlaying(true);
}

function enterTrack(opts: TrackOptions) {
  if (!idea) return;
  track = buildTrack(idea, opts);
  looping = null;
  shown = 0;
  trackCard.hidden = false;
  trackBtn.hidden = true;
  drawTrack(track);
  syncTrackOptions();
  engine.setList(track.sections, false, 0);
  render();
  updateLink();
}

trackBtn.onclick = () => { if (idea) enterTrack(defaultTrackOptions(idea)); };

$('playall').onclick = async () => {
  if (!track) return;
  looping = null;
  shown = 0;
  engine.setList(track.sections, false, 0);
  render();
  await playIfStopped();
};

$('backidea').onclick = () => {
  if (!idea) return;
  leaveTrack();
  engine.setIdea(idea);
  render();
  updateLink();
};

// tap a section to loop it; tap the looped one again to play on from there
$('sections').onclick = async (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>('.sec');
  if (!btn || !track) return;
  const i = Number(btn.dataset.i);
  if (looping === i) {
    looping = null;
    engine.setList(track.sections, false, i);
  } else {
    looping = i;
    engine.setList([track.sections[i]], true);
  }
  shown = i;
  render();
  await playIfStopped();
};

// structure options (changing one goes back to the automatic order)
const optSel = {
  intro: $<HTMLSelectElement>('t-intro'),
  pre: $<HTMLSelectElement>('t-pre'),
  interlude: $<HTMLSelectElement>('t-interlude'),
  keyChange: $<HTMLSelectElement>('t-key'),
  outro: $<HTMLSelectElement>('t-outro'),
  riffVerse: $<HTMLSelectElement>('t-riff'),
  band: $<HTMLSelectElement>('t-band'),
};
function syncTrackOptions() {
  if (!track) return;
  optSel.intro.value = track.opts.intro;
  optSel.pre.value = track.opts.pre;
  optSel.interlude.value = track.opts.interlude;
  optSel.keyChange.value = track.opts.keyChange;
  optSel.outro.value = track.opts.outro ?? 'auto';
  optSel.riffVerse.value = track.opts.riffVerse ?? 'auto';
  optSel.band.value = track.opts.band ?? 'on';
  // only riff genres have a riff to carry through the verses
  optSel.riffVerse.closest('label')!.style.display = track.source.guitar ? '' : 'none';
}
for (const [k, sel] of Object.entries(optSel)) {
  sel.onchange = () => {
    if (!track) return;
    // the band playing it (or not) changes how it's played, not the song: stay where you are
    if (k === 'band') return rebuildTrack({ ...track.opts, band: sel.value as 'on' | 'off' }, shown, true);
    const opts: TrackOptions = { ...track.opts, order: undefined };
    if (k === 'intro') opts.intro = sel.value as IntroChoice;
    else if (k === 'outro') opts.outro = sel.value as OutroChoice;
    else (opts as unknown as Record<string, Choice>)[k] = sel.value as Choice;
    rebuildTrack(opts, 0);
  };
}

// tools for the selected section
const REROLL_LABEL: Record<string, string> = {
  verse: 'New verse', chorus: 'New chorus', pre: 'New pre-chorus', bridge: 'New bridge', hook: 'New hook', structure: 'New arrangement',
};
function renderSectionTools() {
  if (!track) return;
  const sec = track.sections[shown].section!;
  $('sectname').textContent = sec.label;
  const key = rerollSeedFor(sec.kind, !!track.source.guitar, track);
  const rr = $<HTMLButtonElement>('s-reroll');
  const kindName = KIND_LABEL[sec.kind].toLowerCase();
  rr.disabled = !key;
  rr.textContent = key ? (key === 'bridge' && sec.kind === 'breakdown' ? 'New breakdown' : REROLL_LABEL[key]) : `New ${kindName}`;
  rr.title = key ? '' : `The ${kindName} is your idea: reroll its parts in Keep / reroll`;
  const slot = soundSlot(sec.kind);
  soundSel.value = track.opts.sounds?.[slot] ?? 'auto';
  soundSel.disabled = !engine.rhythmAuto;
  soundSel.title = engine.rhythmAuto
    ? `The rhythm instrument for every ${KIND_LABEL[slot].toLowerCase()}`
    : 'Set Rhythm to Auto in Parts to pick instruments per section';
  $<HTMLButtonElement>('s-left').disabled = shown === 0;
  $<HTMLButtonElement>('s-right').disabled = shown === track.sections.length - 1;
  $<HTMLButtonElement>('s-del').disabled = track.sections.length <= 1;
}

/** Edit the order of sections by hand. */
function editOrder(f: (order: SectionKind[]) => number) {
  if (!track) return;
  const order = [...track.order];
  const select = f(order);
  rebuildTrack({ ...track.opts, order }, select);
}

$('s-reroll').onclick = () => {
  if (!track) return;
  const key = rerollSeedFor(track.sections[shown].section!.kind, !!track.source.guitar, track);
  if (!key) return;
  rebuildTrack({ ...track.opts, seeds: { ...track.opts.seeds, [key]: newSeed() } });
};
const soundSel = $<HTMLSelectElement>('s-sound');
soundSel.innerHTML = [['auto', 'Sound: Auto'], ...Object.entries(SOUND_SHORT).map(([id, name]) => [id, `Sound: ${name}`])]
  .map(([id, name]) => `<option value="${id}">${name}</option>`).join('');
soundSel.onchange = () => {
  if (!track) return;
  const slot = soundSlot(track.sections[shown].section!.kind);
  const sounds = { ...track.opts.sounds };
  if (soundSel.value === 'auto') delete sounds[slot];
  else sounds[slot] = soundSel.value as SoundId;
  rebuildTrack({ ...track.opts, sounds: Object.keys(sounds).length ? sounds : undefined });
};
$('s-left').onclick = () => editOrder((o) => { [o[shown - 1], o[shown]] = [o[shown], o[shown - 1]]; return shown - 1; });
$('s-right').onclick = () => editOrder((o) => { [o[shown + 1], o[shown]] = [o[shown], o[shown + 1]]; return shown + 1; });
$('s-dup').onclick = () => editOrder((o) => { o.splice(shown + 1, 0, o[shown]); return shown + 1; });
$('s-del').onclick = () => editOrder((o) => { o.splice(shown, 1); return Math.min(shown, o.length - 1); });
const addSel = $<HTMLSelectElement>('s-add');
addSel.onchange = () => {
  const k = addSel.value as SectionKind;
  addSel.value = '';
  if (k) editOrder((o) => { o.splice(shown + 1, 0, k); return shown + 1; });
};

const partsPanel = buildPartsPanel($('parts'), engine, () => {
  // a layer added or removed: the strip labels, lanes, Keep / reroll and the link all follow
  if (track) drawTrack(track);
  render();
  lockPanel.update(idea);
  updateLink();
});

// dev-only handle for debugging in the browser console
if (import.meta.env.DEV) Object.assign(window, { engine, Tone, currentIdea: () => idea, currentTrack: () => track, buildExport });

weird.oninput = () => { $('wv').textContent = weird.value; };

// master volume, remembered on this device
const master = $<HTMLInputElement>('master');
try { master.value = localStorage.getItem('mig.volume') ?? master.value; } catch { /* storage blocked */ }
engine.mixer.setMasterVolume(+master.value);
master.oninput = () => {
  engine.mixer.setMasterVolume(+master.value);
  try { localStorage.setItem('mig.volume', master.value); } catch { /* storage blocked */ }
};

$('gen').onclick = async () => {
  await Tone.start();
  newIdea();
};

playBtn.onclick = async () => {
  if (!engine.playing) {
    await engine.start();
    setPlaying(true);
  } else {
    engine.stop();
    setPlaying(false);
  }
};

// boot: open a shared link, or show a new idea right away; enable Play once drums + bass are in
const shared = readLink();
if (shared) {
  genreSel.value = shared.o.genre;
  meterSel.value = shared.o.meter;
  weird.value = String(Math.round(shared.o.weirdness * 100));
  $('wv').textContent = weird.value;
  if (shared.o.bpm) tempo.value = String(shared.o.bpm);
  for (const p of LAYER_PARTS) if (shared.l?.[p]) engine.setLayer(p, shared.l[p]!);
  for (const p of shared.l?.throughout ?? []) engine.setLayerThroughout(p, true);
  partsPanel.sync();
  showIdea(generate(shared.o, shared.s));
  if (shared.t) enterTrack(shared.t);
} else newIdea();
engine.loadCore().then((failed) => {
  baseStatus = failed.length
    ? `Ready — synth fallback for ${failed.join(', ')} (samples didn't load).`
    : 'Ready — tap Play.';
  if (status.textContent?.startsWith('Loading sounds')) setStatus('');
  playBtn.disabled = false;
});
