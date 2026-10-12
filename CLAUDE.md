# Music Idea Generator

Browser app that generates 8-bar musical ideas (chords, strumming, drums, bass), plays them with sampled instruments, lets you lock/reroll parts and export MIDI. Will be hosted on GitHub Pages (static, no server). Desktop + mobile web.

## Read first
- `docs/SPEC.md`: v1 spec, milestones, decisions log
- `spike/index.html`: working single-file prototype (M1/M1.1). **Source of truth for the music logic**: genres, meters, phrase plans, fills, polyrhythmic cycles, chord timeline, bass logic.

## Owner
Paul is a senior designer, not a full-time dev. Keep explanations short and non-technical unless he asks. Bullet points, concise.

## Stack (agreed)
- Vite + TypeScript, static build
- Tone.js (playback, Sampler, Transport), tonal (theory helpers, optional), @tonejs/midi (export, M4)
- Samples self-hosted in `public/samples/` (no hotlinking). Candidate: tonejs-instruments pack (CC-BY 3.0; add credits in the app + README). Check licenses.
- GitHub Pages deploy later (Vite `base` set to repo name).

## Current milestone: M2 — real project + guitars
1. Scaffold Vite + TS in the repo root. Keep `spike/` as reference.
2. Port spike logic into modules, e.g. `src/theory`, `src/rhythm` (meters, phrases, fills, cycles), `src/parts/{chords,strum,drums,bass}`, `src/audio` (instruments, mixer), `src/ui`.
3. Generator stays pure and deterministic given a seed (add a seeded RNG so ideas can be shared/rerolled later).
4. Instruments: piano, acoustic guitar, electric guitar (Clean / Crunch / Distortion via Tone effects), sampled bass, acoustic drum kit + toms. Keep synth fallbacks.
5. Guitar voicings (guitar-shaped chords, not piano voicings), realistic strum spread, palm mutes.
6. Per-part controls: instrument, volume, mute/solo.
7. Mobile: audio starts on tap; keep sample sizes small.
8. `git init`, `.gitignore`, first commit; then help Paul create a private GitHub repo.

## Later milestones
- M3 tracks MVP: sections built from an idea (scope: `docs/TRACKS.md`) — done
- M4 lock/reroll per part + track editing + shareable links — done
- M5 MIDI export (idea + track) — done
- Set your own chords (idea, all genres, per section in tracks) — done; next: finer timing (any beat)
- The band plays it: players perform the written track their way (`src/players/`). Done: drummer, bassist, guitarists, shared groove and human MIDI
- The hands: how each player physically plays their notes (string, fret, picked / hammer-on / pull-off / slide, bends, fall-offs), by persona (`src/players/hands.ts`). Done: bass, Guitar 2, riffs, chord changes (squeaks, open strings); later: a tab view
- Lead guitar and solos (`docs/LEAD.md`): Guitar 2 as the lead player, by character (`src/players/lead.ts`). Done: verse fills answering the singer, pre-chorus climbs, solo sections, each player's own licks and techniques (bends let down, unison bends, double-stops, trills, tremolo, rakes; `src/parts/licks.ts`); later: pinch harmonics, whammy, a tab view
- Rhythm guitar by research (`docs/RHYTHM.md`): the rhythm guitarist by character (`src/players/rhythm.ts`): accents, chord colours, picked quiet parts, licks between chords, strumming that develops bar to bar, capo, up the neck, drones, echo on arpeggios, timing drift; riff genres played by a riff player (accents, a riff that breathes). Done
- Mood and tension (`docs/TENSION.md`, `src/tension.ts`): a Mood choice shapes one tension curve over the whole song (section energies, levels and builds follow it; a tension line in the UI). Done: phase 1 and 2 (mood chords, build-ups, solo and lead follow the curve); next: phase 3 (drag the curve, a mood per section, a tension meter)
- The demo singer (`docs/VOCAL.md`): a vocal melody with pseudo-English words, sung by a Klatt formant synth (`src/parts/vocal.ts`, `src/parts/lyrics.ts`, `src/audio/sing.ts`, `src/audio/singer.ts`). Done: first version, backing vocals (doubles, harmonies, oohs) and ad-libs; melodies by mood and genre (`src/parts/melody.ts`: motifs and forms, contours, lift, sighs and turns, twists), following the tension curve line by line; singers with their own phrasing (`src/parts/singers.ts`: lines of 1-4 bars, runs, wails, slides and falls); voices: a voice per genre made with Paul by ear, sung by the FOF singer (`src/audio/fof.ts`, IRCAM's CHANT method: registers blended by pitch, a way up past the break, a real voice's unevenness; `src/audio/voices.ts`; the FOF lab `npm run fof-lab`; the earlier voice-box voices in git tag `voices-v2-voicebox`), or the clear first voice; human feel (`src/audio/feel.ts`) and speech-rhythm tunes, Western (English-language) styles only; a second singer on backing vocals; fitted to the band (`src/parts/fit.ts`: each chord's own notes, no bass clashes, held notes move with chord changes, syncopations with the groove, pushes with the band, Guitar 2 answering in the gaps, pace by tempo, the best of several tries kept); off by default; later: a recorded or AI voice
- Real amps (Neural Amp Modeler: Marshall JCM2000 for Crunch and Distortion, Fender Twin Reverb for Clean, a Tech 21 dUg bass preamp for the Driven bass): guitars (and a Driven bass) prepared up front with the Prepare real amps button (`src/audio/prep.ts`, `src/audio/realamp.ts`, `public/amp/`) — done
- M6 UI design · M7 GitHub Pages deploy — done (deploys on push to main)

## Design
- No Figma for this project. Design straight in code: build a rough working version Paul can try on his phone, then iterate.
