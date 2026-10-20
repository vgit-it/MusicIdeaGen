# Band video: render the band view as a video file

Scope and plan (2026-10-20). **Built (2026-10-20)**: see "What was built" at the end.

From the band view (`band.html`), a **Render video** button makes a video file of the band playing the
song, with the real-amp sound, in 360p or 720p. Everything is made in the browser (GitHub Pages, no
server). Later: other sizes, 60 fps, the walk-on, a share-friendly square or vertical crop.

## Decisions (Paul, 2026-10-20)

- Sizes: **360p** (640 x 360) and **720p** (1280 x 720), 16:9.
- The stage is wider than 16:9 (350 x 180), so it's **letterboxed**: the whole stage, full width, thin
  black bars above and below.
- **30 fps**.
- The video starts on the song's first beat: **no walk-on or count-in** (later). It ends on the band's
  final pose, held while the last chord rings (the audio's 5 s tail).
- **Lyrics burned in**, as on the page (the sung line, the syllable sounding now in bold), with a
  switch to leave them out.
- **MP4** (H.264 video, AAC audio); WebM where the browser can't make MP4 (see Codecs).

## How it works

Rendered offline, not recorded while playing: faster than real time, every frame exactly on the music,
and it doesn't matter if the tab is hidden. Recording the canvas while it plays was ruled out (real
time only, frames drift from the sound, poor quality); ffmpeg in the browser too (about 30 MB, and it
needs server headers GitHub Pages can't send).

1. **The sound.** The same path as the main app's audio export: the guitars (and a driven bass)
   prepared with the real amps (`engine.prepareFor`, reusing any already prepared), then the whole mix
   rendered and mastered (`renderAudio`, `src/export/audio.ts`). Singer included.
2. **When each 16th sounds.** The picture follows the sound through `StepClock` (`src/band/clock.ts`),
   which live playback feeds from the engine. Offline the engine doesn't report steps, so the times are
   worked out: the song is one tempo, the clock starts 0.05 s in (`LEAD`, as the audio render), and
   every in-between 16th comes late by the swing (`swing x 2/3 of a 16th`, Tone's own rule) plus the
   section's lilt (`lilt x a 16th`). A check compares this against the engine's real times.
3. **The frames.** For each frame (frame n at n / 30 s): the song step from the clock, then
   `stage.render` draws the 350 x 180 stage exactly as live. Before the first beat: the band waiting;
   after the last: the final pose held.
4. **Scaled up.** Sharp pixels need a whole-number scale, but the letterbox width isn't one (640 / 350 =
   1.83). So the stage is first blown up with hard pixel edges to the next whole size above the target
   (2x = 700 x 360 for 360p, 4x = 1400 x 720 for 720p), then smoothly shrunk to fit: 640 x 329 or
   1280 x 658, centred on black. Even pixels everywhere, edges very slightly soft.
5. **Lyrics** drawn onto the scaled frame (sharp text at the video's size, same look as the page).
6. **Encoded** with the browser's own video and audio encoders (WebCodecs) and packed into an MP4 with
   a small library (mediabunny, or mp4-muxer). Then downloaded, named after the song.

## Work list

1. **Step times offline** (`src/band/`): the swing and lilt formula above, plus a check (render a
   short song offline with the engine reporting its steps and compare; a few songs per genre, swung
   and lilted ones included).
2. **Frames that repeat exactly** (`src/band/stage.ts`):
   - pass the frame's own time as `wall` (grain, neon flicker and bulbs read `performance.now()` by
     default)
   - a full-quality switch for exports (on phones lite mode makes the lights only every other frame)
3. **The frame loop** (`src/band/video.ts`, new): draw, scale, letterbox, lyrics, hand to the encoder;
   wait when the encoder's queue is full; yield to the page between batches with a message, not a
   timer (browsers slow timers to once a second in hidden tabs); progress and Cancel.
4. **Audio into the file**: the rendered mix (already mastered, about -10.5 LUFS) cut into chunks for
   the audio encoder, at the render's sample rate (44.1 or 48 kHz), 192 kbps.
5. **Codecs**: ask the browser first (`isConfigSupported`), in order:
   1. MP4: H.264 + AAC (plays everywhere)
   2. MP4: H.264 + MP3 (lamejs, already in the app) where the browser has no AAC encoder
   3. WebM: VP9 + Opus (Firefox and Chromium on Linux often can't make H.264)
   4. none: the button explains the browser can't make video
6. **The page** (`band.html`, `src/band/main.ts`): a Render video button, a 360p / 720p choice, a
   Lyrics switch, status (Preparing real amps… / Rendering audio… / Drawing frames… 42%), Cancel.
   Playback stops first, as with the audio export.
7. **Check it** (`npm run video-check`): in headless Chromium (Playwright is installed) render a short
   song to WebM (headless Chromium has no H.264), then with `ffmpeg-static` (installed) check the
   length, the size, the frame count and that sound and picture start together, and save a few frames
   to look at. MP4 checked by hand in Chrome and Safari.
8. **Docs**: this file brought up to date, a line in `CLAUDE.md` and `docs/BAND-VIEW.md`.

## What to expect (estimates, to be measured)

- Time for a 3-minute song on a laptop: real amps and audio about as long as today's MP3 export (a
  minute or so), the frames another 30-60 s (5,400 frames at a few ms each), encoding alongside.
- File size: the moving pixel grain and dithered light change every frame, which video compression
  doesn't like. About 4 Mbps at 720p (about 90 MB for 3 minutes) and 1.5 Mbps at 360p (about 35 MB).
  If the grain makes it blocky or big, a "less grain" option for video.
- The page is busy while it renders (drawing runs on the page itself). Fine on desktop; moving it to a
  background worker is later.

## Risks

- **Sync**: the step times are worked out, not reported, so a change to how the engine times notes
  would put the picture off; the check (work item 1) catches it.
- **Phones**: memory (the whole file is held until download) and weaker encoders. 360p only on phones
  at first; 720p if it works there.
- **Browsers**: which codecs exist varies (Safari's audio encoder, Firefox's H.264); the codec order
  above covers it, worst case a WebM.
- **Big files**: an MP4 is written in memory then downloaded; a few hundred MB on desktop is fine.
  Writing straight to disk is later.

## Evaluation of the first scope

What changed after a closer look at the code:

- **Step times**: first planned as a dry run of the engine recording its steps. Not needed: the tempo
  is one per song and Tone's swing is a simple rule, so the times are worked out directly (faster, no
  extra render); the dry run becomes the check.
