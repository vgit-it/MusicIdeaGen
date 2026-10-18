"""A test (docs/BAND-VIEW.md): the players' heads, bodies and legs cut straight out of Paul's character
reference (experiments/VisualsReference/Characters_Reference.png), the arms, hands and guitars kept from
the generated sheets. Writes the sheets to public/band/cut/ (the page uses them with band.html?cut).
Run: python scripts/band-cut.py  (needs Pillow; after npm run band-sprites)

Each figure is scaled so its feet-to-shoulders matches the generated rig (the arms join there), cleaned
to hard edges and a small palette, and cut in three: the head (above the chin), the body (chin to belt,
the arms trimmed off the sides) and the legs (belt down). The shades, eyes and hair are the drawing's
own, so the generated eyes, brows and worn things are dropped; the singer keeps the generated mouths
(painted over the drawn one). The arms' skin is recoloured to each figure's skin.
"""
import json, os
from PIL import Image

SRC = 'experiments/VisualsReference/Characters_Reference.png'
BAND, OUT = 'public/band', 'public/band/cut'
PERSONAS = ['cool', 'energetic', 'emo', 'angry']
S = 1.35  # the drawing's pixels to the band's (feet to shoulders: about 41 px in the drawing, 55 in the rig)

# Each figure in the drawing: which player, the sheet whose arms match the clothes, the drawing's box,
# the body's centre line, the chin (head above), the belt (legs below), the body's sides, the head's sides.
FIGS = [
    dict(player='rhythm', base='cool', box=(1, 42, 44, 108), cx=21.5, chin=66, belt=85, body=(12, 31), head=(1, 43)),
    dict(player='bassist', base='cool', box=(44, 41, 88, 108), cx=62, chin=66, belt=85, body=(51, 73), head=(44, 87)),
    dict(player='drummer', base='cool', box=(88, 34, 132, 108), cx=110.5, chin=61, belt=78, body=(100, 121), head=(101, 122), seat=-32),
    dict(player='singer', base='energetic', box=(130, 43, 178, 110), cx=152.5, chin=69, belt=87, body=(143, 162), head=(139, 166),
         mouth=(152, 65, 157, 68)),
    dict(player='lead', base='cool', box=(178, 42, 223, 109), cx=199.5, chin=67, belt=85, body=(186, 213), head=(181, 221), hair_to=73),
]


# the generated skin of the players whose sheets don't list it
GEN_SKIN = {'singer': '#e8c0a0', 'drummer': '#dcae88'}


def skinlike(c):
    r, g, b, a = c
    return a > 0 and r > 150 and r > g > b and r - b > 55


def hairlike(c):  # the lead's blond hair, below the chin
    r, g, b, a = c
    return a > 0 and r > 140 and g > 95 and b < 110 and r - b > 70


def cut(ref, f):
    """The figure's three parts, each an RGBA image in player space, with its origin (ox, oy)."""
    x0, y0, x1, y1 = f['box']
    fig = ref.crop(f['box'])
    src = fig.load()
    parts = {k: Image.new('RGBA', fig.size) for k in ('head', 'body', 'legs')}
    for y in range(fig.height):
        for x in range(fig.width):
            c, X, Y = src[x, y], x + x0, y + y0
            if c[3] == 0:
                continue
            if Y < f['chin'] and f['head'][0] <= X <= f['head'][1]:
                parts['head'].putpixel((x, y), c)
            elif f.get('hair_to') and Y < f['hair_to'] and hairlike(c):
                parts['head'].putpixel((x, y), c)
            elif Y < f['belt']:
                if f['body'][0] <= X <= f['body'][1] and not skinlike(c):
                    parts['body'].putpixel((x, y), c)
            elif 'seat' not in f and not skinlike(c):
                parts['legs'].putpixel((x, y), c)
    if 'mouth' in f:  # the drawn mouth painted over with skin (the generated mouths sing)
        mx0, my0, mx1, my1 = f['mouth']
        for y in range(my0, my1):
            for x in range(mx0, mx1):
                parts['head'].putpixel((x - x0, y - y0), (0xfc, 0xc2, 0x92, 255))
    # into the band's pixels: the drawing's point (cx, ground) lands on the player's origin
    ground = f['belt'] if 'seat' in f else y1
    w, h = round(fig.width * S), round(fig.height * S)
    ox, oy = round((f['cx'] - x0) * S), round((ground - y0) * S) - (f.get('seat', 0))
    out = {}
    for k, im in parts.items():
        big = im.resize((w, h), Image.LANCZOS)
        a = big.getchannel('A').point(lambda v: 255 if v >= 110 else 0)
        rgb = big.convert('RGB').quantize(colors=28, method=Image.MEDIANCUT).convert('RGB')
        big = rgb.convert('RGBA')
        big.putalpha(a)
        out[k] = (big, ox, oy)
    if 'mouth' in f:
        mx0, my0, mx1, my1 = f['mouth']
        out['mouth_at'] = ((mx0 + mx1) / 2 - f['cx']) * S, ((my0 + my1) / 2 - ground) * S + f.get('seat', 0)
    return out


