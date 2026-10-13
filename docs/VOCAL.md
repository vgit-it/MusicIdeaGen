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
- The low voice's range: C3 to E4, the climax up to A4. The high voice: a woman in pop, funk and rock
  (her tune written a 3rd lower, sung an octave up: about G#3 to D5), a tenor in the heavier genres (his
  tune written a 3rd higher, in key) (docs/VOICES.md, section 9c). ✓
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
- A second singer and their own part (2026-10-12; Paul: the backing vocals were very loud; a different
  voice, a separate track, lower). Harmonies, the gang and oohs are sung by a backing singer: another
  person (a different vocal tract, breathier, less vibrato, thinner and softer up top) on their own
  mixer strip ("Backing vocals": Auto, Low voice, High voice, Off; volume, mute, solo), with more reverb
  and echo, so they sit behind the lead. Auto: the other voice an octave apart in pop, funk and rock (a
  low lead gets high backing voices), the same register in the heavier genres (low harmonies under the
  lead). The lead's double and ad-libs stay with the lead. Measured on a last chorus: backing about
  10-14 dB under the lead (before: about 5). Own stem (backing-vocals), the MIDI backing track in their
  voice, the choice kept in links. ✓

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

## 7. The singers: phrasing, runs and wails (`src/parts/singers.ts`, 2026-10-12)
Paul: the phrasing and melodies sound very similar across songs; mostly short phrases of a few
syllables; it needs more range and vocal runs, the kind of phrasing you hear from Axl Rose (Sweet Child
o' Mine), Eddie Vedder (Black), Chris Cornell (Audioslave), Layne Staley (Alice in Chains), and the like
in other genres. Not impressions: kinds of singers.

What made songs alike: every line was two bars (a bar of words, a held note, a breath), the same
rhythm cells, runs of at most three notes, the top note around E4. Measured over 42 songs before:
95% of lines 1.5-2 bars, no run of 3+ notes on one vowel, range about 15 semitones.

- [P] Phrase length is a singer's signature: the short-short-long "sentence" (a short line, said
  again, then a long answer: Sweet Child's chorus), four bars on one breath (wordy verses tumbling down,
  or a few words stretched long, Black's verses), one-bar chants in call and answer (funk, nu-metal).
  Built: each song gets a singer with phrase plans per section ("1124", "44", "2222", "1111", "224"...);
  lines of one to four bars; a long line travels further (wider contour) and catches a quick breath
  halfway; one-bar lines pair up as call and answer. ✓
- [P] Words per beat and where they fall: patter of 16ths (storytellers), syncopated pushes on the "a"
  of the beat (pop, funk), one word drawn out over two beats (drawlers, brooders). ✓
- [P] Held notes through the bar line: a long one lands on beat 3 or 4 and holds into the next bar (a
  bar and a half), the wail. ✓
- [P] Runs (melisma) on one vowel, 3-7 notes: down into a note from above (the rock cascade), a blues
  fall (minor pentatonic with the flat 5th), up into it, an R&B wave, or a held note running down off its
  end (the grunge tail). 16ths, or 8ths when 16ths would be too quick; never out of the singer's reach,
  never more than an octave above the note before. ✓
- [P] Wails: a chorus or bridge line peaking on a high held note near the top of the singer's range,
  sung full out (brighter, louder), no more than an octave over the note before it; the climax's last
  held note can go higher still (up to C5 for a wailer). The lead guitar no longer cuts them short. ✓
- [P] Delivery: scoops up into held notes (a semitone to a fourth below; more on wails: Staley and
  Vedder), falls off line ends (2-7 semitones, fading). In the voice: per-note slides and falls, quicker
  glides between the quick notes of a run, diphthongs gliding only on a run's last note. ✓

| Singer | Lines | Words | Held notes | Runs | Wails | Delivery | Mostly in |
|---|---|---|---|---|---|---|---|
| Wailer | 1124, 44, 224 | medium | long, through the bar | cascades, blues falls, tails | often, high | some slides | hard rock, metal, grunge, rock |
| Storyteller | 44 verses, 1124 choruses | wordy patter, tumbling down | short-mid | some | some | plain | rock, hard rock |
| Low drawl | 44, 2222 | few, stretched, off the beat | long, mid-line too | tails, waves | some | slides, falls | grunge, rock |
| Brooder | 2222, 44 | few, held | long, through the chords | a few | sudden | lots of slides | grunge, alt metal |
| Pop voice | 1124, 1111 | syncopated hooks | mid | waves, cascades | some | clean | pop, funk |
| Chanter | 1111 | busy, syncopated, near one note | short | none | rare | punchy | funk, alt metal |
| Crooner | 44, 2222 | few, legato | mid-long | waves, cascades | gentle | some slides | pop, ballads |
| Shouter | 1111, 2222, 1124 | short, hard | screams on the peaks | rare | often | falls | metal, hard rock |

- Moods lean who sings (melancholic: drawl, crooner, brooder; angry: shouter, chanter; dark: brooder;
  triumphant: wailer; happy: pop voice, storyteller). The singer is in the notes ("Singer: a wailer...").
  The Vocal reroll can bring a different singer.
- Measured after, over 70 songs: lines of 1 bar 50%, 2 bars 31%, 3-4 bars 18%; about 200 runs of 3+
  notes; about 270 wails; range about 19 semitones; every song's verse and chorus phrasing different.

### Voices: a voice per genre (2026-10-12)
Paul: a raspier voice for some singers, deep ones too; keep the first voice as an option. Worked out
with him by ear over a day of clips and then a voice lab (the whole path: docs/VOICES.md). The lead
singer's voice is a choice next to the Vocal part: Auto (the song's genre's voice), Clear (the first
voice, unchanged), or any genre's voice; kept in links and exports. The backing singer stays clear.

