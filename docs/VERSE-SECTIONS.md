# Verse melody writer: sections and variety (experiment)

The verse melody card (`src/verse/`) writes a verse and now a chorus, one rule at a time. Goal: great songs that don't sound alike.

## How it fits together
- `profile.ts`: **dials**, every number the rules roll against (phrase lengths, runs, holds, endings, lift...). `VERSE` is the verse as it always was.
- `personality.ts`: a song's **personality**, drawn once from the song seed, tilted (never forced) by genre and mood. Each trait has its own random stream, so adding a trait later leaves the others alone. `dialsFor(kind, personality)` gives a section its dials.
- `section.ts`: an idea (a verse or chorus of the track) to the writer's input; shared by the card and the check.
- `build.ts`: the rule pipeline per leaf of the form (A A' ...).

## Variety rules (keep these true)
- Nothing is fixed: every trait is a weighted menu, and "none" (plain endings, level choruses) is a real option.
- A chorus ends phrases in one of: held, open (3rd/5th), hang (off the chord), punch (short), sync (early, off the beat), plain. A held ending is never required.
- Hooks: chant, anthem, leap, push. Chorus height: +5, +3, level, -2.
- `npm run verse-variety` writes ~224 real songs and prints how each trait spreads. Anything marked `!!` has one value winning too often: retune the weights in `personality.ts`. Also counts near-duplicate choruses.

## Choruses
- **One melody per song's chorus.** The song's last chorus (the fullest) is the master: every other chorus of the same length is written with the master's seed, energy and band hits, over its own chords. The rhythm and shape are the same; pitches follow each chorus's chords. Words are shared where the rhythm matches. (Before: each chorus was written from its own energy and chords, so 9 songs in 10 had choruses that differed.) No stripping of the vocal in earlier choruses: the build-up is the band's.
- **Silence.** Each song draws how much of its chorus has no vocals: 25-45%, a squared draw so 25% is common and 45% rare (`chorusSilence`). Rule 18 (`fitSilence`) fits every chorus to it, within 3 points: too full, the weakest notes drop out (short, off the band's hits, off the beat; never a phrase's first or last note, a walk or a long note), then long notes let go of their last 8th; too empty, notes are held into the gaps, then phrase endings are held on into the break. The verse is untouched.
- **Longer notes, fewer notes, more bends.** Rule 17 (`withStretch`): a plain 8th is held through the next on the same chord note (a beat, now and then a beat and a half), by hook. Fewer 16th runs; more long notes; bends about 3x the verse's chances (about 6 a chorus).
- **Openers.** Rule 19 (`withOpeners`): a phrase opens on one long note (a beat to three beats, on the first beat of the phrase) that takes the 8ths under it, then the shorter notes follow; it stops at a chord change or an existing long note. Openers are scooped into and bent more often. About 8 phrases in 10 of a chorus now open on a beat-or-longer note; the average chorus note is 3.7 sixteenths (was 3.3) and 67% of the sung time is in notes a beat or longer (was 59%). The verse is untouched.
- The chorus's second half answers the first (how much: drawn per song).

## Constraint: no lone short units (rule 20)
- A **unit** is one note or several touching notes. No unit shorter than a quarter bar may have silence on both sides; a phrase's start and end count as silence. It is a constraint, not a chance, and applies to verses and choruses.
- A short unit is first held out to a beat when the phrase has room (never across a chord change); one that reaches the next note joins it. If it can't be fixed that way, the whole leaf is written again with new dice until it passes (up to 40 tries; the last try drops the unit, so the rule always holds). An answering leaf starts on its source's try; a chorus built like its master starts on the master's.
- Side effects: held notes get longer; a chorus's silence lands a little under its draw (mean 2 points); in 2 songs in 224 a chorus over different chords needed another try than its master, so it differs from it.

## Pentatonic option
- The card's **Notes** menu: All (default) or Pentatonic only. On, every note is chosen from the key's pentatonic scale (major pentatonic 1 2 3 5 6 for a mode with a major 3rd, else minor 1 b3 4 5 b7), at every step of the writer, not filtered afterwards: the chord note a bar sits on gives way to the chord's other notes in the scale, else the nearest scale note; neighbours and walks step along the pentatonic (2-3 semitones); open and hang endings and bends to a chord note pick scale notes only. Scoops (a slide into a note) still start below the note.
- Checked on 168 songs: 0 of 29,845 notes outside the scale; with the menu on All, notes are as before.

## Range
- The line lives in D3-D4 (a man's range) and dips out of it, down to D3 or up to A5, only when that saves a big leap (a note in the extended zone costs 4 semitones extra). About 3% of verse notes and 4% of chorus notes do. Bends to a chord note and open/hang endings stay in the main range where they can.
- A chorus lift moves the D3-D4 band, not the extended limits: it stops at them (so a lift down from D3 stays at D3).

## Singing
- A held phrase ending fades out in volume (10, 16 or 24 dB over its last half), never in pitch; half as far if that note bends.
- The card's **Human feel** switch (on by default) runs the experiment line through the main vocal's human feel (`guide/feel.ts`): glides, scoops, swells, a short fade at every word end, a softer last word, a breath before lines after a rest. The ending fade above stays when it is the longer one.

## Next
Pre-chorus (climb / stall / stop / call / none), verse 2 answering verse 1, a lifted last chorus, bridge, outro.
