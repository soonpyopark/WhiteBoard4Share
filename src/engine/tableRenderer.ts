import type { TableObject } from './types';
import { buildTextFont } from './textRenderer';
import {
  buildGridLinePositions,
  findColIndexAt,
  findRowIndexAt,
  getCanvasContextScale,
  getColOffset,
  getRowOffset,
  getTableColWidths,
  getTableRowHeights,
} from '../lib/table/tableDimensions';
import { getCellFillColor, getCellTextColor } from '../lib/table/tableColors';

export const TABLE_DEFAULT_ROWS = 3;
export const TABLE_DEFAULT_COLS = 3;
export const TABLE_CELL_WIDTH = 80;
export const TABLE_CELL_HEIGHT = 32;
export const TABLE_CELL_PADDING = 4;
const TABLE_CELL_LINE_HEIGHT = 1.35;
export const TABLE_BORDER_COLOR = '#4a4a4a';
export const TABLE_MAX_ROWS = 20;
export const TABLE_MAX_COLS = 20;
export const TABLE_MIN_DRAG_PX = 20;

export { applyTableDimensions } from '../lib/table/tableDimensions';

export function createEmptyCells(rows: number, cols: number): string[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => ''));
}

export function computeTableSize(
  rows: number,
  cols: number,
  cellWidth: number,
  cellHeight: number,
): { width: number; height: number } {
  return {
    width: cols * cellWidth,
    height: rows * cellHeight,
  };
}

export function rowsColsFromRect(
  width: number,
  height: number,
  cellWidth = TABLE_CELL_WIDTH,
  cellHeight = TABLE_CELL_HEIGHT,
): { rows: number; cols: number } {
  if (width < TABLE_MIN_DRAG_PX && height < TABLE_MIN_DRAG_PX) {
    return { rows: TABLE_DEFAULT_ROWS, cols: TABLE_DEFAULT_COLS };
  }

  return {
    rows: Math.max(1, Math.min(TABLE_MAX_ROWS, Math.round(Math.abs(height) / cellHeight))),
    cols: Math.max(1, Math.min(TABLE_MAX_COLS, Math.round(Math.abs(width) / cellWidth))),
  };
}

export function getTableTopLeft(table: TableObject): { x: number; y: number } {
  return {
    x: table.transform.cx - table.width / 2,
    y: table.transform.cy - table.height / 2,
  };
}

export function hitTestTableCell(
  table: TableObject,
  wx: number,
  wy: number,
): { row: number; col: number } | null {
  const local = worldToTableLocal(table, wx, wy);
  if (local.x < 0 || local.y < 0 || local.x >= table.width || local.y >= table.height) {
    return null;
  }

  const colWidths = getTableColWidths(table);
  const rowHeights = getTableRowHeights(table);
  const col = findColIndexAt(colWidths, local.x);
  const row = findRowIndexAt(rowHeights, local.y);
  if (row < 0 || col < 0 || row >= table.rows || col >= table.cols) return null;
  return { row, col };
}

function worldToTableLocal(
  table: TableObject,
  wx: number,
  wy: number,
): { x: number; y: number } {
  const dx = wx - table.transform.cx;
  const dy = wy - table.transform.cy;
  const cos = Math.cos(-table.transform.rotation);
  const sin = Math.sin(-table.transform.rotation);
  const rx = (dx * cos - dy * sin) / table.transform.scale;
  const ry = (dx * sin + dy * cos) / table.transform.scale;
  return {
    x: rx + table.width / 2,
    y: ry + table.height / 2,
  };
}

export function renderTable(ctx: CanvasRenderingContext2D, table: TableObject): void {
  const { transform, fontSize, fontFamily, borderColor, cells } = table;
  const colWidths = getTableColWidths(table);
  const rowHeights = getTableRowHeights(table);

  ctx.save();
  ctx.translate(transform.cx, transform.cy);
  ctx.rotate(transform.rotation);
  ctx.scale(transform.scale, transform.scale);

  const startX = -table.width / 2;
  const startY = -table.height / 2;
  const deviceScale = getCanvasContextScale(ctx);

  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1 / deviceScale;
  ctx.lineCap = 'square';

  for (let row = 0; row < table.rows; row++) {
    for (let col = 0; col < table.cols; col++) {
      const cellWidth = colWidths[col] ?? table.cellWidth;
      const cellHeight = rowHeights[row] ?? table.cellHeight;
      const cellX = startX + getColOffset(colWidths, col);
      const cellY = startY + getRowOffset(rowHeights, row);
      ctx.fillStyle = getCellFillColor(table, row, col);
      ctx.fillRect(cellX, cellY, cellWidth, cellHeight);
    }
  }

  const xLines = buildGridLinePositions(startX, colWidths, table.width);
  const yLines = buildGridLinePositions(startY, rowHeights, table.height);

  for (const y of yLines) {
    ctx.beginPath();
    ctx.moveTo(startX, y);
    ctx.lineTo(startX + table.width, y);
    ctx.stroke();
  }

  for (const x of xLines) {
    ctx.beginPath();
    ctx.moveTo(x, startY);
    ctx.lineTo(x, startY + table.height);
    ctx.stroke();
  }

  ctx.font = buildTextFont(fontSize, fontFamily);
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';

  for (let row = 0; row < table.rows; row++) {
    for (let col = 0; col < table.cols; col++) {
      const text = cells[row]?.[col] ?? '';
      if (!text) continue;
      const cellWidth = colWidths[col] ?? table.cellWidth;
      const cellHeight = rowHeights[row] ?? table.cellHeight;
      const cellX = startX + getColOffset(colWidths, col) + TABLE_CELL_PADDING;
      const cellY = startY + getRowOffset(rowHeights, row) + TABLE_CELL_PADDING;
      const maxWidth = cellWidth - TABLE_CELL_PADDING * 2;
      const maxHeight = cellHeight - TABLE_CELL_PADDING * 2;
      const lineHeight = fontSize * TABLE_CELL_LINE_HEIGHT;
      ctx.fillStyle = getCellTextColor(table, row, col);
      fillCellText(ctx, text, cellX, cellY, maxWidth, maxHeight, lineHeight);
    }
  }

  ctx.restore();
}

function fillCellText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  maxHeight: number,
  lineHeight: number,
): void {
  const lines = text.split('\n');
  let lineY = y;

  for (const line of lines) {
    if (lineY + lineHeight > y + maxHeight + 0.5) break;
    truncateFillLine(ctx, line, x, lineY, maxWidth);
    lineY += lineHeight;
  }
}

function truncateFillLine(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
): void {
  if (ctx.measureText(text).width <= maxWidth) {
    ctx.fillText(text, x, y);
    return;
  }

  let trimmed = text;
  while (trimmed.length > 0 && ctx.measureText(`${trimmed}…`).width > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  ctx.fillText(trimmed ? `${trimmed}…` : '…', x, y);
}
