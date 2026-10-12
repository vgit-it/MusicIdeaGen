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

As built (`src/parts/solo.ts`, rules in `docs/SOLO-THEORY.md`; placement in `src/track.ts`):
- Where: after the 2nd chorus (70%), else after the 1st (taking the interlude's place); 20% of songs
  also solo over the outro. Hand-edited orders keep what you set.
- 8 bars over the verse (60%) or chorus (40%) chords; metal and hard rock 16 bars half the time (back
  to 8 if the song runs long, and the outro solo goes before the pre-choruses do).
- The arc, two bars at a time: opening (first ~30%: low, sparse; maybe the hook quoted or one bold
  bent note), build (the ceiling climbing, busier), the peak at ~70% (the motif climbing two or three
  times, then the solo's highest note on the downbeat, never heard before: held and bent, or the
  player's way), the release (lower, sparser) landing on the root of the last chord on beat 1 (or an
  8th early), held, the last beat left to the drums.
- Phrases: a call ending open (3rd/5th) and an answer ending home (root); rests between them early,
  none in the build; starts on the downbeat about a third of the time.
- Rhythm first (2-4 note cells); the first phrase's rhythm and shape are the motif, reused and varied
  in about 60% of phrases.
- Pitch: mostly steps, ~12% leaps then a step back, arches most; chord notes on strong beats, chord
  changes and held notes; no held note rubbing against the chord or the riff; at most two repeats.
- Scales by player: melodic: pentatonic + mode colour; bluesy: the blues scale, the blue third curled
  up over major chords; shredder: the full mode; raw / funky: pentatonic.
- Licks: a vocabulary of real pentatonic-box licks per player (`LICKS`): fast (runs down the box with
  pull-offs, rolling three-note groups, a hammered climb, the blues run with the b5, the shredder's
  fours, tremolo), mid (bend then down to the root, the 7th bent to the root twice, up the box by
  slides, climbing thirds, a sweet turn, funky figures), slow (one bent held note, a slide up into a
  long note, bend-step-hold). Each is moved up or down the box so its last note is a chord note (the
  root to close), near the last note played, never reaching the solo's top note early.
- Slow against fast: each build unit pairs a slow slot with a fast one (a sung phrase and a fast lick,
  a mid lick and a burst: a held note, a quick run, a held note), the mix by player (a shredder more
  fast, a melodic player more sung).
- How each note is played, from the solo: quick notes legato (a pick on each beat, hammered up or
  pulled off down between, by player 10-70%), slower connected notes slid now and then (5-40%), each
  phrase picked or slid into, held chord notes bent (10-50%), vibrato on held notes (6-22 cents by
  player, wider on the peak); what a lick says it keeps. The hands follow it (`art` and `vib` on the
  notes): they finger the line so hammered and slid notes share a string.
- Mix: Guitar 2 +2.5 dB and the rhythm guitar -2 dB through a solo (eased in); strummed rhythm
  guitars also play a level softer.
- The drummer under it (`playUnderSolo`, drummer.ts): the ride instead of the hi-hat, a crash with
  the kick every four bars, building to the peak bar (+16%) then easing off, short fills at the ends
  of four-bar phrases where the guitar isn't busy, their big fill into the peak bar (crash on the
  peak), crashes caught on the guitar's long notes and the peak note (once per two bars at most), no
  ghost notes.

## 4. Each player's style (2026-10-12)
Paul: "resume work on the lead parts". The research, like the rhythm guitar's: lesson summaries
(guitarworld, premierguitar, licklibrary, musicradar, guitarplayer, fundamental-changes, pmtonline).
Tags: [M] stated by a source; [P] what teachers agree on; [R] a rule of thumb turned into a number.
✓ = built, · = not yet.

### Techniques (the sound engine, `multisampler.ts`, `instruments.ts`)
- ✓ Bend and release: bent up into the note, held, let down again (Gilmour, Slash) [P].
- ✓ Pre-bend and release: picked already bent, then let down (Slash, Brian May) [M].
- ✓ Unison bend: the note held on one string, bent up to on the string below (Gilmour, Hendrix,
  grunge) [P]; oblique bend: a note bent up under a held one (Albert King, Johnny Winter, "November
  Rain") [M]. (A double-stop's bend is on its lower note.)
- ✓ Double-stops: sixths sliding down (Knopfler, pop), thirds in harmony (Brian May), fourths (Chuck
  Berry, Frusciante, Cory Wong), a hammered double-stop (Curtis Mayfield), octaves (grunge, Wes) [M].
- ✓ Overbends: two tones (Gilmour, Albert King) [M].
- ✓ Trills: hammered on and pulled off, about 14 notes a second (Cantrell, shredders) [M].
- ✓ Tremolo picking: 32nds, accents on the beat (metal) [M].
- ✓ Rakes: the pick dragged across two or three muted strings into a bent note (blues, Gilmour,
  Prince) [M], by player 5-30% of bent licks [R].
- ✓ Ghost notes: muted 16ths between the notes of a funk lick [M].
- · Pinch harmonics, whammy dives, feedback (no samples for them yet).

### What each player plays (`src/parts/licks.ts`)
Licks written over the chord (so they fit wherever they're put), moved to the chord under them and
into the register near the last note; they have to fit (in the key or a chord note or a passing note
the lick means; held notes not rubbing; nothing against the riff; ending on a chord note). Sometimes
cut down (the first notes left off) to fit a gap.
| Player | Licks | Peak of a solo |
|---|---|---|
| Melodic | a two-tone overbend, a unison bend, a bend under a held note, a sung pickup slid into, a pre-bend let down, a bend let down onto the root, a picked cascade (Knopfler), sixths sliding down, thirds in harmony (May) | a unison bend on the top note (40%), else the long bend |
| Shredder | the pentatonic in threes (Wylde, Rhoads), a pull-off loop (Hammett), a pedal-tone run, a legato climb in fours (Petrucci), string skipping (Gilbert), a broken chord up, chromatic steps down (Dimebag), tremolo picking, trills climbing, a harmonic-minor turn; the harmonic minor's leading tone over a major V | the run, then the top note trilled (25%) or tremolo picked (20%) |
| Raw | octaves, a bend into the flat 5th (Cobain), a bend then a trill (Cantrell), a Hendrix flurry (McCready), a slide falling (Jack White), one note again, a unison bend | the top note in octaves, slid into (40%) |
| Funky | a ghosted 16th hook (Rodgers, Wong), a hammered double-stop (Mayfield), sixths slid into, parallel fourths (Frusciante), stabs, a Dorian 16th line (Prince), a raked scream | a raked overbend (40%, Prince) |
| Bluesy (added) | an Albert King overbend, a bend under a held note picked again, B.B. King's box, Chuck Berry double-stops (3+3+2), a double-stop bend | a raked overbend (40%) |

- Verses: where the player answers the singer, one of their licks instead of a made-up line, by player
  (melodic 45%, bluesy 35% on top of the blues licks, shredder 70%, raw 55%, funky 70%), up to three
  beats long, ending on the bar line, not the same lick twice running; funk licks clipped short.
- Solos: a lick slot takes one of these about half the time (the box licks the rest).
- Still made up: the sung lines, the motif and its variations, the climbs, so the vocabulary adds to
  what's new rather than replacing it.

## 5. Later
- Pinch harmonics, whammy dives, feedback (need their own sounds).
- A tab view; locking a solo.