- Each genre's voice (`src/audio/voices.ts`) is a recipe on the voice box (`src/audio/voicebox.ts`, the
  LF model of the vocal folds), rendered at 44.1 kHz: a rock singer, not an opera singer (the larynx
  not lowered, vowels as spoken, little and uneven vibrato), relaxed, breathy all through, edge on the
  open vowels, a softer "s"; three registers (deep, mid, high) sounding together, mixed by pitch,
  vowel and loudness (Paul's own mixes); a break and a way up past it (Rock, Metal, Grunge: a power
  belt; Hard rock: a squeal; Alt metal: a scream; Pop, Funk: falsetto); grit, breath and drive
  growing on the loud notes; tunes written lower than the clear voice's (2 to 8 semitones: Metal the
  highest, Grunge the lowest).
- The earlier Raspy and Deep (on klatt-syn, then on the voice box) are gone from the app; the first is
  kept in git (tag `voices-v1-klatt`).
- Measured over songs in every genre: no glitches or clipping; levels within about 1 dB of the clear
  voice through the mixer; about 10 ms of rendering per second sung (rock) on a desktop (the clear
  voice: about 4), in the background ahead of playback.

### The FOF singer (2026-10-13)
Paul: "the voice is not working, let's build it up from scratch". The options weighed: an AI singer,
recorded syllables, a vocal tract model, measured real singing, and, from the research on building a
voice by rule, IRCAM's CHANT (FOF: formant wave functions, Rodet 1984). FOF won the first head-to-head
by ear and is now every genre's voice (`src/audio/fof.ts`; tried in the FOF lab, `npm run fof-lab`).
- Each pulse of the vocal folds starts one short decaying burst per formant, already at the vowel's
  pitch, width and level, plus a low glottal one for the body; nothing rings on from sound to sound
  (the filters of the old voices were the suspect for their "underwater" sound). Breath and
  consonants are shaped noise.
