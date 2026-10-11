# How good solos are built (research notes, 2026-10-11)

The rules the solo generator (`generateSolo`, `src/parts/guitar2.ts`) and the drummer's solo playing
(`src/players/drummer.ts`) follow. Gathered from guitar teaching sites, solo analyses (Gilmour, Slash,
Hendrix, Hammett, Cobain) and melody research. [M] = measured in research; [P] = what teachers agree
on; [R] = a rule of thumb turned into a number (a tunable default).

## 1. The arc
- Theme, build, peak, release; don't play the best idea early [P]. The peak is the highest note of
  the solo, not heard before it.
- Peak at 0.65-0.8 of the length [R]: bar 6 of 8, bars 11-13 of 16. After it: release.
- Register, around the solo root R (the key's root near E4-A4) [R]: opening R-5..R+7, middle R..R+12,
  peak R+12..R+19, last phrase back to R-5..R+7. The ceiling rises phrase by phrase.
- Notes per bar [R]: opening 3-6, build 6-10, peak 10-16 (metal 16+), release 2-5. Blues / melodic
  ×0.6, grunge ×0.7, metal ×1.5. Silence: blues 35-50%, rock 25-35%, metal 10-20%, mostly early.
- Openings [P]: a pickup, one bold bent note held 1-2 beats (Gilmour), or the vocal/hook melody
  (grunge: Cobain's Teen Spirit solo restates the vocal melody).
- Ending [P/R]: land on the root (or 5th) of the last chord, on beat 1 of the last bar (or an 8th
  early), held 2-4 beats with vibrato; leave the last beat or two for the drum fill.

## 2. Phrasing
- Phrases of 1-2 bars, built from 2-4 note cells (jazz corpus: ~2.4 notes per cell [M]); 2-4 bars of
  continuous playing only at the peak [R].
- Gaps between phrases: 2+ beats early, 1-2 in the build, almost none at the peak, 2+ in the release [R].
- Start on the downbeat only 30-40% of the time; end on a strong beat [R].
- Call and response [P]: the call ends on the 3rd, 5th or b7 (open), the answer on the root (closed).
- Motifs: 1-2 in 8 bars; 50-65% of phrases repeat or vary an earlier one [R]: exact, a step up,
  displaced by an 8th or a beat, cut to its first half. Into the peak: a short motif 2-3 times rising,
  then break out to the peak note [R].

## 3. Note choice
- Minor: minor pentatonic (+ b5 for blues); major: major pentatonic or mixed; metal: natural minor
  or Phrygian [P].
- Chord tones on beat 1 and at chord changes (~80%), beat 3 ~60%, off-beats free [P/R]. A phrase's
  last note is always a chord tone. Impro-Visor (a jazz solo generator) never plays notes outside
  chord tones, colour tones and approaches [M].
- Approach a target from a semitone below or a scale step above [P]. Don't hold: the b5, the 4th over
  a major chord, a semitone above a chord tone [R]. The b3 over a major chord curls up toward the 3rd [P].

## 4. Contour
- Melodies move mostly by step [M] (Vos & Troost 1989; Huron 2006): ~70% steps, ~15% repeats and
  3rds, ~10-15% leaps, at most an octave [R].
- Small intervals tend down, leaps tend up [M]; after a leap the line turns back (Von Hippel & Huron
  2000) [M]: after a leap, step the other way (~80%) [R].
- The arch (rise then fall) is the most common phrase shape (Huron 1996, 6,251 folk melodies) [M]:
  ~50% arches, 25% falling, 15% rising (more in the build), 10% level [R]. No aimless zigzag.

## 5. Rhythm
- Rhythm first, then pitch [P]. Mix of 8ths, 16ths, quarters and held notes [R].
- The core shape: a long note, a quick run, a long note on a strong beat [P]. At least 1 phrase in 3
  ends on a note of a beat or more [R]. ~60% of phrases reuse an earlier phrase's rhythm [R].

## 6. Guitar expression
- Bends [P]: 4→5, b7→1, b3→4 (whole step), the b3 curl (half step); the bend lands on a chord tone.
- Vibrato on notes of a beat or more; slides into ~20% of phrase starts [R].
- Style [P]: Gilmour: sparse, slow wide bends, lots of space. Slash: pentatonic, lyrical then builds.
  Hammett: fast pentatonic 16ths broken by wide bends, Phrygian colour. Cobain: the vocal melody,
  loose bends, noise rather than notes.

## 7. The drummer under a solo
- Hi-hat to the ride from bar 1; kick + crash on beat 1 of the solo and of every 4-bar phrase [P/R].
- Build across the solo (+10-20% up to the peak, then ease off ~10%) [R].
- A short fill at the end of each 4-bar phrase; a longer fill in the bar before the peak, landing a
  crash on the peak; a final fill into the next section [R].
- Catch the guitar: kick + crash on its long held notes and on the peak note, at most once per 2 bars [R].
- Stay out of the way: simple kick and snare, no ghost-note busyness; no extra fills where the guitar
  is busy (8+ notes a bar) [R].

Sources (seen as search summaries; full pages couldn't be opened from here): musictheoryforguitar.com
(build-guitar-solo), londonguitaracademy.com (guitar-solos), fretjam.com (string bending, blues scales),
premierguitar.com (melodic soloing, double-stops), guitarworld.com (Gilmour soloing strategies),
licklibrary.com (November Rain, Teen Spirit solo), loudersound.com (Hammett solos), Von Hippel & Huron
2000, Vos & Troost 1989, Patel 2007, Huron 1996, Frieler (Weimar Jazz Database), Impro-Visor (Keller),
drumeo.com and bandstofans.com (drumming under a guitar solo).
