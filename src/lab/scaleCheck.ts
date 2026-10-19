// The Scale check tab of the voice creator: the voice as set in the Voice tab sings a climb, and the page shows what
// it does at each note: how loud it sounds (as heard: the low notes' plain hum counts for little), how much of the
// sound is the plain fundamental (a thin hum, or a whistle up high), and, for one note, every harmonic with and
// without the low-note and close-vowel fixes (lowBuzz, closeFill). The page's own play buttons let you hear it.

import { FOF_RATE, type FofVoice, renderFof } from '../audio/fof';
import type { SungNote } from '../audio/sing';
import type { Syllable, Vowel } from '../parts/lyrics';
import { harmonics, measure, mtof } from './measure';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = (m: number) => `${NAMES[m % 12]}${Math.floor(m / 12) - 1}`;
const syl = (vowel: Vowel): Syllable => ({ onset: [], vowel, coda: [], stress: true, text: '', wordStart: true });

/** The climb: every third semitone from C2 up, in written (sung) pitch; the voice's own shift moves it up. */
const MIDIS: number[] = [];
for (let m = 36; m <= 84; m += 3) MIDIS.push(m);
const STEP = 1.05;
const NOTE_LEN = 0.9;

interface Result { lv: number[]; heard: number[]; share: number[]; clean: number[]; pcm: Float32Array }
const OFF = { lowBuzz: 0, closeFill: 0, falFill: 0 };

function climb(v: Partial<FofVoice>, vowel: Vowel, vel: number): Result {
  const notes: SungNote[] = MIDIS.map((midi, i) => ({ t: i * STEP, end: i * STEP + NOTE_LEN, midi, vel, syl: syl(vowel) }));
  const voice = { seed: 17, ...v } as FofVoice;
  const pcm = renderFof(notes, voice, 0);
  const sh = voice.shift ?? (voice.high ? 12 : 0);
  const lv: number[] = [], heard: number[] = [], share: number[] = [], clean: number[] = [];
  MIDIS.forEach((midi, i) => {
    const m = measure(pcm, mtof(midi + sh), i * STEP + 0.3);
    lv.push(m.db); heard.push(m.a); share.push(m.h1); clean.push(m.hnr);
  });
  return { lv, heard, share, clean, pcm };
}

/* ---- charts (SVG, in the page's colours) */

