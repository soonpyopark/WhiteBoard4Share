import type { StrokePoint } from './types';

/**
 * Ramer–Douglas–Peucker 단순화.
 * 필기 저장 점 수를 줄여 히트테스트·동기·재렌더 비용을 낮춘다.
 */
export function simplifyStrokePoints(points: StrokePoint[], epsilon: number): StrokePoint[] {
  if (points.length <= 2 || epsilon <= 0) return points.slice();

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  simplifyRange(points, 0, points.length - 1, epsilon * epsilon, keep);

  const result: StrokePoint[] = [];
  for (let i = 0; i < points.length; i++) {
    if (keep[i]) result.push(points[i]!);
  }
  return result.length >= 2 ? result : points.slice();
}

function simplifyRange(
  points: readonly StrokePoint[],
  start: number,
  end: number,
  epsilonSq: number,
  keep: Uint8Array,
): void {
  if (end <= start + 1) return;

  const a = points[start]!;
  const b = points[end]!;
  let maxDistSq = 0;
  let maxIndex = start;

  for (let i = start + 1; i < end; i++) {
    const d = pointToSegmentDistSq(points[i]!, a, b);
    if (d > maxDistSq) {
      maxDistSq = d;
      maxIndex = i;
    }
  }

  if (maxDistSq <= epsilonSq) return;

  keep[maxIndex] = 1;
  simplifyRange(points, start, maxIndex, epsilonSq, keep);
  simplifyRange(points, maxIndex, end, epsilonSq, keep);
}

function pointToSegmentDistSq(p: StrokePoint, a: StrokePoint, b: StrokePoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    const ex = p.x - a.x;
    const ey = p.y - a.y;
    return ex * ex + ey * ey;
  }

  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  const ex = p.x - projX;
  const ey = p.y - projY;
  return ex * ex + ey * ey;
}

/** 선 두께에 비례한 기본 epsilon */
export function simplifyEpsilonForStroke(baseWidth: number): number {
  return Math.max(0.75, baseWidth * 0.12);
}
