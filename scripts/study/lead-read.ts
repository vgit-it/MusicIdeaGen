// Reading lead guitar parts from MIDI files (the lead guitar study, lead-study.ts, and the lick finder, lick-mine.ts).
import { parseMidi } from 'midi-file';
import type { N } from './lakh-songs';

const median = (a: number[]) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };

/** `bend`: the most a pitch bend raises it while it sounds (semitones, assuming the usual 2-semitone range). */
export interface BN extends N { bent?: boolean; bend?: number }
export interface Track { name: string; ch: number; prog: number; ns: BN[] }

/** Every track's notes (in beats), with notes bent by pitch-bend events marked. */
export function read(bytes: Uint8Array): { T: Track[]; ts: string; bpm: number } | null {
  let m; try { m = parseMidi(bytes); } catch { return null; }
  const ppq = (m.header as { ticksPerBeat?: number }).ticksPerBeat;
  if (!ppq) return null;
  let ts = '', bpm = 0;
  const T = m.tracks.map((t) => {
    let tick = 0, name = '', ch = -1, prog = -1;
    const on: Record<number, number> = {}, ns: BN[] = [], bends: number[] = [], bv: number[] = [];
    for (const e of t as any[]) {
      tick += e.deltaTime;
      if (e.type === 'trackName' && !name) name = (e.text || '').trim();
      else if (e.type === 'timeSignature' && !ts) ts = `${e.numerator}/${e.denominator}`;
      else if (e.type === 'setTempo' && !bpm) bpm = 60000000 / e.microsecondsPerBeat;
      else if (e.type === 'programChange' && prog < 0) prog = e.programNumber;
      else if (e.type === 'pitchBend') { if (Math.abs(e.value) > 400) bends.push(tick / ppq); bv.push(tick / ppq, e.value); }
      else if (e.type === 'noteOn' && e.velocity > 0) { on[e.channel * 128 + e.noteNumber] = tick; ch = e.channel; }
      else if (e.type === 'noteOff' || (e.type === 'noteOn' && e.velocity === 0)) { const k = e.channel * 128 + e.noteNumber; if (on[k] !== undefined) { ns.push({ s: on[k] / ppq, e: tick / ppq, p: e.noteNumber }); delete on[k]; } }
    }
    ns.sort((x, y) => x.s - y.s || x.p - y.p);
    if (bends.length) { let j = 0; for (const n of ns) { while (j < bends.length && bends[j] < n.s - 0.01) j++; if (j < bends.length && bends[j] < n.e) n.bent = true; } }
    // (how far each note is bent up: the highest bend while it sounds, the last one before it counting too)
    if (bv.length) {
      let j = 0, cur = 0;
      for (const n of ns) {
        while (j < bv.length && bv[j] <= n.s + 0.01) { cur = bv[j + 1]; j += 2; }
        let hi = cur;
        for (let k = j; k < bv.length && bv[k] < n.e; k += 2) hi = Math.max(hi, bv[k + 1]);
        if (hi > 1500) n.bend = Math.min(4, Math.max(1, Math.round((hi / 8192) * 2)));
      }
    }
    return { name, ch, prog, ns };
  });
  return { T, ts, bpm: bpm || 120 };
}

/** Onsets: notes struck together (within a 32nd) are one. */
export const onsets = (ns: BN[]) => { const o: BN[][] = []; for (const n of ns) { const l = o[o.length - 1]; if (l && n.s - l[0].s < 0.12) l.push(n); else o.push([n]); } return o; };
const NOT_GTR = /vo(c|x|ice)|sax|key|synth|piano|organ|string|bass|trump|flute|horn|brass|harp|pad|sing|melod/i;
export const guitarish = (t: Track) => t.ch !== 9 && !/bass/i.test(t.name) && ((t.prog >= 24 && t.prog <= 31 && !NOT_GTR.test(t.name)) || (/guit|gtr|solo|lead|\bgt\b/i.test(t.name) && !NOT_GTR.test(t.name) && (t.prog < 0 || t.prog <= 31)));
/** A lead line: mostly one note at a time, above the rhythm register, more than a few pitches. */
export function isLead(t: Track) {
  if (t.ns.length < 30) return false;
  const o = onsets(t.ns), ps = t.ns.map((n) => n.p);
  return o.filter((x) => new Set(x.map((n) => n.p)).size >= 3).length / o.length < 0.25 && median(ps) >= 57 && new Set(ps).size >= 7;
}

