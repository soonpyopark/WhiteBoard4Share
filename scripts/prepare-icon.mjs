/**
 * Prepare platform icons from electron/icon-source.png.
 *
 * Default (--simple): crop to content, square pad, resize per target size.
 *   Best for clean source PNGs (minimal blur / edge rewriting).
 *
 * Legacy (--legacy): flood-fill background removal + edge fringe cleanup + blur.
 *   For sources with white canvas and drop shadow outside the icon.
 *
 * Output:
 *   electron/icon.png (1024), icon-256.png, icon-32.png, splash-icon.png (136)
 *   public/icon.png (512), icon-56.png, icon-136.png
 *   electron/icon.ico, electron/icon.icns
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
const useLegacy = process.argv.includes('--legacy');
const srcArg = process.argv.find((arg) => !arg.startsWith('-') && arg.endsWith('.png'));
const srcPath = srcArg ? path.resolve(srcArg) : defaultSrc;

const pyScript = `
from PIL import Image, ImageDraw, ImageFilter, ImageChops, ImageEnhance
from collections import deque
import sys

mode = sys.argv[1]
src = sys.argv[2]
out_main = sys.argv[3]
out_ui = sys.argv[4]
out_ui_56 = sys.argv[5]
out_splash = sys.argv[6]
out_icon_256 = sys.argv[7]
out_icon_32 = sys.argv[8]

im = Image.open(src).convert('RGBA')
w, h = im.size
px = im.load()

def lum(r, g, b):
    return 0.299 * r + 0.587 * g + 0.114 * b

def sat(r, g, b):
    return max(r, g, b) - min(r, g, b)

def is_outside(r, g, b, a):
    if a < 16:
        return True
    if r >= 246 and g >= 246 and b >= 246:
        return True
    s = sat(r, g, b)
    l = lum(r, g, b)
    if s < 32 and 110 <= l <= 252:
        return True
    return False

def remove_outside_canvas(image):
    work = image.copy()
    rpx = work.load()
    ww, wh = work.size
    outside = set()
    queue = deque()

    for x in range(ww):
        for y in (0, wh - 1):
            if is_outside(*rpx[x, y]):
                queue.append((x, y))
    for y in range(wh):
        for x in (0, ww - 1):
            if is_outside(*rpx[x, y]):
                queue.append((x, y))

    while queue:
        x, y = queue.popleft()
        if (x, y) in outside:
            continue
        if not is_outside(*rpx[x, y]):
            continue
        outside.add((x, y))
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < ww and 0 <= ny < wh:
                queue.append((nx, ny))

    for x, y in outside:
        rpx[x, y] = (0, 0, 0, 0)
    return work

def has_transparent_neighbor(rpx, x, y, ww, wh, threshold=28):
    for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (1, 1), (-1, 1), (1, -1)):
        nx, ny = x + dx, y + dy
        if 0 <= nx < ww and 0 <= ny < wh and rpx[nx, ny][3] < threshold:
            return True
    return False

def is_light_fringe(r, g, b, a):
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

def sample_inward_opaque(rpx, x, y, ww, wh, min_alpha=180):
    for radius in range(1, 14):
        dark = []
        any_colors = []
        for dx in range(-radius, radius + 1):
            for dy in range(-radius, radius + 1):
                if dx == 0 and dy == 0:
                    continue
                nx, ny = x + dx, y + dy
                if 0 <= nx < ww and 0 <= ny < wh:
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
    ww, wh = icon.size
    dist = {}
    q = deque()
    for y in range(wh):
        for x in range(ww):
            if rpx[x, y][3] < 18:
                dist[(x, y)] = 0
                q.append((x, y))
    while q:
        x, y = q.popleft()
        d = dist[(x, y)]
        if d >= 14:
            continue
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < ww and 0 <= ny < wh and (nx, ny) not in dist:
                if rpx[nx, ny][3] >= 10:
                    dist[(nx, ny)] = d + 1
                    q.append((nx, ny))
    return dist

def strip_white_outer_fringe(icon, passes=8):
    rpx = icon.load()
    ww, wh = icon.size
    for _ in range(passes):
        to_clear = []
        for y in range(wh):
            for x in range(ww):
                pr, pg, pb, pa = rpx[x, y]
                if pa < 16:
                    continue
                if not has_transparent_neighbor(rpx, x, y, ww, wh):
                    continue
                if is_light_fringe(pr, pg, pb, pa):
                    to_clear.append((x, y))
        if not to_clear:
            break
        for x, y in to_clear:
            rpx[x, y] = (0, 0, 0, 0)
    return icon

def clean_light_edge_band(icon, max_depth=9):
    dist = edge_depth_map(icon)
    rpx = icon.load()
    ww, wh = icon.size
    for y in range(wh):
        for x in range(ww):
            pr, pg, pb, pa = rpx[x, y]
            if pa < 12:
                rpx[x, y] = (0, 0, 0, 0)
                continue
            depth = dist.get((x, y), 999)
            if depth > max_depth:
                continue
            if not is_light_fringe(pr, pg, pb, pa):
                continue
            inner = sample_inward_opaque(rpx, x, y, ww, wh)
            if depth <= 3 or inner is None:
                rpx[x, y] = (0, 0, 0, 0)
            else:
                ir, ig, ib = inner
                rpx[x, y] = (ir, ig, ib, pa)
    return icon

def spill_inward_edge_color(icon):
    rpx = icon.load()
    ww, wh = icon.size
    for y in range(wh):
        for x in range(ww):
            pr, pg, pb, pa = rpx[x, y]
            if pa < 12:
                rpx[x, y] = (0, 0, 0, 0)
                continue
            if pa >= 252 and not has_transparent_neighbor(rpx, x, y, ww, wh):
                continue
            inner = sample_inward_opaque(rpx, x, y, ww, wh)
            if inner is None:
                if has_transparent_neighbor(rpx, x, y, ww, wh) and is_light_fringe(pr, pg, pb, pa):
                    rpx[x, y] = (0, 0, 0, 0)
                continue
            ir, ig, ib = inner
            if has_transparent_neighbor(rpx, x, y, ww, wh) and is_light_fringe(pr, pg, pb, pa):
                rpx[x, y] = (ir, ig, ib, pa)
            elif pa < 250 and has_transparent_neighbor(rpx, x, y, ww, wh):
                rpx[x, y] = (
                    int(pr * 0.2 + ir * 0.8),
                    int(pg * 0.2 + ig * 0.8),
                    int(pb * 0.2 + ib * 0.8),
                    pa,
                )
    return icon

def estimate_corner_radius(alpha, threshold=96):
    ww, wh = alpha.size
    apx = alpha.load()
    rx = 0
    for x in range(ww):
        if apx[x, 0] >= threshold or (wh > 1 and apx[x, 1] >= threshold):
            rx = x
            break
    ry = 0
    for y in range(wh):
        if apx[0, y] >= threshold or (ww > 1 and apx[1, y] >= threshold):
            ry = y
            break
    fallback = int(min(ww, wh) * 0.19)
    return max(rx, ry, fallback)

def refine_outer_edge(icon):
    r, g, b, a = icon.split()
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

def to_square(icon):
    bbox = icon.getbbox()
    if not bbox:
        raise SystemExit('No icon content detected')
    cropped = icon.crop(bbox)
    size = max(cropped.size)
    square = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    ox = (size - cropped.size[0]) // 2
    oy = (size - cropped.size[1]) // 2
    square.paste(cropped, (ox, oy), cropped)
    return square

def resize_sharp(icon, target):
    return icon.resize((target, target), Image.Resampling.LANCZOS)

def process_legacy(image):
    work = remove_outside_canvas(image)
    bbox = work.getbbox()
    if not bbox:
        raise SystemExit('No icon content detected after background removal')
    icon = refine_outer_edge(work.crop(bbox))
    square = to_square(icon)
    big = square.resize((square.size[0] * 2, square.size[1] * 2), Image.Resampling.LANCZOS)
    big = refine_outer_edge(big)
    return big

def process_simple(image):
    return to_square(image)

if mode == 'legacy':
    base = process_legacy(im)
    main = base.resize((1024, 1024), Image.Resampling.LANCZOS)
    ui = base.resize((512, 512), Image.Resampling.LANCZOS)
    ui_56 = base.resize((56, 56), Image.Resampling.LANCZOS)
    splash = base.resize((136, 136), Image.Resampling.LANCZOS)
    icon_256 = base.resize((256, 256), Image.Resampling.LANCZOS)
    icon_32 = base.resize((32, 32), Image.Resampling.LANCZOS)
else:
    square = process_simple(im)
    main = resize_sharp(square, 1024)
    ui = resize_sharp(square, 512)
    ui_56 = resize_sharp(square, 56)
    splash = resize_sharp(square, 136)
    icon_256 = resize_sharp(square, 256)
    icon_32 = resize_sharp(square, 32)

main.save(out_main, 'PNG')
ui.save(out_ui, 'PNG')
ui_56.save(out_ui_56, 'PNG')
splash.save(out_splash, 'PNG')
icon_256.save(out_icon_256, 'PNG')
icon_32.save(out_icon_32, 'PNG')
print(f'icon prepared: {out_main} ({main.size[0]}x{main.size[1]}) mode={mode}')
`;

const electronIcon = path.join(rootDir, 'electron', 'icon.png');
const electronIcon256 = path.join(rootDir, 'electron', 'icon-256.png');
const electronIcon32 = path.join(rootDir, 'electron', 'icon-32.png');
const electronSplashIcon = path.join(rootDir, 'electron', 'splash-icon.png');
const publicIcon = path.join(rootDir, 'public', 'icon.png');
const publicIcon56 = path.join(rootDir, 'public', 'icon-56.png');
const electronIco = path.join(rootDir, 'electron', 'icon.ico');
const electronIcns = path.join(rootDir, 'electron', 'icon.icns');

if (!fs.existsSync(srcPath)) {
  console.error(`Source image not found: ${srcPath}`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(electronIcon), { recursive: true });
fs.mkdirSync(path.dirname(publicIcon), { recursive: true });

const mode = useLegacy ? 'legacy' : 'simple';
const result = spawnSync(
  'python',
  [
    '-c',
    pyScript,
    mode,
    srcPath,
    electronIcon,
    publicIcon,
    publicIcon56,
    electronSplashIcon,
    electronIcon256,
    electronIcon32,
  ],
  { stdio: 'inherit' },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

fs.copyFileSync(electronSplashIcon, path.join(rootDir, 'public', 'icon-136.png'));

// Windows taskbar/title bar: build ICO from 256px (sharper 16–48px than downsampling from 1024).
const icon256Buffer = fs.readFileSync(electronIcon256);
const ico = png2icons.createICO(icon256Buffer, png2icons.HERMITE, 0, false, true);
const icns = png2icons.createICNS(fs.readFileSync(electronIcon), png2icons.BICUBIC2, 0);

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
