// The bar grid of a section (experiment): where the bar lines and the beats really are.
// The verse writer used to read "a bar" as one number, so every bar was as long as the next and a beat was a quarter of it. A song
// can change meter (7/8 then 4/4), and a bar of 7/8 is felt as 2+2+3, not four quarters. The grid holds each bar's start, length and
// beat groups, so the rules that look at bar lines, strong places and beats read them from here. `bar` stays the nominal length
// (the mean) for the rules that only need a size: a beat's worth of silence, a hold of a bar and a half.
// A grid made from a plain number is the old picture: equal bars, four equal beats. The same line comes out of it as before.

export interface BarSpec {
  /** Step the bar starts on, from the start of the section. */
  start: number;
  /** 16ths in the bar. */
  len: number;
  /** Beat groups in 16ths (7/8 as 4+4+6). */
  groups: number[];
}

const EPS = 1e-6;

export class BarGrid {
  /** The nominal bar in 16ths: the mean of the bars. */
  readonly bar: number;
  private readonly bars?: BarSpec[];
  private readonly starts: number[] = [];

  constructor(bar: number, bars?: BarSpec[]) {
    this.bar = bar;
    if (bars?.length) {
      this.bars = bars;
      this.starts = bars.map((b) => b.start);
    }
  }

  /** The bars as they really are (not equal bars made from one number). */
  get real(): boolean { return !!this.bars; }
  /** Bars the grid lists (a uniform grid goes on for ever). */
  get count(): number { return this.bars?.length ?? Infinity; }

  spec(i: number): BarSpec {
    if (!this.bars) { const g = this.bar / 4; return { start: i * this.bar, len: this.bar, groups: [g, g, g, g] }; }
    if (i < this.bars.length) return this.bars[Math.max(0, i)];
    // (past the last bar: it goes on in the same meter)
    const last = this.bars[this.bars.length - 1];
    return { start: last.start + (i - this.bars.length + 1) * last.len, len: last.len, groups: last.groups };
  }
  start(i: number): number { return this.spec(i).start; }
  len(i: number): number { return this.spec(i).len; }
  end(i: number): number { const s = this.spec(i); return s.start + s.len; }

