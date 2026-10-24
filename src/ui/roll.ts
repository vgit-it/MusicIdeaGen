// The melody view: the vocal as it's sung (idea.sung: bends, scoops and falls drawn as a curve) over the
// chord tones, so you can see what the line does against the chords and the key while you listen.
// Notes are coloured by what they are: a chord tone, in the key, or out of it; each carries its scale
// degree; leaps between notes are marked. A playhead follows the band; the note sounding lights up.
// Read-only: it never touches playback. The picture is drawn once per section; while playing only a
// playhead (a moving element) and the lit note change, so it costs the phone almost nothing.

import * as Tone from 'tone';
import type { Idea } from '../idea';
import { NOTE_NAMES, QUALITIES, SCALES, chordName } from '../theory';
import { voiceOf } from '../verse/sing';
import type { Rule } from '../verse/form';
import { leadOnly, leadView, type RollNote } from './leadnotes';
import { compareLeaf, endingOf, leafSpans, type Diff, type LeafCompare, type LeafSpan } from '../verse/variants';
import { changedTimes, shapeName } from '../verse/shapes';

type N = RollNote;

const COL = { chord: '#5ad69a', key: '#ffcf5b', out: '#ff5b6e' } as const;
type Role = keyof typeof COL;
const ROLE_LABEL: Record<Role, string> = { chord: 'Chord tone', key: 'In key', out: 'Out of key' };
/** Scale degrees, as a guitarist says them (flats against the major scale). */
const DEG = ['1', '♭2', '2', '♭3', '3', '4', '♭5', '5', '♭6', '6', '♭7', '7'];
/** Steps of at least this many semitones are marked as leaps. */
const LEAP = 5;
const TOP = 30, GUT = 52, MIN_STEP_PX = 5.5;

/** The layers that show how the line is built (the writer's form, phrasing, repeated shapes and the variants). */
const LAYERS = [
  { id: 'form', name: 'Form', hint: 'The leaves (A, A′, B…), which one answers which, and the rules each answer wrote again' },
  { id: 'phrases', name: 'Phrases', hint: 'Each phrase with its length and how it ends; the breaks shaded' },
  { id: 'shapes', name: 'Shapes', hint: "Rule 39 and 45: the small shape sung again inside a phrase, or a bar or two across call and response, the changed times (A′) in orange" },
  { id: 'compare', name: 'Compare', hint: 'An answering leaf against its source: ghosts of the source under it, the notes that differ outlined' },
] as const;
type LayerId = (typeof LAYERS)[number]['id'];
const FORM_H = 34, PHRASE_H = 20, SHAPE_H = 18;
/** A leaf's colour by its letter (A, B, C...). */
const LEAF_COL = ['#5b8cff', '#c07bff', '#4ad6c8', '#ffa94d', '#ff7aa8', '#9bd65a', '#e0d35b', '#8b93a7'];
const RULE_NAME: Record<Rule, string> = {
  phrases: 'phrasing', runs: '16th runs', tones: 'chord notes', holds: 'long notes', small: 'small breaks', neighbours: 'neighbours',
  walk: 'walks', endings: 'endings', thirds: 'third-bars', bends: 'bends',
};
/** The colours of the gaps (rest, tail, joint) in a solo's melody. */
const GAP_COL = { rest: '#9aa3b8', tail: '#4ad6c8', joint: '#ffa94d' } as const;
const FILL_WORD = { bend: 'bend', release: 'let down', passing: 'between', neighbour: 'neighbour' } as const;
const DIFF_COL: Record<Exclude<Diff, 'same'>, string> = { pitch: '#ff9d3c', rhythm: '#c07bff', new: '#4ad6ff' };
const DIFF_LABEL: Record<Exclude<Diff, 'same'>, string> = { pitch: 'Other pitch', rhythm: 'Other length', new: 'New note' };

