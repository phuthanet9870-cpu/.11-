# Builds public/art/sprites/class/<job>.webp for every job from the PixelLab exports in <exports dir>/<job>/
# (rotations + any animations: idle, walk, attack, cast, hit, death), and writes src/data/jobSprites.ts.
# High and transcendent jobs reuse the sheet of the job they come from, with a gold outline.
import json, os, subprocess, sys
from PIL import Image, ImageFilter
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
exports = sys.argv[1]
classes = json.load(open(os.path.join(ROOT, 'src/data/classes.json')))
out_dir = os.path.join(ROOT, 'public/art/sprites/class'); os.makedirs(out_dir, exist_ok=True)
base_of = {}
for c in classes:
    cid = c['id']; req = c.get('requirements') or {}
    if cid == 'high_novice': base_of[cid] = 'novice'
    elif cid.startswith('high_') and c['tier'] == 1: base_of[cid] = cid[5:]
    elif c['tier'] == 3: base_of[cid] = req.get('rebornFrom')
    else: base_of[cid] = cid
done = []
assembler = os.path.join(ROOT, 'tools/pixellab/assemble_job_sheet.py')
sheets = {}
for base in sorted(set(base_of.values())):
    src = os.path.join(exports, base)
    if not os.path.exists(os.path.join(src, 'rotations', 'south.png')): continue
    anims = [a for a in ('idle', 'walk', 'attack', 'cast', 'hit', 'death') if os.path.isdir(os.path.join(src, 'animations', a))]
    png = os.path.join(exports, f'{base}.sheet.png')
    subprocess.run([sys.executable, assembler, src, png] + [f'{a}={a}' for a in anims], check=True, stdout=subprocess.DEVNULL)
    sheets[base] = Image.open(png).convert('RGBA')
def gold_outline(im):
    a = im.split()[3].point(lambda v: 255 if v > 60 else 0)
    ring = a.filter(ImageFilter.MaxFilter(3))
    glow = Image.new('RGBA', im.size, (255, 214, 96, 0)); glow.putalpha(ring.point(lambda v: 150 if v else 0))
    glow.alpha_composite(im); return glow
for cid, base in base_of.items():
    if base not in sheets: continue
    im = sheets[base] if cid == base else gold_outline(sheets[base]) if cid != base and (cid.startswith('high_') or True) else sheets[base]
    im.save(os.path.join(out_dir, f'{cid}.webp'), lossless=True, quality=100, method=6)
    done.append(cid)
with open(os.path.join(ROOT, 'src/data/jobSprites.ts'), 'w') as f:
    f.write('// Job character sheets drawn with PixelLab (tools/pixellab/build_job_sprites.py): public/art/sprites/class/<job>.webp.\n')
    f.write('// Loaded before the game starts like Studio sprites; they replace the procedural sheets of these jobs.\n')
    f.write('export const JOB_SPRITES: string[] = ' + json.dumps([f'sprites/class/{c}' for c in sorted(done)], indent=1) + ';\n')
print(len(done), 'job sheets from', len(sheets), 'drawn characters:', ' '.join(sorted(sheets)))
