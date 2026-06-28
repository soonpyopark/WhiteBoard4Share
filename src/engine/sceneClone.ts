import type { ImageObject, PathObject, TableObject, TextObject } from './types';

export function clonePaths(paths: PathObject[]): PathObject[] {
  return structuredClone(paths);
}

export function cloneImages(images: ImageObject[]): ImageObject[] {
  return images.map((image) => ({
    ...image,
    transform: { ...image.transform },
  }));
}

export function cloneTexts(texts: TextObject[]): TextObject[] {
  return texts.map((text) => ({
    ...text,
    transform: { ...text.transform },
  }));
}

export function cloneTables(tables: TableObject[]): TableObject[] {
  return tables.map((table) => ({
    ...table,
    cells: table.cells.map((row) => [...row]),
    colWidths: table.colWidths ? [...table.colWidths] : undefined,
    rowHeights: table.rowHeights ? [...table.rowHeights] : undefined,
    transform: { ...table.transform },
  }));
}