def skin_of(ref, f):
    px = [ref.getpixel((x, y)) for y in range(f['box'][1], f['chin']) for x in range(f['head'][0], f['head'][1] + 1)]
    px = [c for c in px if skinlike(c) and c[2] > 0.38 * c[0]]  # (not blond hair)
    px.sort(key=lambda c: sum(c[:3]))
    return px[len(px) // 2][:3]


def hexrgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def reskin(sheet, old, new):
    """Recolour the generated skin (and its shades) to the drawing's skin."""
    px = sheet.load()
    k = [n / max(1, o) for n, o in zip(new, old)]
    for y in range(sheet.height):
        for x in range(sheet.width):
            r, g, b, a = px[x, y]
            if a == 0 or r == 0:
                continue
            m = r / old[0]
            if 0.35 < m < 1.6 and abs(g - old[1] * m) < 18 and abs(b - old[2] * m) < 18:
                px[x, y] = (min(255, round(r * k[0])), min(255, round(g * k[1])), min(255, round(b * k[2])), a)


def build(ref, f):
    parts = cut(ref, f)
    base = json.load(open(f'{BAND}/{f["player"]}-{f["base"]}.json'))
    sheet = Image.open(f'{BAND}/{base["image"]}').convert('RGBA')
    geo, frames = base['geo'], base['frames']
    old = geo.get('skin') or GEN_SKIN.get(f['player'])
    if old:
        new = skin_of(ref, f)
        reskin(sheet, hexrgb(old), new)
        k = [n / max(1, o) for n, o in zip(new, hexrgb(old))]
        geo['skin'] = '#%02x%02x%02x' % new
        if geo.get('skinDark'):
            geo['skinDark'] = '#%02x%02x%02x' % tuple(min(255, round(c * kk)) for c, kk in zip(hexrgb(geo['skinDark']), k))
    # the drawing's parts, in a strip under the sheet
    lift = (geo.get('poses') or {}).get('up', [0, -2])[1]
    add = [('head/front', 'head', 0), ('head/up', 'head', lift), ('head/down', 'head', -lift), ('body/idle', 'body', 0)]
    if 'seat' not in f:
        add += [('legs/stand', 'legs', 0), ('legs/wide', 'legs', 0)]
    strip_h = max(parts[p][0].height for _, p, _ in add)
    out = Image.new('RGBA', (max(sheet.width, sum(parts[p][0].width for p in ('head', 'body', 'legs'))), sheet.height + strip_h))
    out.paste(sheet, (0, 0))
    x, at = 0, {}
    for p in ('head', 'body', 'legs'):
        if 'seat' in f and p == 'legs':
            continue
        im, ox, oy = parts[p]
        bb = im.getbbox()
        out.paste(im.crop(bb), (x, sheet.height))
        at[p] = [x, sheet.height, bb[2] - bb[0], bb[3] - bb[1], ox - bb[0], oy - bb[1]]
        x += bb[2] - bb[0]
    for name, p, dy in add:
        fx, fy, w, h, ox, oy = at[p]
        frames[name] = [fx, fy, w, h, ox, oy - dy]
    # the drawing's own face: no generated eyes, brows, worn things or hair behind
    for k in list(frames):
        if k.startswith(('eyes/', 'brows/', 'acc/', 'hair/')) or (k.startswith('mouth/') and 'mouth' not in f):
            del frames[k]
    geo['acc'] = []
    if 'mouth_at' in parts:  # the generated mouths moved onto the drawn mouth's place
        r = frames['mouth/rest']
        cx, cy = r[2] / 2 - r[4], r[3] / 2 - r[5]
        tx, ty = parts['mouth_at']
        dx, dy = round(tx - cx), round(ty - cy)
        for k in frames:
            if k.startswith('mouth/'):
                frames[k][4] -= dx
                frames[k][5] -= dy
    os.makedirs(OUT, exist_ok=True)
    for p in PERSONAS:
        name = f'{f["player"]}-{p}'
        out.save(f'{OUT}/{name}.png')
        json.dump({'image': f'{name}.png', 'frames': frames, 'geo': geo}, open(f'{OUT}/{name}.json', 'w'))
    print(f['player'], 'skin', geo.get('skin'), 'sheet', out.size)


ref = Image.open(SRC).convert('RGBA')
for f in FIGS:
    build(ref, f)
# the stage and the crowd: the same as the band's own
for n in ('stage.png', 'stage.json', 'stage-front.png', 'crowd.png', 'crowd.json'):
    open(f'{OUT}/{n}', 'wb').write(open(f'{BAND}/{n}', 'rb').read())
