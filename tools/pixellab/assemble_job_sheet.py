# Usage: python3 assemble_job_sheet.py <export dir> <out.png> idle=<anim> walk=<anim> attack=<anim> cast=<anim> hit=<anim> death=<anim>
# Cells are 80x72 with the feet 4 px above the bottom (the game reads bigger cells from the sheet size).
# Builds a classic 16-column character sheet (48x64 cells; rows down, left, right, up) from a PixelLab
# character export folder: <dir>/rotations/<dir>.png and <dir>/animations/<name>/<dir>/frame_NNN.png.
# Clips: idle 2, walk 4, attack 3, cast 3, hit 1, death 3 (see CHAR_ANIMS in src/game/art/spriteMeta.ts).
import sys, os, glob
from PIL import Image
src, out = sys.argv[1], sys.argv[2]
names = dict(a.split('=') for a in sys.argv[3:])  # idle=<anim folder>, walk=..., attack=..., cast=..., hit=..., death=...
DIRS = [('down', 'south'), ('left', 'west'), ('right', 'east'), ('up', 'north')]
CLIPS = [('idle', 0, 2), ('walk', 2, 4), ('attack', 6, 3), ('cast', 9, 3), ('hit', 12, 1), ('death', 13, 3)]
W, H, FEET = 80, 72, 68
def raw(clip, d):
    n = names.get(clip)
    if n:
        fs = sorted(glob.glob(os.path.join(src, 'animations', n, d, 'frame_*.png')))
        if fs: return [Image.open(f).convert('RGBA') for f in fs]
    return None
def frames(clip, d):
    fs = raw(clip, d)
    # East missing: mirror west (classic sprite games draw one side and flip it).
    if fs is None and d == 'east':
        w = raw(clip, 'west')
        if w: return [f.transpose(Image.FLIP_LEFT_RIGHT) for f in w]
    if fs: return fs
    return [Image.open(os.path.join(src, 'rotations', f'{d}.png')).convert('RGBA')]
def pick(fs, k):  # k evenly spread frames
    if len(fs) <= k: return fs + [fs[-1]] * (k - len(fs))
    return [fs[round(i * (len(fs) - 1) / max(1, k - 1))] for i in range(k)]
# Common scale: the standing sprite's height must fit 56 px; feet at y=60, centred.
rot = Image.open(os.path.join(src, 'rotations', 'south.png')).convert('RGBA')
bb = rot.getbbox(); sh = bb[3] - bb[1]
scale = 1.0
cx_src = (bb[0] + bb[2]) / 2; feet_src = bb[3]
sheet = Image.new('RGBA', (W * 16, H * 4))
for row, (_, d) in enumerate(DIRS):
    for clip, start, k in CLIPS:
        for i, fr in enumerate(pick(frames(clip, d), k)):
            img = fr.resize((round(fr.width * scale), round(fr.height * scale)), Image.NEAREST) if scale != 1 else fr
            # Frames on a bigger canvas are centred on the same point as the rotation canvas.
            pad_x = (fr.width - rot.width) / 2; pad_y = (fr.height - rot.height) / 2
            ox = round(W / 2 - (cx_src + pad_x) * scale); oy = round(FEET - (feet_src + pad_y) * scale)
            cell = Image.new('RGBA', (W, H))
            cell.paste(img, (ox, oy), img)
            sheet.alpha_composite(cell, ((start + i) * W, row * H))
sheet.save(out)
print('scale', scale, 'sprite h', sh, '->', out)
