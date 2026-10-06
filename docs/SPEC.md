# Music Idea Generator — v1 Spec

## Goal
A browser app that generates **8-bar musical ideas** (chords, strumming, drums, bass), plays them with **realistic sampled instruments**, lets you **lock what you like and reroll the rest**, and **exports MIDI** to take into a DAW. Hosted free on GitHub Pages. No server.

## Core loop
1. Pick a genre (or Random), weirdness level, and optionally a key and tempo. Anything not set stays on Auto.
2. Hit **Generate**.
3. The idea plays on a loop.
4. **Lock** the parts you like and **reroll** the others.
5. **Export MIDI** when it's worth keeping.

## Genres (v1)
| Genre | Tempo | Feel | Harmony | Drums | Chord rhythm |
|---|---|---|---|---|---|
| Rock | 100–150 | Straight 8ths | Power chords, I–IV–V, bVII, minor-key riffs | Backbeat, kick on 1 and 3, crash on bar starts | Driving 8th downstrokes, palm mutes |
| Pop | 90–128 | Straight or half-time | I–V–vi–IV family, sus and add9 chords | Four-on-the-floor or half-time | Syncopated strums, piano stabs |
| Funk | 95–115 | 16ths, light swing | Dom7/9, min7, one-chord vamps | Syncopated kick, ghost snares, busy hats | Muted 16th scratches, chord stabs |
| Random | Any | — | — | — | — |

**Random** either picks one genre at random or **mixes parts across genres** (e.g. funk drums + rock chords + pop bass). It sets weirdness to at least medium.

## Parts

### 1. Chords
- Key: any of the 12. Mode: major, minor, dorian, mixolydian; phrygian and lydian unlock at higher weirdness.
- Progression comes from genre templates plus a random walk.
- Weirdness adds borrowed chords, secondary dominants, chromatic moves, odd extensions and chord changes that don't fall on the bar line.
- Instruments: **piano, acoustic guitar, electric guitar** (clean / crunch / distortion).

### 2. Strumming / comping
- A pattern library per genre on a 16-step grid: down/up strokes, mutes, accents, rests.
- Weirdness mutates steps, displaces accents and adds odd groupings (e.g. 3-against-4).

### 3. Drums
- Sampled kit: kick, snare, hats, toms, crash, ride.
- Genre patterns, with fills on bars 4 and 8.
- Weirdness adds ghost notes, displaced snares and polyrhythmic hats.

### 4. Bass
- Follows chord roots. Patterns: roots, root–fifth, octaves, passing tones.
- Locks to the kick drum where it can.
- Weirdness adds chromatic approach notes, rhythmic displacement and occasional non-root notes.

## Weirdness slider (0–100)
- **0–30 Safe:** genre-typical, always musical.
- **30–70 Spicy:** a few surprises per idea.
- **70–100 Weird:** odd chords and rhythms, genre rules broken on purpose.

## Controls
- Genre, key, mode, tempo (each Auto or manual)
- Weirdness slider
- Per part: instrument, volume, mute/solo, **lock**, **reroll**
- Generate all, Play/Stop (loops)
- Export MIDI

## Fixed for v1
- 8 bars, 4/4, one section

## Non-goals (v1)
- Not a DAW: no note editing or piano roll
- No melody, no vocals
- No AI models, server or accounts
- No odd time signatures

## Tech (proposed)
- **Vite + TypeScript**, static site
- **Tone.js**: playback, timing, sampler
- **tonal**: music theory (scales, chords)
- **@tonejs/midi**: MIDI export
- **Samples**: free, CC-licensed packs (piano, acoustic and electric guitar, bass, drums). Check each license before use.
- **Hosting**: GitHub Pages
- Git from day 1 in the local folder

## Milestones
- **M0** Project setup + git
- **M1** Sound spike: random progression on piano + drum loop (proves sound and timing)
- **M2** Chords + strumming engine, all chord instruments
- **M3** Drums
- **M4** Bass
- **M5** Weirdness slider, lock/reroll, Random genre
- **M6** MIDI export
- **M7** UI design (Figma) + build
- **M8** Deploy to GitHub Pages

## v2 ideas
- Melody / hooks
- Song sections (intro, verse, chorus)
- Odd time signatures (e.g. 5/4, 7/8)
- WAV export
- Favorites, shareable links
- More genres

## Platforms
- Desktop and mobile browsers. Responsive layout, touch-friendly controls.
- Mobile notes: audio starts only after a tap; iPhone silent mode mutes web audio; keep sample sizes small for mobile data.

## Decisions log
- 2026-10-06: Electric guitar includes distortion. Mobile web supported.
- 2026-10-06 (M2): Drums use Big Rusty Drums (CC0) instead of the Tone.js demo kit, which has no clear license. It also adds crash, ride and open hi-hat.
- 2026-10-06 (M2): Pitched samples come from tonejs-instruments (CC-BY 3.0). The subset is re-encoded to mono MP3s, about 1.6 MB in total. Instruments load only when they're selected.
- 2026-10-06 (M2): Odd and mixed meters from the spike are kept, even though "Fixed for v1" says 4/4 only. Auto still picks 4/4 at low weirdness.
- 2026-10-06 (M2): Each part has its own seed (song, chords, drums, strum, bass) so M3 can reroll one part at a time. Bass follows the kick, so rerolling drums also changes the bass rhythm.
