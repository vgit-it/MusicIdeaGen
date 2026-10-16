# Anchor line (Guide line switch; 2026-10-14)

Paul's idea: a melody built the way many real vocal lines are, mostly one note, sung in a steady rhythm,
broken now and then by a small accent. **Anchor line: Off / On** in the Guide line card. It is a writer of its
own (`src/guide/anchor.ts`), giving the same kind of line as the guide line, so the drawing, the synth, the
words, the singer and MIDI all work as before. Off: the guide line exactly as before.

## Decisions (Paul)
| Question | Choice |
|---|---|
| The main note | One per 4 bars, **moving every 4 bars** (a step or two) |
| Rhythm patterns | **By genre** |
| Where | **Its own switch** |
| Words | A word on each note of the rhythm; now and then more than one in a beat (less often) |
| Accent endings | The last note strong, sometimes held into the next bar or two; the verse planned around it |
| Bends | Into the accents, now and then, by chance |

## How it writes
- **The anchor:** for each 4 bars, one main note, near the section's height (verses low, pre-choruses
  climbing, choruses lifted, by the tension), on a note the chords there share (leaning in), a step or two
  from the last one.
- **The plan of each 4 bars:** one 4-bar phrase, two 2-bar phrases, or 1+1+2 / 2+1+1 (6/8 and 7/8: 4, or
  2+2). Never more than 4 bars sung without a pause (Paul: no phrase longer than 8 bars).
- **Each phrase:**
  1. **The pattern:** a rhythm cell of 3-6 beats, by genre, repeated on the anchor (at least about half the
     phrase). Each beat of a cell: one note, two notes, a push on the offbeat, three quick notes (rare), the
     note held on, or a rest.
  2. **The break:** the rhythm changes for the accent: a note a beat each, two to a beat, or the last note
     pushed an 8th early.
  3. **The accent**, in scale steps from the anchor (in the key): two up and one down (+2, +1); a step up and
     back (+1, 0); up, up, one down; a dip (-1, 0); a turn (+1, 0, -1, 0); a reach up two (+1, +2); a fall
     (-1 or -2); up then down past it; two up, stepping home; now and then a leap up a 5th after a breath
     (choruses, pre-choruses, bridges).
  4. **The last note:** on a strong beat, on a chord note (leaning in); a beat or two, or held a bar or two
     (more in choruses and by mood: dreamy, melancholic and triumphant the most).
  5. **A rest** of a beat or more (verses longer: sparse).
- **The mood picks the accents:** happy and triumphant reach up, melancholic and dark fall and dip, tense
  turns, angry steps and falls.
- **Phrases that end a 4-bar block settle** (back to the anchor or below); earlier ones stay open (up).
- **Bends**, by chance: into an accent note a half or whole step from the note before, straight on, over an
  8th, a quarter or half a bar (more likely on the last note; melancholic and dreamy most).
- **Kept from the guide line:** where it sits out, verses and choruses sung alike, the song ending on home,
  at most 4 new sounds in any second (in busy spots anchor notes are tied together, the accents kept), the
  range and Key & scale, Hard & soft.
- **Not used:** quick notes, pushes and pulls, and the other switches.

## Measured (168 songs: 8 moods, 7 genres, 4/4, 6/8, 7/8)
| | 4/4 | 6/8 | 7/8 |
|---|---|---|---|
| Notes on the 4 bars' main note | 78% | 81% | 81% |
| Notes a beat | 0.58 | 0.73 | 0.65 |
| Time sung | 75% | 71% | 75% |
| Notes held a bar or more, a song | 8.5 | 11 | 9.6 |
| Bends, a song | 8.5 | 6 | 6.3 |

