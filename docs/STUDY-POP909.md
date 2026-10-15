# Study: melodies in POP909

Goal (Paul): study the melodies and rhythms of real songs, to later write similar ones by algorithm.

## Data
- **POP909**: 909 pop songs as MIDI (Wang et al., ISMIR 2020). MELODY track, BRIDGE track, PIANO track, plus beat and chord files.
- Mostly Mandarin pop, many ballads. **Not rock.** Mean 81 BPM.
- Fetch: `sh scripts/study/fetch-pop909.sh` (into `study-data/`, git-ignored; the songs are not in the repo).
- Analyse: `python3 -I scripts/study/pop909-stats.py study-data/pop909 out.json`. Needs `pip install mido`.
- Numbers only come out. `scripts/study/pop909-stats.json` is the result.
- The files' own time signatures are wrong (1/4, 2/4). Bars come from `beat_midi.txt`. 879 songs have 4-beat bars; 29 have 6. Only the 879 are counted.
- Why this one: other MIDI sites (BitMidi, MuseScore, FreeMidi, Lakh mirrors) are blocked from this session. Only raw GitHub files load.

## What the melodies do (879 songs, MELODY track)
- **Mode:** 61% major, 39% minor (by key-finding).
- **Notes (major, % of notes):** 1 22, 2 16, 3 15, 5 17, 6 13, 4 8, 7 4. Every chromatic note under 2%, b7 2%.
- **Notes (minor):** 1 22, b3 16, 4 16, 5 18, b7 13.5, 2 7, b6 4. Natural 6 and 7 almost never.
- **Steps between notes:** same note 23%, step (1-2 semitones) 44%, third (3-4) 21%, 4th/5th 7%, bigger than that 5%.
- **After a leap (5+ semitones):** 58% turn back (28% by step, 30% by a bigger move). Leaps are not always filled.
- **Repeated notes:** runs of 2 notes 65%, 3 notes 21%, 4+ 14%.
- **Note spacing (start to start):** 8th 47%, 16th 25%, quarter 11%, dotted 8th 5%, dotted quarter 3%, longer 9%.
- **Notes per bar:** mean 5.1. 5-7 notes is the bulk; 1-3 notes in 22% of bars.
- **Where notes start in the bar (16 slots):** beat 1 13%, other beats 10-11% each, 8th offbeats 8-10% each. The four in-between 16th slots take 2-4% each. The 16th just before a beat (slots 3, 7, 11, 15) is the commonest of those.
- **Bar rhythm repeats** one of the previous 4 bars in 29% of bars. The most common bars: one note on beat 1; straight 8ths; 8ths with a held last beat.
- **Phrases (rest of 1.5 beats or more splits them):** 1-2 bars 32%, 3-4 bars 22%, 8+ bars 35%. The rest is usually 1.5-3 beats; 18% are 2 bars or more.
- **Phrase start:** tonic 27%, 5th 23%. **Phrase end:** tonic 37%, 5th 20%, 2nd 10%.
- **Phrase shape:** rise, level and fall are about equal (33/34/32%). The top note lands about 40% of the way in.
- **Against the chord:** 70% of notes on beats are chord notes, 60% off-beat. 81% of phrases end on a chord note. On half-bars: root 26%, 3rd 25%, 5th 22%, 2nd 7%, b7 5%.
- **Range:** mean 18 semitones per song.

## Caveats
- Ballad-heavy and tempo ~80. Rhythm density will differ in faster, rock-style songs.
- Key and mode are guessed from the notes. Some songs change key.
- Some 16ths are the dataset's quantising of human timing.

## Next
- Compare with the app: run `npm run melody-lab` and set its numbers beside these (step share, repeats, phrase length, chord-note share).
- Get Western rock/pop MIDI. Needs a source this session can reach (e.g. Paul uploads a folder, or the network allowlist opens a MIDI host).
- Then turn the tables into weights for the melody writers (`src/parts/melody.ts`, `src/parts/first.ts`).
