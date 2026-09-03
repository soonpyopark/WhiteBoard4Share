import type {
  DrawTool,
  EraserMode,
  ImageObject,
  LineEndStyle,
  PathObject,
  PathTransform,
  SceneObject,
  StrokePoint,
  TableObject,
  TextObject,
} from '../../shared/drawing';

export type {
  DrawTool,
  EraserMode,
  ImageObject,
  LineEndStyle,
  PathObject,
  PathTransform,
  SceneObject,
  StrokePoint,
  TableObject,
  TextObject,
};
export {
  isImageObject,
  isPathObject,
  isTableObject,
  isTextObject,
} from '../../shared/drawing';

export type Tool = DrawTool | 'select' | 'lasso' | 'hand' | 'image' | 'text' | 'table';

export interface LassoPoint {
  x: number;
  y: number;
}

export interface DrawingOptions {
  tool: DrawTool;
  color: string;
  baseWidth: number;
  minWidth: number;
  maxWidth: number;
  opacity: number;
  lineEnd: LineEndStyle;
  eraserMode?: EraserMode;
}

export interface ToolPreset {
  opacity: number;
  baseWidth: number;
  minWidth: number;
  maxWidth: number;
  textured: boolean;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type HandleId = 'nw' | 'ne' | 'sw' | 'se' | 'rotate';

export interface HandlePosition {
  id: HandleId;
  x: number;
  y: number;
}

export const TOOL_PRESETS: Record<DrawTool, ToolPreset> = {
  pencil: {
    opacity: 0.7,
    baseWidth: 1.5,
    minWidth: 0.5,
    maxWidth: 3,
    textured: true,
  },
  pen: {
    opacity: 1.0,
    baseWidth: 2,
    minWidth: 0.8,
    maxWidth: 4,
    textured: false,
  },
  highlighter: {
    opacity: 0.2,
    baseWidth: 20,
    minWidth: 20,
    maxWidth: 20,
    textured: false,
  },
  eraser: {
    opacity: 1.0,
    baseWidth: 20,
    minWidth: 10,
    maxWidth: 40,
    textured: false,
  },
};

export const HANDLE_RADIUS = 7;
export const ROTATION_HANDLE_OFFSET = 28;

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;
export const ZOOM_STEP_FACTOR = 1.25;
