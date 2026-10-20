// The melody view: the vocal as it's sung (idea.sung: bends, scoops and falls drawn as a curve) over the
// chord tones, so you can see what the line does against the chords and the key while you listen.
// Notes are coloured by what they are: a chord tone, in the key, or out of it; each carries its scale
// degree; leaps between notes are marked. A playhead follows the band; the note sounding lights up.
// Read-only: it never touches playback. The picture is drawn once per section; while playing only a
// playhead (a moving element) and the lit note change, so it costs the phone almost nothing.

import * as Tone from 'tone';
import type { Idea } from '../idea';
import { NOTE_NAMES, QUALITIES, SCALES, chordName } from '../theory';

interface N { step: number; len: number; midi: number; bend?: number; slide?: number; fall?: number; slideLen?: number }

const COL = { chord: '#5ad69a', key: '#ffcf5b', out: '#ff5b6e' } as const;
type Role = keyof typeof COL;
const ROLE_LABEL: Record<Role, string> = { chord: 'Chord tone', key: 'In key', out: 'Out of key' };
/** Scale degrees, as a guitarist says them (flats against the major scale). */
const DEG = ['1', '♭2', '2', '♭3', '3', '4', '♭5', '5', '♭6', '6', '♭7', '7'];
/** Steps of at least this many semitones are marked as leaps. */
const LEAP = 5;
const TOP = 30, GUT = 52, MIN_STEP_PX = 5.5;

const mod = (n: number, m: number) => ((n % m) + m) % m;
const noteName = (m: number) => `${NOTE_NAMES[mod(m, 12)]}${Math.floor(m / 12) - 1}`;

