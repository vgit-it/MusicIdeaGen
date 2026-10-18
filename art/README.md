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

## Legs: drawn once as pieces (a rig)

The standing players' legs aren't frames: they're pieces in `art/<player>/rig/legs/`, drawn in the
standing pose on the same canvas:
- `hips` is the top of the trousers, across both legs.
- `thigh-L`, `shin-L`, `shoe-L` and `thigh-R`, `shin-R`, `shoe-R` are each leg (L is screen left).
  The thigh and shin overlap by 3 rows at the knee, so bends never show a gap.

`rig/legs.json` says where the hips, knees and ankles are (x, y on the canvas). Packing makes every leg
pose from the pieces: `stand`, `wide`, `walk/0` to `3`, `jump` and `lunge`.
- Facing us, a lifted foot's knee comes toward the camera, so the thigh is squashed shorter and the shin
  and shoe rise.
- A foot moved out turns the whole leg a little at the hip, with clean pixel rotation.

New trousers or shoes are a few pieces, not every frame. Hand-drawn frames still win: a file at
`art/<player>/legs/walk/1.png` replaces the rig's.

The poses (how far each foot moves) are in `scripts/band-rig.ts` (`POSES`). A walk made in Figma can
replace them.

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
4. **Arms:** the pick hand (`pick/up`, `mid`, `down`, `blurD`, `blurU`), then the fretting hand.
5. **Optional:** `brows/neutral`, `raised`, `furrow`, `sad`; `head/up` and `head/down` (head-banging,
   1 to 2 px up or down).

New frame names (like `eyes/closed` on a player who doesn't have one yet) are picked up if the view
uses them. A misspelt name is reported when you pack.

**Guitars:** if you redraw `inst/body`, keep the neck where it is. The fingers are placed on the
neck by maths. If the neck moves, tell Claude so the neck's position can be updated.
