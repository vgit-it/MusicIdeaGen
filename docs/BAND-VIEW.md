# Band view: the band playing the song, on screen

A pixel-art stage where a singer, a rhythm guitarist, a lead guitarist, a bassist and a drummer play the
track as it plays. Every move comes from the music the app already writes: the drum lanes, the
bassist's and Guitar 2's string and fret, the strum strokes and chord shapes, the sung syllables.
Prototype: `band.html` (`npm run dev`, then open `/band.html`), code in `src/band/`, placeholder sprites
in `public/band/` (made by `npm run band-sprites`). The page: a genre, New song, Play from any section,
Singer on/off, the check view, and a Delay slider (Bluetooth). `band.html?mute` plays silently (tests).
Not in the built site yet (dev only).

**Render video**: the band playing the song as a video file with the real-amp sound (360p or 720p, MP4). The page's Render video button; how it works in `docs/BAND-VIDEO.md`.

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
   - loud sections lock the band in: everyone nods on the same beat, bigger bounces, the guitarists
     sway, the bassist and rhythm guitarist step in toward the drummer
   - showing off: the band jumps into big sections (a crouch first, knees tucked in the air), the pick
     hand goes up on a big chord left ringing, the lead lunges in solos, the singer pumps a fist between
     lines; on the final chord everyone jumps and holds an ending pose (the drummer's sticks up)
   - strolling: the bassist, lead, singer (mic stand in hand) and rhythm guitarist wander a lane around
     their spot while playing (stand a while, walk across, stand; more in loud sections, less for calm
     characters: `roam` in `persona.ts`), planned per song so it's the same anywhere you jump to; the
     lead holds still in solos; `Stage.apart` eases anyone apart who'd get closer than their bodies allow
4. **Walk-on** (Walk-on switch, playing from the top): the band walks on one by one (drummer first,
   then each side from the middle out), the singer waves, the drummer counts in four with stick clicks you hear, and the song
   starts on the fifth beat (timed on the audio clock).
3. **Stage** (`src/band/stage.ts`). A small canvas (320 x 180: a close camera, the players filling
   about half its height) scaled up with sharp pixels. Composed like a poster: a light pipe across the
   top with a can over each player, speaker stacks at both edges, the drummer dead centre on a riser,
   left to right the bassist, the lead, the drummer, the singer and the rhythm guitarist, the crowd in silhouette across the front, the players' shadows cast on
   the back wall. A bar's
   band stage (brick wall, low wooden ceiling with a lighting pipe, string lights, "LIVE MUSIC" and
   "BEER" neon, the band's banner, gig posters, plank floor, a rug, a drum riser), shaded with ordered
   dithering, not smooth gradients (`stage.png`; its lights' places in `stage.json`). The crowd in the
   front corners bobs along and throws hands up for the big moments (`crowd.png`). The light is pixel
   art too: drawn at half size, stepped into six levels with a 4x4 ordered dither, added over the stage
   with hard edges: cans throwing coloured cones at the players by section (swinging and punching on
   the downbeat when it's loud), bulbs twinkling, neon glowing and
   now and then stuttering; a crash in a loud part flashes the room. A check view shows each player's
   fretboard and the drum hits, to see the playing is right.

**Sync**: the audio engine reports when every 16th is going to sound; the view reads the audio clock
each frame and finds where in the song it is (so swing, tempo and the band's lilt line up). A delay
setting covers Bluetooth headphones.

## Paul's stage (`npm run band-stage`, `scripts/band-stage.ts`)

The stage is painted by Paul (`experiments/VisualsReference/Stage_BG.png`, the empty stage, and
`Stage_Front.png`, the monitors and the front edge over the players' feet; `Final_Reference.png` is the
look to aim for). The paintings are large and pixel-styled, not pixel-exact (soft edges, thousands of
colours), so the import makes them real pixel art at the band's pixel size: shrunk to 350 x 180 (each
pixel the average of the painting's pixels under it) and put on one 48-colour palette (`--dither` to
dither between colours). It also writes where the 16 lamps and the neon are (`stage.json`). Run it again
after changing a painting. The band stands as in the final reference: the drummer on the riser, the rest
along the rug, the monitors in front of their feet, the crowd (with devil horns) in front of that.
Lit as the final reference: the players and the crowd each on their own layer, darkened toward a deep
red and rim-lit (the edges facing the lights glowing orange from above and the left, red from the
right; stronger when it's loud and on a crash), then the whole picture warmed toward red, a stepped
dithered vignette and a moving pixel grain.

**Test: the players from Paul's character drawing** (`band.html?cut`, `python scripts/band-cut.py`):
the heads, bodies and legs cut straight out of `Characters_Reference.png` (scaled up 1.35 so the
shoulders meet the generated arms, hard edges, a small palette); the arms, hands, guitars and the
singer's mouths kept from the generated sheets, their skin recoloured to match. The drawing's own
faces (shades, eyes) replace the generated eyes and brows. Walking, jumping and lunging legs are still
the generated ones.

**Paul's art** (`art/`, `art/README.md`, `scripts/band-art.ts`): `npm run band-export` writes every
frame of every player as its own PNG, all on one canvas (128 x 112, the feet at 60, 104), starting from
the cut-out test, and never overwrites a drawing. `npm run band-pack` packs them back into sheets
(`public/band/art/`, seen with `band.html?art`): a frame drawn for one character type
(`art/lead-emo/...`) over the player's own (`art/lead/...`) over the placeholder; new frames the view
uses (eyes, mouths on a drawn head) are added; misspelt names are reported. Legs are a cutout rig
(`src/band/rig.ts`): hips, thighs, shins and shoes drawn once and neutral (`art/<player>/rig/legs/`:
the thighs and shins straight, hanging from their joint as the arm pieces; cut from the drawing on export
and straightened, the bent originals kept in `rig/legs-bent/`); every pose made from them on pack, the
rock stance too: each foot placed (where it stands in the drawing, moved by the pose), the knee bending
out to reach it (two-bone), a lifted foot squashing the thigh (the knee coming toward us); turned the
RotSprite way (Scale2x three times, turned, sampled back), so the pixels stay clean. `_neutral.png`
per player (made on pack): the legs straight, the arms hanging, to draw against.
Arms are rigged too: `npm run band-sprites` records each arm frame's arms (shoulder, hand, the side the
elbow bends to; `geo.arms`) and writes the frame's hand alone (`hand/<frame>`); on pack each arm frame
is an upper arm and a forearm piece (`art/<player>/rig/arms/`, the sleeves on them) turned from the
player's own shoulders (found on the drawn body) through the elbow to the hand, the hand over them.

**The wardrobe** (`art/wardrobe/`, `src/band/dress.ts`): the standing players share one skeleton (the
singer's: `skeleton.json`), so clothes are items anyone wears: tops (the torso and its two sleeve
pieces, with its shoulders), bottoms (hips, thighs, shins), shoes, heads (a head's skin is the player's:
the arms and hands recoloured to it; the singer's mouthless head is the singer's only). `npm run
band-export` copied each player's own clothes in (fitted: bodies sat on the skeleton's belt, heads on its
neck, pieces stretched to its lengths); `npm run band-pack` packs them into `wardrobe.png/json`. On the
page (`?art`) each song's outfits are picked by the song (seeded: a player's own twice as likely, no two
in the same top or head, half the tops and bottoms dyed: the main colour moved to a dye, shading kept,
prints left), and each player's sheet is made in the browser with the rig (`src/band/rig.ts`, shared
with the packer): their own frames (hands, guitar, faces), the outfit's body and head, the leg poses and
every arm frame (about 60 ms a player). `?art&own`: their own clothes. The drummer keeps his own.
The joints (a top's neck and shoulders, a head's chin, the skeleton's hips, knees and ankles) are found
at each pack or set by hand in item.json / skeleton.json; a local tool (not in git) shows and sets them
with every outfit combination drawn live.

**Moves** (`src/band/moves.ts`): two sets for the dressed players. Classic: as first made (the feet
moved per pose, the body bobbing on its own over the legs). Fresh (the default), made for the skeleton
with knees: every frame its own pose (each foot, and the hips up or down: the body goes with them, so it
never slides over the trousers): each stance (`stand`, `wide`, `lunge`) at rest and at each depth of a
bounce on the beat (`wide/b1` to `b3`: a cool player's bounce reaches the first, an energetic one's the
deepest), the walk's four steps, a jump's crouch, the jump and its landing (`jump/crouch`, `jump`,
`jump/land`), the knees bending the way the stand's do, and the singer's free arm placed from his
shoulders (fits any top). A bounce frame not drawn follows its stance (that much lower); a crouch or
landing not drawn follows the wide stance. `?moves=classic` brings the classic set back. They're redrawn
in `art/wardrobe/moves.json` (packed into `wardrobe.json`): each frame shared by every role or a role's
own (the role's over the shared over the first made); the local rig lab's Moves edits them frame by
frame (filmstrips with onion skin, dragged handles, undo) and plays them in time by the stage's own rules
(`groove`, `showOf`, `stanceFor` in `src/band/actors.ts`: tempo, section loudness, character type), every
role side by side and on the stage at the audience's size.

## Characters (`src/band/persona.ts`)

Each player is a character: **cool**, **energetic**, **emo** or **angry**. On Auto, each song picks
them from its genre (funk leans cool, metal angry, grunge emo and angry), its mood (melancholic leans
emo, happy energetic) and the part each player has: the singer's energy style (a Brooder emo, a
Puncher angry, a Driver energetic, a Drifter cool), the kind of lead player (a shredder energetic,
bluesy cool, raw angry), a rhythm guitarist on riffs or palm mutes (angry), a busy bassline
(energetic) or a sparse one (cool), a drummer with lots of fills (energetic). Never all five the
same. Each can be chosen on the page.

| | Moves | Dress |
| --- | --- | --- |
| Cool | small bounce, nods only on the bar, no jumps, a smirk, poses | open leather jacket, shades, boots; a black guitar |
| Energetic | big bounce, sways, jumps (and more in the loudest parts), a grin, fist pumps | a plain tee (dark red, white, charcoal, faded navy), black wristbands, a white sweatband |
| Emo | slumps head-down when quiet, head-bangs when loud, eyes closed, hand on chest | dark hoodie with striped sleeves, black hair with a side fringe, eyeliner |
| Angry | feet planted wide, head-bangs when loud, a glare, gritted teeth, shouts | black tank top, spiked wristbands, studded belt, boots |

Everyone dresses like a working rock band, nothing loud: natural hair (black, dark brown, dirty
blond), black, grey and white tees, jeans, black boots and sneakers; guitars in natural wood, dark
cherry or black.

Each player has a sheet per character (`singer-cool`, `lead-emo`...): the same frames, other clothes,
plus `acc/...` frames worn over the face (`shades`, `fringe`, `sweatband`, `eyeliner`), listed in the
JSON's `acc`.

## Sprites: the contract for the artwork

Every player is a set of parts layered on top of each other (a paper doll), each part a list of
frames. All frames of a player are drawn in the same space: a box with the player's feet at the
origin, so parts line up when stacked (no fiddly offsets). Each player is one PNG sheet plus a JSON
file: frame name, where it is on the sheet, and its origin.

| Part | Frames (names) |
| --- | --- |
| legs, body | `legs/stand wide jump lunge`, `legs/walk/0-3`, `body/idle` |
| head, face | `head/front` `head/up` `head/down`; `eyes/open half closed wide squeeze left right`; `brows/neutral raised furrow sad`; `mouth/rest M F S E I A A+ O O+ U` |
| guitar, bass | `inst/body` (the neck's ends and strings listed in the JSON, for the fret maths) |
| fretting hand | `fret/palm/<fret>` (the palm under the neck, thumb over the top, at the index finger's fret), `fret/off/<fret>` (relaxed, off the strings); `tip/press`, `tip/light` (a fingertip, its origin the pressed pixel) |
| pick hand | `pick/up mid down blurD blurU mute mute2 a b rest high` (`high`: thrown up in a pose), bass `pluck/a b rest` (`a`/`b` drawn on the middle string; the view moves them to the string picked) |
| drummer | `kit/...` per drum (`/rest`, `/hit`), cymbals (`/hit1`, `/hit2`), hi-hat open/closed; `armA/<drum>/<up mid hit>`, `armB/...`, `armA/sky` (sticks up), `armA/click` (count-in); `legs/sit kick` |
| singer | `armA/mic`, `armA/down`, `armB/down up out chest`, `stand`, `mic` |

The fretting hand is accurate to every note: the view puts a fingertip on each fretted string at its
real fret (a chord's whole shape, a power chord, a barre laid across the strings, a bend pushing the
string up), and draws each finger from the knuckles to its tip in the skin colour. Ringing strings
shimmer from their fret to the bridge. Fingers and string shimmer are drawn by the view (thin lines);
everything else is sprites.

Proportions follow the Scott Pilgrim game's sprites: about 3 heads tall, a big head and hair, a short torso,
solid limbs, big hands and sneakers, knees a little bent, big eyes (whites, pupils, a shine), thick
dark outlines, three tones of shading.

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

1. **Prototype** (this): the system, placeholder sprites, a page that plays a generated track; Scott
   Pilgrim proportions, fingers on the real frets, the walk-on, jumps and poses, characters. Done.
2. Paul's art: the real characters in Aseprite; the converter; more frames where it helps (strum blur,
   drum fills, singer moves).
3. Loaded and ready: render the singer and real amps before starting (as the main app's Prepare); sheets
   preloaded.
4. Into the main app: a Band view toggle next to the track; mobile layout.
5. Later: backing vocals sung by the guitarists into their mics, crowd, camera moves (close-ups on solos
   and fills), a video export.
