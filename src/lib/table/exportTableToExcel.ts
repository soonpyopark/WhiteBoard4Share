import type { TableObject } from '../../engine/types';
import { getCellFillColor, getCellTextColor } from './tableColors';
import { getTableColWidths, getTableRowHeights } from './tableDimensions';
import { resolveSessionRowHeights } from './tableRowSizing';

const EXCEL_ROW_HEIGHT_BUFFER = 1.15;
const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;

type ExcelBorderSide = {
  style: 'thin';
  color: { rgb: string };
};

type ExcelCellStyle = {
  font: {
    name: string;
    sz: number;
    color: { rgb: string };
  };
  fill: {
    patternType: 'solid';
    fgColor: { rgb: string };
  };
  border: {
    top: ExcelBorderSide;
    bottom: ExcelBorderSide;
    left: ExcelBorderSide;
    right: ExcelBorderSide;
  };
  alignment: {
    vertical: 'top';
    horizontal: 'left';
    wrapText: boolean;
  };
};

type StyledCell = {
  v: string;
  t: 's';
  s: ExcelCellStyle;
};

function sanitizeFilename(name: string): string {
  const trimmed = name.replace(INVALID_FILENAME_CHARS, '_').trim();
  return trimmed || '표';
}

function hexToExcelRgb(hex: string): string {
  const raw = hex.replace('#', '').trim();
  if (raw.length === 3) {
    return raw
      .split('')
      .map((channel) => `${channel}${channel}`)
      .join('')
      .toUpperCase();
  }
  if (raw.length === 6) return raw.toUpperCase();
  if (raw.length === 8) return raw.slice(2).toUpperCase();
  return '000000';
}

function excelFontName(fontFamily: string): string {
  const first = fontFamily.split(',')[0]?.trim().replace(/^['"]|['"]$/g, '') ?? '';
  return first || 'Calibri';
}

function pxToColumnWidth(px: number): number {
  return Math.max(1, Math.round(((px - 5) / 7) * 100) / 100);
}

function pxToRowHeightPt(px: number): number {
  return Math.max(1, Math.round(px * 0.75 * 100) / 100);
}

function borderSide(color: string): ExcelBorderSide {
  return { style: 'thin', color: { rgb: hexToExcelRgb(color) } };
}

function buildCellStyle(table: TableObject, row: number, col: number): ExcelCellStyle {
  const borderColor = table.borderColor;
  const side = borderSide(borderColor);

  return {
    font: {
      name: excelFontName(table.fontFamily),
      sz: table.fontSize,
      color: { rgb: hexToExcelRgb(getCellTextColor(table, row, col)) },
    },
    fill: {
      patternType: 'solid',
      fgColor: { rgb: hexToExcelRgb(getCellFillColor(table, row, col)) },
    },
    border: {
      top: side,
      bottom: side,
      left: side,
      right: side,
    },
    alignment: {
      vertical: 'top',
      horizontal: 'left',
      wrapText: true,
    },
  };
}

function buildStyledRows(table: TableObject): StyledCell[][] {
  const rows: StyledCell[][] = [];

  for (let row = 0; row < table.rows; row++) {
    const line: StyledCell[] = [];
    for (let col = 0; col < table.cols; col++) {
      const value = table.cells[row]?.[col] ?? '';
      line.push({
        v: value,
        t: 's',
        s: buildCellStyle(table, row, col),
      });
    }
    rows.push(line);
  }

  return rows;
}

function resolveExportRowHeights(table: TableObject): number[] {
  return resolveSessionRowHeights(
    {
      rows: table.rows,
      cells: table.cells,
      rowHeights: getTableRowHeights(table),
    },
    table.fontSize,
    table.cellHeight,
  );
}

export async function exportTableToExcel(table: TableObject, filenameBase?: string): Promise<void> {
  const XLSX = await import('xlsx-js-style');

  const sheet = XLSX.utils.aoa_to_sheet(buildStyledRows(table));

  sheet['!cols'] = getTableColWidths(table).map((width) => ({
    wch: pxToColumnWidth(width),
  }));

  sheet['!rows'] = resolveExportRowHeights(table).map((height) => ({
    hpt: pxToRowHeightPt(height * EXCEL_ROW_HEIGHT_BUFFER),
  }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1');

  const filename = `${sanitizeFilename(filenameBase?.trim() || '표')}.xlsx`;
  XLSX.writeFile(workbook, filename);
}
