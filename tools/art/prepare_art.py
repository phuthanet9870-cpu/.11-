"""Convert the Veyloria art packs into the files the game loads (public/art/*.webp).

Usage: python3 tools/art/prepare_art.py <packs-dir>
<packs-dir> holds the unzipped packs: tiles/tiles/<theme>.png, props/props/<theme>.png,
Veyloria-Architecture-Assets/sprites/<theme>/<part>.png and Veyloria-Aurelion-Objects/objects/*.png.
Images are copied as they are (WebP, high quality); only the palace is scaled down to its in-game size.
"""
import os
import sys
from PIL import Image

src = sys.argv[1]
out = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'art')


def save(im, path, max_w=None):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if max_w and im.width > max_w:
        im = im.resize((max_w, round(im.height * max_w / im.width)), Image.LANCZOS)
    im.save(path, 'WEBP', quality=90, method=6)


for kind in ('tiles', 'props'):
    folder = os.path.join(src, kind, kind)
    for name in sorted(os.listdir(folder)):
        if name.endswith('.png'):
            save(Image.open(os.path.join(folder, name)), os.path.join(out, kind, name[:-4] + '.webp'))

arch = os.path.join(src, 'Veyloria-Architecture-Assets', 'sprites')
for theme in sorted(os.listdir(arch)):
    for name in sorted(os.listdir(os.path.join(arch, theme))):
        if name.endswith('.png'):
            save(Image.open(os.path.join(arch, theme, name)), os.path.join(out, 'arch', theme, name[:-4] + '.webp'))

# Royal Capital landmarks used by its dry-land plan (the harbour, canal and farm pieces are not used).
AURELION = {'cathedral', 'grand-palace', 'royal-statue', 'stall-blue', 'stall-gold', 'stall-red', 'training-dummy'}
objs = os.path.join(src, 'Veyloria-Aurelion-Objects', 'objects')
for name in sorted(os.listdir(objs)):
    if name[:-4] in AURELION and name.endswith('.png'):
        save(Image.open(os.path.join(objs, name)), os.path.join(out, 'aurelion', name[:-4] + '.webp'), max_w=1000)

total = sum(os.path.getsize(os.path.join(d, f)) for d, _, fs in os.walk(out) for f in fs)
print(f'{sum(len(fs) for _, _, fs in os.walk(out))} files, {total / 1e6:.1f} MB in {os.path.normpath(out)}')
