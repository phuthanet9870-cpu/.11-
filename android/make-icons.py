# Launcher icons for the Android build: a shadow head with glowing eyes on a dark gem (original art).
import sys, os
from PIL import Image, ImageDraw, ImageFilter
out = sys.argv[1]
for name, size in [('mdpi', 48), ('hdpi', 72), ('xhdpi', 96), ('xxhdpi', 144), ('xxxhdpi', 192)]:
    S = 512
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((16, 16, S - 16, S - 16), 110, fill=(26, 18, 40, 255), outline=(243, 210, 122, 255), width=14)
    glow = Image.new('RGBA', (S, S), (0, 0, 0, 0)); g = ImageDraw.Draw(glow)
    g.ellipse((96, 120, 416, 470), fill=(127, 214, 255, 120))
    im.alpha_composite(glow.filter(ImageFilter.GaussianBlur(40)))
    d = ImageDraw.Draw(im)
    d.polygon([(256, 70), (330, 200), (182, 200)], fill=(10, 9, 16, 255))          # hood tip
    d.ellipse((150, 150, 362, 380), fill=(10, 9, 16, 255))                          # head
    d.rectangle((120, 340, 392, 470), fill=(10, 9, 16, 255))                        # shoulders
    eyes = Image.new('RGBA', (S, S), (0, 0, 0, 0)); e = ImageDraw.Draw(eyes)
    for x in (200, 284):
        e.rounded_rectangle((x - 22, 245, x + 22, 275), 8, fill=(127, 214, 255, 255))
    im.alpha_composite(eyes.filter(ImageFilter.GaussianBlur(14)))
    im.alpha_composite(eyes)
    d = ImageDraw.Draw(im)
    for x in (200, 284):
        d.rounded_rectangle((x - 12, 252, x + 8, 266), 5, fill=(230, 248, 255, 255))
    os.makedirs(f'{out}/mipmap-{name}', exist_ok=True)
    im.resize((size, size), Image.LANCZOS).save(f'{out}/mipmap-{name}/ic_launcher.png')
