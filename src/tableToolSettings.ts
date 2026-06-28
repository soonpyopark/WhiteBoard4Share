import type { TableObject } from './engine/types';
import { MAIN_COLOR_PALETTE, TEXT_FONT_OPTIONS } from './textToolSettings';

export interface TableToolSettings {
  fontFamily: string;
  fontSize: number;
  color: string;
  borderColor: string;
  cellWidth: number;
  cellHeight: number;
}

export const DEFAULT_TABLE_TOOL_SETTINGS: TableToolSettings = {
  fontFamily: 'Malgun Gothic, sans-serif',
  fontSize: 14,
  color: '#4a4a4a',
  borderColor: '#4a4a4a',
  cellWidth: 80,
  cellHeight: 32,
};

export { MAIN_COLOR_PALETTE, TEXT_FONT_OPTIONS };

export function settingsFromTable(table: TableObject): TableToolSettings {
  return {
    fontFamily: table.fontFamily,
    fontSize: table.fontSize,
    color: table.color,
    borderColor: table.borderColor,
    cellWidth: table.cellWidth,
    cellHeight: table.cellHeight,
  };
}
