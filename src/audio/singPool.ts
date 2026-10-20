// Sung lines made in the background (singWorker.ts), in up to two workers, the most urgent first. Where
// workers can't run (an old browser, a script), the line is made here, on the spot, as before.

import { renderFof, type FofVoice } from './fof';
import { renderLine, type SungNote, type VoiceShape } from './sing';
import { type PolishOpts, polishVoice } from './polish';
import { addBreath } from '../guide/feel';

/** One line to sing: by the FOF singer (a genre's voice) or the formant synth (the clear voice), polished or not. */
export type RenderJob = { notes: SungNote[]; pre: number; rate: number; polish?: PolishOpts; /** A breath in before the line (human feel), added before the polish: its strength and noise seed. */ breath?: { amount: number; seed: number } }
  & ({ kind: 'fof'; fof: FofVoice } | { kind: 'line'; shape: VoiceShape });
export interface RenderDone { pcm: Float32Array; pol: Float32Array | null }

interface Waiting { id: number; job: RenderJob; urgent: number; resolve: (d: RenderDone) => void; reject: (e: unknown) => void }

/** Make a line here and now (no workers, or a worker failed). */
export function renderNow(job: RenderJob): RenderDone {
  const pcm = job.kind === 'fof' ? renderFof(job.notes, job.fof, job.pre) : renderLine(job.notes, job.shape, job.pre);
  if (job.breath) addBreath(pcm, job.rate, job.pre, job.breath.amount, job.breath.seed);
  return { pcm, pol: job.polish ? polishVoice(pcm, job.rate, job.polish) : null };
}

class Pool {
  private workers: { w: Worker; busy: Waiting | null }[] = [];
  private queue: Waiting[] = [];
  private nextId = 1;
  private broken = false;

  constructor() {
    if (typeof Worker === 'undefined') { this.broken = true; return; }
    // (two at most: the page and the audio need the rest of a phone)
    const n = Math.max(1, Math.min(2, (navigator.hardwareConcurrency || 2) - 1));
    try {
      for (let i = 0; i < n; i++) {
        const w = new Worker(new URL('./singWorker.ts', import.meta.url), { type: 'module' });
        const slot = { w, busy: null as Waiting | null };
        w.onmessage = (e: MessageEvent<{ id: number; done: RenderDone }>) => {
          const job = slot.busy;
          slot.busy = null;
          if (job && job.id === e.data.id) job.resolve(e.data.done);
          this.pump();
        };
        w.onerror = (e) => {
          // (a worker that fails: its line and the rest are made on the page instead)
          e.preventDefault();
          const job = slot.busy;
          slot.busy = null;
          this.broken = true;
          if (job) this.runHere(job);
          for (const q of this.queue.splice(0)) this.runHere(q);
        };
        this.workers.push(slot);
      }
    } catch {
      this.broken = true;
    }
  }

  private runHere(q: Waiting) {
    try { q.resolve(renderNow(q.job)); } catch (e) { q.reject(e); }
  }

  /** Make a line; `urgent`: lower is sooner (the line's place in the song: what plays first comes first). */
  render(job: RenderJob, urgent: number): Promise<RenderDone> {
    return new Promise((resolve, reject) => {
      const q: Waiting = { id: this.nextId++, job, urgent, resolve, reject };
      if (this.broken) {
        // (no workers: one at a time, a breather between, as before)
        setTimeout(() => this.runHere(q), 0);
        return;
      }
      this.queue.push(q);
      this.pump();
    });
  }

  /** Move the lines waiting for these keys to the front (playback is about to need them). */
  hurry(match: (job: RenderJob) => boolean) {
    for (const q of this.queue) if (match(q.job)) q.urgent = -1;
  }

  private pump() {
    for (const slot of this.workers) {
      if (slot.busy || !this.queue.length) continue;
      let bi = 0;
      this.queue.forEach((q, k) => { if (q.urgent < this.queue[bi].urgent) bi = k; });
      const q = this.queue.splice(bi, 1)[0];
      slot.busy = q;
      slot.w.postMessage({ id: q.id, job: q.job });
    }
  }
}

let pool: Pool | null = null;
/** The shared pool (made when first needed). */
export const singPool = () => (pool ??= new Pool());
