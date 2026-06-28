import type { TableObject } from '../../engine/types';

export const MIN_COL_WIDTH = 40;
export const MAX_COL_WIDTH = 480;
export const MIN_ROW_HEIGHT = 20;
export const MAX_ROW_HEIGHT = 240;

export function clampColWidth(width: number): number {
  return Math.max(MIN_COL_WIDTH, Math.min(MAX_COL_WIDTH, width));
}

export function clampRowHeight(height: number): number {
  return Math.max(MIN_ROW_HEIGHT, Math.min(MAX_ROW_HEIGHT, height));
}

export function getTableColWidths(
  table: Pick<TableObject, 'cols' | 'cellWidth' | 'colWidths'>,
): number[] {
  if (table.colWidths?.length === table.cols) {
    return table.colWidths.map(clampColWidth);
  }
  return Array.from({ length: table.cols }, () => table.cellWidth);
}

export function getTableRowHeights(
  table: Pick<TableObject, 'rows' | 'cellHeight' | 'rowHeights'>,
): number[] {
  if (table.rowHeights?.length === table.rows) {
    return table.rowHeights.map(clampRowHeight);
  }
  return Array.from({ length: table.rows }, () => table.cellHeight);
}

export function sumSizes(sizes: readonly number[]): number {
  return sizes.reduce((total, size) => total + size, 0);
}

export function computeTableSizeFromLayout(
  colWidths: readonly number[],
  rowHeights: readonly number[],
): { width: number; height: number } {
  return {
    width: sumSizes(colWidths),
    height: sumSizes(rowHeights),
  };
}

export function createUniformColWidths(cols: number, cellWidth: number): number[] {
  return Array.from({ length: cols }, () => cellWidth);
}

export function createUniformRowHeights(rows: number, cellHeight: number): number[] {
  return Array.from({ length: rows }, () => cellHeight);
}

export function normalizeTableLayout(
  rows: number,
  cols: number,
  cellWidth: number,
  cellHeight: number,
  colWidths?: number[],
  rowHeights?: number[],
): { colWidths: number[]; rowHeights: number[] } {
  const nextColWidths = createUniformColWidths(cols, cellWidth);
  const nextRowHeights = createUniformRowHeights(rows, cellHeight);

  if (colWidths) {
    for (let col = 0; col < Math.min(cols, colWidths.length); col++) {
      nextColWidths[col] = clampColWidth(colWidths[col] ?? cellWidth);
    }
  }

  if (rowHeights) {
    for (let row = 0; row < Math.min(rows, rowHeights.length); row++) {
      nextRowHeights[row] = clampRowHeight(rowHeights[row] ?? cellHeight);
    }
  }

  return { colWidths: nextColWidths, rowHeights: nextRowHeights };
}

export function applyTableDimensions(table: TableObject): void {
  const colWidths = getTableColWidths(table);
  const rowHeights = getTableRowHeights(table);
  const { width, height } = computeTableSizeFromLayout(colWidths, rowHeights);
  table.colWidths = colWidths;
  table.rowHeights = rowHeights;
  table.width = width;
  table.height = height;
}

export function getColOffset(colWidths: readonly number[], col: number): number {
  let offset = 0;
  for (let index = 0; index < col; index++) {
    offset += colWidths[index] ?? 0;
  }
  return offset;
}

export function getRowOffset(rowHeights: readonly number[], row: number): number {
  let offset = 0;
  for (let index = 0; index < row; index++) {
    offset += rowHeights[index] ?? 0;
  }
  return offset;
}

export function findColIndexAt(colWidths: readonly number[], localX: number): number {
  let cursor = 0;
  for (let col = 0; col < colWidths.length; col++) {
    cursor += colWidths[col] ?? 0;
    if (localX < cursor) return col;
  }
  return Math.max(0, colWidths.length - 1);
}

export function findRowIndexAt(rowHeights: readonly number[], localY: number): number {
  let cursor = 0;
  for (let row = 0; row < rowHeights.length; row++) {
    cursor += rowHeights[row] ?? 0;
    if (localY < cursor) return row;
  }
  return Math.max(0, rowHeights.length - 1);
}

/** 누적 크기 합과 total이 어긋나지 않도록 격자선 좌표를 만든다. */
export function buildGridLinePositions(
  start: number,
  sizes: readonly number[],
  total: number,
): number[] {
  const lines = [start];
  let cursor = start;
  for (const size of sizes) {
    cursor += size;
    lines.push(cursor);
  }
  if (lines.length > 0) {
    lines[lines.length - 1] = start + total;
  }
  return lines;
}

export function getCanvasContextScale(ctx: CanvasRenderingContext2D): number {
  const transform = ctx.getTransform();
  const scale = Math.hypot(transform.a, transform.b);
  return scale > 0 ? scale : 1;
}

