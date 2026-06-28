import type { TableObject } from '../../engine/types';

export type TableAxisColors = (string | null)[];
export type TableAxisSeqs = (number | null)[];

const DEFAULT_CELL_FILL = '#ffffff';

export interface TableAxisColorState {
  axisColorSeq: number;
  rowFillColors: TableAxisColors;
  colFillColors: TableAxisColors;
  rowTextColors: TableAxisColors;
  colTextColors: TableAxisColors;
  rowFillColorSeq: TableAxisSeqs;
  colFillColorSeq: TableAxisSeqs;
  rowTextColorSeq: TableAxisSeqs;
  colTextColorSeq: TableAxisSeqs;
}

export type TableAxisColorPatch = Partial<
  Pick<
    TableAxisColorState,
    | 'rowFillColors'
    | 'colFillColors'
    | 'rowTextColors'
    | 'colTextColors'
    | 'rowFillColorSeq'
    | 'colFillColorSeq'
    | 'rowTextColorSeq'
    | 'colTextColorSeq'
  >
>;

export function createAxisColors(length: number): TableAxisColors {
  return Array.from({ length }, () => null);
}

export function createAxisSeqs(length: number): TableAxisSeqs {
  return Array.from({ length }, () => null);
}

export function createEmptyAxisColorState(
  rows: number,
  cols: number,
  axisColorSeq = 0,
): TableAxisColorState {
  return {
    axisColorSeq,
    rowFillColors: createAxisColors(rows),
    colFillColors: createAxisColors(cols),
    rowTextColors: createAxisColors(rows),
    colTextColors: createAxisColors(cols),
    rowFillColorSeq: createAxisSeqs(rows),
    colFillColorSeq: createAxisSeqs(cols),
    rowTextColorSeq: createAxisSeqs(rows),
    colTextColorSeq: createAxisSeqs(cols),
  };
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

export function normalizeAxisSeqs(
  seqs: TableAxisSeqs | undefined,
  length: number,
): TableAxisSeqs {
  const next = createAxisSeqs(length);
  if (!seqs) return next;
  for (let i = 0; i < Math.min(length, seqs.length); i++) {
    next[i] = seqs[i] ?? null;
  }
  return next;
}

export function compactAxisColors(colors: TableAxisColors | undefined): TableAxisColors | undefined {
  if (!colors?.some((color) => color !== null)) return undefined;
  return colors.map((color) => color ?? null);
}

export function compactAxisSeqs(seqs: TableAxisSeqs | undefined): TableAxisSeqs | undefined {
  if (!seqs?.some((seq) => seq !== null)) return undefined;
  return seqs.map((seq) => seq ?? null);
}

export function axisColorsFromTable(table: TableObject): TableAxisColorState {
  return {
    axisColorSeq: table.axisColorSeq ?? 0,
    rowFillColors: normalizeAxisColors(table.rowFillColors, table.rows),
    colFillColors: normalizeAxisColors(table.colFillColors, table.cols),
    rowTextColors: normalizeAxisColors(table.rowTextColors, table.rows),
    colTextColors: normalizeAxisColors(table.colTextColors, table.cols),
    rowFillColorSeq: normalizeAxisSeqs(table.rowFillColorSeq, table.rows),
    colFillColorSeq: normalizeAxisSeqs(table.colFillColorSeq, table.cols),
    rowTextColorSeq: normalizeAxisSeqs(table.rowTextColorSeq, table.rows),
    colTextColorSeq: normalizeAxisSeqs(table.colTextColorSeq, table.cols),
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

export function insertRowAxisSeq(seqs: TableAxisSeqs, insertIndex: number): TableAxisSeqs {
  const next = [...seqs];
  next.splice(insertIndex, 0, null);
  return next;
}

export function deleteRowAxisSeq(seqs: TableAxisSeqs, deleteIndex: number): TableAxisSeqs {
  const next = [...seqs];
  next.splice(deleteIndex, 1);
  return next.length > 0 ? next : [null];
}

export function insertColAxisSeq(seqs: TableAxisSeqs, insertIndex: number): TableAxisSeqs {
  return insertRowAxisSeq(seqs, insertIndex);
}

export function deleteColAxisSeq(seqs: TableAxisSeqs, deleteIndex: number): TableAxisSeqs {
  return deleteRowAxisSeq(seqs, deleteIndex);
}

export function syncSessionColorsForLayout(
  session: TableAxisColorState & { rows: number; cols: number },
  previousRows: number,
  previousCols: number,
): TableAxisColorPatch {
  let {
    rowFillColors,
    colFillColors,
    rowTextColors,
    colTextColors,
    rowFillColorSeq,
    colFillColorSeq,
    rowTextColorSeq,
    colTextColorSeq,
  } = session;

  if (session.rows !== previousRows) {
    rowFillColors = normalizeAxisColors(rowFillColors, session.rows);
    rowTextColors = normalizeAxisColors(rowTextColors, session.rows);
    rowFillColorSeq = normalizeAxisSeqs(rowFillColorSeq, session.rows);
    rowTextColorSeq = normalizeAxisSeqs(rowTextColorSeq, session.rows);
  }
  if (session.cols !== previousCols) {
    colFillColors = normalizeAxisColors(colFillColors, session.cols);
    colTextColors = normalizeAxisColors(colTextColors, session.cols);
    colFillColorSeq = normalizeAxisSeqs(colFillColorSeq, session.cols);
    colTextColorSeq = normalizeAxisSeqs(colTextColorSeq, session.cols);
  }

  return {
    rowFillColors,
    colFillColors,
    rowTextColors,
    colTextColors,
    rowFillColorSeq,
    colFillColorSeq,
    rowTextColorSeq,
    colTextColorSeq,
  };
}

function pickAxisColor(
  rowValue: string | null | undefined,
  colValue: string | null | undefined,
  rowSeq: number | null | undefined,
  colSeq: number | null | undefined,
  fallback: string,
): string {
  const hasRow = !!rowValue;
  const hasCol = !!colValue;
  if (hasRow && hasCol) {
    const rowOrder = rowSeq ?? 0;
    const colOrder = colSeq ?? 0;
    if (rowOrder === colOrder) return colValue!;
    return rowOrder > colOrder ? rowValue! : colValue!;
  }
  if (hasCol) return colValue!;
  if (hasRow) return rowValue!;
  return fallback;
}

export function getCellFillColor(
  table: Pick<
    TableObject,
    'color' | 'rowFillColors' | 'colFillColors' | 'rowFillColorSeq' | 'colFillColorSeq'
  >,
  row: number,
  col: number,
): string {
  return pickAxisColor(
    table.rowFillColors?.[row],
    table.colFillColors?.[col],
    table.rowFillColorSeq?.[row],
    table.colFillColorSeq?.[col],
    DEFAULT_CELL_FILL,
  );
}

export function getCellTextColor(
  table: Pick<
    TableObject,
    'color' | 'rowTextColors' | 'colTextColors' | 'rowTextColorSeq' | 'colTextColorSeq'
  >,
  row: number,
  col: number,
): string {
  return pickAxisColor(
    table.rowTextColors?.[row],
    table.colTextColors?.[col],
    table.rowTextColorSeq?.[row],
    table.colTextColorSeq?.[col],
    table.color,
  );
}

export function applySessionAxisColor<T extends TableAxisColorState>(
  session: T,
  target: 'row' | 'col',
  index: number,
  type: 'fill' | 'text',
  color: string | null,
): T {
  const nextSeq = session.axisColorSeq + 1;
  if (target === 'row') {
    const colorKey = type === 'fill' ? 'rowFillColors' : 'rowTextColors';
    const seqKey = type === 'fill' ? 'rowFillColorSeq' : 'rowTextColorSeq';
    const nextColors = [...session[colorKey]];
    const nextSeqs = [...session[seqKey]];
    nextColors[index] = color;
    nextSeqs[index] = color === null ? null : nextSeq;
    return { ...session, [colorKey]: nextColors, [seqKey]: nextSeqs, axisColorSeq: nextSeq };
  }

  const colorKey = type === 'fill' ? 'colFillColors' : 'colTextColors';
  const seqKey = type === 'fill' ? 'colFillColorSeq' : 'colTextColorSeq';
  const nextColors = [...session[colorKey]];
  const nextSeqs = [...session[seqKey]];
  nextColors[index] = color;
  nextSeqs[index] = color === null ? null : nextSeq;
  return { ...session, [colorKey]: nextColors, [seqKey]: nextSeqs, axisColorSeq: nextSeq };
}

export function resetSessionAxisColors<T extends TableAxisColorState>(
  session: T,
  target: 'row' | 'col',
  index: number,
): T {
  if (target === 'row') {
    const rowFillColors = [...session.rowFillColors];
    const rowTextColors = [...session.rowTextColors];
    const rowFillColorSeq = [...session.rowFillColorSeq];
    const rowTextColorSeq = [...session.rowTextColorSeq];
    rowFillColors[index] = null;
    rowTextColors[index] = null;
    rowFillColorSeq[index] = null;
    rowTextColorSeq[index] = null;
    return { ...session, rowFillColors, rowTextColors, rowFillColorSeq, rowTextColorSeq };
  }

  const colFillColors = [...session.colFillColors];
  const colTextColors = [...session.colTextColors];
  const colFillColorSeq = [...session.colFillColorSeq];
  const colTextColorSeq = [...session.colTextColorSeq];
  colFillColors[index] = null;
  colTextColors[index] = null;
  colFillColorSeq[index] = null;
  colTextColorSeq[index] = null;
  return { ...session, colFillColors, colTextColors, colFillColorSeq, colTextColorSeq };
}

export function applyTableAxisColors(
  table: TableObject,
  colors: Partial<TableAxisColorState>,
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
  table.rowFillColorSeq = compactAxisSeqs(
    normalizeAxisSeqs(colors.rowFillColorSeq, table.rows),
  );
  table.colFillColorSeq = compactAxisSeqs(
    normalizeAxisSeqs(colors.colFillColorSeq, table.cols),
  );
  table.rowTextColorSeq = compactAxisSeqs(
    normalizeAxisSeqs(colors.rowTextColorSeq, table.rows),
  );
  table.colTextColorSeq = compactAxisSeqs(
    normalizeAxisSeqs(colors.colTextColorSeq, table.cols),
  );
  if (colors.axisColorSeq !== undefined && colors.axisColorSeq > 0) {
    table.axisColorSeq = colors.axisColorSeq;
  } else {
    delete table.axisColorSeq;
  }
}
