# Band view: the band playing the song, on screen

A pixel-art stage where a singer, a rhythm guitarist, a lead guitarist, a bassist and a drummer play the
track as it plays. Every move comes from the music the app already writes: the drum lanes, the
bassist's and Guitar 2's string and fret, the strum strokes and chord shapes, the sung syllables.
Prototype: `band.html` (`npm run dev`, then open `/band.html`), code in `src/band/`, placeholder sprites
in `public/band/` (made by `npm run band-sprites`). The page: a genre, New song, Play from any section,
Singer on/off, the check view, and a Delay slider (Bluetooth). `band.html?mute` plays silently (tests).
Not in the built site yet (dev only).

## How it works (three layers)

1. **The score for the eyes** (`src/band/score.ts`). Before playing, the whole track is turned into one
   list of moves per player, in song time (16th steps, with each player's feel in ms):
   - drummer: every hit given to a limb (right hand, left hand, right foot, left foot) and a drum; fills
     alternate hands; the hi-hat foot follows open and closed hats
   - bassist and lead: each note's string, fret, how it's reached (picked, hammered, pulled, slid), bends,
     vibrato, trills, tremolo, rakes; already decided by the band's hands pass (`src/players/hands.ts`)
   - rhythm guitarist: each stroke (down, up, palm-muted, dead), the chord shape it holds (the same
     shapes the guitar sound uses), where it sits out (Guitar plan)
   - singer: each syllable split into mouth shapes (its consonants and vowel, diphthongs moving), with
     its stress, loudness, belts and peaks, line starts (a breath), and how high it sits in the line
2. **Animators** (`src/band/actors.ts`). Each player is a function of time: "at 12.34 s, which sprites,
   where". No state builds up, so it can jump, loop or be scrubbed, and could render a video later.
   They pick sprites the way a player moves:
   - a drum hit: the stick rises before the hit (higher when louder), lands on the drum on the beat, rebounds
   - a strum: the hand swings like a pendulum, down and up through the strings, silently past the rests
   - a picked note: the pick hand moves only on picked notes, not on hammer-ons, pull-offs or slides
   - the fretting hand sits at the real fret and string, slides along the neck, pushes up for bends,
     wobbles for vibrato, changes chord shape just before the change
   - the singer: mouth shapes per sound, eyes closing on belts and peaks, brows by pitch and strain,
     head back on big notes, a breath before each line, the mic lowered between long gaps
   - everyone bobs with the beat, more in loud sections; the lead steps up for solos
3. **Stage** (`src/band/stage.ts`). A small canvas (480 x 270) scaled up with sharp pixels; lights by
   section, flashes on crashes, a spotlight on solos. A check view shows each player's fretboard and the
   drum hits, to see the playing is right.

**Sync**: the audio engine reports when every 16th is going to sound; the view reads the audio clock
each frame and finds where in the song it is (so swing, tempo and the band's lilt line up). A delay
setting covers Bluetooth headphones.

## Sprites: the contract for the artwork

Every player is a set of parts layered on top of each other (a paper doll), each part a list of
frames. All frames of a player are drawn in the same space: a box with the player's feet at the
origin, so parts line up when stacked (no fiddly offsets). Each player is one PNG sheet plus a JSON
file: frame name, where it is on the sheet, and its origin.

| Part | Frames (names) |
| --- | --- |
| legs, body | `legs/stand`, `body/idle`, `body/lean` |
| head, face | `head/front` `head/up` `head/down`; `eyes/open half closed wide squeeze left right`; `brows/neutral raised furrow sad`; `mouth/rest M F S E I A A+ O O+ U` |
| guitar, bass | `inst/body` (the neck's ends and strings listed in the JSON, for the fret maths) |
| fretting hand | `fret/<grip>/<fret>/<string>`: grips `single bend open chord barre power mute` |
| pick hand | `pick/up mid down mute a b`, bass `pluck/a b rest` |
| drummer | `kit/...` per drum (`/rest`, `/hit`), cymbals (`/hit1`, `/hit2`), hi-hat open/closed; `armR/<drum>/<up mid hit>`, `armL/...` |
| singer | `armL/mic`, `armL/down`, `armR/down up out chest`, `stand` |

The fretting hand: draw as many frets as you like. With only every 3rd fret drawn, the view slides the
nearest frame along the neck. The same for strings.

**Making them in Aseprite** (later): one file per player, a layer per part, a tag per frame name;
export the sheet with JSON; a small converter maps it to this format.

## Research notes (what this is built on)

- Sprite parts layered on a body (paper-doll / cutout rigs) are how 2D games show many combinations
  (mouth x eyes x hands) without drawing every combination: Scott Pilgrim's game and most pixel
  fighters use full frames for big moves and layered parts for faces and held items.
- Lip sync from phonemes: the classic 8-10 mouth shapes (Preston Blair set: A/I, E, O, U, M/B/P, F/V,
  L/TH, rest), as in Rhubarb Lip Sync and game dialogue tools. Our syllables already carry ARPAbet
  phonemes, so no audio analysis is needed.
- Rhythm-game timing: drive visuals from the audio clock (not the frame timer), schedule with a look
  ahead, and show anticipation before the beat (Guitar Hero, Rock Band, Rhythm Heaven: the wind-up is
  what makes a hit read as on time).
- Drummers: hands alternate in fills, the hi-hat hand crosses over, cymbals swing after a hit; a
  stick's height tracks loudness.
- Guitar: the fretting hand moves before the note (it has to be there when it's picked), chord
  changes happen in the last moment, strumming is a constant pendulum (down on the beat, up between).

## Milestones

1. **Prototype** (this): the system, placeholder sprites, a page that plays a generated track. Done.
2. Paul's art: the real characters in Aseprite; the converter; more frames where it helps (strum blur,
   drum fills, singer moves).
3. Loaded and ready: render the singer and real amps before starting (as the main app's Prepare); sheets
   preloaded.
4. Into the main app: a Band view toggle next to the track; mobile layout.
5. Later: backing vocals sung by the guitarists into their mics, crowd, camera moves (close-ups on solos
   and fills), a video export.
