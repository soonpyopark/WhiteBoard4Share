"""Extract size-variant app icons from the sheet and refresh project assets."""
from __future__ import annotations

import subprocess
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SHEET = ROOT / "electron" / "icon-sheet" / "icon-variants.png"
CROPS = ROOT / "_icon_crops"


def dilate_mask(mask: np.ndarray, radius: int) -> np.ndarray:
    """Binary dilate with a disk of the given radius."""
    if radius <= 0:
        return mask
    img = Image.fromarray((mask.astype(np.uint8) * 255), mode="L")
    # MaxFilter size must be odd
    size = radius * 2 + 1
    for _ in range(1):
        img = img.filter(ImageFilter.MaxFilter(min(size, 15)))
    # For larger radii, repeat
    remaining = radius - 7 if size > 15 else 0
    while remaining > 0:
        step = min(7, remaining)
        img = img.filter(ImageFilter.MaxFilter(step * 2 + 1))
        remaining -= step
    return np.array(img) > 0


def find_logo_groups(sheet_rgb: np.ndarray) -> list[tuple[int, int, int, int]]:
    r, g, b = (sheet_rgb[:, :, i].astype(np.int16) for i in range(3))
    lum = (r.astype(np.float32) + g + b) / 3
    sat = np.maximum(np.maximum(r, g), b) - np.minimum(np.minimum(r, g), b)
    logo = ((sat > 40) & (lum < 220)) | ((lum < 70) & (sat > 8))
    h, w = logo.shape
    visited = np.zeros_like(logo)
    comps: list[tuple[int, int, int, int, int]] = []
    for y in range(h):
        for x in np.where(logo[y] & ~visited[y])[0]:
            if visited[y, x]:
                continue
            q: deque[tuple[int, int]] = deque([(int(x), int(y))])
            visited[y, x] = True
            minx = maxx = int(x)
            miny = maxy = int(y)
            count = 0
            while q:
                cx, cy = q.popleft()
                count += 1
                minx, maxx = min(minx, cx), max(maxx, cx)
                miny, maxy = min(miny, cy), max(maxy, cy)
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < w and 0 <= ny < h and logo[ny, nx] and not visited[ny, nx]:
                        visited[ny, nx] = True
                        q.append((nx, ny))
            if count >= 120:
                comps.append((minx, miny, maxx, maxy, count))

    comps.sort(key=lambda c: -c[4])
    groups: list[tuple[int, int, int, int]] = []
    used = [False] * len(comps)
    for i, c in enumerate(comps):
        if used[i]:
            continue
        x0, y0, x1, y1, _ = c
        changed = True
        while changed:
            changed = False
            for j, d in enumerate(comps):
                if used[j] or j == i:
                    continue
                gap = 32
                if d[0] <= x1 + gap and d[2] >= x0 - gap and d[1] <= y1 + gap and d[3] >= y0 - gap:
                    x0, y0 = min(x0, d[0]), min(y0, d[1])
                    x1, y1 = max(x1, d[2]), max(y1, d[3])
                    used[j] = True
                    changed = True
        used[i] = True
        groups.append((x0, y0, x1, y1))
    return groups


