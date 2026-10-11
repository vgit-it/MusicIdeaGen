# Lead guitar and solos (scope)

Guitar 2 becomes the band's lead player: it answers the singer through the verses, builds into
choruses, and takes solos. Who the lead player is (their character) decides how.

## Decisions (Paul, 2026-10-11)
- Guitar 2 is the lead, but still plays other parts sometimes (harmonies, arpeggios, swells...).
- Solos are on by default for rock, hard rock, metal and grunge; off for pop and funk.
- The usual solo spot is after the 2nd chorus, with a chance of other spots (earlier, the end) and
  of more than one solo in a song.
- Verse fills leave gaps for an imagined singer (for now).

## 1. The lead player around the song (phase 1, done)
- Verses: a singer is assumed to sing most of each 4-bar phrase. The lead answers in the gaps: the
  end of each phrase (first verse), or every two bars (later verses, and the second time through a
  doubled first verse; the halfway answer only now and then, so verses don't get busy). Each lick lands on a chord note; now and then a four-bar run goes to another
  part for a change.
- Pre-chorus: some players climb into the chorus (a held chord note a bar, then a scale run a note a
  beat to a top note).
- Chorus: as before (the hook, or the idea's part).
- Riff songs: licks still avoid clashing with the riff.

## 2. The lead player's character (`src/players/lead.ts`)
| Player | Licks | Hands | Mostly in |
|---|---|---|---|
| Melodic | two or three sung notes, room around them | legato or slides | pop, rock, alt metal |
| Bluesy | blues licks: 1-4 notes, written bends, the blue third, landing on the root or 5th | bends | rock, hard rock |
| Shredder | quick 16th runs by step | legato or picked | metal, hard rock |
| Raw | one or two plain notes | slides or picked | grunge |
| Funky | short muted 16ths | picked | funk, pop |

Each also has: how likely they take the verses, how often they change to another part, and how
likely they climb into the chorus. Picked with the band (rerolling the band can change it).

## 3. Solos (phase 2, done: a first version)
What makes a good solo, as rules for the generator:
- A story: starts low and sparse, quotes the hook early, repeats and varies it, climbs and gets
  busier, peaks in the last 2-4 bars (highest note, held bend or fast run), resolves on the root as
  the next section starts.
- Phrasing: 2-bar question and answer, about a third rests, phrases often start just off the beat
  and end on chord notes on strong beats.
- Notes: pentatonic with the odd colour note; chord notes on chord changes; bends from a scale note.
- Moves: long bends, repeated-note licks, triplet runs, double-stops, fast runs saved for the peak.
- Sound: a little louder, a bit more echo; the rhythm guitar backs off.

The section:
- 8 bars (16 for heavier styles and longer songs), over the verse or chorus chords (sometimes the
  bridge's).
- The band: rhythm guitar simplifies, bass on roots, drums a level up, a push in the last 4 bars.
- In: a drum fill and a pickup run. Out: a landing note held into the next chorus.
- Track option "Solo: Auto / On / Off"; shown as "Solo" in the sections (and in Add after…), with its own
  "New solo" reroll.

As built (`generateSolo` in `src/parts/guitar2.ts`, placement in `src/track.ts`):
- Where: after the 2nd chorus (70%), else after the 1st (taking the interlude's place); 20% of songs
  also solo over the outro. Hand-edited orders keep what you set.
- 8 bars over the verse (60%) or chorus (40%) chords; metal and hard rock 16 bars half the time (back
  to 8 if the song runs long, and the outro solo goes before the pre-choruses do).
- Four bars at a time, the register climbs from G3 and the playing gets busier (busy only for a
  shredder); over the chorus chords it starts by quoting the hook (60%); the last two bars peak the
  player's way (melodic: a long held bend; bluesy: a bend twice; shredder: a 16th run up; raw: one
  note hammered on the 8ths; funky: stabs) and land on the root of the chord underneath.
- Mix: Guitar 2 +2.5 dB and the rhythm guitar -2 dB through a solo (eased in); strummed rhythm
  guitars also play a level softer.

## 4. Later
- Revisit each player's style and playing nuances (Paul, 2026-10-11: "keep this for now"). Known: the
  shredder's runs and the melodic, raw and funky licks haven't been reworked like the bluesy ones.
- Richer solos per player: lick library, double-stops, fast runs, the louder solo sound.
- A "new solo" button, locking a solo, a tab view.
