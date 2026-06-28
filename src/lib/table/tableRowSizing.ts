export interface TableRowSizingSession {
  rows: number;
  cells: string[][];
  rowHeights: number[];
}

export const TABLE_CELL_LINE_HEIGHT = 1.35;
export const TABLE_CELL_EDITOR_PADDING = 8;
export const TABLE_CELL_BORDER_INSET = 2;
export const TABLE_CELL_METRICS_BUFFER = 4;
export const TABLE_HEADER_MIN_HEIGHT = 24;

export function getMinRowHeightForFont(fontSize: number): number {
  return Math.ceil(
    fontSize * TABLE_CELL_LINE_HEIGHT +
      TABLE_CELL_EDITOR_PADDING +
      TABLE_CELL_BORDER_INSET +
      TABLE_CELL_METRICS_BUFFER,
  );
}

export function getHeaderHeightForFont(fontSize: number): number {
  return Math.max(
    TABLE_HEADER_MIN_HEIGHT,
    Math.ceil(fontSize + TABLE_CELL_EDITOR_PADDING),
  );
}

export function getMinRowHeightForCell(cell: string, fontSize: number): number {
  const lineCount = Math.max(1, cell.split('\n').length);
  return Math.ceil(
    fontSize * TABLE_CELL_LINE_HEIGHT * lineCount +
      TABLE_CELL_EDITOR_PADDING +
      TABLE_CELL_BORDER_INSET +
      TABLE_CELL_METRICS_BUFFER,
  );
}

export function getEffectiveRowHeight(
  rowIndex: number,
  session: TableRowSizingSession,
  fontSize: number,
  defaultRowHeight: number,
): number {
  const manualHeight = session.rowHeights[rowIndex] ?? defaultRowHeight;
  const fontMinHeight = getMinRowHeightForFont(fontSize);
  const contentMinHeight = Math.max(
    fontMinHeight,
    ...(session.cells[rowIndex] ?? []).map((cell) => getMinRowHeightForCell(cell, fontSize)),
  );
  return Math.max(manualHeight, contentMinHeight);
}

export function resolveSessionRowHeights(
  session: TableRowSizingSession,
  fontSize: number,
  defaultRowHeight: number,
): number[] {
  return Array.from({ length: session.rows }, (_, rowIndex) =>
    getEffectiveRowHeight(rowIndex, session, fontSize, defaultRowHeight),
  );
}
