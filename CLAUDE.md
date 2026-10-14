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
- The demo singer (`docs/VOCAL.md`): a vocal melody with pseudo-English words, sung by a Klatt formant synth (`src/parts/vocal.ts`, `src/parts/lyrics.ts`, `src/audio/sing.ts`, `src/audio/singer.ts`). Done: first version, backing vocals (doubles, harmonies, oohs) and ad-libs; melodies by mood and genre (`src/parts/melody.ts`: motifs and forms, contours, lift, sighs and turns, twists), following the tension curve line by line; singers with their own phrasing (`src/parts/singers.ts`: lines of 1-4 bars, runs, wails, slides and falls); voices: a voice per genre made with Paul by ear, sung by the FOF singer (`src/audio/fof.ts`, IRCAM's CHANT method: registers blended by pitch, a way up past the break, a real voice's unevenness; `src/audio/voices.ts`; the FOF lab `npm run fof-lab`; the earlier voice-box voices in git tag `voices-v2-voicebox`), with expression (the tone moving with the section, line and note; less operatic) and three characters on top (Big & dark, Dark & nasal, Clean & scream: a distorted scream on pushed notes; the timbre lab `npm run timbre-lab`), or the clear first voice; human feel (`src/audio/feel.ts`) and speech-rhythm tunes, Western (English-language) styles only; a second singer on backing vocals; fitted to the band (`src/parts/fit.ts`: each chord's own notes, no bass clashes, held notes move with chord changes, syncopations with the groove, pushes with the band, Guitar 2 answering in the gaps, pace by tempo, the best of several tries kept); not locked to the tempo (double-time lines, quicker runs in slow songs); a second rhythm writer on the metronome grid (`docs/VOCAL-RHYTHM.md`: Rhythm Classic / Grid in the vocal row); a third, words first (`docs/VOCAL-WORDS.md`: Rhythm Words: each line's words written first as English word groups, then set to the grid: stresses on beats, quick light words on 16ths, soft line endings, triplets, density by genre with a random lean; pitch by speech: light syllables by step, the line's top on a stress, soft endings falling; question and answer pairs by mood (a line rising, the next falling home); best paired with Melody first (its leap on a stressed word); next: Paul listens vs Grid); a second melody writer (`docs/VOCAL-MELODY.md`: Melody Classic / Shaped: a chord-note path, a motif on it, by genre; with signature moves from real songs, `docs/VOCAL-MOVES.md`, `src/parts/moves.ts`, chosen per song or in the Moves menu); energy styles (`docs/VOCAL-ENERGY.md`, `src/parts/energy.ts`: Climber, Puncher, Driver, Brooder, Drifter, Switcher, after Paul's reference songs; each turns the section's energy into its own dials, gels with the band, now and then goes against it; Energy menu, Auto by genre and mood, Off as before); a third melody writer, Melody first (`docs/VOCAL-FIRST.md`, `src/parts/first.ts`: the tune's own spine and idea first, fitted to the chords last, planned clashes by mood, rock loops over the chords now and then, the sentence form, contrary motion to the bass, a musical score per try; done, next: Paul compares it with Shaped by ear); off by default; later: a recorded or AI voice
- Guide line (experiment, `docs/GUIDE.md`, `src/guide/`): one note line through the whole song in its key, shaped by the Mood (start note, resting notes, pace, lean up or down, colour notes), mostly small steps, big leaps only after a pause, following the tension curve, ending home; lean in or out of the chords; its own section of the page and its own code, kept apart from the vocals until it sounds right. Done: first version; next: Paul listens per mood
- Real amps (Neural Amp Modeler: Marshall JCM2000 for Crunch and Distortion, Fender Twin Reverb for Clean, a Tech 21 dUg bass preamp for the Driven bass): guitars (and a Driven bass) prepared up front with the Prepare real sound button, which also polishes the singer's lines (`src/audio/polish.ts`: clean-up, tube preamp, opto compressor) (`src/audio/prep.ts`, `src/audio/realamp.ts`, `public/amp/`) — done
- M6 UI design · M7 GitHub Pages deploy — done (deploys on push to main)

## Design
- No Figma for this project. Design straight in code: build a rough working version Paul can try on his phone, then iterate.
