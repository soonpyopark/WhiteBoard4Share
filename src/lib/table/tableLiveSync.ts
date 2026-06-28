import type { TableObject } from '../../engine/types';
import type { TableEditSession } from '../../components/TableEditorOverlay';
import { applyTableDimensions, normalizeTableLayout } from './tableDimensions';

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
    rowHeights: normalized.rowHeights,
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

  return { ...session, cells };
}

export function isTableCellInputFocused(): boolean {
  const active = document.activeElement;
  return (
    active instanceof HTMLInputElement &&
    active.closest('.canvas-table-editor__grid') !== null
  );
}
