// The singer's voice, synthesised off the page (a Web Worker): a sung line takes a moment to make (on a
// phone up to a second or two), and made on the page it held everything up, the band's timing too (Paul:
// "stuttering a lot on phones"). The same code as before (fof.ts, sing.ts, polish.ts), run here instead.

import { renderFof } from './fof';
import { renderLine } from './sing';
import { polishVoice } from './polish';
import { addBreath } from '../guide/feel';
import type { RenderJob, RenderDone } from './singPool';

self.onmessage = (e: MessageEvent<{ id: number; job: RenderJob }>) => {
  const { id, job } = e.data;
  const pcm = job.kind === 'fof' ? renderFof(job.notes, job.fof, job.pre) : renderLine(job.notes, job.shape, job.pre);
  if (job.breath) addBreath(pcm, job.rate, job.pre, job.breath.amount, job.breath.seed);
  const pol = job.polish ? polishVoice(pcm, job.rate, job.polish) : null;
  const done: RenderDone = { pcm, pol };
  (self as unknown as Worker).postMessage({ id, done }, pol ? [pcm.buffer, pol.buffer] : [pcm.buffer]);
};
