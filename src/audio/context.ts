// Audio nodes belong to one audio context. The app has the live one and, while exporting, offline
// ones; Tone.js makes new nodes in whichever is current. Code that builds nodes later (after samples
// download, or when an instrument is first needed) builds them in its own context with this.

import * as Tone from 'tone';

export function inContext<T>(ctx: Tone.BaseContext, make: () => T): T {
  const prev = Tone.getContext();
  if (prev === ctx) return make();
  Tone.setContext(ctx);
  try {
    return make();
  } finally {
    Tone.setContext(prev);
  }
}
