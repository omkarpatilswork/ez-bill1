"""Convert the PNGs from site-assets.mjs into the WebP files ezzbill.com uses.

Usage: python3 scripts/screens/site-assets-webp.py <pngDir> <ezzbill-site>/assets/screens

Phone screens, full-length scrolls and tab bars keep their size (390 px wide at 2x).
Desktop screens become desk-<name>.webp (1600 x 1000) and desk-<name>@1x.webp (800 x 500).
"""
import glob
import os
import sys

from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
os.makedirs(dst, exist_ok=True)
for path in sorted(glob.glob(os.path.join(src, '*.png'))):
    name = os.path.splitext(os.path.basename(path))[0]
    if name.endswith('-full') or name.endswith('-top'):
        continue  # working shots, not used on the site
    im = Image.open(path).convert('RGB')
    if name.startswith('desk-'):
        for suffix, size in (('', (1600, 1000)), ('@1x', (800, 500))):
            im.resize(size, Image.LANCZOS).save(os.path.join(dst, f'{name}{suffix}.webp'), 'WEBP', quality=80, method=6)
    else:
        im.save(os.path.join(dst, f'{name}.webp'), 'WEBP', quality=80, method=6)
    print(name, im.size)
