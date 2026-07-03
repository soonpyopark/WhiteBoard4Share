import type { ImageObject, PathObject, TableObject, TextObject } from './drawing.ts';

export const WHITEBOARD_FILE_FORMAT = 'whiteboard4share' as const;
export const WHITEBOARD_FILE_VERSION = 1 as const;
export const WHITEBOARD_FILE_EXTENSION = '.wb4s';

export interface WhiteboardFileDocument {
  format: typeof WHITEBOARD_FILE_FORMAT;
  version: typeof WHITEBOARD_FILE_VERSION;
  exportedAt: string;
  title: string;
  paths: PathObject[];
  images?: ImageObject[];
  texts?: TextObject[];
  tables?: TableObject[];
  thumbnail?: string;
}

export interface WhiteboardFileImportPayload {
  title: string;
  paths: PathObject[];
  images: ImageObject[];
  texts: TextObject[];
  tables: TableObject[];
  thumbnail?: string;
}