`npm run guide-check` checks it too (alone, with Hard & soft, two ranges, a key and scale of its own): the
words on the tune, at most 4 changes in a second, the range, never two notes at once, a note held at most
2 bars (the guide line's own limit, a bar, stays for the guide line).

## Fewer long notes, moving ones, energy, more patterns (2026-10-15)
Paul: too many long runs held across two bars; long ones could bend to the next note or start on the accent
and bend down; more dynamic, by the song's energy and mood (following the song); more word patterns.

- **Fewer long notes:** at most 2 long holds a section (3 in a chorus), fewer as the energy rises; half a bar
  to a bar; two bars only to close a chorus or the song. Notes held a bar or more: 9.7 → 2.7 a song (over a
  bar: 6.5 → 0.8).
- **Long notes move**, by chance (mood and energy pick):
  - bent away to the next step near its end (toward the next note)
  - started a step above (the accent's note) and bent down onto it
  - scooped up from a step below
  - falling off a step at the very end
  - sung again as new words on the same note
  - or simply held
  - Melancholic and dark fall off and start above; happy and triumphant scoop; angry and tense sing again;
    dreamy bends away. High energy scoops and sings again; low energy falls off and bends away.
- **Energy follows the song:** each section's energy level and tension, with the mood's lean (angry, tense,
  triumphant push; dreamy, melancholic hold back). Low: fewer words a beat, longer rests, small accents (a
  step, a dip, a fall). High: more words, shorter rests, bigger accents (a reach, a climb, a leap).
  Words a beat by section energy: low 0.66, mid 0.77, high 0.86 (before: 0.64 everywhere).
- **More rhythm patterns:** new beats: long-short (a dotted 8th and a 16th), short-long (a 16th and a
  dotted 8th), two quick ones on the offbeat, a 16th late. 2-4 more cells per genre, and 8 classic vocal
  rhythms any genre can use (a pickup into the beat, a call that breathes, long-short swing, a dotted push).
  The cell is picked to suit the energy.
- Still: about 80% of notes on the anchor; `npm run guide-check` passes (the guide line itself unchanged).

## Slow line, Breaths, Lead-ins with it (2026-10-15)
Paul: make these three switches work with the Anchor line. (The others still don't apply to it: Repeat idea,
Pitch by words, Question & answer, Section change, Carry over, Quick notes, Voice, Avoid clashes.)

- **Slow line:** each section's shape (by mood: verses falling, pre-choruses climbing, choruses arching...)
  moves where each 4-bar anchor sits, from the section's start to its end. Sections whose anchors go the
  way their shape does (first 4 bars vs last 4): 53% off → 93% on.
- **Breaths:**
  - before a big section (a chorus, or one sung higher) or after a tiring one: a silence of 1-4 beats
    before it (the last note cut short)
  - inside a section, after a tiring stretch (long, or high): the rest before the next phrase a beat or
    two longer
  - about 2 a song; time silent 30% → 31%
- **Lead-ins:** now and then (about a third of sections) the first note comes in early, an 8th, a beat or
  two before the section, held into it, with a beat's breath before it. Also after a section the line sits
  out. About 2 a song.
- Each has its own dice: switching one on doesn't reshuffle the rest. `npm run guide-check` checks each,
  and all three together with Hard & soft and a narrow range.

## Stronger, inside a section too (2026-10-15)
Paul: switching them on and off made no difference he could hear. They worked, but mostly where sections meet,
so a single 8-bar idea barely changed (and a lead-in before the song's very start couldn't be heard: fixed).
- **Slow line:** never "around one note" (the anchor already is): a clear shape instead (high then a drop;
  tense: a climb); the shape moves the anchors further (1.3 times), and each phrase's last note leans to it.
- **Breaths:** inside a section after a stretch of a bar or more (was 2.5 bars), a beat or two longer rest.
- **Lead-ins:** inside a section too: about a third of phrases come in early, the first note held into it
  (an 8th or a beat), or a quick pickup word an 8th before (a step below, or on the note).

| On vs off: songs where the line changes (notes changed) | Single idea | Track |
|---|---|---|
| Slow line | 98% (84%) | 100% (92%) |
| Breaths | 39% (3%) | 96% (3%) |
| Lead-ins | 74% (7%) | 100% (9%) |

Breaths only act where the line is tiring; many quiet verses already rest a lot.

## More rhythms, a Rhythm menu (2026-10-15)
Paul: the vocal rhythm too limited; more options.
- **New beats:** an 8th and two 16ths (gallop), two 16ths and an 8th, 16th-8th-16th (syncopated), four
  16ths (talky, rare), a 16th late then an 8th, the beat's last 16th pushed into the next (held on), a
  clipped word, three 8ths in a 6/8 beat.
- **More patterns:** 5-6 more per genre, 4 more shared.
- **Rhythm menu** (next to Anchor line): Auto (by genre: its own patterns, the shared ones, a little of the
  styles that suit it), or one style:
  | Style | What | Words a beat | Off the beat (8ths / 16ths) |
  |---|---|---|---|
  | Auto | by genre | 0.91 | 29% / 11% |
  | Straight | words on the beats | 0.97 | 29% / 1% |
  | Pushed | offbeats, notes ahead of the beat | 0.78 | 32% / 24% |
  | Busy | quick, talky | 1.29 | 33% / 14% |
  | Sparse | few words, held and late | 0.55 | 20% / 13% |
  | Bouncy | long-short, gallops | 1.18 | 22% / 27% |
  | Mixed | a bit of everything, like talking | 0.90 | 24% / 21% |
- **Variations:** a pattern repeated in a phrase now and then comes back with a beat or two changed
  (a near relation: a word split in two, a dotted one, pushed early).
- **Each kind of section its pace:** choruses busier, pre-choruses driving, verses a little sparer.
- Fast songs and quiet sections sing the 16ths plainer.
- Different bar rhythms a song (Auto): 15.7 → 17.6. `npm run guide-check` checks each style.

## Human feel
The Human feel switch works with it too (`docs/GUIDE-FEEL.md`).

## Next
- Paul listens per genre and mood.
- Maybe: the pattern changing with the section (a chorus busier), a pickup into a phrase, the anchor
  following the slow line.

## Hook, Less one-note, Best of several; controls grouped (2026-10-15)
Paul: make it sound like a real, human vocal melody. Three switches in the Anchor line's own group.

- **Hook:** each section's phrases in a form, by mood: A A B A, A B A B or A A B B (2-bar phrases; a second
  round ends anew). A letter's rhythm comes back on its block's main note (so a sequence when the note has
  moved); its accent comes back when it ends the same way (open or settled), else a new one: the answer. The
  chorus's first phrase is its hook, leaning to accents that reach up (and every chorus sings it).
- **Less one-note:** the words on the main note decorated: a weak word (off the beat) a step up (mostly) or
  down and back; the last word before the accent a step into it; a phrase now and then leaping in from a 3rd or
  4th away (more in choruses and pre-choruses); the strong last note now and then sung a step above first, a
  clash with the chord, settling down onto a chord note (melancholic, nostalgic, dreamy the most; angry the
  least). A phrase that comes back is decorated alike.
- **Best of several:** 8 lines written, the best scoring kept: strong notes and phrase ends on the chord, easy
  steps (no big jumps without a pause, no tritones), about half the bars repeating, not too many words on one
  note (nor too few), each section's top note once or twice and not at its start, choruses higher than verses,
  the song's top in a chorus. The notes say which try was kept and why. Off: the first try, as before.
- **Controls:** a Writer choice (Guide line / Anchor line); each writer's own settings in its own group, the
  other's hidden; the ones both use (Slow line, Breaths, Lead-ins, Hard & soft, Human feel) in a group of their own.

Measured (168 songs):
| | Off | Hook | Less one-note | Best | All three |
|---|---|---|---|---|---|
| Words on the 4 bars' main note | 80% | 78% | 65% | 80% | 65% |
| Bars repeating a bar before (rhythm) | 24% | 41% | 22% | 29% | 44% |
| Strong notes on the chord | 53% | 51% | 51% | 59% | 55% |
| Phrase ends on the chord | 60% | 56% | 57% | 71% | 66% |
| Song's top in a chorus (songs with one) | 89% | 89% | 90% | 99% | 99% |
| Words a beat | 0.79 | 0.78 | 0.80 | 0.79 | 0.80 |

## Song arc, Listen to band (2026-10-15)
Paul: the song-wide arc and listening to the band. Two more switches in the Anchor line's group.

- **Song arc:** choruses higher (a tenth of the voice's range), with fewer words (plainer rhythms, no extra
  words when the energy is up) and more long notes; verses lower and a little talkier. The song's highest note
  saved for the last chorus, sung once: a long accent there (past its first third, the later the better) raised
  up to 3 scale steps above everything else, within the range and no leap over a 6th; held a beat longer into
  the rest after it; any note elsewhere as high brought a step under it.
- **Listen to band** (like the singer's `fit.ts`): phrase ends land on a drum hit (kick or snare), moved up to a
  beat if not (keeping a chord note a chord note); on the kick, now and then moved on to the snare a beat away (a
  backbeat landing). When the band pushes a chord change an 8th or 16th early (kick or bass on it), the note on
  the beat comes in with it. Under the drums' fills and Guitar 2's licks (when Guitar 2 plays half the section
  or less: licks, not a part) no new words: the note before held on.

Measured (168 songs):
| | Off | Arc | Band | Arc, band, best |
|---|---|---|---|---|
| Song's top in the last chorus only | 13% | 98% | 13% | 99% |
| Song's top sung once | 21% | 98% | 21% | 99% |
| Verse: average pitch / words a beat | 57.5 / 0.74 | 55.5 / 0.81 | 57.5 / 0.72 | 55.6 / 0.79 |
| Chorus: average pitch / words a beat | 65.7 / 0.84 | 69.5 / 0.72 | 65.7 / 0.78 | 69.6 / 0.67 |
| Chorus: long notes (half a bar or more) | 10% | 13% | 12% | 16% |
| Phrase ends on a drum hit (on the snare) | 76% (19%) | 74% (20%) | 86% (28%) | 86% (29%) |

## Patterns (2026-10-16)
The Guide card's Patterns switch, on the Anchor line: rhythm cells mostly from real songs (notes held over the bar line too), half the accents a common real shape, runs of words on the main note a real shape now and then, all leaning to what the Anchor line lacks. Details and numbers: `docs/PATTERNS.md`.