export function buildRoll(root: HTMLElement) {
  root.innerHTML = `<h2>Melody view</h2>
    <div class="rolllegend"></div>
    <div class="rollwrap">
      <canvas class="rollgut"></canvas>
      <div class="rollscroll"><div class="rollinner">
        <canvas class="rollbase"></canvas><canvas class="rolllit"></canvas><div class="rollph"></div>
      </div></div>
    </div>
    <div class="rollstats hint"></div>
    <label class="rollsync hint">Sync <input type="range" class="rollnudge" min="-200" max="400" step="10" value="0" aria-label="Nudge the needle later or earlier"> <span class="rollms">0 ms</span></label>
    <div class="rollempty hint" hidden>No vocal in this section.</div>`;
  const q = <T extends HTMLElement>(c: string) => root.querySelector<T>('.' + c)!;
  const legend = q('rolllegend'), wrap = q('rollwrap'), stats = q('rollstats'), empty = q('rollempty');
  const gut = q<HTMLCanvasElement>('rollgut'), scroll = q('rollscroll'), inner = q('rollinner');
  const base = q<HTMLCanvasElement>('rollbase'), lit = q<HTMLCanvasElement>('rolllit'), ph = q('rollph');

  legend.innerHTML = (Object.keys(COL) as Role[]).map((r) => `<span><i style="background:${COL[r]}"></i>${ROLE_LABEL[r]}</span>`).join('') +
    `<span><i class="band"></i>Chord notes (every octave)</span><span><i class="curve"></i>Pitch curve</span>`;

  let cur: Idea | null = null;
  /** The picture's layout, for the lit note and the playhead. */
  let lay: { stepPx: number; rects: { n: N; x: number; y: number; w: number; h: number }[]; total: number; height: number } | null = null;
  let litIdx = -1;
  let rec: { idea: Idea; g: number; time: number; six: number } | null = null;
  let raf = 0;
  /** Nudge (ms) for phones that report their output delay wrongly, kept between visits. */
  let nudge = 0;
  try { nudge = +(localStorage.getItem('rollNudge') ?? 0) || 0; } catch { /* no storage */ }
  const nudgeEl = q<HTMLInputElement>('rollnudge'), msEl = q('rollms');
  nudgeEl.value = String(nudge); msEl.textContent = `${nudge} ms`;
  nudgeEl.oninput = () => {
    nudge = +nudgeEl.value; msEl.textContent = `${nudge} ms`;
    try { localStorage.setItem('rollNudge', String(nudge)); } catch { /* no storage */ }
  };

  function sized(c: HTMLCanvasElement, w: number, h: number) {
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    c.style.width = w + 'px'; c.style.height = h + 'px';
    const x = c.getContext('2d')!;
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    return x;
  }

  function show(idea: Idea | null) {
    cur = idea;
    litIdx = -1;
    const lines: N[][] = !idea ? [] : idea.sung ? idea.sung.map((l) => l.notes) : groupLines(idea);
    const notes = lines.flat();
    wrap.hidden = stats.hidden = !notes.length;
    legend.hidden = !notes.length;
    empty.hidden = !!notes.length;
    if (!idea || !notes.length) { lay = null; ph.style.display = 'none'; return; }

    const { song, chords } = idea;
    const total = song.total;
    const key = song.key;
    const scale = SCALES[song.mode] as readonly number[];
    const inKey = (m: number) => scale.includes(mod(m - key, 12));
    const chordAt = (step: number) => chords.timeline[chords.chordIdx[Math.max(0, Math.min(total - 1, Math.floor(step)))]].chord;
    const tonesOf = (c: { root: number; q: keyof typeof QUALITIES }) => new Set(QUALITIES[c.q].map((i) => mod(key + c.root + i, 12)));
    const roleOf = (n: N): Role => (tonesOf(chordAt(n.step)).has(mod(n.midi, 12)) ? 'chord' : inKey(n.midi) ? 'key' : 'out');

    // pitch range: the line (with its scoops) and a little room, at least a ninth
    let lo = Math.min(...notes.map((n) => n.midi - (n.slide ?? 0))) - 2;
    let hi = Math.max(...notes.map((n) => n.midi)) + 2;
    if (hi - lo < 14) { const m = Math.ceil((14 - (hi - lo)) / 2); lo -= m; hi += m; }
    const rows = hi - lo + 1;
    const rowH = Math.max(9, Math.min(18, Math.floor(260 / rows)));
    const H = TOP + rows * rowH + 4;
    const avail = scroll.clientWidth || 600;
    const W = Math.max(avail, Math.ceil(total * MIN_STEP_PX));
    const stepPx = W / total;
    const X = (s: number) => s * stepPx;
    const Y = (m: number) => TOP + (hi - m) * rowH;           // top of a pitch's row
    const YC = (m: number) => Y(m) + rowH / 2;                // its middle

    // the gutter: scale degree and note name per row
    const gx = sized(gut, GUT, H);
    gx.fillStyle = '#11141a'; gx.fillRect(0, 0, GUT, H);
    gx.font = `${rowH >= 12 ? 10 : 9}px ui-monospace, Consolas, monospace`;
    gx.textBaseline = 'middle';
    for (let m = lo; m <= hi; m++) {
      const k = inKey(m), tonic = mod(m - key, 12) === 0;
      gx.fillStyle = k ? (tonic ? '#ff7a45' : '#e8eaf0') : '#4b5263';
      if (k) { gx.textAlign = 'left'; gx.fillText(DEG[mod(m - key, 12)], 4, YC(m)); }
      gx.textAlign = 'right'; gx.fillText(noteName(m), GUT - 4, YC(m));
    }

    // the picture
    inner.style.width = W + 'px'; inner.style.height = H + 'px';
    const x = sized(base, W, H);
    x.fillStyle = '#11141a'; x.fillRect(0, 0, W, H);
    for (let m = lo; m <= hi; m++) {
      if (inKey(m)) { x.fillStyle = mod(m - key, 12) === 0 ? 'rgba(255,122,69,.13)' : 'rgba(255,255,255,.05)'; x.fillRect(0, Y(m), W, rowH); }
      if (mod(m, 12) === 0) { x.fillStyle = 'rgba(255,255,255,.12)'; x.fillRect(0, Y(m) + rowH - 1, W, 1); }
    }
    // beats and bars
    x.font = '9px system-ui, sans-serif'; x.textAlign = 'left'; x.textBaseline = 'top';
    song.bars.forEach((b, i) => {
      for (let s = 4; s < b.len; s += 4) { x.fillStyle = 'rgba(255,255,255,.06)'; x.fillRect(X(b.start + s), TOP, 1, H - TOP); }
      x.fillStyle = 'rgba(255,255,255,.28)'; x.fillRect(X(b.start), 0, 1, H);
      x.fillStyle = '#8b93a7'; x.fillText(String(i + 1), X(b.start) + 3, 2);
    });
    // chord tones, every octave in range, held for as long as the chord lasts; the chord's name above
    const tl = chords.timeline;
    tl.forEach((e, i) => {
      const x0 = X(e.step), x1 = X(tl[i + 1]?.step ?? total);
      const tones = tonesOf(e.chord);
      x.fillStyle = 'rgba(91,140,255,.24)';
      for (let m = lo; m <= hi; m++) if (tones.has(mod(m, 12))) x.fillRect(x0 + 1, Y(m) + 1, x1 - x0 - 2, rowH - 2);
      x.fillStyle = '#e8eaf0'; x.font = '600 11px system-ui, sans-serif';
      x.fillText(chordName(key, e.chord), x0 + 3, 14);
    });

    // leaps between neighbours in a line: a dashed link, and the size for the big ones
    const rects: NonNullable<typeof lay>['rects'] = [];
    x.font = '600 10px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'bottom';
    for (const L of lines) {
      for (let i = 1; i < L.length; i++) {
        const a = L[i - 1], b = L[i], d = b.midi - a.midi;
        if (Math.abs(d) < LEAP) continue;
        const ax = X(a.step + a.len), bx = X(b.step);
        x.strokeStyle = 'rgba(255,255,255,.35)'; x.setLineDash([3, 3]); x.lineWidth = 1;
        x.beginPath(); x.moveTo(ax, YC(a.midi)); x.lineTo(Math.max(ax, bx), YC(b.midi)); x.stroke(); x.setLineDash([]);
        x.fillStyle = Math.abs(d) >= 8 ? COL.out : '#e8eaf0';
        x.fillText((d > 0 ? '+' : '') + d, (ax + Math.max(ax, bx)) / 2, Math.min(YC(a.midi), YC(b.midi)) - 1);
      }
    }
    // the notes
    x.textAlign = 'left'; x.textBaseline = 'middle'; x.font = '600 10px system-ui, sans-serif';
    for (const n of notes) {
      const r = { x: X(n.step), y: Y(n.midi) + 1, w: Math.max(3, X(n.len) - 1.5), h: rowH - 2 };
      rects.push({ n, ...r });
      x.fillStyle = COL[roleOf(n)];
      x.beginPath(); x.roundRect(r.x, r.y, r.w, r.h, 3); x.fill();
      if (r.w >= 15) { x.fillStyle = '#10131a'; x.fillText(DEG[mod(n.midi - key, 12)], r.x + 3, r.y + r.h / 2 + 0.5); }
    }
    // the pitch curve: scoops up into a note, bends from the last note, falls off the end
    x.strokeStyle = 'rgba(255,255,255,.9)'; x.lineWidth = 1.5; x.lineJoin = 'round';
    for (const L of lines) {
      x.beginPath();
      L.forEach((n, i) => {
        const p = L[i - 1], t0 = X(n.step), t1 = X(n.step + n.len), yN = YC(n.midi);
        if (n.bend && p) {
          // glides there from the note before, over so many steps
          x.moveTo(X(p.step + p.len) - 0.5, YC(p.midi)); x.lineTo(t0, YC(p.midi));
          bezier(x, t0, YC(p.midi), Math.min(t1, t0 + X(n.bend)), yN);
        } else if (n.slide) {
          const e = Math.min(t1, t0 + (n.slideLen ? X(n.slideLen) : (t1 - t0) * 0.4));
          x.moveTo(t0, YC(n.midi - n.slide)); bezier(x, t0, YC(n.midi - n.slide), e, yN);
        } else x.moveTo(t0, yN);
        x.lineTo(t1 - 1, yN);
        if (n.fall) {
          // (falls off the end: over about the last 2 steps, or the last third of a short note)
          const f = Math.min(X(2), (t1 - t0) / 3);
          x.moveTo(t1 - 1, yN); bezier(x, t1 - 1, yN, t1 - 1 + f, YC(n.midi - n.fall));
        }
      });
      x.stroke();
    }

    lay = { stepPx, rects, total, height: H };
    sized(lit, W, H);
    ph.style.display = 'none';
    ph.style.height = H + 'px';

    // what the line is doing, in numbers
    const c = { chord: 0, key: 0, out: 0 };
    for (const n of notes) c[roleOf(n)]++;
    let rep = 0, stp = 0, skip = 0, leap = 0, big = 0;
    for (let i = 1; i < notes.length; i++) {
      const d = notes[i].midi - notes[i - 1].midi, a = Math.abs(d);
      if (!a) rep++; else if (a <= 2) stp++; else if (a < LEAP) skip++; else { leap++; if (a > Math.abs(big)) big = d; }
    }
    const pct = Math.round((100 * c.chord) / notes.length);
    stats.textContent = `${notes.length} notes · ${c.chord} chord tones (${pct}%) · ${c.key} in key · ${c.out} out of key · ` +
      `${stp} steps · ${rep} repeats · ${skip} thirds · ${leap} leaps${leap ? ` (biggest ${big > 0 ? '+' : ''}${big})` : ''} · ` +
      `${noteName(Math.min(...notes.map((n) => n.midi)))}–${noteName(Math.max(...notes.map((n) => n.midi)))}`;
    scroll.scrollLeft = 0;
  }

  /** An S-shaped glide between two points. */
  function bezier(x: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) {
    const mx = (x0 + x1) / 2;
    x.bezierCurveTo(mx, y0, mx, y1, x1, y1);
  }

  /** The older ideas that have no `sung`: the vocal's notes, in lines. */
  function groupLines(idea: Idea): N[][] {
    const out: N[][] = [];
    for (const n of idea.vocal ?? []) { if (n.start || !out.length) out.push([]); out[out.length - 1].push(n); }
    return out;
  }

  /* ---- playback: a playhead and the note sounding */

  function frame() {
    raf = 0;
    if (!rec || !lay || !cur || rec.idea !== cur) { ph.style.display = 'none'; clearLit(); raf = rec ? requestAnimationFrame(frame) : 0; return; }
    const ctx = Tone.getContext().rawContext as AudioContext;
    // (what's coming out of the speakers now: the context's clock less the output delay; phones often
    // report no outputLatency, so the base latency stands in, as in the band view)
    const heard = ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0) - nudge / 1000;
    const pos = Math.max(0, Math.min(lay.total, rec.g + (heard - rec.time) / rec.six));
    const px = pos * lay.stepPx;
    ph.style.display = 'block';
    ph.style.transform = `translateX(${px.toFixed(1)}px)`;
    // keep it in view
    const sl = scroll.scrollLeft, vw = scroll.clientWidth;
    if (px < sl + 8 || px > sl + vw - 40) scroll.scrollLeft = Math.max(0, px - 40);
    const i = lay.rects.findIndex((r) => pos >= r.n.step && pos < r.n.step + r.n.len);
    if (i !== litIdx) {
      litIdx = i;
      const lx = lit.getContext('2d')!;
      lx.clearRect(0, 0, lit.width, lit.height);
      if (i >= 0) {
        const r = lay.rects[i];
        lx.save(); lx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
        lx.fillStyle = 'rgba(255,255,255,.35)'; lx.strokeStyle = '#fff'; lx.lineWidth = 2;
        lx.beginPath(); lx.roundRect(r.x, r.y, r.w, r.h, 3); lx.fill(); lx.stroke();
        lx.restore();
      }
    }
    raf = requestAnimationFrame(frame);
  }
  function clearLit() {
    if (litIdx < 0) return;
    litIdx = -1;
    lit.getContext('2d')!.clearRect(0, 0, lit.width, lit.height);
  }

  addEventListener('resize', () => { if (cur) show(cur); });

  return {
    show,
    /** The engine played a step (idea, step, audio time, seconds per step). */
    step(idea: Idea, g: number, time: number, six: number) {
      rec = { idea, g, time, six };
      if (!raf) raf = requestAnimationFrame(frame);
    },
    stopped() {
      rec = null;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      ph.style.display = 'none';
      clearLit();
    },
  };
}