  /** The bar a step is in (0 for the first). */
  index(step: number): number {
    if (!this.bars) return Math.max(0, Math.floor(step / this.bar + 1e-9));
    const n = this.bars.length, last = this.bars[n - 1];
    if (step >= last.start + last.len - EPS) return n - 1 + Math.floor((step - last.start) / last.len + 1e-9);
    let lo = 0, hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.starts[mid] <= step + EPS) lo = mid; else hi = mid - 1;
    }
    return lo;
  }
  startAt(step: number): number { return this.start(this.index(step)); }
  lenAt(step: number): number { return this.len(this.index(step)); }

  /** Whether a step is a bar line. */
  isLine(step: number): boolean { return Math.abs(step - this.startAt(step)) < EPS; }

  /** The beats of bar `i`, as steps from its start. */
  beats(i: number): number[] {
    const out: number[] = [];
    let p = 0;
    for (const g of this.spec(i).groups) { out.push(p); p += g; }
    return out;
  }
  /** Whether a step is on a beat (a beat group's start). */
  isBeat(step: number): boolean {
    const off = step - this.startAt(step);
    return this.beats(this.index(step)).some((b) => Math.abs(b - off) < EPS);
  }
  /**
   * Beats (as whole steps, rounded) from `lo` to `hi`, both ends in. The bar's first beat is where its bar line is; the others are the
   * starts of its beat groups.
   */
  beatSteps(lo: number, hi: number): number[] {
    const out: number[] = [];
    for (let i = Math.max(0, this.index(lo) - 1); this.start(i) <= hi + EPS; i++) {
      const s = this.start(i);
      for (const b of this.beats(i)) if (s + b >= lo - 1e-9 && s + b <= hi) out.push(Math.round(s + b));
    }
    return out;
  }

  /**
   * Whether a step is in a strong place (the lean running through the rules: more notes on strong places, longer notes or silence on weak
   * ones). A strong place is the first quarter-bar of a beat group that is the 1st, 3rd, 5th... of its bar; in a bar of two groups (6/8,
   * 5/8) both. In 4/4 that is the 1st and 3rd beat.
   */
  isStrong(step: number): boolean {
    const i = this.index(step), s = this.spec(i), off = step - s.start;
    let p = 0;
    for (let k = 0; k < s.groups.length; k++) {
      const g = s.groups[k];
      if (off < p + g - 1e-9) return (k % 2 === 0 || s.groups.length === 2) && off - p < Math.min(g, s.len / 4) - 1e-9;
      p += g;
    }
    return false;
  }

  /** Which quarter of its bar a step is in (0-3). */
  quarterOf(step: number): number {
    const s = this.spec(this.index(step));
    return Math.min(3, Math.floor((step - s.start) / (s.len / 4) + 1e-9));
  }

  /**
   * How far a phrase of `k` bars reaches from `pos`: to the same beat of the bar `k` bars on (a bar of any length, so a phrase that
   * starts on the 3rd beat of a 7/8 bar ends on the 3rd beat of the 4/4 bar after it).
   */
  span(pos: number, k: number): number {
    if (!this.bars) return Math.round(this.bar * k);
    const i = this.index(pos), off = pos - this.start(i), j = i + k, here = this.beats(i), there = this.beats(j);
    const m = here.reduce((best, b, n) => (Math.abs(b - off) < Math.abs(here[best] - off) ? n : best), 0);
    return this.start(j) + there[Math.min(m, there.length - 1)] - pos;
  }

  /** The beat nearest to `target` that comes after `after` (a tie goes to the later one); `target` itself when no beat is known. */
  snapBeat(target: number, after: number): number {
    const beats = this.beatSteps(after + EPS, Math.max(target, after) + this.bar * 2).filter((b) => b > after + EPS);
    if (!beats.length) return Math.round(target);
    return beats.reduce((best, b) => (Math.abs(b - target) <= Math.abs(best - target) ? b : best), beats[0]);
  }

  /**
   * A length of `n` beats (a half beat allowed) counted back from `end` along the real beats: the position `n` beats before `end`, as a
   * length. In 4/4 that is `n` quarters; in a 7/8 bar of 4+4+6 two beats back from the bar's end is 10 steps.
   */
  backLen(end: number, n: number): number {
    const arr = this.beatSteps(Math.max(0, end - 8 * this.bar), end);
    if (arr[arr.length - 1] !== Math.round(end) || Math.abs(end - Math.round(end)) > EPS) arr.push(end);
    const o = arr.length - 1, whole = Math.floor(n + 1e-9), frac = n - whole;
    if (o - whole - (frac > 1e-9 ? 1 : 0) < 0) return Math.round((this.bar / 4) * n);
    const at = frac > 1e-9 ? Math.round((arr[o - whole] + arr[o - whole - 1]) / 2) : arr[o - whole];
    return end - at;
  }

  /** The beat of bar `i` nearest to a fraction of the bar (not its first), as steps from the bar's start; a tie goes to the later one. */
  beatNear(i: number, frac: number): number {
    const target = frac * this.len(i), bs = this.beats(i).filter((b) => b > EPS);
    if (!bs.length) return Math.round(target);
    if (!this.bars) return Math.round(target);
    return bs.reduce((best, b) => (Math.abs(b - target) <= Math.abs(best - target) ? b : best), bs[0]);
  }

  /** The bars from `from` to `to` (bar lines), as a grid of their own starting at 0. */
  slice(from: number, to: number): BarGrid {
    if (!this.bars) return new BarGrid(this.bar);
    const bars = this.bars.filter((b) => b.start >= from - EPS && b.start < to - EPS).map((b) => ({ ...b, start: b.start - from }));
    return bars.length ? new BarGrid(this.bar, bars) : new BarGrid(this.bar);
  }
}

/** A bar size or a grid. */
export type BarArg = number | BarGrid;
export const gridOf = (b: BarArg): BarGrid => (typeof b === 'number' ? new BarGrid(b) : b);
