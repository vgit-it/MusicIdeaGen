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
- · Ad-libs over the last chorus, harmonies or doubling in choruses, melisma at line ends.

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

## 5. Later
- · A recorded voice (Paul's own syllables) or an AI singing voice, if the demo singer earns it.
- · Ad-libs, harmonies and doubled choruses; fillers in the gaps; the melody following the tension
  curve more closely; screamed or growled delivery for metal.
