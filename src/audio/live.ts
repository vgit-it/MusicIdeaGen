// The live audio context, made before anything builds audio nodes (main.ts imports this first).
// 'playback': the browser gives the audio thread bigger chunks to fill, so a phone has room to
// spare instead of crackling when a busy moment takes longer (a music player, nothing played live,
// so the extra few hundredths of a second of delay don't matter). The engine schedules notes this far
// ahead (engine.ts LOOKAHEAD), so a busy moment on the page doesn't make them late either.

import * as Tone from 'tone';

/** As the engine's (engine.ts LOOKAHEAD). */
const LIVE_LOOKAHEAD = 0.25;

Tone.setContext(new Tone.Context({ latencyHint: 'playback', lookAhead: LIVE_LOOKAHEAD }));
