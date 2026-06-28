import type { TableObject } from '../../engine/types';

export type TableAxisColors = (string | null)[];

const DEFAULT_CELL_FILL = '#ffffff';

export function createAxisColors(length: number): TableAxisColors {
  return Array.from({ length }, () => null);
}

export function normalizeAxisColors(
  colors: TableAxisColors | undefined,
  length: number,
): TableAxisColors {
  const next = createAxisColors(length);
  if (!colors) return next;
  for (let i = 0; i < Math.min(length, colors.length); i++) {
    next[i] = colors[i] ?? null;
  }
  return next;
}

export function compactAxisColors(colors: TableAxisColors | undefined): TableAxisColors | undefined {
  if (!colors?.some((color) => color !== null)) return undefined;
  return colors.map((color) => color ?? null);
}

export function axisColorsFromTable(table: TableObject): {
  rowFillColors: TableAxisColors;
  colFillColors: TableAxisColors;
  rowTextColors: TableAxisColors;
  colTextColors: TableAxisColors;
} {
  return {
    rowFillColors: normalizeAxisColors(table.rowFillColors, table.rows),
    colFillColors: normalizeAxisColors(table.colFillColors, table.cols),
    rowTextColors: normalizeAxisColors(table.rowTextColors, table.rows),
    colTextColors: normalizeAxisColors(table.colTextColors, table.cols),
  };
}

export function insertRowAxisColor(colors: TableAxisColors, insertIndex: number): TableAxisColors {
  const next = [...colors];
  next.splice(insertIndex, 0, null);
  return next;
}

export function deleteRowAxisColor(colors: TableAxisColors, deleteIndex: number): TableAxisColors {
  const next = [...colors];
  next.splice(deleteIndex, 1);
  return next.length > 0 ? next : [null];
}

export function insertColAxisColor(colors: TableAxisColors, insertIndex: number): TableAxisColors {
  return insertRowAxisColor(colors, insertIndex);
}

export function deleteColAxisColor(colors: TableAxisColors, deleteIndex: number): TableAxisColors {
  return deleteRowAxisColor(colors, deleteIndex);
}

export function syncSessionColorsForLayout(
  session: {
    rows: number;
    cols: number;
    rowFillColors: TableAxisColors;
    colFillColors: TableAxisColors;
    rowTextColors: TableAxisColors;
    colTextColors: TableAxisColors;
  },
  previousRows: number,
  previousCols: number,
): Pick<
  typeof session,
  'rowFillColors' | 'colFillColors' | 'rowTextColors' | 'colTextColors'
> {
  let { rowFillColors, colFillColors, rowTextColors, colTextColors } = session;

  if (session.rows !== previousRows) {
    rowFillColors = normalizeAxisColors(rowFillColors, session.rows);
    rowTextColors = normalizeAxisColors(rowTextColors, session.rows);
  }
  if (session.cols !== previousCols) {
    colFillColors = normalizeAxisColors(colFillColors, session.cols);
    colTextColors = normalizeAxisColors(colTextColors, session.cols);
  }

  return { rowFillColors, colFillColors, rowTextColors, colTextColors };
}

export function getCellFillColor(
  table: Pick<TableObject, 'color' | 'rowFillColors' | 'colFillColors'>,
  row: number,
  col: number,
): string {
  const colFill = table.colFillColors?.[col];
  if (colFill) return colFill;
  const rowFill = table.rowFillColors?.[row];
  if (rowFill) return rowFill;
  return DEFAULT_CELL_FILL;
}

export function getCellTextColor(
  table: Pick<TableObject, 'color' | 'rowTextColors' | 'colTextColors'>,
  row: number,
  col: number,
): string {
  const colText = table.colTextColors?.[col];
  if (colText) return colText;
  const rowText = table.rowTextColors?.[row];
  if (rowText) return rowText;
  return table.color;
}

export function applyTableAxisColors(
  table: TableObject,
  colors: {
    rowFillColors?: TableAxisColors;
    colFillColors?: TableAxisColors;
    rowTextColors?: TableAxisColors;
    colTextColors?: TableAxisColors;
  },
): void {
  table.rowFillColors = compactAxisColors(
    normalizeAxisColors(colors.rowFillColors, table.rows),
  );
  table.colFillColors = compactAxisColors(
    normalizeAxisColors(colors.colFillColors, table.cols),
  );
  table.rowTextColors = compactAxisColors(
    normalizeAxisColors(colors.rowTextColors, table.rows),
  );
  table.colTextColors = compactAxisColors(
    normalizeAxisColors(colors.colTextColors, table.cols),
  );
}