- Registers blended by pitch around the singer's break (chest, fuller at the bottom; belt, scream,
  squeal or falsetto above); edge (Paul's, toned down); a level the singer's ear keeps steady.
- A real voice's unevenness, measured to stay as clean as a singer (harmonics 13-21 dB over the noise).
- Pitch from note to note as a spring settles (Saitou et al.'s model, damped more), bends in the same
  line, smooth; phrase-level loudness arcs.
- Wider formants and a warmer balance than the first trial (Paul: less ringing, less treble, more bass).
- About 17 ms of rendering per second sung in the browser, in the background ahead of playback. The
  backing singer and the clear voice stay on the formant synth.

### Western (English-language) singing only, for now (2026-10-13)
Paul: the tunes and runs "sound very much like Chinese vocals"; he wants the melody styles and run
techniques of Western (English-language) music only, and may add other traditions later. What made
them sound East Asian, and what changed:
- A major key's tune walked the major pentatonic alone (do-re-mi-so-la, stepped through): now the
  whole major scale, half steps and all. Minor keys keep the minor pentatonic in verses (the blues-rock
  singer's scale) and the mode elsewhere (`scaleFor`, `src/parts/melody.ts`).
- Runs on a vowel: only the rock and soul ones (down into a note, the blues fall, a tail off a held
  note), half as often; their scale the blues scale, or in major the major blues scale (the flat 3rd
  slid through to the 3rd), never the plain major pentatonic (`runScale`; `src/parts/singers.ts`).
- Fewer, smaller scoops; quick note-turns inside a syllable gone (`settle`, `src/parts/vocal.ts`); a
  smaller rise and dip around every note (the voice, `src/audio/fof.ts`): a contour on every syllable
  sounds like a tonal language.
- More closed syllables in the words (English keeps many; "ly ni ry" all open sounds less like it).
- Later: other traditions as a choice (a "singing style" per song), not mixed in by chance.

## 8. The singer listens to the band (`src/parts/fit.ts`, 2026-10-12)
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
- Result (first measured on the two-bar writer): borrowed-chord rubs 21-46% → 0-9%; held notes ending
  off their chord 20-33% → 5-21% (the rest colour notes, not clashes); bass clashes about 6% → 2%; the
  tunes' shape (steps, leaps, range) unchanged.
- [P] Rhythm with the groove: off-beat notes scored by whether the band plays there (kick, snare,
  bass, strum, riff), so the singer's syncopations match the band's. Off-beat notes landing with the band
  43-80% → 48-84%. ✓
- [P] Pushes: when the band pushes a chord change early (kick or bass on it), a held or stressed note
  on the next beat comes in on the push too. ✓
- [P] Guitar 2 answers, it doesn't talk over the singer: its melody notes starting under the singer's
  words, in either voice's range, are left out (arpeggios, swells, chords and muted scratches stay).
  Guitar 2 notes over the words: about 50% → 22% (what's left: out of range, or ringing parts). ✓
- [P] Tempo: fewer, longer notes over a fast band, more words over a slow one. ✓
- Re-measured on top of the singers (section 7), 140 songs, before → after: borrowed-chord rubs 13-35% →
  0-6% (funk 24%, its 7th and 9th chords); bass clashes 4-8% → 2-4%; held notes ending off their chord
  8-35% → 3-21%; notes starting on chord changes 41-55% → 63-69%; Guitar 2 notes over the words 25-38%
  → 22-35%; off-beat notes with the band about the same (61-93%, already good).
- Checked, already fine: the singer rests through drum fills and stops (about 1% of notes overlap).
- · Next: riff genres echoing the riff's rhythm and notes; density by section energy; Guitar 2 moving
  out of the singer's range rather than leaving notes out.

## 9. Not locked to the band's tempo (2026-10-13)
Paul: in a slow song the vocal is "super slow and draggy"; runs and melody shouldn't be as tempo-locked
as the band: "some inherent base energy", runs at half or quarter time, "not all through but sprinkled".
Measured over 60 songs per tempo, before: at 65 bpm about 1.1 syllables a second (2.1 at 120), the
quick words held to 8ths (0.46 s apart at 65 bpm), and almost no runs at any tempo (1-3 in 60 songs: the
rule against quick turns as a syllable starts removed them too).
- [P] Double-time lines: in a slow song (under about 100 bpm), now and then a line is sung in double
  time, its 8ths as its beats and its light syllables on 16ths; more in verses, more the slower the song
  (up to 8 in 10 lines at 65 bpm, 6 in 10 in choruses' share). ✓
- [P] Held notes shorter more often in slow songs, and more of each line sung before them. ✓
- [P] Runs are back, once the syllable has been held a beat (Paul's rule: no quick turns right as it
  starts): a run down or up into the note after a beat's hold, or a tail off its end; a few more of
  them in slow songs. ✓
- [P] Runs faster than the grid: a run whose notes would take over 0.2 s each is now and then (about 2
  in 3) sung two or four times as fast, between the 16ths, landing on its last note sooner and holding
  it longer (`quicken`, `src/parts/vocal.ts`). The voice, the MIDI file and the lanes take the quick
  notes; the backing singers hold through them. ✓
- Result: syllables a second at 65 bpm 1.1 → 1.4, at 80 bpm 1.4 → 1.5, 120 bpm unchanged; runs in 60
  songs 1-3 → 100-190; run notes at 65 bpm 0.46 s → about 0.19 s on average.

## 9b. Fixes from listening (2026-10-13)
Paul: "the vocal melody is sitting at one note most of the time", "some songs ... at a very low
register and barely audible", "too many long runs", and a sung line heard twice at once after tapping
a section. Measured on 56 songs (8 per genre, Classic; Shaped alike):

| | Before | After |
|---|---|---|
| Syllables on the same note as the last | 46% | 35% |
| Share of the song's most-used note | 34% | 26% |
| Notes under B2 (Shaped) | 6% (down to D#2) | 0 |
| Runs per song / long runs (5+ notes) | 1.9 / 0.29 | 1.3 / 0.18 (the wailer's only) |

- **The floor:** no sung note under B2 (`FLOOR` in `melody.ts`, plus a higher singer's lift); the band
  fitting allowed the Shaped voice down to C#2. A range pushed up off the floor keeps its width.
- **One note:** the low-voiced genres (grunge, alt metal) had their verse and chorus both pressed onto the
  floor, the chorus with no lift: the lift is now measured from where the verse really sits. The
  repeat chance is about half, never more than two repeats running (three in a recited line), at least
  about a 6th of range, and the reciting verse rarer in the dark, tense and angry moods.
- **Runs:** long runs, and runs from well above the note, are the wailer's own; the other singers' are
  fewer and no more than 4 notes, from no more than a 4th above.
- **Sung twice:** a jump while playing (a section tapped) stops the lines already sung (faded over 40 ms).

## 9c. No fuzz between syllables (2026-10-13)
Paul: "fuzzes and 'ts' 's' sounds ... making it sound weird". Measured with the ess lab
(`npm run ess-lab`, 19 lines from 5 songs, the FOF singer), the cause was the synth, not the words:

- Hard or hissy sounds meeting at a seam were rare (15 of 273 joins); seam rules barely helped.
- The short bursts were the stops (t, k, p and d, b, g made just as loud): 93 bursts, 23 without them.
- The fuzz "at the end of a sound" was mostly the next word's s, t, k, f, sung before the beat, so
  on the note before, with the vowel cut off at once and the hiss loud and bright.

The fix (Paul's pick, take C5), on every FOF voice (`SUNG` in `voices.ts`; `cons` and `stops` in `fof.ts`):
the vowel fades into the hiss over about 40 ms; a word's starting s, t, k, f at 60% of their length,
toward the beat; their noise 6 dB down and darker; stops with barely a burst, the voice dipping
through p, t, k instead of stopping. Noise in the lines 4.8 s to 1.4 s (vowels alone: 1.2 s), short
bursts 93 to 31, the words as written. The clear (Klatt) voice is unchanged.

## 9d. Held notes, high notes held, one level (2026-10-13)
Paul: "i'd like some more longer held notes too"; "if the note jumps to a pushed scream or belt or anything
at a higher pitch, then it should not fall off immediately -- it should be held for at least half a bar
... and these should not fall off at the end"; "the max volume of vocals to remain more or less similar
throughout the song and not jump around wildly".
- **Held notes inside long lines** (`holdInside`, `src/parts/melody.ts`): now and then a stressed syllable
  on a downbeat or middle beat is held 6-12 16ths, the words after it coming later. Syllables held half a
  bar or more: about 9% to 15%; a third of the sung time to about 40%.
- **High notes held** (`holdHighs`): a belt, or a jump of a major 3rd or more up to the line's top, is held
  at least half its bar (the words in its way left out; a beat's breath before the next line, or sung into
  it when there's no room). Marked `peak`: no fall off its end (it fades as held notes do), no speech-rhythm
  push into it, Guitar 2 doesn't cut it, the breath before the next line doesn't shorten it. High notes
  under half a bar: about 75% to under 10%; falling off: none (the climax's top note too).
- **The vocal rider** (`src/audio/level.ts`, on both singers): each line's level ridden against its body
  before it's set to its level (loud moments brought most of the way down, 4:1; quiet sung notes lifted a
  little; breaths, consonants and fades left alone). Before, a note up past the break came out up to 15 dB
  over the rest of its line, and a line was set by its loudest moment, so choruses sounded quieter with
  spikes. Measured (`npm run level-lab`, 5 songs, whole tracks):

| | Before | After |
|---|---|---|
| Sections' loud body, range through the song (as played) | 4.0 dB | 1.5 dB |
| Notes, 10th to 95th percentile (as played) | 10.4 dB | 4.7 dB |
| The same, prepared (polished) | 1.7 / 4.2 dB | 1.0 / 2.2 dB |

## 10. Later
- · A recorded voice (Paul's own syllables) or an AI singing voice, if the demo singer earns it.
- · More voices (breathy, raspy and deep together, a nasal one), falsetto flips; singing behind the
  beat (the drawl's lag).
- · Fillers in the gaps of the lead line itself;
  screamed or growled delivery for metal; harmonies in two parts (a third above and a fifth below).
