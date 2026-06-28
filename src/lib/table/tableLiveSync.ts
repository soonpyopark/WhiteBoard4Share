import type { TableObject } from '../../engine/types';
import type { TableEditSession } from '../../components/TableEditorOverlay';
import { applyTableDimensions, normalizeTableLayout } from './tableDimensions';
import { normalizeAxisColors, normalizeAxisSeqs } from './tableColors';
import { resolveSessionRowHeights } from './tableRowSizing';

export function buildLiveTableFromSession(
  session: TableEditSession,
  base: TableObject | null,
): TableObject | null {
  if (!session.id || !base) return null;

  const normalized = normalizeTableLayout(
    session.rows,
    session.cols,
    base.cellWidth,
    base.cellHeight,
    session.colWidths,
    session.rowHeights,
  );

  const table: TableObject = {
    ...structuredClone(base),
    rows: session.rows,
    cols: session.cols,
    cells: session.cells.map((row) => [...row]),
    colWidths: normalized.colWidths,
    rowHeights: resolveSessionRowHeights(session, base.fontSize, base.cellHeight),
    rowFillColors: session.rowFillColors.some((color) => color !== null)
      ? [...session.rowFillColors]
      : base.rowFillColors,
    colFillColors: session.colFillColors.some((color) => color !== null)
      ? [...session.colFillColors]
      : base.colFillColors,
    rowTextColors: session.rowTextColors.some((color) => color !== null)
      ? [...session.rowTextColors]
      : base.rowTextColors,
    colTextColors: session.colTextColors.some((color) => color !== null)
      ? [...session.colTextColors]
      : base.colTextColors,
    axisColorSeq: session.axisColorSeq > 0 ? session.axisColorSeq : base.axisColorSeq,
    rowFillColorSeq: session.rowFillColorSeq.some((seq) => seq !== null)
      ? [...session.rowFillColorSeq]
      : base.rowFillColorSeq,
    colFillColorSeq: session.colFillColorSeq.some((seq) => seq !== null)
      ? [...session.colFillColorSeq]
      : base.colFillColorSeq,
    rowTextColorSeq: session.rowTextColorSeq.some((seq) => seq !== null)
      ? [...session.rowTextColorSeq]
      : base.rowTextColorSeq,
    colTextColorSeq: session.colTextColorSeq.some((seq) => seq !== null)
      ? [...session.colTextColorSeq]
      : base.colTextColorSeq,
  };

  applyTableDimensions(table);
  return table;
}

export function mergeRemoteCellsIntoSession(
  session: TableEditSession,
  remote: TableObject,
  preserveActiveCell: boolean,
): TableEditSession {
  const cells = session.cells.map((row, rowIndex) =>
    row.map((cell, colIndex) => {
      if (preserveActiveCell && rowIndex === session.activeRow && colIndex === session.activeCol) {
        return cell;
      }
      return remote.cells[rowIndex]?.[colIndex] ?? cell;
    }),
  );

  return {
    ...session,
    cells,
    axisColorSeq: remote.axisColorSeq ?? session.axisColorSeq,
    rowFillColors: normalizeAxisColors(remote.rowFillColors, session.rows),
    colFillColors: normalizeAxisColors(remote.colFillColors, session.cols),
    rowTextColors: normalizeAxisColors(remote.rowTextColors, session.rows),
    colTextColors: normalizeAxisColors(remote.colTextColors, session.cols),
    rowFillColorSeq: normalizeAxisSeqs(remote.rowFillColorSeq, session.rows),
    colFillColorSeq: normalizeAxisSeqs(remote.colFillColorSeq, session.cols),
    rowTextColorSeq: normalizeAxisSeqs(remote.rowTextColorSeq, session.rows),
    colTextColorSeq: normalizeAxisSeqs(remote.colTextColorSeq, session.cols),
  };
}

export function isTableCellInputFocused(): boolean {
  const active = document.activeElement;
  return (
    (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) &&
    active.closest('.canvas-table-editor__grid') !== null
  );
}
