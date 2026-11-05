"""Turn the PixelLab downloads (tools/pixellab/fetch.sh) into game art and the Studio library.

Usage: python3 tools/pixellab/build_library.py <download-dir>

Writes lossless WebP files under public/art/pl/ and the manifest src/data/pixellab/library.json:
  obj/<slug>     objects (first frame of multi-frame ones)
  chr/<slug>     characters as game character sheets (48x64 frames, 16 columns x 4 directions)
  mon/<slug>     characters as monster sheets (one row facing left: idle 2, walk 4, attack 3, hit 1, death 3)
  tile/<slug>    ground tiles in a strip of 32x32 cells (tiles-pro sets and top-down transition tilesets)
  ui/<slug>      UI panels
"""
import io
import json
import math
import os
import re
import sys
import zipfile
from PIL import Image, ImageDraw

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'public', 'art', 'pl')
MANIFEST = os.path.join(ROOT, 'src', 'data', 'pixellab', 'library.json')

FW, FH, FEET = 48, 64, 60                      # game character frame
CHAR_ANIMS = [('idle', 2), ('walk', 4), ('attack', 3), ('cast', 3), ('hit', 1), ('death', 3)]
MON_ANIMS = [('idle', 2), ('walk', 4), ('attack', 3), ('hit', 1), ('death', 3)]
DIRS = [('down', 'south'), ('left', 'west'), ('right', 'east'), ('up', 'north')]
MIRROR = {'west': 'east', 'east': 'west', 'south-west': 'south-east', 'south-east': 'south-west', 'north-west': 'north-east', 'north-east': 'north-west'}

used = set()


def slugify(text, uid):
    stop = {'chibi', 'jrpg', 'pixel', 'art', 'a', 'an', 'the', 'of', 'with', 'and', 'in', 'on', 'drawn', 'flat', 'shaded', 'small', 'large', '1', '2', '3', '4'}
    words = [w for w in re.sub(r'[^a-z0-9 ]+', ' ', text.lower()).split() if w not in stop]
    base = '_'.join(words[:4]) or 'asset'
    s = f'{base}_{uid[:4]}'
    while s in used:
        s += 'x'
    used.add(s)
    return s


def save(im, rel):
    path = os.path.join(OUT, rel + '.webp')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, 'WEBP', lossless=True, method=6)
    return 'pl/' + rel


def ground_base(text):
    t = text.lower()
    for words, base in ((('water', 'lake', 'shallow', 'sea'), 'water'), (('sand', 'dune', 'beach'), 'sand'),
                        (('cobble', 'brick', 'stone', 'tower', 'floor', 'tile', 'slab', 'basalt', 'rock', 'void'), 'path_stone'),
                        (('dirt', 'road', 'path', 'earth', 'mud', 'camp', 'yard', 'farmland', 'arena'), 'dirt'),
                        (('snow',), 'sand'), (('forest', 'moss', 'leaf', 'peat', 'bog'), 'forest_floor')):
        if any(w in t for w in words):
            return base
    return 'grass'


# ---------------------------------------------------------------- objects
def clear_background(im):
    """Some PixelLab objects come on a solid backdrop (usually white). When the corners share one
    colour, everything of that colour connected to the edges is made transparent."""
    w, h = im.size
    corners = [im.getpixel(p) for p in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1))]
    solid = [c for c in corners if c[3] > 200]
    if len(solid) < 3:
        return im, False
    ref = solid[0]
    if any(sum((a - b) ** 2 for a, b in zip(c[:3], ref[:3])) > 40 ** 2 for c in solid):
        return im, False
    rgb = im.convert('RGB')
    key = (255, 0, 255)
    edge = [(x, 0) for x in range(0, w, 2)] + [(x, h - 1) for x in range(0, w, 2)] + [(0, y) for y in range(0, h, 2)] + [(w - 1, y) for y in range(0, h, 2)]
    for p in edge:
        c = rgb.getpixel(p)
        if c != key and sum((a - b) ** 2 for a, b in zip(c, ref[:3])) <= 48 ** 2:
            ImageDraw.floodfill(rgb, p, key, thresh=40)
    out = im.copy()
    px, ok = out.load(), rgb.load()
    for y in range(h):
        for x in range(w):
            if ok[x, y] == key:
                px[x, y] = (0, 0, 0, 0)
    return out, True