def crop_icon_tile(sheet: Image.Image, logo_box: tuple[int, int, int, int]) -> Image.Image | None:
    """Crop the white rounded-square tile that contains the logo artwork."""
    x0, y0, x1, y1 = logo_box
    bw, bh = x1 - x0 + 1, y1 - y0 + 1
    # White face extends beyond logo; dilate logo coverage to capture the tile.
    radius = max(18, int(max(bw, bh) * 0.22))
    w, h = sheet.size
    # Build local mask
    pad = radius + 8
    rx0, ry0 = max(0, x0 - pad), max(0, y0 - pad)
    rx1, ry1 = min(w, x1 + pad + 1), min(h, y1 + pad + 1)
    local = sheet.crop((rx0, ry0, rx1, ry1)).convert("RGB")
    la = np.array(local)
    lr, lg, lb = (la[:, :, i].astype(np.int16) for i in range(3))
    llum = (lr.astype(np.float32) + lg + lb) / 3
    lsat = np.maximum(np.maximum(lr, lg), lb) - np.minimum(np.minimum(lr, lg), lb)
    logo = ((lsat > 40) & (llum < 220)) | ((llum < 70) & (lsat > 8))
    cover = dilate_mask(logo, radius)

    # Also include soft drop-shadow gray near the dilated logo (for natural tile edge)
    shadow = (lsat < 20) & (llum < 245) & (llum > 170)
    cover = cover | (shadow & dilate_mask(logo, radius + 6))

    ys, xs = np.where(cover)
    if len(xs) == 0:
        return None
    bx0, bx1 = int(xs.min()), int(xs.max()) + 1
    by0, by1 = int(ys.min()), int(ys.max()) + 1

    # Square around the covered area
    side = max(bx1 - bx0, by1 - by0)
    cx = (bx0 + bx1) / 2
    cy = (by0 + by1) / 2
    sx0 = int(round(cx - side / 2))
    sy0 = int(round(cy - side / 2))
    sx1, sy1 = sx0 + side, sy0 + side
    # Clamp into local crop
    lw, lh = local.size
    if sx0 < 0:
        sx1 -= sx0
        sx0 = 0
    if sy0 < 0:
        sy1 -= sy0
        sy0 = 0
    if sx1 > lw:
        d = sx1 - lw
        sx0 = max(0, sx0 - d)
        sx1 = lw
    if sy1 > lh:
        d = sy1 - lh
        sy0 = max(0, sy0 - d)
        sy1 = lh
    tile = local.crop((sx0, sy0, sx1, sy1))
    # Force exact square by padding if clamp shrank one side
    tw, th = tile.size
    if tw != th:
        side = max(tw, th)
        sq = Image.new("RGB", (side, side), (255, 255, 255))
        sq.paste(tile, ((side - tw) // 2, (side - th) // 2))
        tile = sq
    return tile


def bottom_text_score(tile: Image.Image) -> float:
    """Higher = more dark text-like pixels in the bottom third."""
    a = np.array(tile.convert("RGB"))
    h = a.shape[0]
    bottom = a[int(h * 0.62) :]
    rr, gg, bb = bottom[:, :, 0], bottom[:, :, 1], bottom[:, :, 2]
    lum = (rr.astype(float) + gg + bb) / 3
    sat = np.maximum(np.maximum(rr, gg), bb) - np.minimum(np.minimum(rr, gg), bb)
    return float(((lum < 90) & (sat < 60)).mean())


def main() -> int:
    if not SHEET.exists():
        print(f"Sheet not found: {SHEET}", file=sys.stderr)
        return 1

    sheet = Image.open(SHEET).convert("RGB")
    groups = find_logo_groups(np.array(sheet))
    tiles: list[dict] = []
    for g in groups:
        tile = crop_icon_tile(sheet, g)
        if tile is None or tile.size[0] < 28:
            continue
        tiles.append({"img": tile, "size": tile.size[0], "box": g, "text": bottom_text_score(tile)})

    tiles.sort(key=lambda t: -t["size"])
    kept: list[dict] = []
    for t in tiles:
        x0, y0, x1, y1 = t["box"]
        area = (x1 - x0 + 1) * (y1 - y0 + 1)
        if any(
            max(0, min(x1, k["box"][2]) - max(x0, k["box"][0]) + 1)
            * max(0, min(y1, k["box"][3]) - max(y0, k["box"][1]) + 1)
            > 0.35 * min(area, (k["box"][2] - k["box"][0] + 1) * (k["box"][3] - k["box"][1] + 1))
            for k in kept
        ):
            continue
        kept.append(t)

    CROPS.mkdir(exist_ok=True)
    print(f"extracted {len(kept)} tiles")
    for i, t in enumerate(kept):
        name = f"tile_{i:02d}_{t['size']}px_text{t['text']:.3f}.png"
        t["img"].save(CROPS / name)
        print(i, name, "box", t["box"])

    if not kept:
        print("No tiles extracted", file=sys.stderr)
        return 1

    # Primary: largest with noticeable text (full branding)
    branded = [t for t in kept if t["text"] > 0.01]
    primary = (branded[0] if branded else kept[0])["img"]
    primary_1024 = primary.resize((1024, 1024), Image.Resampling.LANCZOS)
    primary_1024.save(CROPS / "master_1024.png")
    src_path = ROOT / "electron" / "icon-source.png"
    primary_1024.save(src_path)
    print("wrote", src_path, primary_1024.size)

    # Graphic-only for tiny sizes
    graphic_cands = sorted(kept, key=lambda t: (t["text"], -t["size"]))
    graphic = graphic_cands[0]["img"]
    graphic.save(CROPS / "graphic_best.png")
    print("graphic_best", graphic.size, "text", round(graphic_cands[0]["text"], 4))

    # W4S / medium text for mid sizes
    mid_cands = [t for t in kept if 0.005 < t["text"] < 0.08 and 80 <= t["size"] <= 280]
    mid_cands.sort(key=lambda t: -t["size"])
    if mid_cands:
        mid_cands[0]["img"].save(CROPS / "w4s_best.png")
        print("w4s_best", mid_cands[0]["size"], "text", round(mid_cands[0]["text"], 4))

    # --simple: source is already a clean white rounded tile
    prep = subprocess.run(
        ["node", "scripts/prepare-icon.mjs", str(src_path)],
        cwd=ROOT,
        check=False,
    )
    if prep.returncode != 0:
        return prep.returncode

    def round_corners(icon: Image.Image, radius_ratio: float = 0.10) -> Image.Image:
        from PIL import ImageDraw, ImageChops

        icon = icon.convert("RGBA")
        ww, wh = icon.size
        radius = max(2, int(min(ww, wh) * radius_ratio))
        mask = Image.new("L", (ww, wh), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, ww - 1, wh - 1), radius=radius, fill=255)
        r, g, b, a = icon.split()
        a = mask if a.getextrema() == (255, 255) else ImageChops.multiply(a, mask)
        return Image.merge("RGBA", (r, g, b, a))

    def resize_icon(src: Image.Image, size: int) -> Image.Image:
        base = Image.new("RGBA", src.size, (255, 255, 255, 255))
        rgba = src.convert("RGBA")
        base.paste(rgba, (0, 0), rgba)
        return round_corners(base.resize((size, size), Image.Resampling.LANCZOS))

    # Size-specific sheet variants: graphic-only @32, W4S @56
    g32 = resize_icon(graphic, 32)
    g32.save(ROOT / "electron" / "icon-32.png")
    print("replaced electron/icon-32.png (graphic-only)")

    w4s_path = CROPS / "w4s_best.png"
    mid = Image.open(w4s_path) if w4s_path.exists() else primary
    resize_icon(mid, 56).save(ROOT / "public" / "icon-56.png")
    print("replaced public/icon-56.png (W4S/mid)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
