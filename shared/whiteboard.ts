import type { ImageObject, PathObject, TableObject, TextObject } from './drawing.ts';

export interface WhiteboardDocument {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  paths: PathObject[];
  images?: ImageObject[];
  texts?: TextObject[];
  tables?: TableObject[];
  thumbnail?: string;
  shareToken?: string;
  isPrivate?: boolean;
  isViewRestricted?: boolean;
}

export interface WhiteboardSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  thumbnail?: string;
  shareToken?: string;
  isPrivate?: boolean;
  isViewRestricted?: boolean;
}

export interface SaveWhiteboardPayload {
  title?: string;
  paths: PathObject[];
  images?: ImageObject[];
  texts?: TextObject[];
  tables?: TableObject[];
  thumbnail?: string;
}
