# Tracks: scope (M3)

Turn an 8-bar idea into a full track with sections: intro, verses, choruses, bridge and outro.

**Status:** MVP built (2026-10-07). Since then: written chord plans for verse, pre-chorus and bridge; pre-choruses; an interlude where the hook returns; layered 8-bar intros; snare builds and band hits into choruses; a key change for the last chorus; riff genres' riff through the verses (with a new chorus); 16-bar long-build intros and long outros with a tag; chords you set per block (verse, pre-chorus, bridge; the chorus is the idea's) (see the decisions log in `SPEC.md`). Code: `src/track.ts` (builder), `src/audio/engine.ts` (plays a list of sections), `src/ui/render.ts` (section strip).

## Decisions
- **Start from a loop.** The 8-bar idea stays as it is. When you like one, **Make track** builds a song around it.
- **Auto structure first.** The MVP picks the structure from a genre template. Editing it comes in M4, together with lock/reroll.
- **Full song shape, short sections.** About 50–70 bars, so roughly 2–2.5 minutes depending on tempo.
- **Order.** M3 tracks MVP → M4 lock/reroll and track editing → M5 MIDI export (whole track) → M6 UI design → M7 deploy.

## How a track is built
A track reuses a few **blocks** of music, the way real songs do:

| Block | What it is | Where it comes from |
|---|---|---|
| **A: verse** | Chords or riff | Riff genres: the first (quieter) half of the idea. Strum genres: new chords in the same key. |
| **B: chorus** | Chords or riff | The idea you started from (riff genres: its louder second half). |
| **C: bridge** | Contrasting chords or riff | New: different starting chord (e.g. IV, bVI), often half-time. |

Each **section** plays one block at an **energy level (1–5)**. Same chords, different energy = different section.

Fixed for the whole track: genre (and the part genres under Random), key, mode, tempo, time signature and tuning.

## Section templates (MVP)
One is picked per genre, with some random variation. Each section is 4 or 8 bars.

| Genre | Structure |
|---|---|
| Rock | Intro 4 · Verse 8 · Chorus 8 · Verse 8 · Chorus 8 · Bridge 8 · Chorus 8 · Outro 4 |
| Pop | Intro 4 · Verse 8 · Chorus 8 · Verse 8 · Chorus 8 · Bridge 4 · Chorus 8 · Outro 4 |
| Funk | Intro 4 · Verse 8 · Chorus 8 · Verse 8 · Bridge 8 · Chorus 8 · Outro 4 |
| Grunge | Intro 4 · Verse 8 (quiet) · Chorus 8 (loud) · Verse 8 · Chorus 8 · Bridge 8 · Chorus 8 · Outro 4 |
| Alt metal | Intro 4 (riff) · Verse 8 (chugs) · Chorus 8 (big) · Verse 8 · Chorus 8 · Breakdown 8 · Chorus 8 · Outro 4 |

Typical energy: Intro 1–2 · Verse 2–3 · Chorus 4–5 · Bridge contrast (1–2 or 5) · last Chorus 5 · Outro 5 → ending.

## What energy does to each part
| Energy | Rhythm guitar | Drums | Bass | Guitar 2 |
|---|---|---|---|---|
| 1 | Held chords or clean arpeggios | None, or kick + hat only | Long roots, or none | Rest or swells |
| 2 | Palm mutes, light strums, clean | Closed hats, simple kick | Roots on the beat | Rest, arpeggios |
| 3 | Genre pattern, crunch | Full groove | Genre pattern | Harmony or arpeggios |
| 4 | Open strums / big chords | Open hat or ride, crash on bar 1 | Driving 8ths, octaves | Lead or octaves |
| 5 | Full strums / big chords, accents | Crashes, busier kick and cymbals | Driving, passing notes | Lead |

- **Auto instruments suit each section** (`src/sounds.ts`). Each block (verse, chorus, bridge…) gets one sound: quiet sections on acoustic, clean electric or piano, choruses on the genre's main sound, a bridge that contrasts with the verse, sometimes more gain for the last chorus. Guitar 2 follows (the hook keeps its instrument). The section tools' **Sound** picks a block's rhythm instrument by hand; picking an instrument in Parts fixes it for the whole track.
- **Riff genres** map energy to the existing riff styles: arpeggios at 1–2, single notes or chugs at 3, chugs or big chords at 4–5.

## Transitions and variation
- **Into a louder section:** a drum fill in the last bar, then a crash on the downbeat.
- **Before a chorus, sometimes:** a band stop (everyone silent for the last 1–2 beats, then the hit).
- **Intro:** one of
  - the guitar alone,
  - the riff alone with the band joining at the verse,
  - or the band at low energy.
- **Outro:** the chorus at full energy, ending on a held final chord with a crash.
- **Repeats change a little:**
  - Verse 2 adds Guitar 2 and a busier groove.
  - The last chorus gets a Guitar 2 lead and more crashes.

## Playback and UI (MVP: plain, Figma later)
- **Make track** button next to Generate, enabled when there's an idea.
- **Section strip:** one block per section, showing its name and bar count. The block's height or brightness shows its energy, and the block that's playing is highlighted.
- **Play** plays the whole track once (no loop). Clicking a section loops just that section.
- **Back to idea** returns to the 8-bar loop.
- **Note lanes** show the section that's playing.
- **Parts panel** (instrument, volume, mute and solo) applies to the whole track. On Auto, each section uses its own instruments (shown in the strip).
- **Tempo box** changes the whole track live.

## Not in the MVP
- **Comes in M4:** editing the structure (add, remove, reorder or resize sections) and rerolling a section or block.
- **Comes later as extras:**
  - Pre-chorus, solo section, key change, tempo or time-signature changes between sections, fades.
- **Comes in M5:** MIDI export of the track. WAV export is a v2 idea.
- **Comes with a melody part:** a melody or vocal line. Until then, Guitar 2 carries the hooks.

## Done when
- **Every genre works.** Make track gives a 2–2.5 minute structure for every genre, including Random.
- **Deterministic.** The same idea and seeds always give the same track.
- **Chorus is louder.** Choruses measure at least 3 dB louder than verses (checked with the meter, browser muted).
- **Clean section changes.** No gaps, clicks or timing slips; fills and crashes land on time.
- **Looping works.** Looping a single section works, and Back to idea restores the loop.
- **Checks pass.** Typecheck, build and the generator checks all pass.
- **Mobile works.**

## Implementation notes (for Claude)
- **Data model.**
  - `Track { opts, seeds, song, blocks: {A, B, C}, sections: Section[] }`, where `song` holds the settings fixed for the whole track.
  - `Section { kind, block, bars, energy, seed }`.
- **One section = one Idea-like part set.** Reuse the existing part generators, adding `energy` and `role` inputs, and render each section to note arrays.
- **Engine.** Plays a list of sections back to back on one Transport: step within the section, then advance to the next. It fires `onSection` and `onBar` callbacks. Looping one section = a list with one entry.
- **Seeds.**
  - Track seed: structure.
  - Block seeds: chords and riff.
  - Section seeds: drums, strum and Guitar 2 variation.
  - Everything stays pure and deterministic.
- **Phrase plans and cycles.** Keep phrase plans for 8-bar sections. Polyrhythmic cycles restart at each section.