- **Scaling**: letterbox can't keep whole-number pixels at 360p / 720p, hence the blow-up then shrink
  (step 4) instead of plain 2x / 4x.
- **File size**: first guessed at 10-25 MB for 720p; the grain and dithering make it more like 90 MB
  for 3 minutes at a clean bitrate.
- **Audio codec**: a second MP4 option (MP3 audio) added, so browsers without an AAC encoder still give
  an MP4.
- **Hidden tabs**: the frame loop must not wait on timers (the same trap the audio export hit).
- Size of the job: about 1-2 days, unchanged.

## What was built (2026-10-20)

- `src/band/video.ts`: `stepTimes` (when each step sounds), `planVideo` (which file this browser can make),
  `renderVideo` (the whole thing), `measureStepTimes` (the check). Page: the Render video button, size
  (360p / 720p), Lyrics on video and Cancel in `band.html` / `src/band/main.ts`; works in `band.html?art`
  too (it draws whatever stage is on the page: the dressed band, Paul's art). Small hooks:
  `Stage.full` (full quality for a render), `Engine.reportOffline` (step times for the check),
  `LEAD` and `TAIL` exported from the audio export.
- Real sound: the button prepares the real amps and the polished singer first (`engine.prepareRealAmps`),
  so the video has them whatever was on before; Real sound stays on afterwards.
- Codecs, in order: MP4 with H.264 + AAC (the browser's own encoders); MP4 with H.264 + AAC from a small
  WebAssembly encoder (`@mediabunny/aac-encoder`, loaded only then) where the browser has no AAC; WebM
  with VP9 or VP8 + Opus where it has no H.264. **Changed from the plan**: AAC from an encoder extension,
  not MP3 in an MP4 (AAC plays everywhere an MP4 does).
- **AAC delay**: an AAC encoder starts one frame (1024 samples, 23 ms) before its first sound and these
  files don't say so, so players heard the sound that much late (found by the check). The audio is fed
  one frame early for AAC. Opus (WebM) needed nothing.
- The video starts 30 ms before the first beat (so a note played a hair early isn't cut) and runs to the
  end of the 5 s tail; the audio's last second fades.

### Checked (`npm run video-check`, headless Chromium, 360p; options `--genre`, `--size`, `--only steps|webm|mp4`)

- Step times against the engine's own, rock (lilt), funk (swing 0.18), hardrock (lilt): within 0.00 ms.
- A real render to WebM (VP9 + Opus) and to MP4 (VP9 video, AAC from the extension: headless Chromium has
  no H.264): size 640 x 360, 30 fps, length within 0.05 s of the song's, every frame there, and the
  kicks in the file landing where the rendered audio has them (+0 to +1 ms) and where the step times put
  them (about 35 ms later: a kick sample's own attack).
- Frames looked at: crisp pixels, the band lit as live, lyrics in the syllable-by-syllable style, with the
  dressed band (`?art`) too.
- Time: a 2.5-3 minute song at 360p took 110-170 s in headless Chromium (about 50 s preparing the real
  amps, 30-40 s of audio, the rest frames); file 27-38 MB.

### Not checked yet

- H.264 and the browser's own AAC (headless Chromium has neither): Paul tries an MP4 in Chrome, Safari
  and on a phone. If the sound is a little early or late in some player, `AAC_DELAY` is the knob.
- 720p on a phone.
