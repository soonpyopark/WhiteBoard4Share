import { getLocalBounds } from './pathObject';
import type { PathObject } from './types';

export type PathBakeRenderer = (ctx: CanvasRenderingContext2D, path: PathObject) => void;

type BakeEntry = {
  canvas: HTMLCanvasElement;
  /** local-space destination rect */
  x: number;
  y: number;
  w: number;
  h: number;
  signature: string;
};

const bakeMap = new Map<string, BakeEntry>();
const MAX_BAKE_EDGE = 2048;
const MAX_BAKE_ENTRIES = 400;

function pathContentSignature(path: PathObject): string {
  const pts = path.points;
  const first = pts[0];
  const mid = pts[pts.length >> 1];
  const last = pts[pts.length - 1];
  return [
    pts.length,
    path.tool,
    path.color,
    path.baseWidth,
    path.minWidth,
    path.maxWidth,
    path.opacity,
    path.textured ? 1 : 0,
    path.lineEnd ?? 'plain',
    first ? `${first.x.toFixed(2)},${first.y.toFixed(2)},${first.pressure.toFixed(3)}` : '',
    mid ? `${mid.x.toFixed(2)},${mid.y.toFixed(2)},${mid.pressure.toFixed(3)}` : '',
    last ? `${last.x.toFixed(2)},${last.y.toFixed(2)},${last.pressure.toFixed(3)}` : '',
  ].join('|');
}

function bakePixelScale(): number {
  if (typeof devicePixelRatio === 'number' && Number.isFinite(devicePixelRatio)) {
    return Math.min(2, Math.max(1, devicePixelRatio));
  }
  return 1;
}

function ensureBake(path: PathObject, renderUnbaked: PathBakeRenderer): BakeEntry | null {
  if (path.tool === 'eraser' || path.points.length === 0) return null;

  const signature = pathContentSignature(path);
  const existing = bakeMap.get(path.id);
  if (existing && existing.signature === signature) return existing;

  const rawLocal = getLocalBounds(path);
  if (rawLocal.w <= 0 || rawLocal.h <= 0) return null;

  // Catmull 보간 오버슈트 여유
  const curvePad = Math.max(2, path.maxWidth * 0.75);
  const local = {
    x: rawLocal.x - curvePad,
    y: rawLocal.y - curvePad,
    w: rawLocal.w + curvePad * 2,
    h: rawLocal.h + curvePad * 2,
  };

  const pixelScale = bakePixelScale();
  let pixelW = Math.ceil(local.w * pixelScale);
  let pixelH = Math.ceil(local.h * pixelScale);
  let scale = pixelScale;

  const maxEdge = Math.max(pixelW, pixelH);
  if (maxEdge > MAX_BAKE_EDGE) {
    scale = (pixelScale * MAX_BAKE_EDGE) / maxEdge;
    pixelW = Math.max(1, Math.ceil(local.w * scale));
    pixelH = Math.max(1, Math.ceil(local.h * scale));
  }

  const canvas = existing?.canvas ?? document.createElement('canvas');
  canvas.width = pixelW;
  canvas.height = pixelH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, pixelW, pixelH);
  ctx.setTransform(scale, 0, 0, scale, -local.x * scale, -local.y * scale);

  const bakePath: PathObject = {
    ...path,
    transform: { cx: 0, cy: 0, rotation: 0, scale: 1 },
  };
  renderUnbaked(ctx, bakePath);

  const entry: BakeEntry = {
    canvas,
    x: local.x,
    y: local.y,
    w: local.w,
    h: local.h,
    signature,
  };

  if (!bakeMap.has(path.id) && bakeMap.size >= MAX_BAKE_ENTRIES) {
    const oldest = bakeMap.keys().next().value;
    if (oldest !== undefined) bakeMap.delete(oldest);
  }

  bakeMap.set(path.id, entry);
  return entry;
}

/** 로컬 베이크를 transform과 함께 그린다. eraser·실패 시 false */
export function drawBakedPath(
  ctx: CanvasRenderingContext2D,
  path: PathObject,
  renderUnbaked: PathBakeRenderer,
): boolean {
  const entry = ensureBake(path, renderUnbaked);
  if (!entry) return false;

  const { transform } = path;
  ctx.save();
  ctx.translate(transform.cx, transform.cy);
  ctx.rotate(transform.rotation);
  ctx.scale(transform.scale, transform.scale);
  ctx.drawImage(entry.canvas, 0, 0, entry.canvas.width, entry.canvas.height, entry.x, entry.y, entry.w, entry.h);
  ctx.restore();
  return true;
}

export function invalidateStrokeBake(pathId: string): void {
  bakeMap.delete(pathId);
}

export function pruneStrokeBakes(livePathIds: ReadonlySet<string>): void {
  for (const id of bakeMap.keys()) {
    if (!livePathIds.has(id)) bakeMap.delete(id);
  }
}

export function clearStrokeBakes(): void {
  bakeMap.clear();
}
