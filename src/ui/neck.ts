// The solo on the neck: what the solo writer followed (energy, the height it aimed at, the pace) over the frets the hands
// played, on one time line, and a fretboard underneath where the notes sit (the whole solo's places faint; the bar playing
// strong, the note sounding lit). Read-only: it never touches playback. Drawn once per section; while playing only a
// playhead and the lit note change.

import * as Tone from 'tone';
import type { Idea } from '../idea';
import { hasNeck, neckView, type NeckNote, type NeckView } from './necknotes';

/** A colour per string, low to high. */
const STRING_COL = ['#ff7a45', '#ffcf5b', '#9bd65a', '#4ad6c8', '#5b8cff', '#c07bff'];
const STRING_NAME = ['low E', 'A', 'D', 'G', 'B', 'high E'];
const GUT = 52, CURVE_H = 76, BAR_H = 14, MIN_STEP_PX = 5.5;
const DOTS = new Set([3, 5, 7, 9, 15, 17, 19, 21]);

export function buildNeck(root: HTMLElement) {
  root.innerHTML = `<h2>Solo on the neck</h2>
    <div class="necklegend rolllegend"></div>
    <div class="neckwrap rollwrap">
      <canvas class="neckgut"></canvas>
      <div class="neckscroll rollscroll"><div class="neckinner rollinner">
        <canvas class="neckbase"></canvas><canvas class="necklit"></canvas><div class="neckph rollph"></div>
      </div></div>
    </div>
    <div class="neckboardwrap"><canvas class="neckboard"></canvas></div>
    <div class="neckstats hint"></div>`;
  const q = <T extends HTMLElement>(c: string) => root.querySelector<T>('.' + c)!;
  const legend = q('necklegend'), stats = q('neckstats'), boardWrap = q('neckboardwrap');
  const gut = q<HTMLCanvasElement>('neckgut'), scroll = q('neckscroll'), inner = q('neckinner');
  const base = q<HTMLCanvasElement>('neckbase'), lit = q<HTMLCanvasElement>('necklit'), ph = q('neckph');
  const board = q<HTMLCanvasElement>('neckboard');

  let cur: Idea | null = null;
  let view: NeckView | null = null;
  let lay: { stepPx: number; total: number; rects: { n: NeckNote; x: number; y: number; w: number; h: number }[] } | null = null;
  let rec: { idea: Idea; g: number; time: number; six: number } | null = null;
  let raf = 0, litIdx = -1, barIdx = -2;

  function sized(c: HTMLCanvasElement, w: number, h: number) {
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    c.style.width = w + 'px'; c.style.height = h + 'px';
    const x = c.getContext('2d')!;
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    return x;
  }

  function show(idea: Idea | null) {
    cur = idea; litIdx = -1; barIdx = -2;
    const ok = !!idea && hasNeck(idea);
    root.hidden = !ok;
    if (!idea || !ok) { view = null; lay = null; ph.style.display = 'none'; return; }
    const v = view = neckView(idea);
    const curve = idea.soloCurve!;
    const { song } = idea;
    const total = song.total;

    // the fret rows: a little room round the frets used, at least a dozen frets
    const lo = Math.max(0, Math.min(v.lo, 12) - 1);
    let hi = Math.min(24, v.hi + 1);
    if (hi - lo < 11) hi = Math.min(24, lo + 11);
    const rows = hi - lo + 1;
    const rowH = Math.max(8, Math.min(13, Math.floor(180 / rows)));
    const T = BAR_H + CURVE_H + 8;                                  // top of the fret panel
    const H = T + rows * rowH + 4;
    const W = Math.max(scroll.clientWidth || 600, Math.ceil(total * MIN_STEP_PX));
    const stepPx = W / total;
    const X = (s: number) => s * stepPx;
    const Yf = (f: number) => T + (hi - f) * rowH;                  // top of a fret's row
    const YCf = (f: number) => Yf(f) + rowH / 2;
    const cy = (val: number, min: number, max: number) => BAR_H + 4 + (CURVE_H - 8) * (1 - (val - min) / Math.max(1e-6, max - min));

    // the gutter
    const gx = sized(gut, GUT, H);
    gx.fillStyle = '#11141a'; gx.fillRect(0, 0, GUT, H);
    gx.font = '9px ui-monospace, Consolas, monospace'; gx.textBaseline = 'middle'; gx.textAlign = 'left';
    gx.fillStyle = '#8b93a7';
    gx.fillText('Energy', 4, BAR_H + 14); gx.fillText('strong', 4, BAR_H + 26);
    gx.fillText('calm', 4, BAR_H + CURVE_H - 16);
    gx.fillText('Fret', 4, T + 2);
    for (let f = lo + 1; f <= hi; f++) if (f % 2 === 0) { gx.textAlign = 'right'; gx.fillText(String(f), GUT - 4, YCf(f)); }

    // the picture
    inner.style.width = W + 'px'; inner.style.height = H + 'px';
    const x = sized(base, W, H);
    x.fillStyle = '#11141a'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#0d1016'; x.fillRect(0, 0, W, T - 4);
    // beats and bars
    x.font = '9px system-ui, sans-serif'; x.textAlign = 'left'; x.textBaseline = 'top';
    song.bars.forEach((b, i) => {
      for (let s = 4; s < b.len; s += 4) { x.fillStyle = 'rgba(255,255,255,.06)'; x.fillRect(X(b.start + s), BAR_H, 1, H - BAR_H); }
      x.fillStyle = 'rgba(255,255,255,.28)'; x.fillRect(X(b.start), 0, 1, H);
      x.fillStyle = '#8b93a7'; x.fillText(String(i + 1), X(b.start) + 3, 2);
    });
    // fret rows: the markers of a real neck lightly, the open string a line
    for (let f = lo; f <= hi; f++) {
      if (f === 12 || f === 24) { x.fillStyle = 'rgba(255,255,255,.08)'; x.fillRect(0, Yf(f), W, rowH); }
      else if (DOTS.has(f)) { x.fillStyle = 'rgba(255,255,255,.035)'; x.fillRect(0, Yf(f), W, rowH); }
    }

    // the curves: energy (a filled line from the middle), the height aimed at, the pace
    const mid = cy(0, -1, 1);
    x.strokeStyle = 'rgba(255,255,255,.15)'; x.setLineDash([3, 3]); x.beginPath(); x.moveTo(0, mid); x.lineTo(W, mid); x.stroke(); x.setLineDash([]);
    const line = (vals: number[], min: number, max: number) => {
      x.beginPath();
      for (let g = 0; g < total; g += 2) { const px = X(g + 1), py = cy(vals[g], min, max); g ? x.lineTo(px, py) : x.moveTo(px, py); }
    };
    x.beginPath(); x.moveTo(0, mid);
    for (let g = 0; g < total; g += 2) x.lineTo(X(g + 1), cy(curve.energy[g], -1, 1));
    x.lineTo(W, mid); x.closePath(); x.fillStyle = 'rgba(255,255,255,.13)'; x.fill();
    x.lineJoin = 'round'; x.lineWidth = 1.5;
    x.strokeStyle = '#e8eaf0'; line(curve.energy, -1, 1); x.stroke();
    if (curve.pitchC) {
      const mn = Math.min(...curve.centre), mx = Math.max(...curve.centre);
      x.strokeStyle = '#ffa94d'; line(curve.centre, mn, mx); x.stroke();
    }
    if (curve.paceC) {
      const mn = Math.min(...curve.pace), mx = Math.max(...curve.pace);
      x.strokeStyle = '#5b8cff'; x.setLineDash([4, 3]); line(curve.pace, mn, mx); x.stroke(); x.setLineDash([]);
    }

    // the hand: the frets each bar uses
    for (const b of v.bars) {
      if (!b.hi) continue;
      x.fillStyle = 'rgba(255,255,255,.07)'; x.fillRect(X(b.from) + 1, Yf(b.hi), X(b.to) - X(b.from) - 2, Yf(b.lo) + rowH - Yf(b.hi));
      x.fillStyle = 'rgba(255,255,255,.35)'; x.fillRect(X(b.from) + 1, YCf(b.mid) - 0.5, X(b.to) - X(b.from) - 2, 1);
    }

    // the notes
    const rects: NonNullable<typeof lay>['rects'] = [];
    x.font = '600 9px system-ui, sans-serif'; x.textAlign = 'left'; x.textBaseline = 'middle';
    const tops = v.notes.filter((n) => n.top);
    // (a line through the melody notes, the way the hand travels)
    x.strokeStyle = 'rgba(255,255,255,.28)'; x.lineWidth = 1; x.beginPath();
    tops.forEach((n, i) => { const px = X(n.step), py = YCf(n.fret); i ? x.lineTo(px, py) : x.moveTo(px, py); });
    x.stroke();
    v.notes.forEach((n) => {
      const r = { x: X(n.step), y: Yf(n.fret) + 1, w: Math.max(3, X(n.len) - 1.5), h: rowH - 2 };
      rects.push({ n, ...r });
      x.globalAlpha = n.top ? 1 : 0.6;
      x.fillStyle = STRING_COL[n.string] ?? '#8b93a7';
      x.beginPath(); x.roundRect(r.x, r.y, r.w, r.h, 3); x.fill();
      x.globalAlpha = 1;
      // the way it was played: a slide's run in, a bend's arrow, hammer-on or pull-off letters
      x.strokeStyle = '#fff'; x.lineWidth = 1.2;
      if (n.slide && n.top) {
        // (slid into from below: positive; the fret it came from is about a fret per two semitones, drawn simply as the semitones)
        const from = Math.max(lo, Math.min(hi, n.fret - n.slide));
        x.beginPath(); x.moveTo(Math.max(0, r.x - 7), YCf(from)); x.lineTo(r.x, YCf(n.fret)); x.stroke();
      }
      if ((n.bend || n.late) && n.top) {
        const bx = n.late ? r.x + r.w * 0.5 : r.x + 3, up = Math.min(rowH * 2.2, rowH * (n.bend ?? n.late ?? 1) * 0.9);
        x.beginPath(); x.moveTo(bx, r.y); x.lineTo(bx, r.y - up); x.moveTo(bx - 2.5, r.y - up + 3.5); x.lineTo(bx, r.y - up); x.lineTo(bx + 2.5, r.y - up + 3.5); x.stroke();
      }
      if (r.w >= 14) {
        const tag = n.trill ? 'tr' : n.tremolo ? 'tm' : n.move === 'hammer' ? 'h' : n.move === 'pull' ? 'p' : n.move === 'slide' ? 's' : '';
        x.fillStyle = '#10131a';
        x.fillText(tag ? `${n.fret} ${tag}` : String(n.fret), r.x + 3, r.y + r.h / 2 + 0.5);
      }
    });

    lay = { stepPx, total, rects };
    sized(lit, W, H);
    ph.style.display = 'none'; ph.style.height = H + 'px';

    legend.innerHTML = STRING_NAME.map((nm, s) => v.strings.includes(s) ? `<span><i style="background:${STRING_COL[s]}"></i>${nm}</span>` : '').join('') +
      `<span><i style="background:#e8eaf0"></i>Energy</span>` +
      (curve.pitchC ? `<span><i style="background:#ffa94d"></i>Height aimed at</span>` : '') +
      (curve.paceC ? `<span><i style="background:#5b8cff"></i>Pace</span>` : '') +
      '<span>↑ bend · h hammer-on · p pull-off · s slide · tr trill · tm tremolo</span>';
    const t = Object.entries(v.counts).map(([k, n]) => `${n} ${k}`);
    const coupling = [curve.pitchC ? `${curve.pitchC > 0 ? 'higher' : 'lower'} where it's strong` : 'height not following it',
      curve.paceC ? `${curve.paceC > 0 ? 'busier' : 'sparer'} where it's strong` : 'pace not following it'].join(', ');
    stats.textContent = [`${curve.shape} · ${coupling}`,
      `${v.notes.filter((n) => n.top).length} notes · frets ${v.lo}–${v.hi} · ${v.strings.length} strings · the hand moves ${v.shifts} time${v.shifts === 1 ? '' : 's'} between bars${t.length ? ' · ' + t.join(' · ') : ''}`].join('\n');
    scroll.scrollLeft = 0;
    drawBoard(-1, -1);
  }

  /* ---- the fretboard: where the notes sit */

  const BOARD_H = 132, BGUT = 36;
  /** Draws the neck. `bar`: the bar playing (its notes strong; -1: none, every note faint by how often it is used); `hot`: the sounding note. */
  function drawBoard(bar: number, hot: number) {
    if (!view || !cur) return;
    const frets = Math.max(12, Math.min(24, view.hi + 2));
    const W = Math.max(280, boardWrap.clientWidth || 600);
    const x = sized(board, W, BOARD_H);
    const strings = view.open.length, top = 14, bottom = BOARD_H - 18, left = BGUT, right = W - 8;
    const fw = (right - left) / (frets + 0.5);
    const SY = (s: number) => bottom - (s / (strings - 1)) * (bottom - top);
    x.fillStyle = '#11141a'; x.fillRect(0, 0, W, BOARD_H);
    x.fillStyle = '#1a1710'; x.fillRect(left, top - 4, right - left, bottom - top + 8);
    // fret wires, markers and numbers
    x.font = '9px ui-monospace, Consolas, monospace'; x.textAlign = 'center'; x.textBaseline = 'top';
    for (let f = 0; f <= frets; f++) {
      const wx = left + fw * 0.5 + f * fw;
      x.fillStyle = f === 0 ? '#c9c3b0' : 'rgba(255,255,255,.22)'; x.fillRect(wx - (f === 0 ? 1.5 : 0.5), top - 4, f === 0 ? 3 : 1, bottom - top + 8);
      if (f > 0) {
        const mx = wx - fw / 2;
        if (DOTS.has(f)) { x.fillStyle = 'rgba(255,255,255,.12)'; x.beginPath(); x.arc(mx, (top + bottom) / 2, 3.5, 0, 7); x.fill(); }
        if (f === 12 || f === 24) { x.fillStyle = 'rgba(255,255,255,.12)'; for (const k of [0.3, 0.7]) { x.beginPath(); x.arc(mx, top + (bottom - top) * k, 3.5, 0, 7); x.fill(); } }
        x.fillStyle = '#8b93a7'; x.fillText(String(f), mx, bottom + 6);
      }
    }
    // (the middle of a fret's space; the open string just left of the nut)
    const NX = (f: number) => (f === 0 ? left + fw * 0.15 : left + fw * 0.5 + (f - 0.5) * fw);
    // strings (thicker below)
    for (let s = 0; s < strings; s++) {
      x.strokeStyle = 'rgba(220,214,190,.55)'; x.lineWidth = 0.8 + (strings - 1 - s) * 0.22;
      x.beginPath(); x.moveTo(left, SY(s)); x.lineTo(right, SY(s)); x.stroke();
      x.fillStyle = STRING_COL[s] ?? '#8b93a7'; x.textAlign = 'right'; x.textBaseline = 'middle';
      x.fillText(STRING_NAME[s] ?? '', left - 4, SY(s));
    }
    // the places: how often each is used (faint), the playing bar's notes strong
    const uses = new Map<string, number>();
    for (const n of view.notes) uses.set(`${n.string}:${n.fret}`, (uses.get(`${n.string}:${n.fret}`) ?? 0) + 1);
    const maxUse = Math.max(...uses.values());
    for (const [k, c] of uses) {
      const [s, f] = k.split(':').map(Number);
      x.globalAlpha = bar < 0 ? 0.25 + 0.65 * (c / maxUse) : 0.14;
      x.fillStyle = STRING_COL[s] ?? '#8b93a7';
      x.beginPath(); x.arc(NX(f), SY(s), 5, 0, 7); x.fill();
    }
    x.globalAlpha = 1;
    if (bar >= 0) {
      const b = view.bars[bar];
      x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = '600 8px system-ui, sans-serif';
      for (const n of view.notes) {
        if (!b || n.step < b.from || n.step >= b.to) continue;
        x.fillStyle = STRING_COL[n.string] ?? '#8b93a7'; x.globalAlpha = n.top ? 1 : 0.65;
        x.beginPath(); x.arc(NX(n.fret), SY(n.string), 6, 0, 7); x.fill(); x.globalAlpha = 1;
      }
    }
    if (hot >= 0) {
      const n = view.notes[hot];
      x.fillStyle = 'rgba(255,255,255,.55)'; x.strokeStyle = '#fff'; x.lineWidth = 2;
      x.beginPath(); x.arc(NX(n.fret), SY(n.string), 8, 0, 7); x.fill(); x.stroke();
      x.fillStyle = '#10131a'; x.font = '700 9px system-ui, sans-serif'; x.fillText(String(n.fret), NX(n.fret), SY(n.string) + 0.5);
    }
  }

  /* ---- playback: a playhead, the bar and the note sounding */

  function frame() {
    raf = 0;
    if (!rec || !lay || !cur || !view || rec.idea !== cur) { ph.style.display = 'none'; if (litIdx >= 0 || barIdx >= 0) { litIdx = -1; barIdx = -2; lit.getContext('2d')!.clearRect(0, 0, lit.width, lit.height); drawBoard(-1, -1); } raf = rec ? requestAnimationFrame(frame) : 0; return; }
    const ctx = Tone.getContext().rawContext as AudioContext;
    const heard = ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0);
    const pos = Math.max(0, Math.min(lay.total, rec.g + (heard - rec.time) / rec.six));
    const px = pos * lay.stepPx;
    ph.style.display = 'block';
    ph.style.transform = `translateX(${px.toFixed(1)}px)`;
    const sl = scroll.scrollLeft, vw = scroll.clientWidth;
    if (px < sl + 8 || px > sl + vw - 40) scroll.scrollLeft = Math.max(0, px - 40);
    // (the sounding note: the last one begun that hasn't ended; the melody note first)
    let i = -1;
    for (let k = 0; k < lay.rects.length; k++) { const n = lay.rects[k].n; if (pos >= n.step && pos < n.step + n.len && (i < 0 || n.top)) i = k; }
    const b = view.bars.findIndex((br) => pos >= br.from && pos < br.to);
    if (i !== litIdx || b !== barIdx) {
      litIdx = i; barIdx = b;
      const lx = lit.getContext('2d')!;
      lx.clearRect(0, 0, lit.width, lit.height);
      if (i >= 0) {
        const r = lay.rects[i];
        lx.save(); lx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
        lx.fillStyle = 'rgba(255,255,255,.35)'; lx.strokeStyle = '#fff'; lx.lineWidth = 2;
        lx.beginPath(); lx.roundRect(r.x, r.y, r.w, r.h, 3); lx.fill(); lx.stroke();
        lx.restore();
      }
      drawBoard(b, i);
    }
    raf = requestAnimationFrame(frame);
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
      litIdx = -1; barIdx = -2;
      lit.getContext('2d')?.clearRect(0, 0, lit.width, lit.height);
      drawBoard(-1, -1);
    },
  };
}
