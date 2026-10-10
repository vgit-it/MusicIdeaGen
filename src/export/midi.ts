// MIDI export: an idea or a whole track as a standard MIDI file, one track per instrument
// (Rhythm guitar, Guitar 2, Bass, Drums on the GM drum channel, plus Piano and Pad when added), with tempo, time signatures,
// the key (as text), section markers, and the same dynamics, swing, strums and note lengths as playback.

import { Midi } from '@tonejs/midi';
import type { Track as MidiTrack } from '@tonejs/midi/dist/Track';
import type { ChordInstrumentId } from '../audio/instruments';
import { DYNAMICS, SECTION_DB } from '../audio/dynamics';
import { GENRE_LABEL } from '../genres';
import type { GuitarHit, Idea } from '../idea';
import type { Layer } from '../parts/layers';
import { cymbalAccent, groupStarts } from '../rhythm';
import { NOTE_NAMES, pianoVoicing } from '../theory';
import { guitarVoicings } from '../theory/guitar';

const PPQ = 480;
const SIX = PPQ / 4; // ticks per 16th

/** General MIDI programs for the instruments. */
const PROGRAM: Record<ChordInstrumentId, number> = {
  piano: 0, acoustic: 25, 'electric-clean': 27, 'electric-crunch': 29, 'electric-dist': 30,
};

/** General MIDI drum notes (toms 1–3 go high to low, as the fills do). */
const DRUM_NOTE = { kick: 36, snare: 38, hat: 42, hatOpen: 46, ride: 51, crash: 49, tom: [50, 47, 43] };


export interface MidiOptions {
  /** The rhythm instrument for each idea (Auto can change with a section's energy). */
  chordIdFor: (idea: Idea) => ChordInstrumentId;
  /** The same for Guitar 2. */
  guitar2IdFor: (idea: Idea) => ChordInstrumentId;
  /** Added layers: each one's part for an idea (null when it's off). */
  keysFor?: (idea: Idea) => Layer | null;
  padFor?: (idea: Idea) => Layer | null;
  stringsFor?: (idea: Idea) => Layer | null;
  /** Percussion notes are General MIDI percussion numbers (written on the drum channel). */
  percFor?: (idea: Idea) => Layer | null;
}

const vel = (v: number) => Math.max(0.05, Math.min(1, v));

