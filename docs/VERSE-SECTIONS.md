# Verse melody writer: sections and variety

The verse melody writer (`src/verse/`) writes the song's lead vocal, one rule at a time (the main voice since 2026-10-19, `docs/VOCAL.md`; `sing.ts` hooks it into the song builder, the card is now a report). Goal: great songs that don't sound alike.

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

## Pre-chorus (rules 22 and 23)
- The card now sings the song's pre-chorus too. It is the same engine with its own dials (`dialsFor('prechorus')`): tighter phrases (mostly 1-2 bars, short breaks), a few more 16th runs than the verse, a few long notes (less than the chorus), bends 1.5x. Verse and chorus are note for note as before (checked by hash over 486 sections).
- **Shared melody.** Like choruses, the pre-choruses of a song are one melody: the last one is the master, the others are written like it over their own chords. `hookSig` now includes the section kind.
- **Borrowed from the verse.** Its phrasing and small breaks use the verse's dice (`borrow` in `build.ts`), so the two feel related (about 70% of pre-chorus phrase starts land where the verse's do). Its chord notes, long notes, endings and bends are its own.
- **Silence.** 15-30% per song (`preSilence`, mostly nearer 15), fitted by rule 18 like the chorus.
- **Rule 22 - climb** (`d.climb`, 3-7 semitones drawn per song). The core note leans from the root toward the 5th bar by bar (`randomTones`), and `voiceLead` is pulled toward a register that rises across the section (starts a little above the range's bottom; the band is lifted 2 semitones). Mild: 55% of pre-choruses end their second half higher than the first by a semitone or more, 21% fall (chords decide the pitch classes).
- **Rule 23 - lead-in** (`withLeadIn`, `d.leadIn` 45-90% per song). The last phrase ends on one long open (3rd or 5th) or hanging note, 2-4 beats, held on into the break (up to half a bar more, never to the section's last 16th), sung stronger (more velocity) and without the ending fade. About 70% of pre-choruses do it.
- Rules 20 and 21 apply as everywhere. The card shows PRE-CHORUS between VERSE and CHORUS, with its words.
- To add a section the same way: a kind in `section.ts` (`kindOf`), a `dialsFor` branch, its personality traits on new random streams (so other sections don't change), and a rule or two.

## Bridge (rule 24)
- The card now sings the bridge too (`dialsFor('bridge')`), after the chorus on the card. Its own material: nothing is borrowed from the verse or chorus (its seed is its own). A song's bridges are one melody (the last one is the master), like choruses.
- **Dials.** Phrases mostly 2-4 bars, longer breaks (2-4 beats), half the 16th runs, more and longer long notes, more stretched 8ths, openers 40%, fewer bar moves, small breaks 0.6x, endings mostly held / open / hang (60-90% of phrases), bends 1.2x.
- **Register.** `bridgeLift` per song: -3 (lower, intimate moods), 0, +2, +4 (higher, tense/triumphant/angry moods), applied like the chorus lift.
- **Silence.** 30-50% per song (`bridgeSilence`, mostly nearer 30), a loose aim: rule 18 only steps in when the line is more than 7 points off (`silenceTol`); it lands about 7 points under its draw on average.
- **Rule 24 - dwell** (`d.dwell`, low / middle / high of the range, drawn per song). Like rule 22 but a constant target: `voiceLead` is pulled toward one home pitch, so the line circles it. A mild tendency (chords still decide the pitch classes): 73% of bridge notes sit within 4 semitones of the home pitch, against 59% of verse notes.
- **Lead-in** (rule 23) reuses `leadIn`: 30-85% per song (`bridgeLeadIn`); about 55% of bridges end on a long open or hanging note held into the next section.
- Checked: 144 bridges in 168 songs, none empty, no overlaps, 0 short units, Pentatonic gives 0 off-scale notes; silence mean 3.7 points under its draw (worst 14) before the looser fit. Verse, pre-chorus and chorus are note for note the same as before (948 sections by hash).

## Interlude (an echo of the chorus)
- Sings only the 4-bar hook interlude. The 8-bar lead break is the guitar's: it carries a `lead` flag (`idea.section.lead`) and stays silent.
- Takes the song's last chorus's phrasing, chord-note and long-note dice (`echoedFrom` in `section.ts`), so it is the chorus heard again, shorter. The rest is its own dials: 1–2 bar phrases, long gaps, few 16ths, long notes, phrases often ending held or open, no lead-in.
- One melody per song (the interludes share it, like choruses), over each one's own chords.
- Drawn per song: silence 50–70% as a loose aim (the fit only steps in when it is more than 10 points off; `silenceTol`; it lands about 11 points under on average) and a lift of -2, 0 or +2 semitones from the verse.
- Words are sparse (density 0.4), shown as INTERLUDE on the card.
- Checked on 168 songs (121 interludes with the interlude switched on, 15 lead breaks left silent): none empty, no overlaps, 0 short units; verse, pre-chorus, bridge and chorus notes identical to before.

## Outro (the chorus's tail)
- Sings the chorus-based outros (the long outro with its repeated tag, and the short one). A jam outro (new key) and a guitar-solo outro are the guitar's: they carry the `lead` flag (`idea.section.lead`) and stay silent, like the lead break.
- Takes the song's last chorus's phrasing, chord-note and long-note dice (`echoedFrom`, as the interlude does), so it is the chorus heard again. One melody per song, over each outro's own chords.
- Drawn per song: silence 35-55% as a loose aim (+8 points when the song fades; `silenceTol` 0.1; lands about 7 points under on average) and a lift of -2, 0 or +2 semitones, never above the chorus's.
- **Fades or holds**, from the mood's outro (`tension.ts`). Fading moods (melancholic, nostalgic, dreamy, dark): sparser, nearly every phrase ends held, open or hanging (70-100%), and a held ending already fades in volume. Holding moods: fuller, 50-85% of phrases end in a treatment, a short punched ending now and then, bends 1.5x.
- Words density 0.5; shown as OUTRO on the card.
- Checked on 168 songs (151 sung, 17 jam/solo outros left silent): none empty, no overlaps, 0 short units, Pentatonic 0 off-scale. Verse, pre-chorus, bridge and chorus notes identical to before (1092 sections by hash).

## Rule 15: bends inside a held note (first half, quick glide, second half)
- **Changed 2026-10-20 (rule 3):** 16th runs are shorter. Run lengths (⅛, ¼, ½ bar) were 62/30/8% in the verse; now 90/10/0%. The chorus push hook 80/20/0 (was 50/35/15) and the chant hook and one other profile 90/10/0 (were 80/20/0). How often runs happen is unchanged.
- **Changed 2026-10-20:** a held note that bends is two pitches: the first for its first half, the second for its second half, with one quick glide (a 16th at most) across the middle. The old long glides (up to half the note, a bar on a 2-bar note) are gone. No phrase ends while moving (a held ending that bends holds its end note, then fades as before).
- Older notes below describe the old shapes (glide over the first half; hold a quarter, glide, hold two).
- The "next bar" bend (landing as the bar turns) only stays when the next bar's core note is also a note of the chord sounding now, since the end note is held before the bar turns: 450 of them became 76 over 168 songs. The chord-note bends are as before.
- Checked on 168 songs: every inner bend ends by the half (2,710 of them), every note's step, length and pitch before bending is the same as before.

## Rule 21: a fresh core note at every phrase start
- `rerollTones` (`verse.ts`), right after rule 4's bar picks and before holds and notes. At each phrase start the chord note to sit on (1, 3 or 5) is drawn again with the same weights as rule 4 (the hook's, in a chorus), and holds to the next change in the bar's picks or the bar's end. The part of the bar before it (the last phrase's end, or the break) keeps its pick.
- Drawn by step, so a leaf repeating a seed repeats it. Pentatonic still applies when the note is chosen. Bar labels on the card ("1→3") show the result.
- Checked on 168 songs: 67% of phrases starting part-way through a bar sit on a different core note than before the break (a fresh draw out of 3); no overlaps.

## Pentatonic option
- The card's **Notes** menu: All (default) or Pentatonic only. On, every note is chosen from the key's pentatonic scale (major pentatonic 1 2 3 5 6 for a mode with a major 3rd, else minor 1 b3 4 5 b7), at every step of the writer, not filtered afterwards: the chord note a bar sits on gives way to the chord's other notes in the scale, else the nearest scale note; neighbours and walks step along the pentatonic (2-3 semitones); open and hang endings and bends to a chord note pick scale notes only. Scoops (a slide into a note) still start below the note.
- Checked on 168 songs: 0 of 29,845 notes outside the scale; with the menu on All, notes are as before.

## Range
- The line lives in A2-G4 (widened from D3-D4 on 2026-10-20) and dips out of it, down to F#2 or up to D6, only when that saves a big leap (a note in the extended zone costs 4 semitones extra). About 3% of verse notes and 4% of chorus notes do. Bends to a chord note and open/hang endings stay in the main range where they can.
- A chorus lift moves the A2-G4 band, not the extended limits: it stops at them (so a lift down never takes the band's bottom below F#2).

## Singing
- A held phrase ending fades out in volume (10, 16 or 24 dB over its last half), never in pitch; half as far if that note bends.
- The card's **Human feel** switch (on by default) runs the experiment line through the main vocal's human feel (`guide/feel.ts`): glides, scoops, swells, a short fade at every word end, a softer last word, a breath before lines after a rest. The ending fade above stays when it is the longer one.

## Next
Verse 2 answering verse 1, a lifted last chorus, breakdown (same recipe as above).
