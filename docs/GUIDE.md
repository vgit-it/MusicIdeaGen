# Guide line (experiment, 2026-10-14)

A first step toward a new way of writing the vocal melody. Paul's idea: start from a system of notes
mapped to the whole track, so you can steer what kind of music it makes and its mood. Step one is a
single note line from the song's start to its end, in the song's key, shaped by the mood. It's a
separate section of the page (the **Guide line** card, under Parts) and separate code (`src/guide/`),
so it can be worked on without touching the vocals. Once it sounds right, it can feed the vocals.

## Decisions (Paul)
| Question | Choice |
|---|---|
| Mood | The existing Mood (the track's; an idea on its own: Auto, from its genre and key) |
| Chords | An option: **Lean in** (strong beats on the chord's notes) or **Lean out** (the key only) |
| Sound | A soft synth |
| Hand controls (how busy) | None |
| Where | Its own section and its own code |

## How it moves
- **The first note** is picked for the mood: home for strong moods, the 3rd for warm ones, the 5th for
  open ones, an unsettled note for tense ones.
- **Mostly small moves:** a step, sometimes a 3rd, sometimes the same note again.
- **Big leaps (a 4th or more) only after a pause.** After a leap, it steps back the other way. Real
  melodies do this (the leap's "gap" gets filled).
- **How often it moves** comes from the mood: dreamy holds notes for about a bar, angry and tense move
  every beat. It moves quicker as the tension rises.
- **Pauses** come at phrase ends (every 2 bars; every 4 when dreamy).
- **Height** follows the song's tension curve: up into choruses and the climax, down in quiet parts.
  It ends the song on home.
- **Resting notes:** each mood likes to land on certain scale notes, more so on long notes and strong
  beats. Section ends settle on the 1st, 3rd or 5th.
- **Out of key:** only a mood's known colour note, and only now and then:
  - tense and triumphant: the raised 7th, pulling up home (minor keys)
  - melancholic and nostalgic: the flat 6th, sighing down to the 5th (major keys)
  - dark and angry: the flat 2nd, just above home
  - dreamy: the raised 4th, floating (major keys)
- **Key changes** (a last chorus up a key, a jam outro): the line keeps its place in the scale and
  moves with the key.

## How each scale note feels (what the moods are built on)
Tendencies for Western listeners, not laws. Tempo and loudness matter more than which notes.
- 1st (home): at rest. 5th: strong, open. 3rd: warm; it makes the line major or minor.
- 2nd, 4th, 6th: unsettled, they want to move. 7th: yearning, pulls up home.
- Higher and rising: brighter, building. Lower and falling: darker, letting go.
- Small steps: calm, smooth. Big leaps: drama. Long notes: calm. Quick ones: restless.
- Sources: David Huron, *Sweet Anticipation* (how each scale note feels, gap-fill after leaps);
  research on music and emotion (major/minor, pitch height, interval size).

| Mood | Starts on | Rests on | Pace | Leans | Leaps after a pause |
|---|---|---|---|---|---|
| Happy | 3rd, 5th, home | 3rd, home, 5th | lively | up | often, up to a 5th |
| Melancholic | 5th, 3rd | 3rd, home | slow | down | sometimes, up to a 6th |
| Nostalgic | 3rd, 5th | 3rd, 6th, home | medium | a little down | often, up to a 6th |
| Tense | 2nd, 5th, 7th | 7th, 2nd, 4th | quick, repeats | a little up | sometimes, small |
| Angry | home, 5th | home, 5th | quick, repeats | level | often |
| Dreamy | 5th, 3rd | 3rd, 5th, 6th | a note a bar | level | rarely |
| Triumphant | home, 5th | home, 5th | lively | up | very often |
| Dark | home, 3rd | home, 3rd | slow | down | sometimes |

## On the page
- **+ Add guide line**, then:
  - **Chords:** Lean in or Lean out.
  - **Hear:** With band, or Line only (the band muted).
  - **Volume**, **Reroll** (another line, same mood), **MIDI** (the line as a file), **Remove**.
- A drawing of the line over the whole song, with the sections. Leaps are orange, out-of-key notes
  yellow, and the dashed lines are home.
- What it did, in plain words: mood, start, range, moves (steps, 3rds, same note, leaps), pace,
  pauses, how often strong beats land on a chord note, and the colour notes.
- It plays live only. It isn't in MP3/WAV exports, the main MIDI file or share links yet.

## Measured (40 tracks per mood: 5 genres, 4/4, 6/8 and 7/8)
| Mood | Notes a song | Strong beats on a chord note: lean in / out |
|---|---|---|
| Happy | 162 | 75% / 44% |
| Melancholic | 100 | 67% / 43% |
| Nostalgic | 116 | 71% / 42% |
| Tense | 216 | 72% / 35% |
| Angry | 213 | 81% / 44% |
| Dreamy | 80 | 69% / 36% |
| Triumphant | 169 | 74% / 46% |
| Dark | 122 | 72% / 44% |

Every song ends on home, and no leap of a 4th or more comes without a pause before it. Moves are
mostly steps (52-70%), then 3rds (12-40%), with leaps 1-7%.

## Steadier, with bends (2026-10-14)
Paul: "too many shifts, almost every beat; more steady for now", and bends as one of the ways it moves
from note to note, over an 8th, a quarter or half a bar.
- **Steadier:** notes last 2.5 times as long as before, change only on strong beats (a bar's first or
  its middle), and tension speeds them up less. The same note again is held on, not struck again.
  Now about a note every 3-8 beats (was 1-2.4).
- **Bends:** a step up or down (a half or whole step, like a guitar bend) can be bent into instead of
  played: no new attack, the pitch glides from the note before over an 8th, a quarter or half a bar
  (never more than half the note). Only straight on (no pause before).
  - How often, by mood: melancholic and dreamy 35% of steps, nostalgic and dark 30%, tense and
    triumphant 25%, happy and angry 20%.
  - Which length: angry likes quick 8th bends, dreamy and melancholic slow half-bar ones.
  - Drawn as green slopes. In the MIDI file as pitch bends (the standard whole-step range).

| 40 tracks per mood | Notes a song (lean in) | Beats a note | Bends a song |
|---|---|---|---|
| Happy | 54 | 4.2 | 3 |
| Melancholic | 40 | 5.7 | 4 |
| Nostalgic | 48 | 4.8 | 5 |
| Tense | 67 | 3.4 | 9 |
| Angry | 61 | 3.8 | 5 |
| Dreamy | 27 | 8.4 | 2 |
| Triumphant | 54 | 4.2 | 5 |
| Dark | 46 | 4.9 | 4 |

Still: every song ends on home, no leap without a pause before it.

## Quick notes (2026-10-14)
Paul: on the long stretches, now and then one quick note up or down (a step or two at most), on the
beat grid, lasting just that small unit like a drum hit, then straight back to the line; a control from
sparse to a lot; at the end of a note, a bend to it instead.
- **Where:** on held notes of 2 beats or more, on the 8th-note grid, at least a beat into the note,
  at least a beat apart. Not on notes in a bend.
- **What:** one note up (55%) or down, a step (75%) or two, in the key.
- **How long:** a 16th or an 8th, by mood (angry and tense quicker, dreamy and melancholic slower).
  Struck with a little accent, then straight back to the line's note.
- **At a note's very end:** bent to instead, and the line moves on from there (never on the song's
  last note).
- **Control:** Quick notes: Off / Sparse / Some / Lots (Some by default). The line itself stays the
  same whatever the setting; only the quick notes change.
- Drawn as pink dashes (pink slopes for the bends). In the MIDI file the held note is cut around them.

| 120 tracks, all moods | Quick notes a song | Per 8 bars |
|---|---|---|
| Sparse | 11 | 1.1 |
| Some | 24 | 2.5 |
| Lots | 51 | 5.3 |

About 40% are 16ths, the rest 8ths; about 6% land at a note's end and are bent to.

## Quick notes: 8ths, pauses, clusters (2026-10-14)
Paul: quick notes an 8th at least; in some cases a split-second pause before the held note comes back;
and they come in clusters of about 2 bars: frequent, then moderate, then sparse.
- **Length:** always an 8th now (no 16ths).
- **Pause:** about a third of them go silent for a split second (a 32nd) after the quick note, then
  the held note is struck again. Never on the bent-to ones at a note's end.
- **Clusters:** the song is cut into 2-bar clusters that cycle frequent, moderate, sparse (the cycle
  starts at a random place per song). The Quick notes setting scales all three. In a frequent cluster
  they can come an 8th apart (else a beat).

| 120 tracks, all moods | Quick notes a song | In frequent / moderate / sparse clusters |
|---|---|---|
| Sparse | 13 | 64% / 27% / 9% |
| Some | 28 | 62% / 29% / 9% |
| Lots | 56 | 60% / 29% / 11% |

About 30% come back after a pause; about 10% are bent to at a note's end. The readout lists the
count per cluster type.

## Quick notes: more on Lots, 16th pauses (2026-10-14)
Paul: Lots much more frequent; the ones with a pause a 16th long, then a 16th's pause, so the line
comes back in time.
- **Lots:** about 2.2 times as many (13 per 8 bars, was 6). They may start an 8th into a note (else a
  beat) and come an 8th apart in every cluster. In a frequent cluster nearly every other 8th.
- **With a pause:** the quick note is a 16th, then a 16th of silence, then the held note again on the
  next 8th (was an 8th and a 32nd). About a third of them.
- Sparse and Some unchanged (1.3 and 2.9 per 8 bars).

## Voice range, repeats, quick notes lower (2026-10-14)
Paul: the mid voice range (a high voice can have some high parts); verses alike and choruses alike
within a song; quick notes leaning lower, whatever the mood.
- **Range:** the mid voice, C3 to G4. Home sits between F3 and E4, so there's room above and below.
- **High voice:** Voice: Auto follows the singer (high if they sing high), or pick Mid or High (High
  with no high singer uses the rock tenor's range). Where the song is high (tension 0.6 and up:
  choruses, the climax) the line may go up to that voice's top (tenor A4, woman C5) and reaches for
  it. On the way back down it steps down, never jumps.
- **Repeats:** the 2nd and later verses, pre-choruses and choruses sing the first one's notes (in
  their own key, so a last chorus up a key moves up), with about 15% of notes a step away, never
  making a leap. The song's last note is still home. A leap into a repeat gets a pause before it.
- **Quick notes:** 65% go down (was 45%).
- Still: every note in range, every song ends on home, no leap without a pause (360 tracks: mid,
  tenor, woman).

| 120 tracks each | Notes above G4 | Repeats: same note at the same place |
|---|---|---|
| Mid | 0% | 73% |
| Tenor | 5% | 72% |
| Woman | 13% | 73% |

## More room up (2026-10-14)
Paul: "the limiting of range has made it very stale. Open up more of the higher range."
- **Range:** C3 to C5 (was G4). Home stays F3 to E4, so the extra room is all above.
- **Each mood reaches 3 scale notes higher**, so high parts (choruses, the climax) climb further.
- **High voice:** up to 2 semitones past its belted top in the high parts (tenor D5, woman F5).
- **Fixed:** two changed notes side by side in a repeat could make a leap without a pause.
- Still: every note in range, every song ends home, no leap without a pause (360 tracks).

| 50 tracks each | Song's top note (avg) | Average note | Notes G4 and up |
|---|---|---|---|
| Mid, before | F4 | B3/C4 | 5% |
| Mid, now | A4 | D#4 | 38% |
| Tenor, now | A#4 | E4 | 46% |
| Woman, now | B4/C5 | E4 | 48% |

## Quick notes: levels retuned (2026-10-14)
Paul: Lots works best, so make Some the current Lots and retune the other two.
- **Some** (the default) is now what Lots was: it may start an 8th into a note, an 8th apart anywhere.
- **Sparse** is between the old Some and the old Lots (a beat apart, outside frequent clusters).
- **Lots** goes further. It's near the most that fits (every other 8th on a held note), so the
  clusters even out a little: frequent and moderate clusters are about as busy, sparse ones still lighter.
- The line itself doesn't change between levels.

| Per 8 bars | Before | Now |
|---|---|---|
| Sparse | 1.3 | 5.0 |
| Some | 2.8 | 12.7 |
| Lots | 12.7 | 17.0 |

## Where it sits out, and quick notes by genre (2026-10-14)
Paul: silent in solos; by chance in interludes, bridges and outros; no notes at all in intros; and
Sparse, Some and Lots meaning something different per genre.
- **Sits out:** intros and solos always. Interludes 50%, bridges 70% plays, breakdowns 50%, outros 50%
  (rolled per song; Reroll rolls again). Verses, pre-choruses and choruses always play.
- After sitting out it comes back on any note (the silence is its pause). If the outro sits out, the
  last chorus ends on home (with a pause before it if that's a leap).
- Drawn greyed and marked "silent"; the readout lists the sections it sits out.
- **Quick notes by genre** (the levels keep their order; the genre scales them and gives them a feel):

| Genre | How many | Feel |
|---|---|---|
| Pop | as set | smooth |
| Rock | a little more | as before |
| Hard rock | more | punchy: half have a pause after them |
| Funk | many more, an 8th apart at every level | stabby: most with a pause, on the offbeat 8ths |
| Grunge | fewer | lazy: few pauses, often bent to at a note's end |
| Alt metal | in bursts | busy frequent clusters, little between |
| Metal | more | half with a pause, more two-step jumps |

Measured against the same songs played Pop-style: Funk x2.1 on Sparse, x1.2 on Some; Grunge and Alt metal
x0.8 on Some and Lots; Rock, Hard rock and Metal x1.1 on Sparse. Some and Lots are near the most that
fit (one every other 8th), so there the busier genres differ mostly in feel, not count.
Checked (224 tracks): intros and solos always empty, every song ends home, no leap without a pause.

## Quick notes a whole tone away (2026-10-14)
Paul: try some quick notes going one full note (a whole tone) up or down, not the scale's next note;
leave the two-step ones as they are.
- 40% of the one-step quick notes go a whole tone up or down, whatever the scale says.
- Where the scale's next note is already a whole tone away it's the same note; where it's a half step
  (e.g. the 3rd to the 4th, the 7th to home in major), the quick note leaves the key. That's about 7% of
  all quick notes.
- Those are drawn red (other quick notes stay pink); the readout counts them. Two-step ones stay in the scale.

## Quick notes a half step away (2026-10-14)
Paul: the whole tone sounded weird; make it a half step.
- The same 40% of one-step quick notes now go a half step up or down instead.
- Out of key where the scale's next note is a whole step away (most places): about 21% of all quick
  notes (was 7% with the whole tone). Two-step ones still stay in the scale.

## Fewer off-scale, more up, pushes and pulls (2026-10-14)
Paul: fewer off-scale quick notes; more of the normal ones going up; and pushes (emphasis) and pulls
(weak) on the held notes, like a word starting or ending, spread unevenly so held stretches run long or short.
- **Off-scale:** 15% of one-step quick notes go a half step (was 40%): about 8% of all quick notes (was 21%).
- **Up:** in-scale quick notes go up half the time (was 35%); the off-scale ones stay mostly down.
- **Pushes and pulls** on held notes (2 beats or more, not in a bend), on the 8th grid, either one by chance:
  - push: a breath of a dip, then louder, settling back (like a word starting)
  - pull: falls away, then comes back softly (like a word ending)
  - spread unevenly: the gap to the next is short (an 8th or two), medium (2-3 beats) or long (5-12 beats),
    so some held stretches are broken up and others run on untouched
  - placed first; quick notes keep off them (about 6% fewer quick notes)
  - drawn as ticks (white up: push, grey down: pull); in the MIDI file the note is struck again there,
    louder or softer
- About 4 pushes and pulls per 8 bars. Gaps between them: 10% under 4 16ths, half under 14, 10% over 68.

## More pushes and pulls, quick notes on any 16th (2026-10-14)

Paul: more pushes and pulls, a bit more pronounced; quick notes at more random times, not always on the 8ths.

- **Pushes and pulls:** about 7 per 8 bars (was 4); gaps still uneven (short, medium, long), just shorter overall.
- **Stronger:** a push dips deeper and lifts higher; a pull falls further and comes back slower. In MIDI a pull is re-struck softer (0.3).
- **Quick notes on any 16th:** every 16th of a held note is a possible spot (was the 8ths only). The offbeat 8ths still lead by the genre's taste; the in-between 16ths (the e and the a) about a third of them.
- **How many:** about the same as before (Some ~8 per 8 bars; a little fewer where pushes and pulls now sit).

## Quick notes come back on the 8th (2026-10-14)

Paul: wherever a quick note starts, the line should come back on the beat grid.

- A quick note on an 8th: an 8th long (or a 16th and a 16th's pause), as before.
- A quick note on an in-between 16th (the e or the a): a 16th long, so the line is back on the next 8th. No pause on those.
- The grid is the 8th in every meter (4/4, 6/8, 7/8).
- Counts back to about where they were (Some ~9 per 8 bars).

## Pulls end in silence (2026-10-14)

Paul: a pull should end in silence and the note come back on the next beat.

- **A pull now:** the note falls away over a 16th, then silence, then the note is struck again on the next beat (by the time signature's beats: 4/4 quarters, 6/8 dotted quarters, 7/8 its groups).
- **Silence:** usually 1-5 16ths (median 3). Near a note's end, it stays silent until the next note.
- **Never on the song's last note** (it rings to the end).
- Quick notes and pushes keep clear of the silence. Drawn as a gap in the note; in MIDI a soft 16th, then the note again on the beat.
- Pushes and pulls about 6 per 8 bars (a little fewer: the silences take room).

## A cap: 4 per second (2026-10-14)

Paul: never more than 4 quick notes, pushes and pulls together in any one second.

- Counted in real time (by the tempo), across sections, in any 1-second window.
- In a busy spot the later ones are left out. The readout shows how many.
- Rarely needed: about 0.3% left out on Some, 0.6% on Lots (the busiest spots in fast songs).

## Sung: words on the line, the Cornell voice (2026-10-14)

Paul: use the guide line's tune to write words (the same tune exactly), sung by the Cornell voice, on and off.

- **The tune stays exactly the same.** The words only decide which syllable sits on each sound (`src/guide/words.ts`).
- **Where words go:** each note's start, a push and the note back after a pull start a word. A pull ends one softly into its silence (a soft last sound: n, m, l, s).
- **Quick notes:** a jump there and back carries the light end of a word (NEV-er) or stays on the vowel (oh-oh). One with a pause is a quick light word (the, a, in). A bend at a note's end is a soft ending or stays one sound. How often they carry words, by genre: funk most, grunge least.
- **Lines** break at the pauses (a beat or more), or after two bars at the next word. Every other line rhymes. Choruses sing the same words each time; verses get new ones. Long notes open their vowels.
- **Words:** the vocals' pseudo-English (`src/parts/lyrics.ts`). About 2 syllables a bar on Some.
- **The voice:** the FOF singer in the Cornell voice (the woman's when the line is sung High), polished like the vocals, each line rendered once in the background (`src/guide/voice.ts`). Sing: Off / Cornell, Off by default; on, it sings instead of the synth.
- **Shown** under the drawing, section by section; in the MIDI file as lyrics.

## An octave down (2026-10-14)

Paul: the line sounded very weird up at C3-C5; shift the range down an octave.

- The whole line an octave lower: voice C2-C4 (was C3-C5), home F2-E3; a high voice's top an octave down too.
- Same shapes exactly: checked note for note against the old line, minus 12 (120 songs, moods, genres, voices).
- Sung: the Cornell voice at the line's new pitch; the woman's voice (High) sings it back up an octave, in her own range.

## Quick notes as new words (2026-10-14)

Paul: the two-step quick notes should be new words, and most of the others too.

- Two-step quick notes: always a new word.
- One-step ones: a new word most of the time (by genre: funk 95%, rock and pop 85%, grunge 70%); otherwise the vowel carried on.
- With a pause: a new word. A bend at a note's end: a soft word ending (a new word if it's a two-step jump).
- About 2.4 syllables a bar on Some (was 2.0); carried vowels 14% (was 28%). Tune unchanged.

## Around E3, height by section (2026-10-14)

Paul: C2-C4 was super low; keep it around E3 without making it monotonous.

- **Voice A2 to C4**, home A2 to G#3 by the key, so the line circles E3. The song's peaks (tension 0.8 and up) reach D4. A high voice's top as before (an octave under where it's sung).
- **Height by section, not by wandering:** each kind of section has its own place in the voice (verses low, pre-choruses climbing through themselves, choruses lifted, bridges in between), moved by the tension and the mood's lean.
- **Within a phrase** the line keeps near that height: the mood's span sets how many scale notes either side (2-4), or it heads back toward it.
- **Result** (80 songs): middle note F3 (was Eb4 before the octave drop); verses around D3, choruses around G3 (a 4th apart; was 2 semitones); the song's span (13 semitones) and different pitches per song (8) the same as before, so no flatter.
- Leaps after pauses, quick notes, pushes and pulls unchanged.

## Lifted: C3 to E4 (2026-10-14)

Paul: still a bit weird; lift the range further, as limits the line is written within (not a shift afterwards).

- The voice's limits raised: C3 to E4 (was A2 to C4), home C3 to B3 by the key, the song's peaks to F#4 (was D4). The line is written inside them from the start.
- Result (80 songs): middle note Ab3 (was F3); most notes D3 to D4; verses around F#3, choruses around Bb3. Span and variety as before (12-13 semitones, 8 pitches a song).
- The woman's voice (High) still sings the line an octave up, in her range.

## All the voices (2026-10-14)

Paul: give me the other voices in there too.

- **Sing** is now a menu: Off, Auto (the song's genre voice; the woman's when the line is sung High), Clear (the first voice), each genre's voice, and the characters (Big & dark, Chester, Cornell, Woman, Dark & nasal), the same list as the vocals' Voice menu.
- The Woman voice sings the line an octave up, in her range; the rest at the line's pitch.

## Next
- Paul listens: does each mood sound like its name? Lean in vs Lean out.
- Then: a mood per section, phrases that come back (motifs), and the vocals singing on it.