const W = 760, H = 230, L = 46, R = 12, T = 14, B = 34;
const GREY = 'var(--muted)', ACC = 'var(--accent)';
function frame(xLabels: string[], yMin: number, yMax: number, yTicks: number[], unit: string, extra = ''): { svg: (body: string) => string; x: (i: number) => number; y: (v: number) => number } {
  const x = (i: number) => L + ((W - L - R) * (i + 0.5)) / xLabels.length;
  const y = (v: number) => T + (H - T - B) * (1 - (Math.max(yMin, Math.min(yMax, v)) - yMin) / (yMax - yMin));
  const grid = yTicks.map((t) => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" stroke="var(--line)"/><text x="${L - 6}" y="${y(t) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${t}${unit}</text>`).join('');
  const xs = xLabels.map((l, i) => (i % 2 === 0 ? `<text x="${x(i)}" y="${H - 14}" text-anchor="middle" font-size="11" fill="var(--muted)">${l}</text>` : '')).join('');
  return { x, y, svg: (body) => `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img">${extra}${grid}${xs}${body}</svg>` };
}
const line = (pts: [number, number][], color: string, dash = '') => `<polyline fill="none" stroke="${color}" stroke-width="2.2" ${dash ? `stroke-dasharray="${dash}"` : ''} points="${pts.map((p) => p.join(',')).join(' ')}"/>${pts.map((p) => `<circle cx="${p[0]}" cy="${p[1]}" r="2.6" fill="${color}"/>`).join('')}`;

function levelChart(a: Result, b: Result | null, shift: number) {
  const labels = MIDIS.map((m) => noteName(m + shift));
  // (as heard, against the notes in the middle of the climb: where the singer's body is)
  const ref = (r: Result) => { const mid = r.heard.slice(Math.floor(MIDIS.length * 0.3), Math.floor(MIDIS.length * 0.6)).sort((p, q) => p - q); return mid[Math.floor(mid.length / 2)]; };
  const f = frame(labels, -24, 16, [-20, -10, 0, 10], ' dB', '');
  const mk = (r: Result) => r.heard.map((h, i): [number, number] => [f.x(i), f.y(h - ref(r))]);
  const zone = `<rect x="${L}" y="${f.y(-6)}" width="${W - L - R}" height="${f.y(-24) - f.y(-6)}" fill="var(--accent)" opacity="0.07"/><text x="${L + 6}" y="${f.y(-6) + 14}" font-size="11" fill="var(--accent)">quiet: more than 6 dB under the middle of the range</text>`;
  return f.svg(zone + (b ? line(mk(b), GREY, '5 4') : '') + line(mk(a), ACC));
}
function shareChart(a: Result, b: Result | null, shift: number) {
  const labels = MIDIS.map((m) => noteName(m + shift));
  const f = frame(labels, 0, 100, [0, 25, 50, 75, 100], '%');
  const mk = (r: Result) => r.share.map((s, i): [number, number] => [f.x(i), f.y(s * 100)]);
  const zone = `<rect x="${L}" y="${f.y(100)}" width="${W - L - R}" height="${f.y(85) - f.y(100)}" fill="var(--accent)" opacity="0.1"/><text x="${L + 6}" y="${f.y(100) + 13}" font-size="11" fill="var(--accent)">over 85%: one bare tone (a hum low down, a whistle up high)</text>`;
  return f.svg(zone + (b ? line(mk(b), GREY, '5 4') : '') + line(mk(a), ACC));
}
function cleanChart(a: Result, b: Result | null, shift: number) {
  const labels = MIDIS.map((m) => noteName(m + shift));
  const f = frame(labels, 0, 50, [0, 10, 20, 30, 40, 50], ' dB');
  const mk = (r: Result) => r.clean.map((s, i): [number, number] => [f.x(i), f.y(s)]);
  const zone = `<rect x="${L}" y="${f.y(15)}" width="${W - L - R}" height="${f.y(0) - f.y(15)}" fill="var(--accent)" opacity="0.07"/><text x="${L + 6}" y="${f.y(0) - 6}" font-size="11" fill="var(--accent)">under 15 dB: noisy, hissy or rough</text>`;
  return f.svg(zone + (b ? line(mk(b), GREY, '5 4') : '') + line(mk(a), ACC));
}
function harmonicsChart(a: number[], b: number[] | null) {
  const n = Math.max(a.length, b?.length ?? 0), labels = Array.from({ length: n }, (_, i) => String(i + 1));
  const f = frame(labels, -60, 0, [-60, -40, -20, 0], ' dB');
  const bar = (v: number, i: number, off: number, color: string) => `<rect x="${f.x(i) + off}" y="${f.y(v)}" width="${Math.max(3, (W - L - R) / n / 2.4)}" height="${f.y(-60) - f.y(v)}" fill="${color}"/>`;
  const w = Math.max(3, (W - L - R) / n / 2.4);
  let body = '';
  for (let i = 0; i < n; i++) {
    if (b && b[i] !== undefined) body += bar(b[i], i, -w, GREY);
    if (a[i] !== undefined) body += bar(a[i], i, b ? 0 : -w / 2, ACC);
  }
  return f.svg(body).replace('</svg>', `<text x="${W / 2}" y="${H - 1}" text-anchor="middle" font-size="11" fill="var(--muted)">harmonic number (1 = the note itself)</text></svg>`);
}

/* ---- sound */

let ctx: AudioContext | null = null, playing: AudioBufferSourceNode | null = null;
function stop() { try { playing?.stop(); } catch { /* (not started) */ } playing = null; }
function playPcm(pcm: Float32Array) {
  ctx ??= new AudioContext();
  stop();
  const buf = ctx.createBuffer(1, pcm.length, FOF_RATE);
  buf.copyToChannel(pcm as Float32Array<ArrayBuffer>, 0);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(ctx.destination);
  src.start();
  playing = src;
}

/* ---- the tab */

export function initScaleCheck(getVoice: () => Partial<FofVoice>, getName: () => string) {
  const st = { vowel: 'IY' as Vowel, vel: 0.7, pitch: 48, compare: true };
  let last: { a: Result; b: Result | null; shift: number } | null = null;
  const shiftOf = (v: Partial<FofVoice>) => v.shift ?? (v.high ? 12 : 0);

  function status(t: string) { $('scStatus').textContent = t; }
  function measureAll() {
    status('Measuring…');
    setTimeout(() => {
      const v = getVoice();
      const t0 = performance.now();
      const a = climb(v, st.vowel, st.vel), b = st.compare ? climb({ ...v, ...OFF }, st.vowel, st.vel) : null;
      last = { a, b, shift: shiftOf(v) };
      $('scLevel').innerHTML = levelChart(a, b, last.shift);
      $('scShare').innerHTML = shareChart(a, b, last.shift);
      $('scClean').innerHTML = cleanChart(a, b, last.shift);
      $('scVoice').textContent = `${getName()}${last.shift ? ` (sounds ${last.shift} semitones above the written notes)` : ''}`;
      status(`Measured in ${Math.round(performance.now() - t0)} ms`);
      oneNote();
    }, 30);
  }
  function oneNote() {
    const v = getVoice();
    const sh = shiftOf(v);
    const one = (vv: Partial<FofVoice>) => renderFof([{ t: 0, end: 1.2, midi: st.pitch, vel: st.vel, syl: syl(st.vowel) }], { seed: 17, ...vv } as FofVoice, 0);
    const a = one(v), b = st.compare ? one({ ...v, ...OFF }) : null;
    const f0 = mtof(st.pitch + sh);
    const ha = harmonics(a, f0, 0.45), hb = b ? harmonics(b, f0, 0.45) : null;
    $('scHarm').innerHTML = harmonicsChart(ha, hb);
    $('scNote').textContent = `${noteName(st.pitch)}${sh ? ` → sounds ${noteName(st.pitch + sh)}` : ''}  (${Math.round(f0)} Hz)`;
    const fund = (h: number[]) => { const p = h.map((x) => 10 ** (x / 10)); return Math.round((100 * p[0]) / p.reduce((x, y) => x + y, 0)); };
    $('scHarmNote').textContent = `The note itself holds ${fund(ha)}% of the sound${hb ? ` (without the fixes: ${fund(hb)}%)` : ''}.`;
    return { a, b };
  }

  $<HTMLSelectElement>('scVowel').onchange = (e) => { st.vowel = (e.target as HTMLSelectElement).value as Vowel; measureAll(); };
  $<HTMLSelectElement>('scHard').onchange = (e) => { st.vel = Number((e.target as HTMLSelectElement).value); measureAll(); };
  $<HTMLInputElement>('scCompare').onchange = (e) => { st.compare = (e.target as HTMLInputElement).checked; measureAll(); };
  $<HTMLInputElement>('scPitch').oninput = (e) => { st.pitch = Number((e.target as HTMLInputElement).value); oneNote(); };
  $('scMeasure').onclick = measureAll;
  $('scPlayClimb').onclick = () => { if (last) playPcm(last.a.pcm); else status('Measure first'); };
  $('scPlayClimbOff').onclick = () => { if (last?.b) playPcm(last.b.pcm); else status('Measure first (with "Compare" on)'); };
  const note = (off: boolean) => { const v = getVoice(); playPcm(renderFof([{ t: 0, end: 1.8, midi: st.pitch, vel: st.vel, syl: syl(st.vowel) }], { seed: 17, ...(off ? { ...v, ...OFF } : v) } as FofVoice, 0)); };
  $('scPlayNote').onclick = () => note(false);
  $('scPlayNoteOff').onclick = () => note(true);
  $('scStop').onclick = stop;
  return { measureAll };
}
