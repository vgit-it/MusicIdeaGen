# Vocal tune: the vocal's own tune in the Guide card

A third choice in the Guide card's **Writer** menu: Guide line / Anchor line / **Vocal tune**. Paul: the vocal row's new writers (PR #103: Melody Learned, Real songs pacing for Rhythm Words, real verse vs chorus) should reach the Guide card's sound, without risking the Guide and Anchor writers.

## What it is
- It writes nothing new. It takes the main vocal's lead tune and words, note for note (no harmonies, oohs or ad-libs).
- **Follows the vocal row**: Rhythm, Melody (Classic / Shaped / Melody first / Learned), Moves, Energy, Real songs, Patterns. Change them there; the card follows.
- Mute the vocal in the vocal row to hear this one alone (otherwise both sing the same tune).
- Code: `src/guide/tune.ts` (`writeTune`, `tuneWords`). The Guide line and Anchor line code is untouched.

## What works on it (Guide card)
| Setting | What it does here |
|---|---|
| Sing | The vocal's tune sung in any of the card's voices |
| Words | **Vocal's** (default: the vocal's own words and lines) or **New** (written onto the tune, as for the other writers) |
| Human feel | Glides, scoops, swells, fades, falls, vibrato, breaths (synth and Sing) |
| Hard & soft | Louder with tension and section, belted top notes |
| Breaths | A pause before a big section (a chorus, or one sung higher), and after a tiring stretch at a word's end |
| Lead-ins | Now and then a section's first word comes in early, held into it |
| Carry over | Now and then the last note runs on into a section the tune sits out (a solo), held or bent a step, for 2-3 bars, fading out as it goes |
| Bends | Off (default), **Some**: a syllable sung over two notes a step or two apart glides between them, and the vocal's own scoops into notes and falls off their ends are heard. **More**: also, now and then, a note held a beat or more slides a step or two into the next word (at most one every 2 bars; more at phrase ends, in slow songs, in grunge and rock) |
| Range | Auto: as the vocal sings it. Custom: the whole tune moved by octaves to sit in the sliders (never re-written) |
| Volume, MIDI | As for the other writers |
| Reroll | A new vocal, as the vocal's reroll in Keep / reroll (the card follows it) |

Hidden for Vocal tune (they write a tune, and the vocal row does that): Chords lean, Key, Scale, Avoid clashes, Slow line, the card's Real songs and Patterns (the vocal row has its own), quick notes and the Guide and Anchor lines' own settings.

## Bends: how many (24 songs, per 4 sung bars)
| | Glides in a word | Slides into the next word | The vocal's scoops | The vocal's falls |
|---|---|---|---|---|
| Some | 0.56 | 0 | 0.73 | 0.25 |
| More | 0.56 | 0.36 (funk 0.18 … grunge 0.50) | 0.71 | 0.25 |

- Bends are never wider than a whole step (what MIDI's pitch bend carries) and always from the note just before.
- With New words, a slide into the next word still starts a new word; a glide inside a word carries it on.

## Defaults (Paul)
- The card opens on the Vocal tune, with New words, Human feel on and Sing on (Auto: the song's own voice).
- The card's Play plays from the song's start (a track: from its first section); pressed while playing, it stops.

## Also changed
- The card's synth and singer now play notes that start between 16ths (the vocal's triplets and quick runs). The Guide and Anchor lines only use whole steps, so nothing changes for them.
- Carry over moved into the "All writers" group (hidden for the Anchor line, which doesn't use it).

## Checked
- `npm run guide-check`: the 168 songs still match the reference note for note (Guide and Anchor lines unchanged).
- New in it: the Vocal tune on 672 songs (4 setups, the vocal writers taken in turn, including Learned, Words, Real songs and Patterns): switches off, exactly the vocal's notes, rhythm and words; switches on, the same pitches and words, no two notes at once, the words on the tune; Range only moves by whole octaves.
- Types and build pass; browser smoke test (idea and track, every switch, Sing), no page errors.

## Later, if it sounds good
- The vocal's own slides and fall-offs passed on to Human feel (now Human feel adds its own).
- Real songs for the Guide line's chorus heights (option A in the scope).
