# Rhythm guitar: research notes and how it's built (2026-10-12)

Paul: approach the rhythm guitar like the solos: research an exhaustive set of techniques and adapt
them so the generator stays novel without sounding mechanical.

Gathered from guitar teaching sites, producer advice, sample-library manuals and groove research.
Tags: [M] measured in research; [P] what teachers agree on; [R] a rule of thumb turned into a
number (a tunable default). ✓ = built (where), · = not yet.

## 1. The strumming hand
- [P] The hand never stops: down on the beats and 8ths, up on the 16ths in between; a rest is the
  hand passing without touching the strings. In 8th feel, downs on the beats and ups on the "and". ✓
  (`naturalStrokes`, strum.ts: also, where the hand moves in 16ths, its 8ths are downs again)
- [P] Downpicking: punk and AC/DC play 8ths all down (up to ~200 BPM). ✓ (punk always, the rock
  player half the time: "all downstrokes")
- [P/R] Downs hit 4-6 strings from the chord's lowest; ups the top 2-4 (3 half the time). A soft
  strum can miss the top string; a hard one hits everything. ✓ (instruments.ts)
- [M/R] Spread across the strings: ~8-12 ms between neighbours; a hard strum is a quick one (sample
  libraries shorten the strum as velocity rises). ✓ (instruments.ts: the gap shrinks with loudness)
- [P/R] A down-strum starts a little early so the middle of the chord lands on the beat. ✓
- [R] Loudness: downbeat strongest, other beats next, "and" downs, then ups; accents +15%. ✓
  (`playRhythm`, players/rhythm.ts, below)
- [P] Muted scratches: the fretting hand relaxes, a pitchless click; the hand keeps moving after
  one. ✓ (already: ghost scrapes after a scratch)
- [P] Chucks on 2 and 4: a damped backbeat chop. ✓ (strum development: a backbeat strum choked)
- [P] Chord changes: the last strum before a change often hits open strings. ✓ (already: hands.ts)
- [P/R] Pushes: the change lands an 8th early and ties over the bar line (pop/rock 25-35%). ✓
  (already: cohesion.ts)
- [P/R] Palm mutes on the power chord, short and dark. ✓ (an electric's palm mutes now chug on the
  power chord, not the low strings of an open shape)

## 2. Pattern vocabulary
Library per genre (strum.ts). ✓ Added: rock "stabs and space" (Malcolm Young), "the old faithful";
pop "island strum", "tresillo on 16ths" (3-3-2), "folk 16ths"; funk "chucking 16ths" (Nile Rodgers),
"chicken scratch" (Jimmy Nolen).
- [P] Funk: the hand never stops in 16ths, most of it muted, a few strums ringing; small voicings. ✓
- [P] Tresillo: accents on 16ths 1, 4, 7 / 9, 12, 15 over a steady hand. ✓ (pattern, and an accent
  layer)
- · Reggae / ska skank (no reggae genre yet).
- Riff genres (metal gallops, chugs, breakdowns, djent cycles, drop D, grunge loud-quiet) are
  already written as riffs (riff.ts, figures.ts); not changed here.

## 3. Voicings
- [P] Real guitar shapes, not piano voicings: open chords, then E/A barres. ✓ (already)
- [P] Power chords for rock and metal. ✓ (rock player: power chords in the verses; under a solo)
- [P] Funk and pop: small triads on the top three strings, up the neck. ✓ (funk player everywhere;
  strummer and indie players sometimes in the verses)
- [P/R] sus4 / sus2 / add9 put on a held chord and taken off again (D-Dsus4-D), on a weak beat, at
  most one per held chord; don't overdo it. ✓ (`colourVoicing`, theory/guitar.ts)
- · Capo for pop/folk keys; inversions moving up the neck; open-string drones; octave shapes.

## 4. Variation over time
- [R] The pattern stays about three bars in four; bars 2-3 of a four-bar phrase change a stroke or
  two (an up added or left out, a backbeat choked, a strum moved a 16th); bar 4 turns the phrase
  around (16ths through the last beat, quarter notes, a hit and a choke, or an 8th leading over). ✓
  (`developStrum`, strum.ts)
- [P/R] Density follows the song: verses plainer, choruses fuller, the last chorus hardest. ✓
  (already: energy shaping in track.ts, the guitarists' pass)
- [P/R] Pre-chorus builds (+10-20% across it). ✓ (loudness ramps 0.88 to 1.1)
- [P] Stops and hits with the band; the guitar holds while the drums fill. ✓ (already: cohesion.ts,
  track transitions)

## 5. Picking instead of strumming
- [P] Quiet sections picked: broken chords, a rolling pattern, Travis picking (the thumb alternating
  two bass notes on the beats, the fingers between), ringing 8ths on the top strings (The Edge, here
  without the delay). ✓ (`arpeggios`, rhythm.ts: quiet verses, bridges and breakdowns, by player; a
  breath at the end of each phrase; on the clean channel)
- [P] Between chords: a bass walk into the next chord, a pentatonic lick, a double-stop hammer-on
  (Hendrix, Malcolm Young). ✓ (`lick`, rhythm.ts: at the end of a four-bar phrase, only where the
  lead and the drums leave room)
- · Delay on the ringing arpeggios (a dotted 8th).

## 6. Feel
- [M] Groove lives in small timing offsets (10-40 ms); tight but not zero is best; big offsets
  lower groove ratings (Kilchenmann & Senn 2015, Senn et al. 2016). ✓ (already: the band's feel)
- [M] 16th swing in early funk, 52-60% (Ainsworth). ✓ (already: the band's lilt)
- [R] Loudness varies stroke to stroke (±3-8% by player). ✓
- · Slow drift in timing (Räsänen & Hennig 2015: a 2-bar pattern in a drummer's micro-timing).

## 7. The band
- [P] Lock to the kick and snare: accents where the kick lands. ✓ (the "kick" accent layer)
- [R] Make room for the singer and the lead: plainer and lighter under the lead's answers. ✓
- [R] Under a solo: the core pattern, power chords, softer, no colours or licks. ✓
- [R] No lick where the drums fill. ✓

## The players (`src/players/rhythm.ts`)
One per track, picked with the band (an idea uses its default band's player).
| Player | Accents | Voicing | Quiet parts | Between chords | Mostly in |
|---|---|---|---|---|---|
| Strummer | backbeat, 3-3-2 or kick | open; sus/add9 often | sometimes picked (broken, Travis, rolling) | a bass walk | rock, pop |
| Rocker | downbeat or kick; downstrokes half the time | power chords in the verses | rarely picked | pentatonic licks, double-stops | rock |
| Punk | even; all downstrokes | power chords in the verses | strummed | none | rock |
| Funky | kick or 3-3-2, strong | small triads up the neck | strummed | the odd double-stop | funk, pop |
| Indie | backbeat, downbeat or even | triads in the verses; sus/add9 | mostly picked (ringing, broken, rolling) | double-stops | rock, pop |

Sources (search summaries): guitarworld.com (pendulum strumming, gallops, Bob Marley rhythm, Little
Wing), premierguitar.com (strumming patterns, funk, Malcolm Young, Hendrix rhythm, Travis picking,
The Edge, doubling), justinguitar.com (pushes, open strings between changes), yourguitaracademy.com
(16th strumming, ghost notes), andyguitar.co.uk (tresillo), riffhard.com (breakdowns, djent),
amplesound.net and Shreddage / RealGuitar manuals (strum direction, velocity, mute layers),
Ainsworth (microtiming in early funk), Kilchenmann & Senn 2015, Senn et al. 2016, Butterfield,
Danielsen et al. 2015, Räsänen & Hennig 2015.
