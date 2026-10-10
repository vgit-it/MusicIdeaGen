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
- M6 UI design · M7 GitHub Pages deploy — done (deploys on push to main)

## Design
- No Figma for this project. Design straight in code: build a rough working version Paul can try on his phone, then iterate.