/** A leaf's name as written (A') with a proper prime. */
const prime = (n: string) => n.replace(/'/g, '′');
const mod = (n: number, m: number) => ((n % m) + m) % m;
const noteName = (m: number) => `${NOTE_NAMES[mod(m, 12)]}${Math.floor(m / 12) - 1}`;

export function buildRoll(root: HTMLElement) {
  root.innerHTML = `<h2>Melody view<span class="rollwho"></span></h2>
    <div class="rolllayers"></div>
    <div class="rolllegend"></div>
    <div class="rollwrap">
      <canvas class="rollgut"></canvas>
      <div class="rollscroll"><div class="rollinner">
        <canvas class="rollbase"></canvas><canvas class="rolllit"></canvas><div class="rollph"></div>
      </div></div>
    </div>
    <div class="rollstats hint"></div>
    <label class="rollsync hint">Sync <input type="range" class="rollnudge" min="-200" max="400" step="10" value="0" aria-label="Nudge the needle later or earlier"> <span class="rollms">0 ms</span></label>
    <div class="rollempty hint" hidden>No vocal or lead guitar in this section.</div>`;
  const q = <T extends HTMLElement>(c: string) => root.querySelector<T>('.' + c)!;
  const legend = q('rolllegend'), layersEl = q('rolllayers'), wrap = q('rollwrap'), stats = q('rollstats'), empty = q('rollempty');
  const who = q('rollwho');
  const gut = q<HTMLCanvasElement>('rollgut'), scroll = q('rollscroll'), inner = q('rollinner');
  const base = q<HTMLCanvasElement>('rollbase'), lit = q<HTMLCanvasElement>('rolllit'), ph = q('rollph');

  const legendBase = (Object.keys(COL) as Role[]).map((r) => `<span><i style="background:${COL[r]}"></i>${ROLE_LABEL[r]}</span>`).join('') +
    `<span><i class="band"></i>Chord notes (every octave)</span><span><i class="curve"></i>Pitch curve</span>`;
  legend.innerHTML = legendBase;

  let cur: Idea | null = null;
  const on = new Set<LayerId>(['form', 'phrases']);
  try { const v = localStorage.getItem('rollLayers'); if (v !== null) { on.clear(); for (const id of v.split(',')) if (LAYERS.some((l) => l.id === id)) on.add(id as LayerId); } } catch { /* no storage */ }
  layersEl.innerHTML = LAYERS.map((l) => `<label title="${l.hint}"><input type="checkbox" data-layer="${l.id}"${on.has(l.id) ? ' checked' : ''}> ${l.name}</label>`).join('');
  layersEl.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement, id = t.dataset.layer as LayerId | undefined;
    if (!id) return;
    if (t.checked) on.add(id); else on.delete(id);
    try { localStorage.setItem('rollLayers', [...on].join(',')); } catch { /* no storage */ }
    if (cur) show(cur);
  });
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
    // (no sung notes but lead guitar ones: the lead guitar's line instead, nothing of the vocal writer's to show)
    const lv = idea && leadOnly(idea) ? leadView(idea) : null;
    const lines: N[][] = !idea ? [] : lv ? lv.lines : idea.sung ? idea.sung.map((l) => l.notes) : groupLines(idea);
    const extras: N[] = lv?.extras ?? [];
    const notes = lines.flat();
    who.textContent = lv ? ' · Lead guitar' : '';
    wrap.hidden = stats.hidden = !notes.length;
    legend.hidden = !notes.length;
    empty.hidden = !!notes.length;
    if (!idea || !notes.length) { lay = null; ph.style.display = 'none'; return; }

    const { song, chords } = idea;
    const total = song.total;
    // (how it was built: only where the writer's own record of it exists)
    const built = lv ? undefined : voiceOf(idea)?.built;
    layersEl.hidden = !built;
    const lay_ = (id: LayerId) => !!built && on.has(id);
    const showForm = lay_('form'), showPh = lay_('phrases'), showSh = lay_('shapes'), showCmp = lay_('compare') && built!.leaves.some((l) => l.source !== null);
    const yForm = 0, yPh = showForm ? FORM_H : 0, ySh = yPh + (showPh ? PHRASE_H : 0);
    const T0 = ySh + (showSh ? SHAPE_H : 0);
    const top = T0 + TOP;
    const spans: LeafSpan[] = built ? leafSpans(built.leaves, (b) => song.bars[b].start, song.bars.length, total) : [];
    const spanOf = (id: number | null) => spans.find((x) => x.leaf.id === id);
    const cmps = new Map<number, LeafCompare>();
    if (showCmp) for (const sp of spans) { const src = spanOf(sp.leaf.source); if (src) cmps.set(sp.leaf.id, compareLeaf(built!.notes, src, sp)); }
    const key = song.key;
    const scale = SCALES[song.mode] as readonly number[];
    const inKey = (m: number) => scale.includes(mod(m - key, 12));
    const chordAt = (step: number) => chords.timeline[chords.chordIdx[Math.max(0, Math.min(total - 1, Math.floor(step)))]].chord;
    const tonesOf = (c: { root: number; q: keyof typeof QUALITIES }) => new Set(QUALITIES[c.q].map((i) => mod(key + c.root + i, 12)));
    const roleOf = (n: N): Role => (tonesOf(chordAt(n.step)).has(mod(n.midi, 12)) ? 'chord' : inKey(n.midi) ? 'key' : 'out');

    // pitch range: the line (with its scoops) and a little room, at least a ninth
    const every = [...notes, ...extras];
    let lo = Math.min(...every.map((n) => n.midi - Math.max(n.slide ?? 0, n.late ?? 0))) - 2;
    let hi = Math.max(...every.map((n) => n.midi)) + 2;
    if (hi - lo < 14) { const m = Math.ceil((14 - (hi - lo)) / 2); lo -= m; hi += m; }
    const rows = hi - lo + 1;
    const rowH = Math.max(9, Math.min(18, Math.floor(260 / rows)));
    const H = TOP + T0 + rows * rowH + 4;
    const avail = scroll.clientWidth || 600;
    const W = Math.max(avail, Math.ceil(total * MIN_STEP_PX));
    const stepPx = W / total;
    const X = (s: number) => s * stepPx;
    const Y = (m: number) => top + (hi - m) * rowH;           // top of a pitch's row
    const YC = (m: number) => Y(m) + rowH / 2;                // its middle

    // the gutter: scale degree and note name per row
    const gx = sized(gut, GUT, H);
    gx.fillStyle = '#11141a'; gx.fillRect(0, 0, GUT, H);
    gx.font = `${rowH >= 12 ? 10 : 9}px ui-monospace, Consolas, monospace`;
    gx.textBaseline = 'middle';
    gx.fillStyle = '#8b93a7'; gx.textAlign = 'left';
    if (showForm) gx.fillText('Form', 4, yForm + 12);
    if (showPh) gx.fillText('Phrases', 4, yPh + PHRASE_H / 2);
    if (showSh) gx.fillText('Shapes', 4, ySh + SHAPE_H / 2);
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
      for (let s = 4; s < b.len; s += 4) { x.fillStyle = 'rgba(255,255,255,.06)'; x.fillRect(X(b.start + s), top, 1, H - top); }
      x.fillStyle = 'rgba(255,255,255,.28)'; x.fillRect(X(b.start), T0, 1, H - T0);
      x.fillStyle = '#8b93a7'; x.fillText(String(i + 1), X(b.start) + 3, T0 + 2);
    });
    // chord tones, every octave in range, held for as long as the chord lasts; the chord's name above
    const tl = chords.timeline;
    tl.forEach((e, i) => {
      const x0 = X(e.step), x1 = X(tl[i + 1]?.step ?? total);
      const tones = tonesOf(e.chord);
      x.fillStyle = 'rgba(91,140,255,.24)';
      for (let m = lo; m <= hi; m++) if (tones.has(mod(m, 12))) x.fillRect(x0 + 1, Y(m) + 1, x1 - x0 - 2, rowH - 2);
      x.fillStyle = '#e8eaf0'; x.font = '600 11px system-ui, sans-serif';
      x.fillText(chordName(key, e.chord), x0 + 3, T0 + 14);
    });


    // how it was built: washes under the notes, strips above
    const fit = (t: string, w: number) => { while (t.length > 1 && x.measureText(t).width > w) t = t.slice(0, -1); return t; };
    const letterCol = (name: string) => LEAF_COL[Math.max(0, 'ABCDEFGH'.indexOf(name[0]))] ?? LEAF_COL[7];
    if (built && (showForm || showPh || showSh)) {
      x.fillStyle = '#0d1016'; x.fillRect(0, 0, W, T0);
      x.textBaseline = 'middle'; x.textAlign = 'left';
    }
    if (showForm) {
      // (a wash of each leaf's colour down the roll, and a band for it above)
      for (const sp of spans) {
        const c = letterCol(sp.leaf.name), x0 = X(sp.from), x1 = X(sp.to);
        x.globalAlpha = 0.07; x.fillStyle = c; x.fillRect(x0, top, x1 - x0, H - top); x.globalAlpha = 1;
        x.fillStyle = c; x.globalAlpha = sp.leaf.source === null ? 0.9 : 0.55;
        x.beginPath(); x.roundRect(x0 + 1, yForm + 1, x1 - x0 - 2, 17, 4); x.fill(); x.globalAlpha = 1;
        x.fillStyle = '#10131a'; x.font = '700 11px system-ui, sans-serif';
        const tries = built!.tries[built!.leaves.indexOf(sp.leaf)] ?? 0;
        x.fillText(fit(`${prime(sp.leaf.name)}${sp.leaf.source !== null ? ' answers ' + prime(built!.leaves.find((l) => l.id === sp.leaf.source)?.name ?? '') : ''}${tries ? ` · try ${tries + 1}` : ''}`, x1 - x0 - 10), x0 + 5, yForm + 10);
        if (sp.leaf.source !== null) {
          const all = sp.leaf.varied.length;
          x.fillStyle = '#c3c9d8'; x.font = '9px system-ui, sans-serif';
          x.fillText(fit(all ? 'again: ' + sp.leaf.varied.map((r) => RULE_NAME[r]).join(', ') : 'nothing written again', x1 - x0 - 8), x0 + 4, yForm + 26);
        }
      }
      // (an arrow from each source to its answer)
      x.lineWidth = 1.2; x.setLineDash([]);
      for (const sp of spans) {
        const src = spanOf(sp.leaf.source);
        if (!src) continue;
        const ax = X(src.from) + 12, bx = X(sp.from) + 12;
        x.strokeStyle = letterCol(sp.leaf.name); x.globalAlpha = 0.9;
        x.beginPath(); x.moveTo(ax, yForm + 18); x.quadraticCurveTo((ax + bx) / 2, yForm + 36, bx - 2, yForm + 19); x.stroke();
        x.beginPath(); x.moveTo(bx - 2, yForm + 19); x.lineTo(bx - 7, yForm + 21); x.lineTo(bx - 5, yForm + 26); x.closePath(); x.fillStyle = letterCol(sp.leaf.name); x.fill();
        x.globalAlpha = 1;
      }
    }
    if (showPh) {
      for (const b of built!.breaks) { x.fillStyle = 'rgba(139,147,167,.12)'; x.fillRect(X(b.step), top, X(b.len), H - top); }
      const meanBar = total / song.bars.length;
      x.font = '600 10px system-ui, sans-serif';
      built!.phrases.forEach((ph, i) => {
        const x0 = X(ph.step), w = X(ph.len);
        x.fillStyle = 'rgba(139,147,167,.5)'; x.fillRect(x0, top, 1, H - top);
        x.strokeStyle = '#8b93a7'; x.lineWidth = 1;
        x.beginPath(); x.roundRect(x0 + 0.5, yPh + 1.5, w - 1, PHRASE_H - 3, 4); x.stroke();
        const e = endingOf(built!.notes, ph), bars = Math.round((ph.len / meanBar) * 2) / 2;
        x.fillStyle = '#e8eaf0';
        x.fillText(fit(`${ph.role ?? i + 1} · ${bars} bar${bars === 1 ? '' : 's'} · ${e.style}${e.role ? ' ' + e.role : ''}`, w - 8), x0 + 4, yPh + PHRASE_H / 2);
      });
    }
    if (showSh) {
      x.font = '600 9px system-ui, sans-serif';
      const has = new Set(built!.shapes.map((sh) => sh.phrase));
      // (a shape across phrases covers the phrases it runs over)
      for (const sh of built!.shapes) if (sh.bars) for (const ph of built!.phrases) if (ph.step >= sh.step - 1e-6 && ph.step < sh.step + sh.n * sh.len - 1e-6) has.add(ph.step);
      for (const ph of built!.phrases) if (!has.has(ph.step)) {
        x.fillStyle = '#4b5263'; x.fillText(fit('no shape', X(ph.len) - 6), X(ph.step) + 4, ySh + SHAPE_H / 2);
      }
      for (const sh of built!.shapes) {
        const changed = changedTimes(sh);
        for (let i = 0; i < sh.n; i++) {
          const last = i === sh.n - 1, alt = changed.includes(i), x0 = X(sh.step + i * sh.len), w = X(sh.len);
          const c = alt ? '#ff9d3c' : '#5b8cff';
          x.globalAlpha = 0.08; x.fillStyle = c; x.fillRect(x0, top, w, H - top); x.globalAlpha = 1;
          x.fillStyle = c; x.globalAlpha = alt ? 0.9 : 0.6;
          x.beginPath(); x.roundRect(x0 + 1, ySh + 1, w - 2, SHAPE_H - 3, 3); x.fill(); x.globalAlpha = 1;
          x.fillStyle = '#10131a';
          x.fillText(fit(alt ? (last ? `A′ ${sh.mod}` : 'A′') : 'A', w - 6), x0 + 4, ySh + SHAPE_H / 2);
        }
      }
    }
    // the source's notes under an answering leaf, and which of the answer's notes differ
    const diffOfStep: { step: number; end: number; d: Diff }[] = [];
    if (showCmp) {
      x.save(); x.setLineDash([3, 2]); x.lineWidth = 1;
      for (const sp of spans) {
        const c = cmps.get(sp.leaf.id), src = spanOf(sp.leaf.source);
        if (!c || !src) continue;
        for (const [n, d] of c.diffs) diffOfStep.push({ step: n.step, end: n.step + n.len, d });
        for (const n of built!.notes) {
          if (n.step < src.from - 1e-6 || n.step >= src.to - 1e-6 || n.step - src.from >= sp.to - sp.from) continue;
          const gone = c.dropped.some((g) => Math.abs(g.step - (n.step - src.from + sp.from)) < 1e-6 && g.midi === n.midi);
          x.strokeStyle = gone ? '#ff5b6e' : 'rgba(255,255,255,.4)';
          x.beginPath(); x.roundRect(X(n.step - src.from + sp.from) + 0.5, Y(n.midi) + 1.5, Math.max(3, X(n.len) - 2), rowH - 3, 3); x.stroke();
        }
      }
      x.restore();
    }

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
    for (const n of every) {
      const r = { x: X(n.step), y: Y(n.midi) + 1, w: Math.max(3, X(n.len) - 1.5), h: rowH - 2 };
      rects.push({ n, ...r });
      x.globalAlpha = extras.includes(n) ? 0.6 : 1;
      x.fillStyle = COL[roleOf(n)];
      x.beginPath(); x.roundRect(r.x, r.y, r.w, r.h, 3); x.fill();
      x.globalAlpha = 1;
      if (showCmp) {
        const f = diffOfStep.find((q) => n.step >= q.step - 1e-6 && n.step < q.end - 1e-6);
        if (f && f.d !== 'same') { x.strokeStyle = DIFF_COL[f.d]; x.lineWidth = 2; x.stroke(); }
      }
      if (r.w >= 15) { x.fillStyle = '#10131a'; x.fillText(DEG[mod(n.midi - key, 12)] + (n.mark && r.w >= 27 ? ' ' + n.mark : ''), r.x + 3, r.y + r.h / 2 + 0.5); }
    }
    // the gaps of a solo's melody (docs/SOLO-MELODY.md, step 0b): rests grey, tails teal, joints orange; the ones used in colour, with a label
    const gaps = lv ? idea!.soloCurve?.gaps ?? [] : [];
    if (gaps.length) {
      x.font = '700 9px system-ui, sans-serif'; x.textAlign = 'left'; x.textBaseline = 'bottom';
      for (const g of gaps) {
        const ms = [g.from?.midi, g.to?.midi].filter((m): m is number => m !== undefined);
        const yA = Y(Math.max(...ms)), yB = Y(Math.min(...ms)) + rowH;
        const gx0 = X(g.step), gw = Math.max(3, X(g.len) - 1), c = GAP_COL[g.kind];
        const [y0, h] = g.kind === 'rest' || g.kind === 'joint' ? [yA, Math.max(rowH, yB - yA)] : [Y(g.from!.midi), rowH];
        x.globalAlpha = g.picked ? 0.42 : 0.12; x.fillStyle = c; x.fillRect(gx0, y0, gw, h);
        x.globalAlpha = g.picked ? 1 : 0.45; x.strokeStyle = c; x.lineWidth = g.picked ? 2 : 1;
        x.setLineDash(g.picked ? [] : [3, 2]); x.strokeRect(gx0 + 0.5, y0 + 0.5, gw - 1, h - 1); x.setLineDash([]);
        if (g.picked) { x.fillStyle = c; x.fillText(`${g.kind[0].toUpperCase()}${g.len}${g.fill ? ' ' + FILL_WORD[g.fill.how] : ''}`, gx0 + 1, y0 - 1); }
        x.globalAlpha = 1;
      }
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
        } else if (n.late) {
          // (picked low, held, then pushed up to the note part of the way through)
          const mid = t0 + (t1 - t0) * 0.5, yLow = YC(n.midi - n.late);
          x.moveTo(t0, yLow); x.lineTo(mid, yLow); bezier(x, mid, yLow, Math.max(mid, Math.min(t1 - 1, mid + X(1.5))), yN);
        } else x.moveTo(t0, yN);
        let yEnd = yN;
        if (n.unbend) {
          // (a bend let down again part of the way through)
          const mid = t0 + (t1 - t0) * 0.5;
          yEnd = YC(n.midi - n.unbend);
          x.lineTo(mid, yN); bezier(x, mid, yN, Math.max(mid, Math.min(t1 - 1, mid + X(1.5))), yEnd);
        } else if (n.vib && t1 - t0 > 20) {
          for (let px = t0 + (t1 - t0) * 0.4; px < t1 - 1; px += 2) x.lineTo(px, yN + Math.sin((px - t0) / 2.2) * 2);
        }
        x.lineTo(t1 - 1, yEnd);
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
    const extra: string[] = [];
    if (showForm) {
      extra.push('Form: ' + spans.map((sp) => prime(sp.leaf.name)).join(' ') + spans.filter((sp) => sp.leaf.source !== null).map((sp) => {
        const src = spanOf(sp.leaf.source)!;
        return ` · ${prime(sp.leaf.name)} answers ${prime(src.leaf.name)}, writes again: ${sp.leaf.varied.length ? sp.leaf.varied.map((r) => RULE_NAME[r]).join(', ') : 'nothing'}`;
      }).join(''));
    }
    if (showPh) {
      const kinds = new Map<string, number>();
      for (const ph of built!.phrases) { const k = endingOf(built!.notes, ph).style; kinds.set(k, (kinds.get(k) ?? 0) + 1); }
      extra.push(`Phrases: ${built!.phrases.length} · ends: ${[...kinds].map(([k, n]) => `${n} ${k}`).join(', ')}`);
    }
    if (showSh) {
      const names = new Map<string, number>();
      for (const sh of built!.shapes) { const k = `${sh.bars ? `${sh.bars}-bar ` : ''}${shapeName(sh).replace(/'/g, '′')}`; names.set(k, (names.get(k) ?? 0) + 1); }
      extra.push(`Shapes: ${built!.shapes.length} (${[...names].map(([k, n]) => `${n} × ${k}`).join(', ') || 'none'}) in ${built!.phrases.length} phrases`);
    }
    if (showCmp) {
      for (const sp of spans) {
        const c = cmps.get(sp.leaf.id);
        if (c) extra.push(`${prime(sp.leaf.name)} against ${prime(spanOf(sp.leaf.source)!.leaf.name)}: ${c.count.same} same · ${c.count.pitch} other pitch · ${c.count.rhythm} other length · ${c.count.new} new · ${c.count.dropped} dropped`);
      }
    }
    if (lv) {
      const t = Object.entries(lv.counts).map(([k, n]) => `${n} ${k}`);
      extra.push(`Lead guitar: ${lines.length} run${lines.length === 1 ? '' : 's'}${extras.length ? ` · ${extras.length} double-stop notes` : ''}${t.length ? ' · ' + t.join(' · ') : ''}`);
    }
    if (gaps.length) {
      const n = (k: string) => gaps.filter((g) => g.kind === k).length, u = gaps.filter((g) => g.picked);
      extra.push(`Gaps: ${gaps.length} (${n('rest')} rests, ${n('tail')} tails, ${n('joint')} joints) · ${u.length} used (${gaps.filter((g) => g.fill).length} joined), ${gaps.length - u.length} bare · most steps of room ${Math.max(...gaps.map((g) => g.len))}`);
    }
    legend.innerHTML = legendBase + (gaps.length ? (['rest', 'tail', 'joint'] as const).map((k) => `<span><i class="out" style="border-color:${GAP_COL[k]}"></i>${k[0].toUpperCase() + k.slice(1)} gap</span>`).join('') + '<span>R, T, J + steps: used · dashed: bare</span>' : '') + (lv ? '<span>h hammer-on · p pull-off · s slide · tr trill · tm tremolo</span>' : '') + (showCmp
      ? (Object.keys(DIFF_COL) as (keyof typeof DIFF_COL)[]).map((d) => `<span><i class="out" style="border-color:${DIFF_COL[d]}"></i>${DIFF_LABEL[d]}</span>`).join('') +
        `<span><i class="out" style="border-color:rgba(255,255,255,.5);border-style:dashed"></i>Source note</span><span><i class="out" style="border-color:#ff5b6e;border-style:dashed"></i>Dropped</span>`
      : '');
    stats.textContent = [`${notes.length} notes · ${c.chord} chord tones (${pct}%) · ${c.key} in key · ${c.out} out of key · ` +
      `${stp} steps · ${rep} repeats · ${skip} thirds · ${leap} leaps${leap ? ` (biggest ${big > 0 ? '+' : ''}${big})` : ''} · ` +
      `${noteName(Math.min(...notes.map((n) => n.midi)))}–${noteName(Math.max(...notes.map((n) => n.midi)))}`, ...extra].join('\n');
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
