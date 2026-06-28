import { TABLE_MAX_COLS, TABLE_MAX_ROWS } from '../../engine/tableRenderer';
import {
  clampColWidth,
  clampRowHeight,
  createUniformColWidths,
  createUniformRowHeights,
} from './tableDimensions';

export interface TableLayoutState {
  rows: number;
  cols: number;
  cells: string[][];
  colWidths: number[];
  rowHeights: number[];
}

function cloneCells(cells: string[][]): string[][] {
  return cells.map((row) => [...row]);
}

function clampRows(rows: number): number {
  return Math.max(1, Math.min(TABLE_MAX_ROWS, rows));
}

function clampCols(cols: number): number {
  return Math.max(1, Math.min(TABLE_MAX_COLS, cols));
}

export function insertRowAt(
  layout: TableLayoutState,
  atIndex: number,
  position: 'above' | 'below',
  defaultHeight: number,
): TableLayoutState {
  if (layout.rows >= TABLE_MAX_ROWS) return layout;

  const insertIndex =
    position === 'above'
      ? Math.max(0, Math.min(atIndex, layout.rows))
      : Math.max(0, Math.min(atIndex + 1, layout.rows));
  const nextCells = cloneCells(layout.cells);
  nextCells.splice(
    insertIndex,
    0,
    Array.from({ length: layout.cols }, () => ''),
  );
  const nextRowHeights = [...layout.rowHeights];
  nextRowHeights.splice(insertIndex, 0, clampRowHeight(defaultHeight));

  return {
    rows: clampRows(nextCells.length),
    cols: layout.cols,
    cells: nextCells,
    colWidths: [...layout.colWidths],
    rowHeights: nextRowHeights,
  };
}

export function insertColAt(
  layout: TableLayoutState,
  atIndex: number,
  position: 'left' | 'right',
  defaultWidth: number,
): TableLayoutState {
  if (layout.cols >= TABLE_MAX_COLS) return layout;

  const insertIndex =
    position === 'left'
      ? Math.max(0, Math.min(atIndex, layout.cols))
      : Math.max(0, Math.min(atIndex + 1, layout.cols));
  const nextCells = layout.cells.map((row) => {
    const nextRow = [...row];
    nextRow.splice(insertIndex, 0, '');
    return nextRow;
  });
  const nextColWidths = [...layout.colWidths];
  nextColWidths.splice(insertIndex, 0, clampColWidth(defaultWidth));

  return {
    rows: layout.rows,
    cols: clampCols(nextColWidths.length),
    cells: nextCells,
    colWidths: nextColWidths,
    rowHeights: [...layout.rowHeights],
  };
}

export function deleteRowAt(layout: TableLayoutState, atIndex: number): TableLayoutState {
  if (layout.rows <= 1) return layout;

  const nextCells = cloneCells(layout.cells);
  nextCells.splice(atIndex, 1);
  const nextRowHeights = [...layout.rowHeights];
  nextRowHeights.splice(atIndex, 1);

  return {
    rows: nextCells.length,
    cols: layout.cols,
    cells: nextCells,
    colWidths: [...layout.colWidths],
    rowHeights: nextRowHeights,
  };
}

export function deleteColAt(layout: TableLayoutState, atIndex: number): TableLayoutState {
  if (layout.cols <= 1) return layout;

  const nextCells = layout.cells.map((row) => {
    const nextRow = [...row];
    nextRow.splice(atIndex, 1);
    return nextRow;
  });
  const nextColWidths = [...layout.colWidths];
  nextColWidths.splice(atIndex, 1);

  return {
    rows: layout.rows,
    cols: nextColWidths.length,
    cells: nextCells,
    colWidths: nextColWidths,
    rowHeights: [...layout.rowHeights],
  };
}

export function appendRow(layout: TableLayoutState, defaultHeight: number): TableLayoutState {
  return insertRowAt(layout, layout.rows - 1, 'below', defaultHeight);
}

export function appendCol(layout: TableLayoutState, defaultWidth: number): TableLayoutState {
  return insertColAt(layout, layout.cols - 1, 'right', defaultWidth);
}

export function removeLastRow(layout: TableLayoutState): TableLayoutState {
  if (layout.rows <= 1) return layout;
  return deleteRowAt(layout, layout.rows - 1);
}

export function removeLastCol(layout: TableLayoutState): TableLayoutState {
  if (layout.cols <= 1) return layout;
  return deleteColAt(layout, layout.cols - 1);
}

export function createTableLayoutState(
  rows: number,
  cols: number,
  cellWidth: number,
  cellHeight: number,
  cells?: string[][],
  colWidths?: number[],
  rowHeights?: number[],
): TableLayoutState {
  const safeRows = clampRows(rows);
  const safeCols = clampCols(cols);
  const nextCells = cells
    ? Array.from({ length: safeRows }, (_, row) =>
        Array.from({ length: safeCols }, (_, col) => cells[row]?.[col] ?? ''),
      )
    : Array.from({ length: safeRows }, () => Array.from({ length: safeCols }, () => ''));

  const normalizedColWidths = createUniformColWidths(safeCols, cellWidth);
  if (colWidths) {
    for (let col = 0; col < Math.min(safeCols, colWidths.length); col++) {
      normalizedColWidths[col] = clampColWidth(colWidths[col] ?? cellWidth);
    }
  }

  const normalizedRowHeights = createUniformRowHeights(safeRows, cellHeight);
  if (rowHeights) {
    for (let row = 0; row < Math.min(safeRows, rowHeights.length); row++) {
      normalizedRowHeights[row] = clampRowHeight(rowHeights[row] ?? cellHeight);
    }
  }

  return {
    rows: safeRows,
    cols: safeCols,
    cells: nextCells,
    colWidths: normalizedColWidths,
    rowHeights: normalizedRowHeights,
  };
}

export function layoutFromSession(session: {
  rows: number;
  cols: number;
  cells: string[][];
  colWidths: number[];
  rowHeights: number[];
}): TableLayoutState {
  return {
    rows: session.rows,
    cols: session.cols,
    cells: cloneCells(session.cells),
    colWidths: [...session.colWidths],
    rowHeights: [...session.rowHeights],
  };
}

export function applyLayoutToSession<T extends TableLayoutState>(
  session: T,
  layout: TableLayoutState,
  activeRow: number,
  activeCol: number,
): T {
  return {
    ...session,
    rows: layout.rows,
    cols: layout.cols,
    cells: layout.cells,
    colWidths: layout.colWidths,
    rowHeights: layout.rowHeights,
    activeRow: Math.max(0, Math.min(activeRow, layout.rows - 1)),
    activeCol: Math.max(0, Math.min(activeCol, layout.cols - 1)),
  };
}
