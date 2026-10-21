# Lead breaks and twin leads (switches)

From `docs/STUDY-LEAD.md`, items 5 and 6. Two switches in the Guitar 2 row, both off by default; off: exactly as before (checked note for note over 126 songs, 4/4, 6/8, 3/4, with and without the other switches). Tracks only. Kept with the idea and in shared links (`leadBreaks`, `leadTwin`).

## Breaks (item 5, `src/track.ts`)
Real songs: under half have a lead guitar line at all (pop 29%, funk 36%), and pop and funk songs with one usually give it an instrumental break (54% / 76%); the app's Guitar 2 played in every song, and pop and funk (no solo by default) had a break in 25% / 13%.
- **No lead guitar:** a song with no solo section has none now and then (pop 65%, funk 60%, alt metal 50%, rock 30%, grunge 25%, hard rock 10%, metal 5%): Guitar 2 sits out (its swells stay, and a solo if you turn one on).
- **A lead break:** otherwise, a song with no solo often (pop 45%, funk 70%, the others 50%) gets eight bars of lead guitar over the chorus chords with no singing, after the second chorus of three (else the first); an interlude the song already has becomes the break. It's a short melodic solo (`generateSolo` at a low intensity: lower and sparer than a full one, quoting the hook, the player's own licks); the band plays as it would.

| | Off | On | Real songs |
|---|---|---|---|
| pop songs with a lead guitar | 100% | 38% | 29% |
| funk songs with a lead guitar | 100% | 48% | 36% |
| alt metal songs with a lead guitar | 100% | 60% | 32% |
| pop songs with a lead that have a break | 33% | 60% | 54% |
| funk songs with a lead that have a break | 8% | 74% | 76% |

## Twin (item 6, `src/track.ts`, `src/audio/engine.ts`)
Real hard rock and metal songs with a lead: 55% have a second lead line, 70% of them in the same bars as the first (a harmony, a double, an octave). The app had one lead.
- **Which songs:** hard rock and metal 55%, rock 30%, grunge 20%, alt metal 15%, pop and funk 10%.
- **What it plays:** on the hook, a lead line over the riff, and the second half of a solo: a harmony a scale 3rd up (metal and hard rock most; a held note that would rub against the chord stays a double), an octave below (or above, for low notes), or the same notes (a double).
- **How it sounds:** a second guitar of the same sound, its own take, left of centre (Guitar 2 is a little right), a hair later and a little softer; on Guitar 2's mixer channel (its volume, mute and solo). With Prepare real sound it goes through the real amp too. MIDI export: its own track, "Guitar 2 twin".

| songs with 2+ lead lines | Off | On | Real songs |
|---|---|---|---|
| hard rock | 13% | 55% | 55% |
| metal | 0% | 53% | 55% |
| all | 2% | 33% | 36% |

## Checked
- Played muted in the browser (metal, all switches on): both guitars sound (meters: the twin at -0.3 pan, Guitar 2 at +0.15), no errors; Prepare real sound and its playback work with the twin.

## Next
- Paul listens: Breaks in pop and funk tracks, Twin in hard rock and metal (the solo's second half).
- The study's list is done. Left from it: real leads are still busier (5.4 notes a bar vs 4.1), choppier (short notes), with more triplets and bends; the lead sits half an octave high.