/** Build a MIDI file from ideas played back to back (one idea, or a track's sections). */
export function toMidi(list: Idea[], o: MidiOptions): Uint8Array {
  const midi = new Midi();
  midi.header.setTempo(list[0].song.bpm);
  midi.header.update();
  const bpm = list[0].song.bpm;
  const secToTicks = (s: number) => Math.round((s * bpm * PPQ) / 60);
  const sixSec = 15 / bpm;

  const mk = (name: string, channel: number, program: number) => {
    const t = midi.addTrack();
    t.name = name;
    t.channel = channel;
    t.instrument.number = program;
    return t;
  };
  // each part's sound: the instrument it plays on most across the list (a MIDI track has one)
  const most = (ids: ChordInstrumentId[]) => ids.sort((a, b) => ids.filter((x) => x === b).length - ids.filter((x) => x === a).length)[0];
  const rhythm = mk('Rhythm guitar', 0, PROGRAM[most(list.map(o.chordIdFor))]);
  const withG2 = list.filter((i) => i.guitar2.length);
  const g2 = mk('Guitar 2', 1, PROGRAM[most((withG2.length ? withG2 : list).map(o.guitar2IdFor))]);
  const bass = mk('Bass', 2, 33);
  const drums = mk('Drums', 9, 0); // channel 10 (index 9): the GM drum kit
  const piano = mk('Piano', 3, 0);
  const pad = mk('Pad', 4, 89); // GM "Pad 2 (warm)"
  const strings = mk('Strings', 5, 48); // GM "String Ensemble 1"
  const perc = mk('Percussion', 9, 0);

  const note = (t: MidiTrack, midiNote: number, ticks: number, dur: number, v: number) => {
    if (midiNote < 0 || midiNote > 127) return;
    t.addNote({ midi: midiNote, ticks: Math.max(0, Math.round(ticks)), durationTicks: Math.max(10, Math.round(dur)), velocity: vel(v) });
  };

  let offset = 0;
  let lastMeter = '';
  let lastKey = '';
  list.forEach((idea) => {
    const { song, chords, drums: d, strum, bass: bl } = idea;
    const total = song.total;
    const energy = idea.section?.energy ?? 4;
    const dyn = DYNAMICS[energy];
    const lastBar = song.bars[song.bars.length - 1];
    // swing: odd 16ths come late, as Tone's transport plays them
    const at = (g: number) => offset + g * SIX + (g % 2 ? song.swing * (2 / 3) * SIX : 0);
    const gapUntil = (lane: ArrayLike<unknown>, empty: unknown, g: number, cap: number) => {
      let n = 1;
      while (n < cap && g + n < total && lane[g + n] === empty) n++;
      return n;
    };

    // headers: section marker, time signature changes, key changes, section level as expression
    if (idea.section) midi.header.meta.push({ type: 'marker', text: idea.section.label, ticks: offset });
    for (const b of song.bars) {
      if (b.meter !== lastMeter) {
        const [num, den] = b.meter.split('/').map(Number);
        midi.header.timeSignatures.push({ ticks: offset + b.start * SIX, timeSignature: [num, den] });
        lastMeter = b.meter;
      }
    }
    // the key as a text note (@tonejs/midi 2.0.28 writes key-signature events wrongly, so none are written)
    const keyName = `${NOTE_NAMES[song.key]} ${song.mode}`;
    if (keyName !== lastKey) {
      midi.header.meta.push({ type: 'text', text: `Key: ${keyName}`, ticks: offset });
      lastKey = keyName;
    }
    const expression = Math.round(127 * 10 ** (SECTION_DB[energy] / 20));
    for (const t of [rhythm, g2, bass, drums, piano, pad, strings, perc]) t.addCC({ number: 11, value: expression / 127, ticks: offset });

    const isGuitar = (id: ChordInstrumentId) => id !== 'piano';
    const id = o.chordIdFor(idea);
    // chord voicings for strummed parts: the same shapes playback uses
    const voicings = idea.guitar ? [] : isGuitar(id)
      ? guitarVoicings(song.key, chords.timeline.map((e) => e.chord), { preferOpen: id === 'acoustic', powerChords: id === 'electric-dist' }).map((v) => v.notes)
      : chords.timeline.map((e) => pianoVoicing(song.key, e.chord));

    /** A guitar hit (riff or guitar 2) as notes, strummed low to high. */
    const hit = (t: MidiTrack, h: GuitarHit, v: number, ending: boolean, late = 0) => {
      let dur = ending ? 6 : Math.min(h.len * sixSec * 0.97, 4);
      let hv = v;
      if (h.mute === 'palm') { dur = Math.min(dur, 0.2); hv *= 0.9; }
      if (h.mute === 'dead') { dur = 0.05; hv *= 0.6; }
      if (h.swell) hv *= 0.8;
      h.notes.forEach((m, i) => note(t, m, at(h.step) + secToTicks(late / 1000) + i * 6, secToTicks(dur), hv));
    };

    for (let g = 0; g < total; g++) {
      const ending = !!idea.section?.ending && g >= lastBar.start;
      const bar = song.bars.find((b) => g >= b.start && g < b.start + b.len)!;
      const onBeat = groupStarts(bar.groups).includes(g - bar.start);

      // rhythm guitar: riff hits, or strums of the chord voicing
      for (const h of idea.guitar ?? []) if (h.step === g) hit(rhythm, h, h.vel * dyn, ending);
      const st = strum[g];
      if (!idea.guitar && st !== '.') {
        const notes = voicings[chords.chordIdx[g]];
        const accent = (onBeat ? 0.12 : 0) + (d.kick[g] || d.snare[g] >= 0.5 ? 0.06 : 0);
        const n = gapUntil(strum, '.', g, 16);
        const ring = ending ? 6 : Math.min(n * sixSec * 0.97, isGuitar(id) ? 2.4 : 1.6);
        const v = ((st === 'U' ? 0.55 : 0.68) + accent) * dyn * (idea.strumGain ?? 1);
        if (st === 'x') notes.slice(-3).forEach((m, i) => note(rhythm, m, at(g) + i * 3, 30, 0.3));
        else if (st === 'p') notes.slice(0, 3).forEach((m, i) => note(rhythm, m, at(g) + i * 4, secToTicks(Math.min(ring, 0.14)), v * 0.8));
        else (st === 'U' ? [...notes].reverse() : notes).forEach((m, i) => note(rhythm, m, at(g) + i * 10, secToTicks(ring), v));
      }

      for (const h of idea.guitar2) if (h.step === g) hit(g2, h, h.vel, false, idea.g2Feel ?? 0);

      if (bl[g]) {
        // as played: legato into the next note, unless written shorter
        const next = gapUntil(bl, 0, g, 64);
        const n = idea.bassLen?.[g] || next;
        const dur = ending ? 5 : Math.min(n >= next ? next * sixSec * 0.98 : n * sixSec * 0.95, 4.5);
        note(bass, bl[g], at(g) + secToTicks((idea.bassFeel ?? 0) / 1000), secToTicks(dur), (onBeat ? 0.9 : 0.74) * dyn);
      }

      // (the drummer's feel moves the snare and cymbals off the grid, as played)
      const dn = (n: number, v: number, ms = 0) => note(drums, n, Math.max(0, at(g) + secToTicks(ms / 1000)), SIX, v);
      const sn = d.feel?.snare ?? 0, cy = d.feel?.cym ?? 0;
      if (d.kick[g]) dn(DRUM_NOTE.kick, d.kick[g]);
      if (d.snare[g]) dn(DRUM_NOTE.snare, d.snare[g], sn);
      const acc = cymbalAccent(bar.groups, g - bar.start);
      if (d.hat[g]) dn(DRUM_NOTE.hat, Math.min(1, d.hat[g] * acc), cy);
      if (d.hatOpen[g]) dn(DRUM_NOTE.hatOpen, d.hatOpen[g], cy);
      if (d.ride[g]) dn(DRUM_NOTE.ride, Math.min(1, d.ride[g] * acc), cy);
      if (d.crash[g]) dn(DRUM_NOTE.crash, d.crash[g]);
      if (d.tom[g]) dn(DRUM_NOTE.tom[Math.min(2, d.tom[g] - 1)], 0.8);
    }
    // added layers: already written with their lengths and velocities (ending chords ring 2 bars)
    for (const [t, layer] of [[piano, o.keysFor?.(idea)], [pad, o.padFor?.(idea)], [strings, o.stringsFor?.(idea)], [perc, o.percFor?.(idea)]] as const) {
      for (const n of layer?.notes ?? []) for (const m of n.notes) note(t, m, at(n.step), n.len * SIX * 0.97, n.vel);
    }
    offset += total * SIX;
  });

  // drop empty tracks (e.g. Guitar 2 sitting out the whole idea)
  midi.tracks = midi.tracks.filter((t) => t.notes.length);
  return midi.toArray();
}

/** A base file name like "hard-rock-fsharp-minor-122bpm-track-<seed>" (shared by MIDI and audio exports). */
export function exportBaseName(idea: Idea, track: boolean): string {
  const { song } = idea;
  const slug = (s: string) => s.replace(/#/g, 'sharp').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `${slug(GENRE_LABEL[song.genre])}-${slug(NOTE_NAMES[song.key])}-${song.mode}-${song.bpm}bpm-${track ? 'track' : 'idea'}-${idea.seeds.song}`;
}

export const midiFileName = (idea: Idea, track: boolean) => `${exportBaseName(idea, track)}.mid`;
