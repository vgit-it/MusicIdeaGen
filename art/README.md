# Drawing the band

Every frame of every player is a PNG here. Draw over them, then put them into the band:

```
npm run band-pack
```

Then open `band.html?art` (refresh after each pack).

## The rules

- **Same canvas for every file: 128 x 112.** The player's feet are at **60, 104** (x, y). Keep it there, so
  the parts line up. `_canvas.json` has the numbers.
- **Draw in place.** Don't move or crop the canvas. Draw where the placeholder is.
- **One file is one frame.** The file's path is the frame's name: `head/front.png`, `legs/walk/2.png`.
- **Transparent background**, 8-bit PNG (Aseprite's normal export).
- **Your files are safe.** `npm run band-export` only writes frames that aren't here yet. It never
  overwrites a drawing. Delete a file to get its placeholder back on the next export.
- **An empty file** (fully transparent) leaves that frame out on purpose.
- `_stance.png` in each player's folder shows the player put together, to draw against. It isn't used.

## Folders

- `art/<player>/` is the player for every character type. Players: `singer`, `rhythm`, `lead`,
  `bassist`, `drummer`.
- `art/<player>-<type>/` is optional. Types: `cool`, `energetic`, `emo`, `angry`. A frame here
  replaces that player's frame for that type only, for example a hoodie for the emo lead:
  `art/lead-emo/body/idle.png`. Only add the frames that change.

## The wardrobe: clothes anyone can wear

The singer, both guitarists and the bassist share one body (a skeleton: the singer's), so their clothes
are pieces in `art/wardrobe/` that any of them can wear. Each song picks an outfit per player from it:
a top, a bottom, shoes and a head, sometimes dyed another colour. The same song always gets the same
band. A player's own clothes are a little more likely, and no two players share a top or a head.
`band.html?art&own` puts everyone in their own clothes.

- `tops/<name>/`: `body.png` (the torso, on the usual canvas) and `upper.png`, `fore.png` (its sleeves,
  the arm pieces: see Arms). `item.json` has its `dyes`. The shoulders (where the arms join) are found
  at each pack: 4 rows below the collar, just in from the body's edges so the sleeve's outside lines up
  with the body's. To set them by hand, add `"shoulders": {"A": [x, y], "B": [x, y]}` (from the feet).
- **The neck goes on the top:** a few rows of skin (and outline) above the collar, drawn 2 to 3 px
  taller than you'd think. The head's chin sits just above the collar (the first row as wide as
  shoulders; or set `"neck": [x, y]` in item.json, and `"chin": [x, y]` in a head's) and covers it; when the head
  nods up (`head/up`) the neck shows instead of a gap. Draw it in the `skin` colour of the top's `item.json` (and its
  shades): it's recoloured to each head's skin.
- `bottoms/<name>/`: `hips.png` and `thigh-L`, `thigh-R`, `shin-L`, `shin-R` (see Legs). `item.json`
  has its `dyes`.
- `shoes/<name>/`: `shoe-L.png`, `shoe-R.png`.
- `heads/<name>/`: `front.png`, `up.png`, `down.png`, ending at the chin (no neck). The chin is found
  at each pack (the lowest row of the face, in the head's skin colour, outline included) and put just
  above the top's collar, so a head can be drawn anywhere up or down the canvas. The skin of the head is the player's skin: the
  arms and hands are recoloured to it. A head with `"sings": true` (no mouth drawn: the singing mouths
  go on it) is for the singer only; the others are for the players.
- `skeleton.json`: the shared body: the hips, knees and ankles (as the players stand; each leg's thigh
  and shin are as long as hip to knee and knee to ankle, and bend that way in every pose), the arm
  lengths, the neck (the top row of the singer's torso) and the belt (its bottom row). Keep each leg a
  little shorter than its trousers are drawn, or a bend shows a gap. Draw new pieces to fit it: the easiest way
  is to copy an item's folder and draw over it.
- **New item:** a new folder in the right kind, with an `item.json` (copy one). Its name is up to you.
- **Dyes:** `"dyes": ["#7a2424", ...]` in `item.json`: the main colour of the item can be moved to any
  of these (the shading kept). Prints and other colours stay. An empty list: never dyed.
- **Where they came from:** each player's own clothes were copied in under the player's name (your
  singer's exactly, the others stretched a pixel or two to fit the skeleton). The player folders keep
  their copies, but **from now on draw clothes here**: the page dresses the players from the wardrobe.
- The drummer keeps his own clothes for now (he sits).
- A drawn strap (on a jacket) stays with the jacket, so the singer may wear one. Draw tops without a
  strap if that bothers you.

## Legs: drawn once as pieces (a rig)

The standing players' legs aren't frames: they're pieces in `art/<player>/rig/legs/`, **drawn neutral**
(straight, like the arms), so every pose can be made from them:
- `hips` is the top of the trousers, across both legs, on the usual canvas.
- `thigh-L`, `shin-L` and `thigh-R`, `shin-R` (L is screen left) are on a small canvas (24 wide),
  **straight, hanging down**: the joint at the top at **12, 4**, the next joint `thigh` / `shin` px below
  it (in `rig/legs.json`, 14 px). Draw a little past each end (the thigh and shin overlap at the knee),
  so bends never show a gap.
- `shoe-L` and `shoe-R` are on the same small canvas, **the ankle at 12, 4**, the shoe below it,
  pointing out as it stands.

`rig/legs.json` says where the hips are and where the ankles stand (x, y on the canvas). Packing makes
every leg pose from the pieces, the rock stance too: `stand`, `wide`, `walk/0` to `3`, `jump` and
`lunge`. Each foot is placed and the knee bends out to reach it.
- Facing us, a lifted foot's knee comes toward the camera, so the thigh is squashed shorter.
- `_neutral.png` (in each player's folder, made at each pack) shows the player neutral: the legs straight
  down, the arms hanging. Draw against it. A straight drawing looks stiff on its own; judge it on stage.
- The pieces were straightened from the reference's bent legs (the old ones are in `rig/legs-bent/`,
  not used), so they're a little rough: redraw them clean.

New trousers or shoes are a few pieces, not every frame. Hand-drawn frames still win: a file at
`art/<player>/legs/walk/1.png` replaces the rig's.

The poses (where each foot goes, and how far the hips, and the body with them, go down or up) are in
`src/band/moves.ts`: the fresh set (every frame its own pose: each stance at rest and at each depth of a
bounce on the beat, the walk, a jump's crouch, air and landing; made for the skeleton with knees) and the
classic one (`band.html?art&moves=classic`). Redraw the fresh ones in `art/wardrobe/moves.json` (made with
the local rig lab's Moves): each pose shared by every role, or a role's own (`all`, then `singer`,
`rhythm`, `lead`, `bassist`); what isn't there is as first made.

## Arms: pieces too

Every arm frame (the fretting hand on each fret, each picking stroke, the singer's arms, every drum
hit) is made from two pieces in `art/<player>/rig/arms/`, plus that frame's hand:
- `upper.png` and `fore.png` (upper arm, forearm) are on a small canvas, hanging straight down: the
  joint at the top at **8, 4**, the next joint `upper` / `fore` px below it (in `rig/arms.json`, 12 to
  13 px). The sleeves are drawn on these, so **an outfit's sleeves are just these two pieces**.
- `rig/arms.json` also has the **shoulders** (x, y from the feet; A is screen left, B screen right),
  found on your drawn body.
- The hand of each frame is its own small frame: `art/<player>/hand/<frame>.png`, for example
  `hand/fret/palm/5.png` or `hand/pick/down.png`. It holds only the hand (and the pick or stick), on the
  usual canvas. Packing draws the arm from shoulder to elbow to that hand, then the hand on top.

Where the hands go comes from the music (the neck, the strings, the drums), so the arm always reaches
the right place: when the hand is further than the arm is long (high frets, a hand resting low), the
arm stretches straight to it, so **draw each piece 3 to 4 px past its next joint** (16 px below the
joint at most), or a stretched arm shows a gap at the elbow. A hand-drawn full frame (`art/<player>/pick/down.png`) still wins.

## How the parts stack (back to front)

- **Guitarists:** `hair/back`, `legs/...`, `body/idle`, `inst/body` (the guitar), the fretting hand
  (`fret/palm/<fret>`, `fret/off/<fret>`), fingertips (`tip/press`, `tip/light`), the pick hand
  (`pick/...`, bass `pluck/...`), then `head/...` and the face.
- **Singer:** `stand`, `legs`, `body`, `armB/...`, the head and face, `armA/mic` (or `armA/down`), `mic`.
- **Drummer:** `legs/sit` or `legs/kick`, `body/idle`, the head and face, the kit (`kit/<drum>/rest`
  or `hit`), then the arms `armA/<drum>/<up|mid|hit>` and `armB/...`.
- **Face (on top of the head):** `eyes/...`, `brows/...`, `mouth/...`. If you draw eyes, draw the head
  without them.

## What to draw first

1. **Heads without eyes, then `eyes/open`, `eyes/closed` and `eyes/half`** (blinks, and eyes shut on big
   notes). Players in shades can skip this.
2. **Singer mouths:** `mouth/rest`, `A`, `O`, `E`, `M` first; then `I`, `U`, `F`, `S`, `A+`, `O+`
   (the + is a bigger, belted version).
3. **Legs:** made by the rig from the pieces. Redraw the pieces for new trousers or shoes.
4. **Arms:** the two arm pieces (sleeves); then hands: `hand/pick/...` and `hand/fret/...`.
5. **Optional:** `brows/neutral`, `raised`, `furrow`, `sad`; `head/up` and `head/down` (head-banging,
   1 to 2 px up or down).

New frame names (like `eyes/closed` on a player who doesn't have one yet) are picked up if the view
uses them. A misspelt name is reported when you pack.

**Guitars:** if you redraw `inst/body`, keep the neck where it is. The fingers are placed on the
neck by maths. If the neck moves, tell Claude so the neck's position can be updated.
