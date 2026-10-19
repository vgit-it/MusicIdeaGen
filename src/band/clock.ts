// Where in the song we are, by the audio clock (docs/BAND-VIEW.md). The engine says when each 16th
// will sound (swing and the band's lilt included); the view asks "what step is sounding now" every
// frame and gets a fraction between those times. Never the frame timer: the picture follows the sound.

export class StepClock {
  private times: Float64Array;
  private first = -1;
  private last = -1;
  private cursor = 0;

  constructor(steps: number, private six: number) {
    this.times = new Float64Array(steps + 1).fill(NaN);
  }

  /** The engine scheduled song step `step` at audio time `time`. */
  record(step: number, time: number) {
    if (step < 0 || step >= this.times.length) return;
    this.times[step] = time;
    this.last = Math.max(this.last, step);
    if (this.first < 0 || step < this.first) this.first = step;
  }

  reset() {
    this.times.fill(NaN);
    this.first = this.last = -1;
    this.cursor = 0;
  }

  /** The song position (steps, fractional) sounding at audio time `t`; -1 before the start. */
  at(t: number): number {
    if (this.last < 0) return -1;
    const T = this.times;
    // (frames move forward: walk from the last answer, and back if the time went backwards)
    let k = Math.max(this.first, Math.min(this.cursor, this.last));
    while (k > this.first && (Number.isNaN(T[k]) || T[k] > t)) k--;
    while (k < this.last && !Number.isNaN(T[k + 1]) && T[k + 1] <= t) k++;
    this.cursor = k;
    if (Number.isNaN(T[k]) || T[k] > t) return -1;
    const next = T[k + 1];
    if (k < this.last && !Number.isNaN(next)) return k + (t - T[k]) / (next - T[k]);
    return k + (t - T[k]) / this.six;
  }
}
