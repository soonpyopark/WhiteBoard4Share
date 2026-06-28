import type { TableObject } from '../../engine/types';

const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;

function sanitizeFilename(name: string): string {
  const trimmed = name.replace(INVALID_FILENAME_CHARS, '_').trim();
  return trimmed || '표';
}

function buildExportFilename(table: TableObject): string {
  for (const row of table.cells) {
    for (const cell of row) {
      const trimmed = cell.trim();
      if (trimmed) return sanitizeFilename(trimmed.slice(0, 40));
    }
  }
  return '표';
}

export async function exportTableToExcel(table: TableObject, filenameBase?: string): Promise<void> {
  const XLSX = await import('xlsx');

  const aoa: string[][] = [];
  for (let row = 0; row < table.rows; row++) {
    const line: string[] = [];
    for (let col = 0; col < table.cols; col++) {
      line.push(table.cells[row]?.[col] ?? '');
    }
    aoa.push(line);
  }

  const sheet = XLSX.utils.aoa_to_sheet(aoa);

  if (table.colWidths?.length) {
    sheet['!cols'] = table.colWidths.map((width) => ({
      wch: Math.max(8, Math.min(60, Math.round(width / 8))),
    }));
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1');

  const filename = `${sanitizeFilename(filenameBase ?? buildExportFilename(table))}.xlsx`;
  XLSX.writeFile(workbook, filename);
}
