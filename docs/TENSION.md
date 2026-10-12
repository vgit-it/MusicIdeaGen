# Tension and release (2026-10-12)

Paul: solos and whole songs don't tell much of a story. Could a song be built on tension and release
(not tension as a negative: any mood), tuned by the song's mood (a melancholic song rising less, or
more slowly)? Decided: a visible Mood choice with Auto; research first, then phase 1.

Tags: [M] measured in a study; [P] what producers and teachers agree on; [R] a rule of thumb turned
into a number. ✓ = built (phase 1), · = later.

## 1. What makes music feel tense
- [M] Listeners' moment-to-moment tension is predicted by loudness (strongest), how busy it is (notes
  per beat), how unstable the harmony is, how high the notes are, and roughness (Farbood 2012;
  Barchet et al. 2024, about 35-40% of the variance from audio alone; the rest is expectation).
- [M] Tension follows the *direction* of change more than the level: a steady crescendo or a
  thickening texture reads as rising tension; a single crash reads as an accent (Farbood's "trend
  salience").
- [M] Two speeds: loudness, density and register are felt over 1-4 s; harmony over about 20 s (about
  8 bars) (Farbood and Upham 2013). So harmony is planned per section, dynamics per bar.
- [M] Loud and low reads as threat (Granot and Eitan 2011): dark and angry moods.
- [M] Ratings lag the music by 1-3 s: a build starts a bar or two before the arrival.
- [theory/M] Release is a prediction coming true: several things resolving together on a strong
  downbeat (home chord, crash, full band). A brief upset first (a stop, a beat of silence, an
  unexpected chord) makes the arrival feel better (Huron 2006). The strongest response is at the
  arrival, not the top of the build (Solberg and Dibben 2019, EDM drops).

## 2. Song-scale arcs
- [M] Choruses are louder and wider than verses in nearly every pop song; later choruses higher than
  the first; but the last chorus is the single peak in only about a third (bridges, solos and outros
  peak too).
- [P/R] The climax usually sits around 65-85% of the song. Each repeat of a section a little higher.
- [P] Shapes: waves (pop/rock), a single long climb (slow burn, epic), a plateau (punk, metal, funk),
  quiet/loud contrast (grunge), an arch (ballads, melancholic).
- [P] Keep 3-6 dB between sections; a breakdown 6-10 dB down; a build adds a layer every 2-4 bars and
  goes stale after 15-20 s without something new.
- [M] Key changes in the last chorus: about 25% of No. 1s in the 60s-90s, almost none since: rare.

## 3. Mood
- [M] Mode, tempo, register, loudness, articulation and timbre carry emotion, in that order (Eerola
  et al. 2013); happy: fast, loud, bright, major; sad: slow, soft, dull, minor, low; angry: fast,
  loud, harsh, dissonant; calm: slow, soft, consonant (Juslin and Laukka 2003).
- [R] Arc settings per mood (`src/tension.ts`, `PROFILES`):

| Mood | Calm parts | Climax | Rises | Releases | Shape | Outro |
|---|---|---|---|---|---|---|
| Happy | 0.40 | 0.88 | each chorus | deep dip before the last chorus | waves | holds |
| Melancholic | 0.22 | 0.62 | slowly | soft | arch | fades |
| Nostalgic | 0.30 | 0.72 | slowly | gentle | waves | fades |
| Tense | 0.50 | 0.84 | in many small builds | never quite settles | restless | holds |
| Angry | 0.62 | 1.00 | fast | by impact (stops, then the band slams back) | plateau | holds |
| Dreamy | 0.15 | 0.48 | barely | no hard arrivals | flat | fades |
| Triumphant | 0.35 | 1.00 | one long climb | deep, everything at once | climb | holds |
| Dark | 0.38 | 0.78 | slowly | falls back low | waves | fades |

- Auto picks a mood from the genre, the key (major or minor) and the tempo (slow songs lean
  melancholic, dreamy, dark; fast ones angry, happy, tense), from the idea's own seed, so rerolling the
  structure keeps the mood.

## 4. Phase 1 (built)
- ✓ Mood menu (Auto shows what it chose), saved in share links.
- ✓ One tension curve for the whole song, bar by bar (`planTension`): each kind of section has a
  level, each repeat a little higher, the bridge before the last chorus drops (deeper in deep-release
  moods), the mood's shape on top, scaled into the mood's range, one climax (the last chorus).
- ✓ Inside each section: a verse edging up, a pre-chorus building, a chorus holding, a bridge dropping
  then rebuilding over its last bars, a solo building to its peak, an outro holding or fading, a long
  intro building up; a small rise across each four-bar phrase.
- ✓ The curve sets each section's energy (so the drums, bass, strumming and layers follow it; intros
  keep their staging, choruses move one step at most, other sections two).
- ✓ The mix follows the curve bar by bar (the mood sets the range: 4 dB dreamy to 8 dB triumphant),
  and everyone plays harder as it rises inside a section (crescendos into choruses, a fading outro).
  MIDI export follows (expression per bar, velocities).
- ✓ The mood leans the structure: quiet verses and bridges (melancholic, dreamy), the last-chorus key
  change (triumphant, happy; never melancholic, dark, tense, angry, dreamy), stops before choruses
  (angry, tense more; dreamy rarely).
- ✓ The tension line over the section strip, with the mood and the climax; the section playing is
  shaded.

## 5. Later
- · Phase 2: harmony and melody follow the curve (the dominant held before a chorus, the home chord
  delayed, borrowed chords by mood, the lead's register), the solo placed as the peak or the release
  after it, other climaxes (a bridge that climbs, an outro solo), mood leaning tempo and key.
- · Phase 3: drag the curve to reshape the song, a mood per section, a tension meter that measures
  what was generated against the plan.
