# Smooth playback on phones

Paul: "stuttering a lot now on normal play on phones". Two causes, measured in Chrome with the CPU slowed 4× (about a phone).

## 1. The singer was made during playback, on the page
- Each sung line is synthesised (a few hundred ms each; on a phone up to 2 s), and that ran on the page while the band played.
- The band's notes are scheduled from the page, so each line held them up: 85 of 231 beats late, the page frozen 22 s in 30 s.
- **Now:** lines are made in background workers (`src/audio/singWorker.ts`, `src/audio/singPool.ts`, two at most), starting as soon as the music is written, what plays first first.
  - Play waits for the first section's lines if any are still on their way ("Getting the singer ready…"); usually none are.
  - A line not ready in time comes in as soon as it is, from where it has got to (never made on the spot again).
  - The Guide card's singer uses the same workers.
- **After:** 0 late beats, 0 page freezes (same test).

## 2. The band's sound was heavy for a phone's audio engine
Measured offline: the share of one CPU core needed to play in real time (this server's CPU; a phone core is 2–4× slower, so anything near 50% here crackles there).
- About 1,200 audio nodes ran all the time, before a note played:
  - The drums' and bass's synth fallbacks (only used without samples, or with the Synth kit) were built and running anyway: about 800 nodes. Now built when first used.
  - Tone's `Filter` drives each EQ band from always-running signal sources (4 per band). The guitars already used plain biquad filters for this reason; drums, bass, strings, percussion, the singer's chain and the echo now do too.

| Genre | Before | After |
|---|---|---|
| Rock | 43% | 19% |
| Metal | 62% | 33% |
| Funk | 57% | 28% |
| Grunge | 47% | 25% |
| Pop | 48% | 19% |

## 3. More room on a phone
- The audio context asks for `latencyHint: 'playback'` (`src/audio/live.ts`): bigger chunks for the audio thread, so a busy moment doesn't crackle. Nothing is played live, so the small extra delay doesn't matter.
- Notes are scheduled a quarter second ahead (was a tenth): a busy moment on the page no longer makes them late.

## Fix: the guitars went silent (after the first version)
- Paul: "the rhythm guitar is not playing at all now". With the context's look-ahead at a quarter second from the start, the switch from the stand-in cabinet to the real one (made when the cabinet sounds load) was scheduled a quarter second ahead, and the browser sometimes dropped it: the amp's real-cabinet path stayed at zero (both guitars, about half the songs).
- Now that switch is made at once. Checked: 6 of 6 trials with sound (was 1-3 of 6), and 40 s tracks in four genres with the rhythm guitar in every second.

## Same sound
- Renders before and after with the randomness fixed: band and lead singer the same to -89 dB or lower (float noise; the same code rendered twice differs as much).
- With the backing singer on, takes differ only by chance: its voice synth draws random noise, which used to come from the page's random numbers (and so moved the drummer's timing jitter).

## How to measure again
Scripts used are simple Playwright pages against `npm run dev`: play a track with the CPU slowed (late beats, long tasks), and render 15 s offline in one context (time ÷ 15 s).
