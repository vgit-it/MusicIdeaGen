# The demo singer (2026-10-12)

Paul: could there be a vocalist who sings in pseudo-English: no real words, but it sounds like English,
with vowels that suit the melody? Decided: a "demo singer" first (a charming synthesized voice), then
see. Real-voice options for later: Paul records a small set of syllables (stitched like a small
Vocaloid), or an AI singing voice.

Tags: [M] measured / corpus study; [P] what songwriters and producers agree on; [R] a rule of thumb
turned into a number. ✓ = built, · = later.

## 1. The melody (`src/parts/vocal.ts`)
- [P] Lines of two bars: sung from the top of the first bar (or a pickup an 8th or two before it) to
  a held note in the second, then a breath of a beat or two where the band fills in. ✓
- [P/M] One syllable per note (rock melisma is rare). Verses busier (about 6-10 syllables a bar),
  choruses longer notes (4-7) [M: choruses have fewer, longer notes and bigger intervals]. ✓
- [P] Verses low and narrow, reciting around one note with neighbours, falling at line ends;
  pre-choruses climb line by line; choruses 3-5 semitones higher, arching to a peak; bridges move
  away (higher). ✓
- [P] Verse lines 1 and 3 share their tune (A A'); every verse sings the verse tune with new words;
  every chorus the same tune and the same words; the chorus hook opens lines 1 and 3. ✓
- [M] Mostly repeated notes and steps, the odd third, rare leaps; strong beats on chord notes more in
  choruses than verses (rock's "loose verse, tight chorus", Temperley's melodic-harmonic divorce);
  verses pentatonic. Rock's anticipations: a held note landing an 8th early about a quarter of the
  time. ✓
- [P] The song's highest note saved for the climax (its last held note lifted). ✓
- Room for the band: a held note stops where Guitar 2's answer starts; Guitar 2 steps back 3 dB where
  the singer sings. ✓
- The low voice's range: C3 to E4, the climax up to A4; a high voice sings an octave up. ✓
- Sung: verses, pre-choruses, choruses, bridges, the first half of the outro (the chorus hook). Not
  sung: intros, interludes, solos, breakdowns. ✓
- Genres: grunge lower and narrower, funk busier, metal and hard rock a little higher, pop wider. ✓
- Ad-libs, harmonies and doubling: section 5. How the tune is shaped by mood and genre: section 6. ✓

## 2. The words (`src/parts/lyrics.ts`)
What makes nonsense sound English (rather than Italian or Icelandic):
- [M/P] Closed syllables: most English syllables end in a consonant (n, t, d, s, nd, st...). ✓
- [M] English clusters only (bl, br, str, sp... / -nd, -nt, -st, -ld...), by how often English uses them. ✓
- [M] Stressed syllables on strong beats; weak notes get light syllables (the, a, in, my, to) or the
  weak half of a strong-weak word (BA-by, NE-ver, MO-ving); mostly one-syllable words. ✓
- [P] A rhyme at the end of every second line; the chorus hook word for word; fillers (yeah, oh, whoa)
  available. ✓ (fillers not yet placed)
- [M/P] Vowels for singing: open vowels (ah, eye, oh, ay) on long and high notes; closed ee and oo
  opened up (to ay, oh) there. ✓
- [M, weak] Mood leans the sounds: bright ee/ay/eye when happy, oh/oo/ow when melancholic or dark,
  harder consonants and clusters when angry, soft l/m/n/w when dreamy. ✓
- A list of words that must never come out. ✓
- Spelled for the lyric lane and the notes (e.g. "vorn int layky the eye caw a ly").

## 3. The voice (`src/audio/sing.ts`, `src/audio/singer.ts`)
- A Klatt formant synthesizer ([klatt-syn](https://github.com/chdh/klatt-syn), MIT) driven frame by frame
  (4 ms): a natural glottal pulse with the synth's slow flutter, five formants. ✓
- [M] Sung vowel formants (Peterson & Barney, Hillenbrand, Csound tenor/alto tables), front vowels a
  little darker for singing; a high voice's formants about 17% up; F1 never under the pitch (on high
  notes singers raise it to the pitch). ✓
- [P] Diphthongs held on their first vowel, gliding to the second over the last quarter. ✓
- [P/M] Consonants placed as singers do: onsets before the beat so the vowel lands on it, codas at the
  end of the note; stops (closure, burst shaped by place, aspiration for p t k), fricatives (s 12 dB
  under the vowel, sh 14, f and th quieter), nasals (murmur with the nasal zero: m 750 Hz, n 1450, ng
  2600), l r w y as formant targets (r's low F3), formant transitions into the vowel. ✓
- [P] Pitch: glides between legato notes, a scoop into some lines, vibrato on notes over 0.45 s (5-6
  Hz, growing in after 0.3 s), a fall off the end of some lines (more for grunge and rock); loud notes
  brighter, soft ones breathier; a breath of air as a line ends. ✓
- Each line is rendered ahead into a buffer (about 100-400x faster than real time), started a little
  before its first note, so it plays the same live, in exports and on phones; through a vocal chain
  (rumble cut, a little presence, gentle compression, the room and a touch of echo). ✓
- Mix: the vocal stem about 5 dB under the whole mix (a lead vocal level). ✓

## 4. In the app
- Parts: "Vocal (demo)": Auto (the song's own voice: low for the heavier genres, either for pop),
  Low voice, High voice, Off; volume, mute, solo. Kept in share links. ✓
- Keep/reroll: "Vocal" rerolls the melody and words. ✓
- Lanes: a Vocal lane (o = a note, - = held) and a Words lane; each section's words in its notes. ✓
- Exports: a vocal stem; MIDI gets a Vocal track (GM Voice Oohs) with the words as lyric events (on
  the song's first track, where @tonejs/midi writes them). ✓

## 5. Backing vocals and ad-libs (`src/parts/backing.ts`, 2026-10-12)
Paul: ad-libs and harmonies next; vocals off by default.
- [P] Choruses (and the outro) double-tracked: the lead sung a second time, a second take (another
  vocal-tract length and vibrato rate), 17 ms late, panned right, 6 dB down. ✓
- [P] Harmonies by the song's mood and style: a third above (happy, triumphant, nostalgic: pop and
  rock's bright stack), a lower harmony a fourth to a fifth under (dark, angry, tense; metal, alt metal,
  grunge), soft "ooh"/"aah" pads holding a chord note each chord (melancholic, dreamy: also under
  pre-choruses, bridges and some second verses), or a gang singing the hook in unison (funk). Harmony
  notes are the nearest chord note a third/fourth above (or fourth/fifth below), else the diatonic one. ✓
- [P] They grow through the song: the first chorus harmonises its hook lines, later choruses, the
  climax and the outro every line; calm sections only get the soft pads. ✓
- [P/R] Ad-libs over the climax and the outro (research: last chorus, 1-3 short "oh/yeah/whoa" in the
  gaps between lines, 3-7 semitones above the melody; melisma only here): "yeah" held up high, an "oh"
  run falling down the pentatonic on one vowel, a "whoa-oh"; and a long high "oh" over the climax's last
  held note. ✓
- Panned around the lead (harmony left, double right, ad-libs a little right, oohs left and soft),
  each with its own take; all in the vocal stem. MIDI: a "Backing vocals" track (Choir Aahs). Lanes: a
  Backs lane (h harmony, g gang, o ooh, a ad-lib). ✓
- The singer is off until you turn it on (Parts: Vocal (demo)); a link remembers it when it's on. ✓

## 6. How the tunes are written, by mood and genre (`src/parts/melody.ts`, 2026-10-12)
Paul: research how vocal melodies are written; build a system that writes them by mood and genre, with
a bit of chance to keep it fresh. Each song now gets a **melody style** (its mood's ways, leaned by its
genre, jittered a little, and about a third of the time a twist); the notes say which.

What the research says, and what's built:
- [P] Melodies are built from motifs, not note by note: a short idea, repeated, varied, answered.
  Hooks repeat word for word; motifs develop (repeat, sequence a step higher, a new ending). A song
  uses only a few melodic parts, recycled (pop's "melodic math"). Built: a line is a motif (bar 1) and
  its answer (bar 2); lines follow a form, e.g. verse A A' B A, chorus A B A B (a letter that comes
  back sings the same rhythm and shape, a primed one the same start with a new ending). ✓
- [P] Pre-choruses: energy gain by fragmenting the motif and climbing (Summach; Open Music Theory).
  Built: the same line a step or two higher each time, the last one breaking off busier. ✓
- [P] Contrast between verse and chorus in several dimensions at once: range (choruses higher, verses
  low and comfortable, so there's room to climb), note lengths (verses quicker, choruses longer), and
  where phrases start (Pattison: on the downbeat feels solid; after it, back-heavy and restless;
  some writers start verses after the beat and choruses right on it). Built: per style, the chorus
  lift (2 semitones to about an octave), busy-ness per section, and verse / chorus start (on, after, or a pickup). ✓
- [M] Phrase contours: arch shapes are the most common, then rising, then falling; phrases settle at
  the start and fall at the end (Huron's Essen study; folk corpora). Built: a contour per kind of
  section (recite, arch, rise to a late peak, fall, valley, climb, wave), picked by mood. ✓
- [M] Expectation: after a leap, a step back the other way (gap-fill, post-skip reversal); mostly
  steps and repeated notes. Built. ✓
- [P] Question and answer: lines that end open (on the 3rd or 5th) and lines that come home (the root).
  Built: settled moods close every second line, open moods only the last one. ✓
- [M] Emotion and melody (Gabrielsson & Lindström; Juslin & Laukka; Huron & Davis): happy = higher, wider,
  rising, leaps; sad = lower, narrower, steps, falling, joined, small intervals; anger = angular, rising,
  short accented notes, unstable notes; tenderness = falling, steps, stable notes. Built per mood:

  | Mood | Verses / choruses | Lift | Leaps | Repeats | Feel |
  |---|---|---|---|---|---|
  | Happy | waves / arches, open endings | 4-7 | some | few | on the beat, bouncy |
  | Triumphant | climbs / rises to a late peak | 5-8 | most | few | a 4th or 5th opening the hook |
  | Nostalgic | arches, falling home | 3-6 | a 6th now and then | few | sighs, pickups |
  | Melancholic | falls / arches or falls | 2-5 | rare | some | low, joined, sighs and turns |
  | Dreamy | waves, open | 3-6 | wide, gentle (5ths) | few | sparse, after the beat, turns |
  | Tense | recites / climbs | 2-5 | rare | many | narrow, unstable notes, detached, off-beat |
  | Angry | recites / rises | 4-7 | angular | many | short, hard, on the beat |
  | Dark | recites or falls / valleys | 2-5 | rare | many | low, a flat 2nd |

- [M] Appoggiaturas (a held note sung a step above first, falling into the chord note) are the
  device most tied to "tears" in sad songs (Sloboda). Built: "sighs" on held notes (melancholic,
  nostalgic, dark most), and short turns on one vowel at line ends (pop's melisma: dreamy, melancholic,
  pop). Sung on one syllable, the word's closing consonant at the end. ✓
- [M] Rock's melodic language: pentatonic, many songs major in the chords but minor in the melody
  (Temperley & de Clercq). Built: blue notes (a flat 3rd or 7th in passing) in rock, hard rock, funk,
  grunge; a dark flat 2nd neighbour in minor keys (metal, alt metal, dark and tense moods). ✓
- Genres lean it all: pop wider, a bigger lift, some melisma; funk busy, detached, syncopated and
  chanted; hard rock and metal higher with longer notes (metal none of the turns); grunge low and
  narrow with a big jump to the chorus. ✓
- Twists (about a third of songs, picked to suit the mood and genre): quiet low verses then a chorus
  that jumps way up; verses chanted on nearly one note; a hook opening with a big leap (a 6th or an
  octave); chorus lines that call high and answer low; every line after the beat; a chorus of long held
  notes; rapid-fire verses. ✓
- The Vocal reroll rerolls the style too (a new form, contour, lift, maybe a twist) within the mood
  and genre.

### Following the tension curve (2026-10-12)
Paul: next step. [P] Producers and vocal coaches: the same chorus is sung with more each time (the
last one reaching higher, held notes pushed, a run where it peaks), and quieter, settled lines as the
song lets go; the tune stays recognisable (word for word, same shape). Built (`followTension`):
- Each sung line is compared with the tension where its tune was first sung (the first verse, the first
  chorus). Above it, its held notes and top note reach up to the next chord note (up to a 4th); at a big
  lift its last held note turns (up a step and back, on one vowel). Below it, held notes settle to the
  chord note under them. Line by line, so a build inside a section climbs too. ✓
- How much by mood: triumphant and angry push hardest, then tense and happy; melancholic and dreamy
  barely move. The song's top notes stay kept for the climax. ✓
- Every note louder (and so brighter) with its bar's tension. ✓
- The notes say it: "Vocal follows the tension: reaching up (notes moved 5 up, a turn)". ✓

## 7. The singer listens to the band (`src/parts/fit.ts`, 2026-10-12)
Paul: the vocal sounds human but doesn't suit the band. Measured on 140 songs: the tune only knew the
key and chords, never the bass, drums or guitars. Over borrowed chords (mood chords) it rubbed a semitone
against the chord 21-46% of the time; 20-33% of held notes ran into a chord they didn't fit; it clashed
with the bass about 6% of the time. Built:
- [P] Every chord brings its own notes: over a borrowed chord the voice sings that chord's scale. ✓
- [P] No semitone or tritone against the bass under a note (unless the voice is on a chord note). ✓
- [P] Held notes land with chord changes where one is near; a held note running into a new chord moves
  to a note both share, or slides on its vowel to the new chord's note as it changes. ✓
- Each line written 6 times and the best fit kept: fewest clashes (chords, bass, riff), stressed
  syllables with the kick and snare, notes starting on chord changes, out of Guitar 2's range. ✓
- Every section fitted to its own chords and bass (a verse with new chords no longer sings the old ones). ✓
- Result: borrowed-chord rubs 21-46% → 0-9%; held notes ending off their chord 20-33% → 5-21% (the rest
  colour notes, not clashes); bass clashes about 6% → 2%; the tunes' shape (steps, leaps, range) unchanged.
- · Next: rhythm from the band (accents from the groove, pushes with the band, resting in fills, singing
  into stops); Guitar 2 answering in the singer's gaps; riff genres echoing the riff; tempo and energy.

## 8. Later
- · A recorded voice (Paul's own syllables) or an AI singing voice, if the demo singer earns it.
- · Fillers in the gaps of the lead line itself;
  screamed or growled delivery for metal; harmonies in two parts (a third above and a fifth below).
