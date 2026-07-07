/**
 * Remove outside canvas (white + drop shadow) via edge flood-fill.
 * Keeps the full icon inside the dark blue rounded border; outside = transparent.
 * Output: electron/icon.png (1024), public/icon.png (256),
 *         electron/icon.ico, electron/icon.icns (platform installers)
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const png2icons = require('png2icons');

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultSrc = path.join(rootDir, 'electron', 'icon-source.png');

const srcPath = process.argv[2] ? path.resolve(process.argv[2]) : defaultSrc;
const pyScript = `
from PIL import Image, ImageDraw, ImageFilter, ImageChops
from collections import deque
import sys

src = sys.argv[1]
out_main = sys.argv[2]
out_ui = sys.argv[3]

im = Image.open(src).convert('RGBA')
w, h = im.size
px = im.load()

def lum(r, g, b):
    return 0.299 * r + 0.587 * g + 0.114 * b

def sat(r, g, b):
    return max(r, g, b) - min(r, g, b)

def is_outside(r, g, b, a):
    """Pixels reachable from image edges: white canvas and drop shadow."""
    if a < 16:
        return True
    if r >= 246 and g >= 246 and b >= 246:
        return True
    s = sat(r, g, b)
    l = lum(r, g, b)
    # gray drop shadow (low saturation, not dark icon ink)
    if s < 32 and 110 <= l <= 252:
        return True
    return False

outside = set()
queue = deque()

for x in range(w):
    for y in (0, h - 1):
        if is_outside(*px[x, y]):
            queue.append((x, y))
for y in range(h):
    for x in (0, w - 1):
        if is_outside(*px[x, y]):
            queue.append((x, y))

while queue:
    x, y = queue.popleft()
    if (x, y) in outside:
        continue
    if not is_outside(*px[x, y]):
        continue
    outside.add((x, y))
    for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
        if 0 <= nx < w and 0 <= ny < h:
            queue.append((nx, ny))

for x, y in outside:
    px[x, y] = (0, 0, 0, 0)

def has_transparent_neighbor(rpx, x, y, w, h, threshold=28):
    for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (1, 1), (-1, 1), (1, -1)):
        nx, ny = x + dx, y + dy
        if 0 <= nx < w and 0 <= ny < h and rpx[nx, ny][3] < threshold:
            return True
    return False

def is_light_fringe(r, g, b, a):
    """White, gray, pale blue-gray and other near-white fringe pixels."""
    if a < 16:
        return False
    l = lum(r, g, b)
    s = sat(r, g, b)
    mn = min(r, g, b)
    mx = max(r, g, b)
    if mn >= 200 and l >= 190:
        return True
    if mn >= 175 and l >= 165 and s < 72:
        return True
    if l >= 145 and s < 62:
        return True
    if l >= 118 and s < 38:
        return True
    if l >= 105 and s < 82 and b >= mx - 8 and mn >= 90:
        return True
    if l >= 125 and s < 48 and mx - mn < 40:
        return True
    return False

def is_dark_enough(r, g, b, a, min_alpha=150):
    if a < min_alpha:
        return False
    l = lum(r, g, b)
    s = sat(r, g, b)
    if l < 138:
        return True
    if s > 42 and l < 172:
        return True
    if b > r + 8 and b > g and l < 185:
        return True
    return False

def sample_inward_opaque(rpx, x, y, w, h, min_alpha=180):
    for radius in range(1, 14):
        dark = []
        any_colors = []
        for dx in range(-radius, radius + 1):
            for dy in range(-radius, radius + 1):
                if dx == 0 and dy == 0:
                    continue
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h:
                    pr, pg, pb, pa = rpx[nx, ny]
                    if pa >= min_alpha:
                        any_colors.append((pr, pg, pb))
                        if is_dark_enough(pr, pg, pb, pa):
                            dark.append((pr, pg, pb))
        pick = dark if dark else any_colors
        if pick:
            n = len(pick)
            return (
                sum(c[0] for c in pick) // n,
                sum(c[1] for c in pick) // n,
                sum(c[2] for c in pick) // n,
            )
    return None

def edge_depth_map(icon):
    rpx = icon.load()
    w, h = icon.size
    dist = {}
    q = deque()
    for y in range(h):
        for x in range(w):
            if rpx[x, y][3] < 18:
                dist[(x, y)] = 0
                q.append((x, y))
    while q:
        x, y = q.popleft()
        d = dist[(x, y)]
        if d >= 14:
            continue
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in dist:
                if rpx[nx, ny][3] >= 10:
                    dist[(nx, ny)] = d + 1
                    q.append((nx, ny))
    return dist

def strip_white_outer_fringe(icon, passes=8):
    rpx = icon.load()
    w, h = icon.size
    for _ in range(passes):
        to_clear = []
        for y in range(h):
            for x in range(w):
                pr, pg, pb, pa = rpx[x, y]
                if pa < 16:
                    continue
                if not has_transparent_neighbor(rpx, x, y, w, h):
                    continue
                if is_light_fringe(pr, pg, pb, pa):
                    to_clear.append((x, y))
        if not to_clear:
            break
        for x, y in to_clear:
            rpx[x, y] = (0, 0, 0, 0)
    return icon

def clean_light_edge_band(icon, max_depth=9):
    """Remove or replace near-white pixels in the border band."""
    dist = edge_depth_map(icon)
    rpx = icon.load()
    w, h = icon.size
    for y in range(h):
        for x in range(w):
            pr, pg, pb, pa = rpx[x, y]
            if pa < 12:
                rpx[x, y] = (0, 0, 0, 0)
                continue
            depth = dist.get((x, y), 999)
            if depth > max_depth:
                continue
            if not is_light_fringe(pr, pg, pb, pa):
                continue
            inner = sample_inward_opaque(rpx, x, y, w, h)
            if depth <= 3 or inner is None:
                rpx[x, y] = (0, 0, 0, 0)
            else:
                ir, ig, ib = inner
                rpx[x, y] = (ir, ig, ib, pa)
    return icon

def spill_inward_edge_color(icon):
    rpx = icon.load()
    w, h = icon.size
    for y in range(h):
        for x in range(w):
            pr, pg, pb, pa = rpx[x, y]
            if pa < 12:
                rpx[x, y] = (0, 0, 0, 0)
                continue
            if pa >= 252 and not has_transparent_neighbor(rpx, x, y, w, h):
                continue
            inner = sample_inward_opaque(rpx, x, y, w, h)
            if inner is None:
                if has_transparent_neighbor(rpx, x, y, w, h) and is_light_fringe(pr, pg, pb, pa):
                    rpx[x, y] = (0, 0, 0, 0)
                continue
            ir, ig, ib = inner
            if has_transparent_neighbor(rpx, x, y, w, h) and is_light_fringe(pr, pg, pb, pa):
                rpx[x, y] = (ir, ig, ib, pa)
            elif pa < 250 and has_transparent_neighbor(rpx, x, y, w, h):
                rpx[x, y] = (
                    int(pr * 0.2 + ir * 0.8),
                    int(pg * 0.2 + ig * 0.8),
                    int(pb * 0.2 + ib * 0.8),
                    pa,
                )
    return icon

def estimate_corner_radius(alpha, threshold=96):
    w, h = alpha.size
    apx = alpha.load()
    rx = 0
    for x in range(w):
        if apx[x, 0] >= threshold or (h > 1 and apx[x, 1] >= threshold):
            rx = x
            break
    ry = 0
    for y in range(h):
        if apx[0, y] >= threshold or (w > 1 and apx[1, y] >= threshold):
            ry = y
            break
    fallback = int(min(w, h) * 0.19)
    return max(rx, ry, fallback)

def refine_outer_edge(icon):
    r, g, b, a = icon.split()

    # Remove speckle, keep solid silhouette
    a = a.filter(ImageFilter.ModeFilter(3))
    a = a.filter(ImageFilter.MaxFilter(3))
    a = a.filter(ImageFilter.MinFilter(3))

    iw, ih = icon.size
    radius = estimate_corner_radius(a)
    mask = Image.new('L', (iw, ih), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, iw - 1, ih - 1), radius=radius, fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(1.8))

    a = ImageChops.multiply(a, mask)
    a = a.filter(ImageFilter.GaussianBlur(0.9))

    result = Image.merge('RGBA', (r, g, b, a))
    result = strip_white_outer_fringe(result, passes=10)
    result = clean_light_edge_band(result, max_depth=10)
    result = spill_inward_edge_color(result)
    result = strip_white_outer_fringe(result, passes=4)
    result = clean_light_edge_band(result, max_depth=6)
    return result

bbox = im.getbbox()
if not bbox:
    raise SystemExit('No icon content detected after background removal')

icon = refine_outer_edge(im.crop(bbox))
size = max(icon.size)
square = Image.new('RGBA', (size, size), (0, 0, 0, 0))
ox = (size - icon.size[0]) // 2
oy = (size - icon.size[1]) // 2
square.paste(icon, (ox, oy), icon)

# Refine again at 2x before downscaling for smoother outer curve
big = square.resize((size * 2, size * 2), Image.Resampling.LANCZOS)
big = refine_outer_edge(big)

main = big.resize((1024, 1024), Image.Resampling.LANCZOS)
ui = big.resize((256, 256), Image.Resampling.LANCZOS)
main.save(out_main, 'PNG')
ui.save(out_ui, 'PNG')
print(f'icon prepared: {out_main} ({main.size[0]}x{main.size[1]})')
`;

const electronIcon = path.join(rootDir, 'electron', 'icon.png');
const publicIcon = path.join(rootDir, 'public', 'icon.png');
const electronIco = path.join(rootDir, 'electron', 'icon.ico');
const electronIcns = path.join(rootDir, 'electron', 'icon.icns');

if (!fs.existsSync(srcPath)) {
  console.error(`Source image not found: ${srcPath}`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(electronIcon), { recursive: true });
fs.mkdirSync(path.dirname(publicIcon), { recursive: true });

const result = spawnSync('python', ['-c', pyScript, srcPath, electronIcon, publicIcon], {
  stdio: 'inherit',
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

const iconBuffer = fs.readFileSync(electronIcon);
const ico = png2icons.createICO(iconBuffer, png2icons.BILINEAR, 0, false, true);
const icns = png2icons.createICNS(iconBuffer, png2icons.BILINEAR, 0);

if (!ico) {
  console.error('Failed to generate electron/icon.ico');
  process.exit(1);
}
if (!icns) {
  console.error('Failed to generate electron/icon.icns');
  process.exit(1);
}

fs.writeFileSync(electronIco, ico);
fs.writeFileSync(electronIcns, icns);
console.log(`icon prepared: ${electronIco}`);
console.log(`icon prepared: ${electronIcns}`);