def objects(src, lib):
    for f in sorted(os.listdir(src)):
        if not f.startswith('object_'):
            continue
        uid = f[7:-4]
        z = zipfile.ZipFile(os.path.join(src, f))
        meta = json.loads(z.read([n for n in z.namelist() if n.endswith('.json')][0]))
        sheet = Image.open(io.BytesIO(z.read(meta['spritesheet']['path']))).convert('RGBA')
        cw, ch = meta['spritesheet']['cell_size']['width'], meta['spritesheet']['cell_size']['height']
        frame, cleared = clear_background(sheet.crop((0, 0, cw, ch)))
        box = frame.getbbox()
        if not box:
            continue
        name = meta['object'].get('prompt') or meta['object'].get('name') or uid
        slug = slugify(name, uid)
        frames = (sheet.width // cw) * (sheet.height // ch)
        lib['objects'].append({'id': uid, 'slug': slug, 'name': name[:160], 'w': cw, 'h': ch, 'frames': frames, 'art': save(frame, f'obj/{slug}'), **({'bgRemoved': True} if cleared else {})})


# ---------------------------------------------------------------- characters
def char_frames(z, meta):
    """Frames by (state, animation, direction), plus the base rotations."""
    states = meta.get('states') or [meta]
    rot, anims = {}, {}
    for s in states:
        fr = s.get('frames', {})
        for d, p in fr.get('rotations', {}).items():
            rot.setdefault(d, p)
        for a, dirs in fr.get('animations', {}).items():
            anims.setdefault(a, dirs)
    img = lambda p: Image.open(io.BytesIO(z.read(p))).convert('RGBA')
    return rot, anims, img


def pick(anims, *keys):
    for k in anims:
        if any(x in k.lower() for x in keys):
            return anims[k]
    return None


def frames_for(dirs, d, img, rot, n):
    """n frames of one direction (mirrored from the opposite side if missing)."""
    paths, flip = None, False
    if dirs:
        if d in dirs:
            paths = dirs[d]
        elif MIRROR.get(d) in dirs:
            paths, flip = dirs[MIRROR[d]], True
    if not paths:
        p = rot.get(d) or rot.get(MIRROR.get(d, d))
        flip = d not in rot
        out = [img(p)] * n
    else:
        idx = [round(i * (len(paths) - 1) / max(1, n - 1)) for i in range(n)] if n > 1 else [0]
        out = [img(paths[i]) for i in idx]
    return [o.transpose(Image.FLIP_LEFT_RIGHT) if flip else o for o in out]


def fit(frame, scale, w, h, feet):
    """Places a source frame (feet at its bbox bottom, centred) into a w x h cell."""
    box = frame.getbbox()
    cell = Image.new('RGBA', (w, h))
    if not box:
        return cell
    part = frame.crop(box)
    if scale != 1:
        part = part.resize((max(1, round(part.width * scale)), max(1, round(part.height * scale))), Image.NEAREST if scale >= 1 else Image.LANCZOS)
    cx = (box[0] + box[2]) / 2 - frame.width / 2
    x = round(w / 2 + cx * scale - part.width / 2)
    cell.alpha_composite(part, (max(0, min(w - part.width, x)) if part.width <= w else x, feet - part.height))
    return cell


def tint_red(im):
    r = Image.new('RGBA', im.size, (255, 60, 60, 0))
    out = Image.blend(im, Image.composite(Image.new('RGBA', im.size, (255, 60, 60, 255)), im, im), 0.35)
    out.putalpha(im.getchannel('A'))
    return out


def lying(im, k, feet):
    """Death frames: the standing pose tipping over around the feet."""
    angle = [15, 50, 85][k]
    big = Image.new('RGBA', (im.width * 2, im.height * 2))
    big.alpha_composite(im, (im.width // 2, im.height // 2))
    rot = big.rotate(angle, resample=Image.NEAREST, center=(big.width // 2, im.height // 2 + feet))
    return rot.crop((im.width // 2, im.height // 2, im.width // 2 + im.width, im.height // 2 + im.height))


def characters(src, lib):
    groups = set()
    for f in sorted(os.listdir(src)):
        if not f.startswith('character_'):
            continue
        uid = f[10:-4]
        z = zipfile.ZipFile(os.path.join(src, f))
        meta = json.loads(z.read('metadata.json'))
        group = meta.get('group_id')
        if group and group in groups:
            continue  # the same character saved in several states
        groups.add(group)
        rot, anims, img = char_frames(z, meta)
        if 'south' not in rot:
            continue
        st0 = (meta.get('states') or [meta])[0]
        name = st0.get('character', {}).get('prompt') or st0.get('character', {}).get('name') or uid
        slug = slugify(name, uid)
        base = img(rot['south'])
        bh = base.getbbox()[3] - base.getbbox()[1]
        scale = min(1.0, 50 / bh)
        walk, attack, cast, idle = pick(anims, 'walk'), pick(anims, 'slash', 'attack', 'strike'), pick(anims, 'spell', 'cast'), pick(anims, 'idle')
        walk = walk or pick(anims, 'run', 'sprint')
        # Game character sheet (48x64 frames).
        sheet = Image.new('RGBA', (FW * 16, FH * 4))
        for row, (_, d) in enumerate(DIRS):
            col = 0
            for anim, n in CHAR_ANIMS:
                src_dirs = {'idle': idle, 'walk': walk, 'attack': attack, 'cast': cast}.get(anim)
                frs = frames_for(src_dirs, d, img, rot, n) if anim in ('idle', 'walk', 'attack', 'cast') else frames_for(None, d, img, rot, n)
                for k, fr in enumerate(frs):
                    cell = fit(fr, scale, FW, FH, FEET)
                    if anim == 'hit':
                        cell = tint_red(cell)
                    if anim == 'death':
                        cell = lying(cell, k, FEET)
                    sheet.alpha_composite(cell, ((col + k) * FW, row * FH))
                col += n
        # Monster sheet: one row facing left, cells sized to the character.
        west = frames_for(walk, 'west', img, rot, 1)[0]
        b = west.getbbox()
        mw, mh = math.ceil((b[2] - b[0]) * scale) + 8, math.ceil(bh * scale) + 6
        msheet = Image.new('RGBA', (mw * 13, mh))
        col = 0
        for anim, n in MON_ANIMS:
            src_dirs = {'idle': idle, 'walk': walk, 'attack': attack}.get(anim)
            frs = frames_for(src_dirs, 'west', img, rot, n)
            for k, fr in enumerate(frs):
                cell = fit(fr, scale, mw, mh, mh - 3)
                if anim == 'hit':
                    cell = tint_red(cell)
                if anim == 'death':
                    cell = lying(cell, k, mh - 3)
                msheet.alpha_composite(cell, ((col + k) * mw, 0))
            col += n
        lib['characters'].append({
            'id': uid, 'slug': slug, 'name': name[:160], 'anims': sorted(anims),
            'chr': save(sheet, f'chr/{slug}'), 'mon': save(msheet, f'mon/{slug}'), 'monW': mw, 'monH': mh,
        })


# ---------------------------------------------------------------- ground tiles
def tiles(src, lib):
    for f in sorted(os.listdir(src)):
        if f.startswith('tiles_') and f.endswith('.zip'):
            uid = f[6:-4]
            z = zipfile.ZipFile(os.path.join(src, f))
            names = sorted([n for n in z.namelist() if n.endswith('.png')], key=lambda n: int(re.findall(r'(\d+)\.png$', n)[0]))
            cells = [Image.open(io.BytesIO(z.read(n))).convert('RGBA').resize((32, 32), Image.NEAREST) for n in names]
            title = re.sub(r'_\d+\.png$', '', names[0]).replace('_', ' ')
            title = re.sub(r'\s+', ' ', title.replace(' . ', ') ')).strip()
            kind = 'tiles'
        elif f.startswith('tileset_') and f.endswith('.png'):
            uid = f[8:-4]
            meta = json.load(open(os.path.join(src, f'tileset_{uid}.json')))
            sheet = Image.open(os.path.join(src, f)).convert('RGBA')
            ts = meta.get('tile_size', {}).get('width', 32)
            cells = []
            for t in meta.get('tileset_data', {}).get('tiles', []) or []:
                bb = t.get('bounding_box')
                if bb:
                    cells.append(sheet.crop((bb['x'], bb['y'], bb['x'] + bb['width'], bb['y'] + bb['height'])).resize((32, 32), Image.NEAREST))
            if not cells:
                cells = [sheet.crop((x, y, x + ts, y + ts)).resize((32, 32), Image.NEAREST) for y in range(0, sheet.height, ts) for x in range(0, sheet.width, ts)]
            title = meta.get('name', uid).replace('↗', '→')
            kind = 'wang'
        else:
            continue
        strip = Image.new('RGBA', (32 * len(cells), 32))
        for i, c in enumerate(cells):
            strip.alpha_composite(c, (i * 32, 0))
        slug = slugify(title, uid)
        lib['tiles'].append({'id': uid, 'slug': slug, 'name': title[:160], 'kind': kind, 'count': len(cells), 'base': ground_base(title), 'art': save(strip, f'tile/{slug}')})


def ui(src, lib):
    for f in sorted(os.listdir(src)):
        if f.startswith('ui_'):
            uid = f[3:-4]
            im = Image.open(os.path.join(src, f)).convert('RGBA')
            slug = slugify('ui panel ragnarok', uid)
            lib['ui'].append({'id': uid, 'slug': slug, 'name': 'UI panel (Ragnarok style)', 'w': im.width, 'h': im.height, 'art': save(im, f'ui/{slug}')})


def main(src):
    lib = {'source': 'PixelLab', 'objects': [], 'characters': [], 'tiles': [], 'ui': []}
    objects(src, lib)
    characters(src, lib)
    tiles(src, lib)
    ui(src, lib)
    os.makedirs(os.path.dirname(MANIFEST), exist_ok=True)
    with open(MANIFEST, 'w', encoding='utf-8') as f:
        json.dump(lib, f, ensure_ascii=False, indent=1)
        f.write('\n')
    size = sum(os.path.getsize(os.path.join(d, x)) for d, _, fs in os.walk(OUT) for x in fs)
    print({k: len(v) for k, v in lib.items() if isinstance(v, list)}, f'{size / 1e6:.1f} MB')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
