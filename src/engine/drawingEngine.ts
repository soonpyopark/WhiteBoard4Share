import { createId } from '../utils/id';
import { hitTestHandle, hitTestPath, pathsHitByEraserStroke } from './hitTest';
import { getCachedImage, preloadImage, preloadImages, renderImage } from './imageRenderer';
import {
  applyLayerMove,
  canApplyLayerMove,
  getObjectWorldBounds,
  getNextZIndex,
  getObjectsByIds,
  getSceneObjectsSorted,
  getSelectedObject,
  hitTestImage,
  hitTestSceneAt,
  hitTestTable,
  hitTestText,
  hitAllSceneInLasso,
  moveSceneObject,
  normalizeSceneZIndices,
  type LayerMove,
} from './sceneObject';
import { createPathFromStroke, getPathWorldBounds } from './pathObject';
import { renderLiveStroke, renderPath } from './pathRenderer';
import { cloneImages, clonePaths, cloneTables, cloneTexts } from './sceneClone';
import {
  createUniformColWidths,
  createUniformRowHeights,
  normalizeTableLayout,
} from '../lib/table/tableDimensions';
import { applyTableAxisColors } from '../lib/table/tableColors';
import { applyTextDimensions, measureTextContent, renderText, TEXT_LINE_HEIGHT } from './textRenderer';
import {
  applyTableDimensions,
  createEmptyCells,
  renderTable,
} from './tableRenderer';
import { pressureToWidth } from './pressure';
import { getStylusCatmullSegments } from './strokeInput';
import { catmullRomSpline } from './smoothing';
import { renderDropOverlay, renderLasso, renderSelectionBox } from './selectionRenderer';
import type {
  DrawingOptions,
  HandleId,
  ImageObject,
  LassoPoint,
  LineEndStyle,
  PathObject,
  SceneObject,
  StrokePoint,
  TableObject,
  TextObject,
  ToolPreset,
  Rect,
} from './types';
import {
  HANDLE_RADIUS,
  MAX_ZOOM,
  MIN_ZOOM,
  ZOOM_STEP_FACTOR,
  isImageObject,
  isTableObject,
  isTextObject,
} from './types';
import {
  diffSceneSnapshots,
  isScenePatchEmpty,
  type SceneWriteEvent,
} from '../lib/collab/scene-events.ts';
import type { SceneSnapshot as CollabSceneSnapshot } from '../lib/collab/schema.ts';

type SelectionCallback = (selectedIds: string[]) => void;
type PathsChangeCallback = () => void;
type DeferredDrawChangeCallback = () => void;
type SceneWriteCallback = (event: SceneWriteEvent | SceneWriteEvent[]) => void;

export interface DeleteSelectedResult {
  paths: string[];
  images: string[];
  texts: string[];
  tables: string[];
}
type ZoomChangeCallback = (percent: number) => void;
type HistoryChangeCallback = (state: { canUndo: boolean; canRedo: boolean }) => void;
type RemoteTableUpsertCallback = (table: TableObject) => void;
type RemoteTableDeleteCallback = (tableId: string) => void;

interface SceneSnapshot {
  paths: PathObject[];
  images: ImageObject[];
  texts: TextObject[];
  tables: TableObject[];
  selectedIds?: string[];
  /** @deprecated use selectedIds */
  selectedId?: string | null;
}

type HistoryEntry =
  | { type: 'snapshot'; data: SceneSnapshot }
  | { type: 'add-path'; path: PathObject }
  | { type: 'remove-paths'; paths: PathObject[] };

interface TransformDrag {
  handle: HandleId;
  startX: number;
  startY: number;
  startScale: number;
  startRotation: number;
  startDist: number;
  startAngle: number;
}

interface MoveDrag {
  lastX: number;
  lastY: number;
}

interface PanDrag {
  lastScreenX: number;
  lastScreenY: number;
  startViewOffsetX: number;
  startViewOffsetY: number;
}

export class DrawingEngine {
  private ctx: CanvasRenderingContext2D;
  private paths: PathObject[] = [];
  private images: ImageObject[] = [];
  private texts: TextObject[] = [];
  private tables: TableObject[] = [];
  private selectedIds: string[] = [];
  private isDrawing = false;
  private strokePoints: StrokePoint[] = [];
  private strokeOptions: DrawingOptions | null = null;
  private strokePreset: ToolPreset | null = null;
  private lassoPoints: LassoPoint[] | null = null;
  private transformDrag: TransformDrag | null = null;
  private moveDrag: MoveDrag | null = null;
  private panDrag: PanDrag | null = null;
  private viewOffsetX = 0;
  private viewOffsetY = 0;
  private viewScale = 1;
  private dropHighlight = false;
  private onSelectionChange: SelectionCallback | null = null;
  private onPathsChange: PathsChangeCallback | null = null;
  private onZoomChange: ZoomChangeCallback | null = null;
  private onHistoryChange: HistoryChangeCallback | null = null;
  private onCollabPublish: SceneWriteCallback | null = null;
  private onDeferredDrawChange: DeferredDrawChangeCallback | null = null;
  /** 연필/볼펜/형광펜/지우개로만 생성·삭제된 경로 — 작성 내용 전송 전까지 동기화 보류 */
  private deferredDrawPathIds = new Set<string>();
  /** 지우개(획)로 로컬만 삭제된, 이미 공유됐을 수 있는 경로 */
  private deferredDrawPathDeletes = new Set<string>();
  private onRemoteTableUpsert: RemoteTableUpsertCallback | null = null;
  private onRemoteTableDelete: RemoteTableDeleteCallback | null = null;
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private readonly maxHistory = 50;
  private dpr = 1;
  private sceneCache: HTMLCanvasElement | null = null;
  private sceneCacheCtx: CanvasRenderingContext2D | null = null;
  private sceneCacheValid = false;
  private sceneCacheRenderedPaths = 0;
  private sceneCacheRenderedImages = 0;
  private sceneCacheRenderedTexts = 0;
  private sceneCacheRenderedTables = 0;
  private sceneCacheViewKey = '';
  private dragBaseCache: HTMLCanvasElement | null = null;
  private dragBaseCacheCtx: CanvasRenderingContext2D | null = null;
  private panBaseCache: HTMLCanvasElement | null = null;
  private panBaseCacheCtx: CanvasRenderingContext2D | null = null;
  private historyNotifyScheduled = false;
  private suppressPathsChange = false;
  private remoteUpdateDepth = 0;
  private hiddenSceneObjectIds = new Set<string>();
  private collabSceneSyncTimer: number | null = null;
  private static readonly COLLAB_SCENE_SYNC_MS = 32;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { willReadFrequently: false });
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    this.ctx = ctx;
  }

  setOnSelectionChange(cb: SelectionCallback | null): void {
    this.onSelectionChange = cb;
  }

  setOnPathsChange(cb: PathsChangeCallback | null): void {
    this.onPathsChange = cb;
  }

  setOnZoomChange(cb: ZoomChangeCallback | null): void {
    this.onZoomChange = cb;
  }

  setOnHistoryChange(cb: HistoryChangeCallback | null): void {
    this.onHistoryChange = cb;
  }

  setOnCollabPublish(cb: SceneWriteCallback | null): void {
    this.onCollabPublish = cb;
    if (!cb) {
      this.clearCollabSceneSyncTimer();
    }
  }

  setOnDeferredDrawChange(cb: DeferredDrawChangeCallback | null): void {
    this.onDeferredDrawChange = cb;
  }

  clearDeferredDrawState(): void {
    this.deferredDrawPathIds.clear();
    this.deferredDrawPathDeletes.clear();
  }

  snapshotDeferredDrawState(): { ids: Set<string>; deletes: Set<string> } {
    return {
      ids: new Set(this.deferredDrawPathIds),
      deletes: new Set(this.deferredDrawPathDeletes),
    };
  }

  hasDeferredDrawChanges(): boolean {
    return this.deferredDrawPathIds.size > 0 || this.deferredDrawPathDeletes.size > 0;
  }

  buildHistoryCollabPatch(
    before: CollabSceneSnapshot,
    after: CollabSceneSnapshot,
    deferredBefore?: { ids: Set<string>; deletes: Set<string> },
  ): SceneWriteEvent | null {
    const { upserts, deletes } = diffSceneSnapshots(before, after);
    const skipPathId = (id: string) => {
      const ids = deferredBefore?.ids ?? this.deferredDrawPathIds;
      const dels = deferredBefore?.deletes ?? this.deferredDrawPathDeletes;
      return ids.has(id) || dels.has(id);
    };
    const filteredUpserts = {
      ...upserts,
      paths: upserts.paths.filter((path) => !skipPathId(path.id)),
    };
    const filteredDeletes = {
      ...deletes,
      paths: deletes.paths.filter((id) => !skipPathId(id)),
    };
    if (isScenePatchEmpty(filteredUpserts, filteredDeletes)) return null;
    return { type: 'scene-patch', upserts: filteredUpserts, deletes: filteredDeletes };
  }

  setOnRemoteTableUpsert(cb: RemoteTableUpsertCallback | null): void {
    this.onRemoteTableUpsert = cb;
  }

  setOnRemoteTableDelete(cb: RemoteTableDeleteCallback | null): void {
    this.onRemoteTableDelete = cb;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  async loadScene(
    paths: PathObject[],
    images: ImageObject[] = [],
    texts: TextObject[] = [],
    tables: TableObject[] = [],
  ): Promise<void> {
    await this.applyScene(paths, images, texts, tables, { resetHistory: true, resetView: true });
  }

  /** 협업 원격 변경 반영 — 저장/히스토리 알림 없이 씬만 갱신 */
  async applyRemoteScene(
    paths: PathObject[],
    images: ImageObject[] = [],
    texts: TextObject[] = [],
    tables: TableObject[] = [],
  ): Promise<void> {
    this.suppressPathsChange = true;
    try {
      await this.applyScene(paths, images, texts, tables, { resetHistory: false, resetView: false });
    } finally {
      this.suppressPathsChange = false;
    }
  }

  beginRemoteUpdateBatch(): void {
    this.remoteUpdateDepth++;
  }

  async endRemoteUpdateBatch(): Promise<void> {
    this.remoteUpdateDepth = Math.max(0, this.remoteUpdateDepth - 1);
    if (this.remoteUpdateDepth === 0) {
      await preloadImages(this.images);
      normalizeSceneZIndices(this.paths, this.images, this.texts, this.tables);
      this.invalidateSceneCache();
      this.redraw();
    }
  }

  private commitRemoteVisualUpdate(): void {
    if (this.remoteUpdateDepth > 0) return;
    normalizeSceneZIndices(this.paths, this.images, this.texts, this.tables);
    this.invalidateSceneCache();
    this.redraw();
  }

  upsertRemotePath(path: PathObject): void {
    this.suppressPathsChange = true;
    try {
      const cloned = structuredClone(path);
      const index = this.paths.findIndex((item) => item.id === cloned.id);
      if (index >= 0) {
        this.paths[index] = cloned;
      } else {
        this.paths.push(cloned);
      }
      this.commitRemoteVisualUpdate();
    } finally {
      this.suppressPathsChange = false;
    }
  }

  removeRemotePath(pathId: string): void {
    this.suppressPathsChange = true;
    try {
      this.paths = this.paths.filter((item) => item.id !== pathId);
      this.selectedIds = this.selectedIds.filter((id) => id !== pathId);
      this.commitRemoteVisualUpdate();
    } finally {
      this.suppressPathsChange = false;
    }
  }

  async upsertRemoteImage(image: ImageObject): Promise<void> {
    this.suppressPathsChange = true;
    try {
      const cloned = structuredClone(image);
      const index = this.images.findIndex((item) => item.id === cloned.id);
      if (index >= 0) {
        this.images[index] = cloned;
      } else {
        this.images.push(cloned);
      }
      if (this.remoteUpdateDepth === 0) {
        await preloadImages([cloned]);
      }
      this.commitRemoteVisualUpdate();
    } finally {
      this.suppressPathsChange = false;
    }
  }

  removeRemoteImage(imageId: string): void {
    this.suppressPathsChange = true;
    try {
      this.images = this.images.filter((item) => item.id !== imageId);
      this.selectedIds = this.selectedIds.filter((id) => id !== imageId);
      this.commitRemoteVisualUpdate();
    } finally {
      this.suppressPathsChange = false;
    }
  }

  upsertRemoteText(text: TextObject): void {
    this.suppressPathsChange = true;
    try {
      const cloned = structuredClone(text);
      const index = this.texts.findIndex((item) => item.id === cloned.id);
      if (index >= 0) {
        this.texts[index] = cloned;
      } else {
        this.texts.push(cloned);
      }
      this.commitRemoteVisualUpdate();
    } finally {
      this.suppressPathsChange = false;
    }
  }

  removeRemoteText(textId: string): void {
    this.suppressPathsChange = true;
    try {
      this.texts = this.texts.filter((item) => item.id !== textId);
      this.selectedIds = this.selectedIds.filter((id) => id !== textId);
      this.commitRemoteVisualUpdate();
    } finally {
      this.suppressPathsChange = false;
    }
  }

  upsertRemoteTable(table: TableObject): void {
    this.suppressPathsChange = true;
    try {
      const cloned = structuredClone(table);
      const index = this.tables.findIndex((item) => item.id === cloned.id);
      if (index >= 0) {
        this.tables[index] = cloned;
      } else {
        this.tables.push(cloned);
      }
      this.commitRemoteVisualUpdate();
      this.onRemoteTableUpsert?.(cloned);
    } finally {
      this.suppressPathsChange = false;
    }
  }

  removeRemoteTable(tableId: string): void {
    this.suppressPathsChange = true;
    try {
      this.tables = this.tables.filter((item) => item.id !== tableId);
      this.selectedIds = this.selectedIds.filter((id) => id !== tableId);
      this.commitRemoteVisualUpdate();
      this.onRemoteTableDelete?.(tableId);
    } finally {
      this.suppressPathsChange = false;
    }
  }

  private async applyScene(
    paths: PathObject[],
    images: ImageObject[] = [],
    texts: TextObject[] = [],
    tables: TableObject[] = [],
    options: { resetHistory: boolean; resetView: boolean },
  ): Promise<void> {
    this.paths = JSON.parse(JSON.stringify(paths)) as PathObject[];
    this.images = JSON.parse(JSON.stringify(images)) as ImageObject[];
    this.texts = JSON.parse(JSON.stringify(texts)) as TextObject[];
    this.tables = JSON.parse(JSON.stringify(tables)) as TableObject[];
    normalizeSceneZIndices(this.paths, this.images, this.texts, this.tables);
    this.selectedIds = [];
    this.isDrawing = false;
    this.strokePoints = [];
    this.lassoPoints = null;
    this.transformDrag = null;
    this.moveDrag = null;
    if (options.resetHistory) {
      this.resetHistory();
    }
    if (options.resetView) {
      const { width, height } = this.getViewportSize();
      if (width > 0 && height > 0) {
        this.recenterView(width, height);
      } else {
        this.resetView();
      }
    }
    await preloadImages(this.images);
    this.invalidateSceneCache();
    this.notifySelection();
    this.redraw();
  }

  /** @deprecated use loadScene */
  loadPaths(paths: PathObject[]): void {
    void this.loadScene(paths, []);
  }

  getPathsSnapshot(): PathObject[] {
    return clonePaths(this.paths);
  }

  getImagesSnapshot(): ImageObject[] {
    return cloneImages(this.images);
  }

  getTextsSnapshot(): TextObject[] {
    return cloneTexts(this.texts);
  }

  getTextObject(id: string): TextObject | null {
    return this.texts.find((text) => text.id === id) ?? null;
  }

  getTablesSnapshot(): TableObject[] {
    return cloneTables(this.tables);
  }

  getTableObject(id: string): TableObject | null {
    return this.tables.find((table) => table.id === id) ?? null;
  }

  setHiddenSceneObjectIds(ids: readonly string[]): void {
    this.hiddenSceneObjectIds = new Set(ids);
    this.invalidateSceneCache();
    this.redraw();
  }

  getSelectedIds(): string[] {
    return [...this.selectedIds];
  }

  getSelectedId(): string | null {
    return this.selectedIds.length === 1 ? this.selectedIds[0] : null;
  }

  getSelectedObjects(): SceneObject[] {
    return getObjectsByIds(this.paths, this.images, this.selectedIds, this.texts, this.tables);
  }

  getSelectedObject(): SceneObject | null {
    if (this.selectedIds.length !== 1) return null;
    return getSelectedObject(this.paths, this.images, this.selectedIds[0], this.texts, this.tables);
  }

  containsSelectedAt(x: number, y: number): boolean {
    for (const obj of this.getSelectedObjects()) {
      if (this.objectContainsPoint(obj, x, y)) return true;
    }
    return false;
  }

  /** @deprecated use getSelectedObject */
  getSelectedPath(): PathObject | null {
    const obj = this.getSelectedObject();
    return obj && 'points' in obj ? obj : null;
  }

  getPaths(): readonly PathObject[] {
    return this.paths;
  }

  screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    return {
      x: (screenX - this.viewOffsetX) / this.viewScale,
      y: (screenY - this.viewOffsetY) / this.viewScale,
    };
  }

  worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
    return {
      x: worldX * this.viewScale + this.viewOffsetX,
      y: worldY * this.viewScale + this.viewOffsetY,
    };
  }

  getViewScale(): number {
    return this.viewScale;
  }

  getZoomPercent(): number {
    return Math.round(this.viewScale * 100);
  }

  private clampZoom(scale: number): number {
    return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, scale));
  }

  private getSceneBounds(): Rect | null {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const path of this.paths) {
      const b = getPathWorldBounds(path);
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.w);
      maxY = Math.max(maxY, b.y + b.h);
    }

    for (const image of this.images) {
      const b = getObjectWorldBounds(image);
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.w);
      maxY = Math.max(maxY, b.y + b.h);
    }

    for (const text of this.texts) {
      const b = getObjectWorldBounds(text);
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.w);
      maxY = Math.max(maxY, b.y + b.h);
    }

    for (const table of this.tables) {
      const b = getObjectWorldBounds(table);
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.w);
      maxY = Math.max(maxY, b.y + b.h);
    }

    if (!Number.isFinite(minX)) return null;

    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  private setZoomAt(scale: number, anchorScreenX: number, anchorScreenY: number): void {
    const nextScale = this.clampZoom(scale);
    const worldX = (anchorScreenX - this.viewOffsetX) / this.viewScale;
    const worldY = (anchorScreenY - this.viewOffsetY) / this.viewScale;
    this.viewScale = nextScale;
    this.viewOffsetX = anchorScreenX - worldX * this.viewScale;
    this.viewOffsetY = anchorScreenY - worldY * this.viewScale;
    this.invalidateSceneCache();
    this.redraw();
    this.notifyZoomChange();
  }

  zoomIn(viewportWidth: number, viewportHeight: number): void {
    this.setZoomAt(
      this.viewScale * ZOOM_STEP_FACTOR,
      viewportWidth / 2,
      viewportHeight / 2,
    );
  }

  zoomOut(viewportWidth: number, viewportHeight: number): void {
    this.setZoomAt(
      this.viewScale / ZOOM_STEP_FACTOR,
      viewportWidth / 2,
      viewportHeight / 2,
    );
  }

  setZoomPercent(percent: number, viewportWidth: number, viewportHeight: number): void {
    this.setZoomAt(percent / 100, viewportWidth / 2, viewportHeight / 2);
  }

  fitToWidth(viewportWidth: number, viewportHeight: number): void {
    const bounds = this.getSceneBounds();
    if (!bounds || bounds.w <= 0) {
      this.resetView();
      return;
    }

    const pad = 48;
    const scale = this.clampZoom((viewportWidth - pad * 2) / bounds.w);
    this.viewScale = scale;
    this.viewOffsetX = (viewportWidth - bounds.w * scale) / 2 - bounds.x * scale;
    this.viewOffsetY = (viewportHeight - bounds.h * scale) / 2 - bounds.y * scale;
    this.invalidateSceneCache();
    this.redraw();
    this.notifyZoomChange();
  }

  /** Pan to center scene content at 100% zoom. */
  recenterView(viewportWidth: number, viewportHeight: number): void {
    const bounds = this.getSceneBounds();
    this.viewScale = 1;

    if (!bounds || bounds.w <= 0) {
      this.viewOffsetX = viewportWidth / 2;
      this.viewOffsetY = viewportHeight / 2;
    } else {
      const centerX = bounds.x + bounds.w / 2;
      const centerY = bounds.y + bounds.h / 2;
      this.viewOffsetX = viewportWidth / 2 - centerX;
      this.viewOffsetY = viewportHeight / 2 - centerY;
    }

    this.invalidateSceneCache();
    this.redraw();
    this.notifyZoomChange();
  }

  resetView(): void {
    this.viewScale = 1;
    this.viewOffsetX = 0;
    this.viewOffsetY = 0;
    this.invalidateSceneCache();
    this.redraw();
    this.notifyZoomChange();
  }

  private getViewportSize(): { width: number; height: number } {
    const canvas = this.ctx.canvas;
    return {
      width: canvas.clientWidth,
      height: canvas.clientHeight,
    };
  }

  getViewCenterWorld(screenWidth: number, screenHeight: number): { x: number; y: number } {
    return this.screenToWorld(screenWidth / 2, screenHeight / 2);
  }

  beginPan(screenX: number, screenY: number): void {
    if (!this.panDrag) {
      this.redraw();
      this.buildPanBaseCache();
    }
    this.panDrag = {
      lastScreenX: screenX,
      lastScreenY: screenY,
      startViewOffsetX: this.viewOffsetX,
      startViewOffsetY: this.viewOffsetY,
    };
  }

  updatePan(screenX: number, screenY: number): void {
    if (!this.panDrag) return;
    this.viewOffsetX += screenX - this.panDrag.lastScreenX;
    this.viewOffsetY += screenY - this.panDrag.lastScreenY;
    this.panDrag.lastScreenX = screenX;
    this.panDrag.lastScreenY = screenY;
    this.redrawPanPreview();
    this.notifyZoomChange();
  }

  endPan(): void {
    if (!this.panDrag) return;
    this.panDrag = null;
    this.clearPanBaseCache();
    this.invalidateSceneCache();
    this.redraw();
  }

  isPanning(): boolean {
    return this.panDrag !== null;
  }

  resize(width: number, height: number, dpr: number): void {
    const canvas = this.ctx.canvas;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    this.dpr = dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.invalidateSceneCache();
    this.redraw();
  }

  setDropHighlight(active: boolean): void {
    this.dropHighlight = active;
    this.redraw();
  }

  clear(): void {
    this.recordHistory();
    this.paths = [];
    this.images = [];
    this.texts = [];
    this.tables = [];
    this.selectedIds = [];
    this.notifySelection();
    this.invalidateSceneCache();
    this.redraw();
    this.notifyPathsChange();
  }

  canReorderSelected(move: LayerMove): boolean {
    return canApplyLayerMove(this.paths, this.images, this.texts, this.selectedIds, move, this.tables);
  }

  reorderSelected(move: LayerMove): boolean {
    if (!canApplyLayerMove(this.paths, this.images, this.texts, this.selectedIds, move, this.tables)) {
      return false;
    }

    this.recordHistory();
    applyLayerMove(this.paths, this.images, this.texts, this.selectedIds, move, this.tables);
    this.invalidateSceneCache();
    this.redraw();
    this.emitSceneObjects(this.getSelectedObjects());
    this.notifyPathsChange();
    return true;
  }

  deleteSelected(): DeleteSelectedResult | null {
    if (this.selectedIds.length === 0) return null;
    this.recordHistory();
    const removeIds = new Set(this.selectedIds);
    const pathDeletes = this.paths.filter((p) => removeIds.has(p.id)).map((p) => p.id);
    const imageDeletes = this.images.filter((i) => removeIds.has(i.id)).map((i) => i.id);
    const textDeletes = this.texts.filter((t) => removeIds.has(t.id)).map((t) => t.id);
    const tableDeletes = this.tables.filter((t) => removeIds.has(t.id)).map((t) => t.id);
    this.paths = this.paths.filter((p) => !removeIds.has(p.id));
    this.images = this.images.filter((i) => !removeIds.has(i.id));
    this.texts = this.texts.filter((t) => !removeIds.has(t.id));
    this.tables = this.tables.filter((t) => !removeIds.has(t.id));
    this.selectedIds = [];
    this.notifySelection();
    this.invalidateSceneCache();
    this.redraw();
    this.emitSceneWriteMany([
      ...pathDeletes.map((id) => ({ type: 'path-delete' as const, id })),
      ...imageDeletes.map((id) => ({ type: 'image-delete' as const, id })),
      ...textDeletes.map((id) => ({ type: 'text-delete' as const, id })),
      ...tableDeletes.map((id) => ({ type: 'table-delete' as const, id })),
    ]);
    this.notifyPathsChange();
    return {
      paths: pathDeletes,
      images: imageDeletes,
      texts: textDeletes,
      tables: tableDeletes,
    };
  }

  updateSelectedColor(color: string): boolean {
    return this.updateSelectedPathStyle({ color });
  }

  updateSelectedPathStyle(patch: {
    color?: string;
    opacity?: number;
    baseWidth?: number;
    minWidth?: number;
    maxWidth?: number;
    lineEnd?: LineEndStyle;
  }): boolean {
    const obj = this.getSelectedObject();
    if (!obj || !('points' in obj) || obj.tool === 'eraser') return false;

    if (patch.color !== undefined) obj.color = patch.color;
    if (patch.opacity !== undefined) obj.opacity = patch.opacity;
    if (patch.baseWidth !== undefined) obj.baseWidth = patch.baseWidth;
    if (patch.minWidth !== undefined) obj.minWidth = patch.minWidth;
    if (patch.maxWidth !== undefined) obj.maxWidth = patch.maxWidth;
    if (patch.lineEnd !== undefined) obj.lineEnd = patch.lineEnd;

    this.invalidateSceneCache();
    this.redraw();
    this.emitSceneWrite({ type: 'path-upsert', path: structuredClone(obj) });
    this.notifyPathsChange();
    return true;
  }

  updateSelectedTextStyle(patch: {
    fontFamily?: string;
    fontSize?: number;
    color?: string;
  }): boolean {
    const obj = this.getSelectedObject();
    if (!obj || !isTextObject(obj)) return false;

    if (patch.fontFamily !== undefined) obj.fontFamily = patch.fontFamily;
    if (patch.fontSize !== undefined) obj.fontSize = patch.fontSize;
    if (patch.color !== undefined) obj.color = patch.color;
    applyTextDimensions(obj);

    this.invalidateSceneCache();
    this.redraw();
    this.emitSceneWrite({ type: 'text-upsert', text: structuredClone(obj) });
    this.notifyPathsChange();
    return true;
  }

  selectAt(x: number, y: number): boolean {
    const hit = hitTestSceneAt(this.paths, this.images, x, y, this.texts, this.tables);
    this.selectedIds = hit ? [hit.id] : [];
    this.notifySelection();
    this.redraw();
    return hit !== null;
  }

  deselect(): void {
    if (this.selectedIds.length === 0) return;
    this.selectedIds = [];
    this.notifySelection();
    this.redraw();
  }

  beginLasso(x: number, y: number): void {
    this.lassoPoints = [{ x, y }];
    if (this.selectedIds.length > 0) {
      this.selectedIds = [];
      this.notifySelection();
    }
    this.redraw();
  }

  extendLasso(x: number, y: number): void {
    if (!this.lassoPoints) return;
    const last = this.lassoPoints[this.lassoPoints.length - 1];
    const minDist = 2 / this.viewScale;
    if (Math.hypot(x - last.x, y - last.y) < minDist) return;
    this.lassoPoints.push({ x, y });
    this.redraw();
  }

  endLasso(): void {
    if (this.lassoPoints && this.lassoPoints.length >= 3) {
      const hits = hitAllSceneInLasso(this.paths, this.images, this.lassoPoints, this.texts, this.tables);
      this.selectedIds = hits.map((obj) => obj.id);
      this.notifySelection();
    } else if (this.lassoPoints && this.lassoPoints.length > 0) {
      const p = this.lassoPoints[0];
      const hit = hitTestSceneAt(this.paths, this.images, p.x, p.y, this.texts);
      this.selectedIds = hit ? [hit.id] : [];
      this.notifySelection();
    }
    this.lassoPoints = null;
    this.redraw();
  }

  beginMove(x: number, y: number): boolean {
    if (this.selectedIds.length === 0) {
      const hit = hitTestSceneAt(this.paths, this.images, x, y, this.texts, this.tables);
      if (!hit) {
        this.selectedIds = [];
        this.notifySelection();
        this.redraw();
        return false;
      }
      this.selectedIds = [hit.id];
      this.notifySelection();
    } else if (!this.containsSelectedAt(x, y)) {
      const hit = hitTestSceneAt(this.paths, this.images, x, y, this.texts, this.tables);
      if (hit) {
        this.selectedIds = [hit.id];
        this.notifySelection();
      }
    }

    this.moveDrag = { lastX: x, lastY: y };
    this.recordHistory();
    this.buildDragBaseCache();
    this.redraw();
    return true;
  }

  updateMove(x: number, y: number): void {
    if (!this.moveDrag || this.selectedIds.length === 0) return;

    const dx = x - this.moveDrag.lastX;
    const dy = y - this.moveDrag.lastY;

    for (const obj of this.getSelectedObjects()) {
      moveSceneObject(obj, dx, dy);
    }

    this.moveDrag.lastX = x;
    this.moveDrag.lastY = y;
    this.redraw();
    this.scheduleCollabSceneSync('selection');
  }

  endMove(): void {
    if (!this.moveDrag) return;
    this.moveDrag = null;
    this.clearDragBaseCache();
    this.invalidateSceneCache();
    this.redraw();
    this.flushCollabSceneSync(this.getSelectedObjects());
    this.notifyPathsChange();
  }

  async addImage(src: string, x: number, y: number, width: number, height: number): Promise<ImageObject> {
    this.recordHistory();
    const image: ImageObject = {
      id: createId(),
      src,
      width,
      height,
      transform: { cx: x, cy: y, rotation: 0, scale: 1 },
    };
    await preloadImage(image.id, src);
    image.zIndex = getNextZIndex(this.paths, this.images, this.texts, this.tables);
    this.images.push(image);
    this.selectedIds = [image.id];
    this.notifySelection();
    this.invalidateSceneCache();
    this.redraw();
    this.emitSceneWrite({ type: 'image-upsert', image: structuredClone(image) });
    this.notifyPathsChange();
    return image;
  }

  addText(
    content: string,
    topLeftX: number,
    topLeftY: number,
    style: { fontFamily: string; fontSize: number; color: string },
  ): TextObject | null {
    const trimmed = content.trim();
    if (!trimmed) return null;

    this.recordHistory();
    const { width, height } = measureTextContent(trimmed, style.fontFamily, style.fontSize);
    const text: TextObject = {
      id: createId(),
      content: trimmed,
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      color: style.color,
      lineHeight: TEXT_LINE_HEIGHT,
      width,
      height,
      transform: {
        cx: topLeftX + width / 2,
        cy: topLeftY + height / 2,
        rotation: 0,
        scale: 1,
      },
    };
    text.zIndex = getNextZIndex(this.paths, this.images, this.texts, this.tables);
    this.texts.push(text);
    this.selectedIds = [text.id];
    this.notifySelection();
    this.invalidateSceneCache();
    this.redraw();
    this.emitSceneWrite({ type: 'text-upsert', text: structuredClone(text) });
    this.notifyPathsChange();
    return text;
  }

  updateText(
    id: string,
    content: string,
    style?: { fontFamily: string; fontSize: number; color: string },
  ): TextObject | null {
    const text = this.texts.find((item) => item.id === id);
    if (!text) return null;

    const trimmed = content.trim();
    if (!trimmed) {
      this.recordHistory();
      this.texts = this.texts.filter((item) => item.id !== id);
      this.selectedIds = this.selectedIds.filter((selectedId) => selectedId !== id);
      this.notifySelection();
      this.invalidateSceneCache();
      this.redraw();
      this.emitSceneWrite({ type: 'text-delete', id });
      this.notifyPathsChange();
      return null;
    }

    this.recordHistory();
    text.content = trimmed;
    if (style) {
      text.fontFamily = style.fontFamily;
      text.fontSize = style.fontSize;
      text.color = style.color;
    }
    applyTextDimensions(text);
    this.selectedIds = [text.id];
    this.notifySelection();
    this.invalidateSceneCache();
    this.redraw();
    this.emitSceneWrite({ type: 'text-upsert', text: structuredClone(text) });
    this.notifyPathsChange();
    return text;
  }

  updateSelectedTableStyle(patch: {
    fontFamily?: string;
    fontSize?: number;
    color?: string;
    borderColor?: string;
    cellWidth?: number;
    cellHeight?: number;
  }): boolean {
    const obj = this.getSelectedObject();
    if (!obj || !isTableObject(obj)) return false;

    if (patch.fontFamily !== undefined) obj.fontFamily = patch.fontFamily;
    if (patch.fontSize !== undefined) obj.fontSize = patch.fontSize;
    if (patch.color !== undefined) obj.color = patch.color;
    if (patch.borderColor !== undefined) obj.borderColor = patch.borderColor;
    if (patch.cellWidth !== undefined) {
      obj.cellWidth = patch.cellWidth;
      obj.colWidths = createUniformColWidths(obj.cols, patch.cellWidth);
    }
    if (patch.cellHeight !== undefined) {
      obj.cellHeight = patch.cellHeight;
      obj.rowHeights = createUniformRowHeights(obj.rows, patch.cellHeight);
    }
    applyTableDimensions(obj);

    this.invalidateSceneCache();
    this.redraw();
    this.emitSceneWrite({ type: 'table-upsert', table: structuredClone(obj) });
    this.notifyPathsChange();
    return true;
  }

  addTable(
    topLeftX: number,
    topLeftY: number,
    rows: number,
    cols: number,
    style: {
      fontFamily: string;
      fontSize: number;
      color: string;
      borderColor: string;
      cellWidth: number;
      cellHeight: number;
    },
  ): TableObject {
    this.recordHistory();
    const layout = normalizeTableLayout(rows, cols, style.cellWidth, style.cellHeight);
    const { width, height } = { width: layout.colWidths.reduce((a, b) => a + b, 0), height: layout.rowHeights.reduce((a, b) => a + b, 0) };
    const table: TableObject = {
      id: createId(),
      rows,
      cols,
      cells: createEmptyCells(rows, cols),
      cellWidth: style.cellWidth,
      cellHeight: style.cellHeight,
      colWidths: layout.colWidths,
      rowHeights: layout.rowHeights,
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      color: style.color,
      borderColor: style.borderColor,
      width,
      height,
      transform: {
        cx: topLeftX + width / 2,
        cy: topLeftY + height / 2,
        rotation: 0,
        scale: 1,
      },
    };
    table.zIndex = getNextZIndex(this.paths, this.images, this.texts, this.tables);
    this.tables.push(table);
    this.selectedIds = [table.id];
    this.notifySelection();
    this.invalidateSceneCache();
    this.redraw();
    this.emitSceneWrite({ type: 'table-upsert', table: structuredClone(table) });
    this.notifyPathsChange();
    return table;
  }

  updateTable(
    id: string,
    cells: string[][],
    style?: {
      fontFamily: string;
      fontSize: number;
      color: string;
      borderColor: string;
      cellWidth: number;
      cellHeight: number;
    },
    layout?: {
      colWidths: number[];
      rowHeights: number[];
      rowFillColors?: (string | null)[];
      colFillColors?: (string | null)[];
      rowTextColors?: (string | null)[];
      colTextColors?: (string | null)[];
      axisColorSeq?: number;
      rowFillColorSeq?: (number | null)[];
      colFillColorSeq?: (number | null)[];
      rowTextColorSeq?: (number | null)[];
      colTextColorSeq?: (number | null)[];
    },
  ): TableObject | null {
    const table = this.tables.find((item) => item.id === id);
    if (!table) return null;

    const hasContent = cells.some((row) => row.some((cell) => cell.trim().length > 0));
    if (!hasContent) {
      this.recordHistory();
      this.tables = this.tables.filter((item) => item.id !== id);
      this.selectedIds = this.selectedIds.filter((selectedId) => selectedId !== id);
      this.notifySelection();
      this.invalidateSceneCache();
      this.redraw();
      this.emitSceneWrite({ type: 'table-delete', id });
      this.notifyPathsChange();
      return null;
    }

    this.recordHistory();
    table.rows = cells.length;
    table.cols = cells[0]?.length ?? table.cols;
    table.cells = cells.map((row) => [...row]);
    const defaultWidth = style?.cellWidth ?? table.cellWidth;
    const defaultHeight = style?.cellHeight ?? table.cellHeight;
    const normalized = normalizeTableLayout(
      table.rows,
      table.cols,
      defaultWidth,
      defaultHeight,
      layout?.colWidths ?? table.colWidths,
      layout?.rowHeights ?? table.rowHeights,
    );
    table.colWidths = normalized.colWidths;
    table.rowHeights = normalized.rowHeights;
    if (style) {
      table.fontFamily = style.fontFamily;
      table.fontSize = style.fontSize;
      table.color = style.color;
      table.borderColor = style.borderColor;
      table.cellWidth = style.cellWidth;
      table.cellHeight = style.cellHeight;
    }
    if (layout) {
      applyTableAxisColors(table, {
        rowFillColors: layout.rowFillColors,
        colFillColors: layout.colFillColors,
        rowTextColors: layout.rowTextColors,
        colTextColors: layout.colTextColors,
        axisColorSeq: layout.axisColorSeq,
        rowFillColorSeq: layout.rowFillColorSeq,
        colFillColorSeq: layout.colFillColorSeq,
        rowTextColorSeq: layout.rowTextColorSeq,
        colTextColorSeq: layout.colTextColorSeq,
      });
    }
    applyTableDimensions(table);
    this.selectedIds = [table.id];
    this.notifySelection();
    this.invalidateSceneCache();
    this.redraw();
    this.emitSceneWrite({ type: 'table-upsert', table: structuredClone(table) });
    this.notifyPathsChange();
    return table;
  }

  resizeTable(id: string, rows: number, cols: number): TableObject | null {
    const table = this.tables.find((item) => item.id === id);
    if (!table) return null;

    this.recordHistory();
    const nextRows = Math.max(1, Math.min(20, rows));
    const nextCols = Math.max(1, Math.min(20, cols));
    const nextCells = createEmptyCells(nextRows, nextCols);
    for (let row = 0; row < Math.min(nextRows, table.rows); row++) {
      for (let col = 0; col < Math.min(nextCols, table.cols); col++) {
        nextCells[row][col] = table.cells[row]?.[col] ?? '';
      }
    }
    const normalized = normalizeTableLayout(
      nextRows,
      nextCols,
      table.cellWidth,
      table.cellHeight,
      table.colWidths,
      table.rowHeights,
    );
    table.rows = nextRows;
    table.cols = nextCols;
    table.cells = nextCells;
    table.colWidths = normalized.colWidths;
    table.rowHeights = normalized.rowHeights;
    applyTableDimensions(table);
    this.invalidateSceneCache();
    this.redraw();
    this.emitSceneWrite({ type: 'table-upsert', table: structuredClone(table) });
    this.notifyPathsChange();
    return table;
  }

  hitTestSceneObjectAt(x: number, y: number): SceneObject | null {
    return hitTestSceneAt(this.paths, this.images, x, y, this.texts, this.tables);
  }

  hitTestHandleAt(x: number, y: number): HandleId | null {
    const obj = this.getSelectedObject();
    if (!obj) return null;
    const hitRadius = (HANDLE_RADIUS + 2) / this.viewScale;
    return hitTestHandle(obj, x, y, hitRadius);
  }

  beginHandleDrag(handle: HandleId, x: number, y: number): void {
    const obj = this.getSelectedObject();
    if (!obj) return;

    this.recordHistory();
    this.buildDragBaseCache();

    const { transform } = obj;
    const dist = Math.hypot(x - transform.cx, y - transform.cy);
    const angle = Math.atan2(y - transform.cy, x - transform.cx);

    this.transformDrag = {
      handle,
      startX: x,
      startY: y,
      startScale: transform.scale,
      startRotation: transform.rotation,
      startDist: dist,
      startAngle: angle,
    };
  }

  updateHandleDrag(x: number, y: number): void {
    const obj = this.getSelectedObject();
    if (!obj || !this.transformDrag) return;

    const drag = this.transformDrag;
    const { transform } = obj;

    if (drag.handle === 'rotate') {
      const angle = Math.atan2(y - transform.cy, x - transform.cx);
      transform.rotation = drag.startRotation + (angle - drag.startAngle);
    } else {
      const dist = Math.hypot(x - transform.cx, y - transform.cy);
      const scaleFactor = drag.startDist > 0 ? dist / drag.startDist : 1;
      transform.scale = Math.max(0.1, Math.min(10, drag.startScale * scaleFactor));
    }

    this.redraw();
    this.scheduleCollabSceneSync('selected');
  }

  endHandleDrag(): void {
    if (!this.transformDrag) return;
    const selected = this.getSelectedObject();
    this.transformDrag = null;
    this.clearDragBaseCache();
    this.invalidateSceneCache();
    this.redraw();
    if (selected) {
      this.flushCollabSceneSync([selected]);
    }
    this.notifyPathsChange();
  }

  beginStroke(point: StrokePoint, options: DrawingOptions, preset: ToolPreset): void {
    this.isDrawing = true;
    this.strokePoints = [point];
    this.strokeOptions = options;
    this.strokePreset = preset;
    this.redraw();
  }

  extendStroke(point: StrokePoint): void {
    this.extendStrokePoints([point]);
  }

  /** coalesced 포인트를 한 번에 추가 — redraw/증분 렌더는 도구별로 1회만 */
  extendStrokePoints(points: StrokePoint[]): void {
    if (!this.isDrawing || !this.strokeOptions || !this.strokePreset || points.length === 0) {
      return;
    }

    const opts = this.strokeOptions;
    const preset = this.strokePreset;
    const isEraserStroke = opts.tool === 'eraser' && opts.eraserMode === 'stroke';
    const useFullRedraw =
      opts.tool === 'highlighter' || opts.tool === 'pencil' || isEraserStroke;

    if (useFullRedraw) {
      this.strokePoints.push(...points);
      this.redraw();
      return;
    }

    for (const point of points) {
      this.strokePoints.push(point);

      if (this.strokePoints.length < 2) {
        this.renderPreviewDot(point, opts, preset);
        continue;
      }

      if (this.strokePoints.length < 3) {
        this.renderPreviewSegment(this.strokePoints[this.strokePoints.length - 2], point);
        continue;
      }

      const len = this.strokePoints.length;
      const smoothed = catmullRomSpline(
        [this.strokePoints[len - 3], this.strokePoints[len - 2], point],
        getStylusCatmullSegments(),
      );

      for (let i = 1; i < smoothed.length; i++) {
        this.renderPreviewSegment(smoothed[i - 1], smoothed[i]);
      }
    }
  }

  endStroke(): PathObject | null {
    if (!this.isDrawing || !this.strokeOptions || !this.strokePreset) return null;

    const options = this.strokeOptions;
    const preset = this.strokePreset;
    const rawPoints = [...this.strokePoints];

    this.isDrawing = false;
    this.strokePoints = [];
    this.strokeOptions = null;
    this.strokePreset = null;

    if (options.tool === 'eraser' && options.eraserMode === 'stroke') {
      const toRemove = pathsHitByEraserStroke(
        this.paths,
        rawPoints,
        options.baseWidth,
        options.minWidth,
        options.maxWidth,
      );

      if (toRemove.length > 0) {
        this.recordPathsRemoved(toRemove);
        const removeIds = new Set(toRemove.map((p) => p.id));
        this.paths = this.paths.filter((p) => !removeIds.has(p.id));
        this.selectedIds = this.selectedIds.filter((id) => !removeIds.has(id));
        this.notifySelection();
        for (const id of removeIds) {
          if (!this.deferredDrawPathIds.has(id)) {
            this.deferredDrawPathDeletes.add(id);
          }
          this.deferredDrawPathIds.delete(id);
        }
        this.notifyDeferredDrawChange();
        this.invalidateSceneCache();
        this.notifyPathsChange();
      }

      this.redraw();
      return null;
    }

    const path = createPathFromStroke(rawPoints, options, preset);

    if (path) {
      path.zIndex = getNextZIndex(this.paths, this.images, this.texts, this.tables);
      this.recordPathAdded(path);
      this.paths.push(path);
      this.deferredDrawPathIds.add(path.id);
      this.notifyDeferredDrawChange();
    }

    this.redraw();
    this.notifyPathsChange();
    return path;
  }

  redraw(): void {
    if (this.panDrag && this.panBaseCache) {
      this.redrawPanPreview();
      if (this.dropHighlight) {
        const canvas = this.ctx.canvas;
        renderDropOverlay(this.ctx, canvas.width / this.dpr, canvas.height / this.dpr);
      }
      return;
    }

    if (this.isDragActive() && this.dragBaseCache) {
      this.clearBackground();

      const canvas = this.ctx.canvas;
      this.ctx.save();
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.drawImage(this.dragBaseCache, 0, 0, canvas.width, canvas.height);
      this.ctx.restore();
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

      this.ctx.save();
      this.ctx.translate(this.viewOffsetX, this.viewOffsetY);
      this.ctx.scale(this.viewScale, this.viewScale);
      this.renderSceneObjects(this.ctx, this.getSelectedObjects());
      for (const selected of this.getSelectedObjects()) {
        if (this.hiddenSceneObjectIds.has(selected.id)) continue;
        renderSelectionBox(this.ctx, selected);
      }
      if (this.lassoPoints && this.lassoPoints.length >= 2) {
        renderLasso(this.ctx, this.lassoPoints);
      }
      this.ctx.restore();

      if (this.dropHighlight) {
        renderDropOverlay(this.ctx, canvas.width / this.dpr, canvas.height / this.dpr);
      }
      return;
    }

    this.syncSceneCache();
    this.clearBackground();

    if (this.sceneCache) {
      const canvas = this.ctx.canvas;
      this.ctx.save();
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.drawImage(this.sceneCache, 0, 0, canvas.width, canvas.height);
      this.ctx.restore();
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }

    this.ctx.save();
    this.ctx.translate(this.viewOffsetX, this.viewOffsetY);
    this.ctx.scale(this.viewScale, this.viewScale);

    if (this.isDrawing && this.strokePoints.length > 0 && this.strokeOptions && this.strokePreset) {
      renderLiveStroke(this.ctx, this.strokePoints, this.strokeOptions, this.strokePreset);
    }

    for (const selected of this.getSelectedObjects()) {
      if (this.hiddenSceneObjectIds.has(selected.id)) continue;
      renderSelectionBox(this.ctx, selected);
    }

    if (this.lassoPoints && this.lassoPoints.length >= 2) {
      renderLasso(this.ctx, this.lassoPoints);
    }

    this.ctx.restore();

    if (this.dropHighlight) {
      const canvas = this.ctx.canvas;
      renderDropOverlay(this.ctx, canvas.width / this.dpr, canvas.height / this.dpr);
    }
  }

  getCursorHint(
    worldX: number,
    worldY: number,
    tool: 'select' | 'lasso' | 'hand' | 'draw' | 'image' | 'text' | 'table',
    isPanning = false,
  ): string {
    if (tool === 'draw' || tool === 'image') return 'crosshair';

    const handle = this.hitTestHandleAt(worldX, worldY);
    if (handle === 'rotate') return 'grab';
    if (handle) return 'nwse-resize';

    if (tool === 'hand') {
      return isPanning ? 'grabbing' : 'grab';
    }

    if (tool === 'lasso') return 'crosshair';

    if (tool === 'text' || tool === 'table') return 'crosshair';

    if (this.selectedIds.length > 0 && this.containsSelectedAt(worldX, worldY)) {
      return 'pointer';
    }

    if (hitTestSceneAt(this.paths, this.images, worldX, worldY, this.texts)) {
      return 'pointer';
    }

    return 'default';
  }

  private objectContainsPoint(obj: SceneObject, x: number, y: number): boolean {
    if ('points' in obj) return hitTestPath(obj, x, y);
    if (isTextObject(obj)) return hitTestText(obj, x, y);
    if (isTableObject(obj)) return hitTestTable(obj, x, y);
    return hitTestImage(obj, x, y);
  }

  private clearBackground(): void {
    const canvas = this.ctx.canvas;
    this.ctx.save();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, canvas.width, canvas.height);
    this.ctx.restore();
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  private notifySelection(): void {
    this.onSelectionChange?.(this.getSelectedIds());
  }

  private notifyPathsChange(): void {
    if (this.suppressPathsChange) return;
    this.onPathsChange?.();
  }

  private emitSceneWrite(event: SceneWriteEvent): void {
    if (this.suppressPathsChange || !this.onCollabPublish) return;
    this.trackRealtimePathPublish(event);
    this.onCollabPublish(event);
  }

  private trackRealtimePathPublish(event: SceneWriteEvent): void {
    if (event.type === 'path-upsert') {
      this.deferredDrawPathIds.delete(event.path.id);
      this.deferredDrawPathDeletes.delete(event.path.id);
    } else if (event.type === 'path-delete') {
      this.deferredDrawPathIds.delete(event.id);
      this.deferredDrawPathDeletes.delete(event.id);
    } else if (event.type === 'scene-patch') {
      for (const path of event.upserts.paths) {
        this.deferredDrawPathIds.delete(path.id);
        this.deferredDrawPathDeletes.delete(path.id);
      }
      for (const id of event.deletes.paths) {
        this.deferredDrawPathIds.delete(id);
        this.deferredDrawPathDeletes.delete(id);
      }
    }
  }

  private buildSceneCollabEvents(objects: SceneObject[]): SceneWriteEvent[] {
    const events: SceneWriteEvent[] = [];
    for (const obj of objects) {
      if ('points' in obj) {
        events.push({ type: 'path-upsert', path: structuredClone(obj) });
      } else if (isImageObject(obj)) {
        events.push({ type: 'image-upsert', image: structuredClone(obj) });
      } else if (isTextObject(obj)) {
        events.push({ type: 'text-upsert', text: structuredClone(obj) });
      } else if (isTableObject(obj)) {
        events.push({ type: 'table-upsert', table: structuredClone(obj) });
      }
    }
    return events;
  }

  private clearCollabSceneSyncTimer(): void {
    if (this.collabSceneSyncTimer === null) return;
    window.clearTimeout(this.collabSceneSyncTimer);
    this.collabSceneSyncTimer = null;
  }

  private scheduleCollabSceneSync(mode: 'selection' | 'selected'): void {
    if (this.suppressPathsChange || !this.onCollabPublish) return;
    if (this.collabSceneSyncTimer !== null) return;

    this.collabSceneSyncTimer = window.setTimeout(() => {
      this.collabSceneSyncTimer = null;
      const objects =
        mode === 'selection'
          ? this.getSelectedObjects()
          : (() => {
              const obj = this.getSelectedObject();
              return obj ? [obj] : [];
            })();
      this.flushCollabSceneSync(objects);
    }, DrawingEngine.COLLAB_SCENE_SYNC_MS);
  }

  private flushCollabSceneSync(objects: SceneObject[]): void {
    this.clearCollabSceneSyncTimer();
    if (this.suppressPathsChange || !this.onCollabPublish) return;

    const events = this.buildSceneCollabEvents(objects);
    if (events.length === 0) return;
    for (const event of events) {
      this.trackRealtimePathPublish(event);
    }
    this.onCollabPublish(events);
  }

  private notifyDeferredDrawChange(): void {
    this.onDeferredDrawChange?.();
  }

  private emitSceneWriteMany(events: SceneWriteEvent[]): void {
    if (this.suppressPathsChange || !this.onCollabPublish || events.length === 0) return;
    for (const event of events) {
      this.trackRealtimePathPublish(event);
    }
    this.onCollabPublish(events);
  }

  private emitSceneObjects(objects: SceneObject[]): void {
    const events: SceneWriteEvent[] = [];
    for (const obj of objects) {
      if ('points' in obj) {
        events.push({ type: 'path-upsert', path: structuredClone(obj) });
      } else if (isImageObject(obj)) {
        events.push({ type: 'image-upsert', image: structuredClone(obj) });
      } else if (isTextObject(obj)) {
        events.push({ type: 'text-upsert', text: structuredClone(obj) });
      } else if (isTableObject(obj)) {
        events.push({ type: 'table-upsert', table: structuredClone(obj) });
      }
    }
    this.emitSceneWriteMany(events);
  }

  private notifyZoomChange(): void {
    this.onZoomChange?.(this.getZoomPercent());
  }

  async undo(): Promise<boolean> {
    if (!this.canUndo()) return false;
    const entry = this.undoStack.pop()!;
    this.redoStack.push(entry);
    await this.revertHistoryEntry(entry);
    this.notifyPathsChange();
    this.notifyHistoryChange();
    return true;
  }

  async redo(): Promise<boolean> {
    if (!this.canRedo()) return false;
    const entry = this.redoStack.pop()!;
    this.undoStack.push(entry);
    await this.replayHistoryEntry(entry);
    this.notifyPathsChange();
    this.notifyHistoryChange();
    return true;
  }

  private captureSnapshot(): SceneSnapshot {
    return {
      paths: this.getPathsSnapshot(),
      images: this.getImagesSnapshot(),
      texts: this.getTextsSnapshot(),
      tables: this.getTablesSnapshot(),
      selectedIds: [...this.selectedIds],
    };
  }

  private async applySnapshot(snap: SceneSnapshot): Promise<void> {
    this.paths = JSON.parse(JSON.stringify(snap.paths)) as PathObject[];
    this.images = JSON.parse(JSON.stringify(snap.images)) as ImageObject[];
    this.texts = JSON.parse(JSON.stringify(snap.texts ?? [])) as TextObject[];
    this.tables = JSON.parse(JSON.stringify(snap.tables ?? [])) as TableObject[];
    normalizeSceneZIndices(this.paths, this.images, this.texts, this.tables);
    this.selectedIds = snap.selectedIds
      ? [...snap.selectedIds]
      : snap.selectedId
        ? [snap.selectedId]
        : [];
    this.isDrawing = false;
    this.strokePoints = [];
    this.lassoPoints = null;
    this.transformDrag = null;
    this.moveDrag = null;
    await preloadImages(this.images);
    this.invalidateSceneCache();
    this.notifySelection();
    this.redraw();
  }

  private recordHistory(): void {
    this.undoStack.push({ type: 'snapshot', data: this.captureSnapshot() });
    this.trimHistoryStacks();
  }

  private recordPathAdded(path: PathObject): void {
    this.undoStack.push({ type: 'add-path', path: structuredClone(path) });
    this.trimHistoryStacks();
  }

  private recordPathsRemoved(paths: PathObject[]): void {
    if (paths.length === 0) return;
    this.undoStack.push({ type: 'remove-paths', paths: structuredClone(paths) });
    this.trimHistoryStacks();
  }

  private trimHistoryStacks(): void {
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
    this.redoStack = [];
    this.scheduleHistoryChange();
  }

  private async revertHistoryEntry(entry: HistoryEntry): Promise<void> {
    switch (entry.type) {
      case 'add-path':
        this.deferredDrawPathIds.delete(entry.path.id);
        this.removePathsById([entry.path.id]);
        break;
      case 'remove-paths':
        this.restorePaths(entry.paths);
        for (const path of entry.paths) {
          this.deferredDrawPathDeletes.delete(path.id);
        }
        break;
      case 'snapshot':
        await this.applySnapshot(entry.data);
        break;
    }
  }

  private async replayHistoryEntry(entry: HistoryEntry): Promise<void> {
    switch (entry.type) {
      case 'add-path':
        this.deferredDrawPathIds.add(entry.path.id);
        this.restorePaths([entry.path]);
        break;
      case 'remove-paths':
        for (const path of entry.paths) {
          if (!this.deferredDrawPathIds.has(path.id)) {
            this.deferredDrawPathDeletes.add(path.id);
          }
          this.deferredDrawPathIds.delete(path.id);
        }
        this.removePathsById(entry.paths.map((path) => path.id));
        break;
      case 'snapshot':
        await this.applySnapshot(entry.data);
        break;
    }
  }

  private removePathsById(ids: string[]): void {
    const removeIds = new Set(ids);
    this.paths = this.paths.filter((path) => !removeIds.has(path.id));
    this.selectedIds = this.selectedIds.filter((id) => !removeIds.has(id));
    normalizeSceneZIndices(this.paths, this.images, this.texts, this.tables);
    this.notifySelection();
    this.invalidateSceneCache();
    this.redraw();
  }

  private restorePaths(paths: PathObject[]): void {
    for (const path of paths) {
      const cloned = structuredClone(path);
      if (this.paths.some((item) => item.id === cloned.id)) continue;
      this.paths.push(cloned);
    }
    normalizeSceneZIndices(this.paths, this.images, this.texts, this.tables);
    this.invalidateSceneCache();
    this.redraw();
  }

  private resetHistory(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.scheduleHistoryChange();
  }

  private notifyHistoryChange(): void {
    this.onHistoryChange?.({
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
    });
  }

  private scheduleHistoryChange(): void {
    if (this.historyNotifyScheduled) return;
    this.historyNotifyScheduled = true;
    requestAnimationFrame(() => {
      this.historyNotifyScheduled = false;
      this.notifyHistoryChange();
    });
  }

  private invalidateSceneCache(): void {
    this.sceneCacheValid = false;
    this.sceneCacheRenderedPaths = 0;
    this.sceneCacheRenderedImages = 0;
    this.sceneCacheRenderedTexts = 0;
    this.sceneCacheRenderedTables = 0;
    this.sceneCacheViewKey = '';
  }

  private getSceneCacheViewKey(): string {
    const canvas = this.ctx.canvas;
    return `${this.viewOffsetX}|${this.viewOffsetY}|${this.viewScale}|${canvas.width}|${canvas.height}`;
  }

  private ensureSceneCacheCanvas(): CanvasRenderingContext2D {
    const canvas = this.ctx.canvas;
    if (!this.sceneCache) {
      this.sceneCache = document.createElement('canvas');
      this.sceneCacheCtx = this.sceneCache.getContext('2d');
    }

    if (this.sceneCache.width !== canvas.width || this.sceneCache.height !== canvas.height) {
      this.sceneCache.width = canvas.width;
      this.sceneCache.height = canvas.height;
      this.invalidateSceneCache();
    }

    if (!this.sceneCacheCtx) {
      throw new Error('Scene cache context unavailable');
    }

    return this.sceneCacheCtx;
  }

  private renderSceneObjects(
    ctx: CanvasRenderingContext2D,
    objects: readonly SceneObject[],
  ): void {
    for (const obj of objects) {
      if (this.hiddenSceneObjectIds.has(obj.id)) continue;
      if ('points' in obj) {
        renderPath(ctx, obj);
      } else if (isTextObject(obj)) {
        renderText(ctx, obj);
      } else if (isTableObject(obj)) {
        renderTable(ctx, obj);
      } else {
        const htmlImg = getCachedImage(obj.id);
        if (htmlImg) renderImage(ctx, obj, htmlImg);
      }
    }
  }

  private isDragActive(): boolean {
    return this.moveDrag !== null || this.transformDrag !== null;
  }

  private buildDragBaseCache(): void {
    const canvas = this.ctx.canvas;
    if (!this.dragBaseCache) {
      this.dragBaseCache = document.createElement('canvas');
      this.dragBaseCacheCtx = this.dragBaseCache.getContext('2d');
    }

    if (!this.dragBaseCacheCtx) {
      throw new Error('Drag base cache context unavailable');
    }

    this.dragBaseCache.width = canvas.width;
    this.dragBaseCache.height = canvas.height;

    const cacheCtx = this.dragBaseCacheCtx;
    cacheCtx.save();
    cacheCtx.setTransform(1, 0, 0, 1, 0, 0);
    cacheCtx.fillStyle = '#ffffff';
    cacheCtx.fillRect(0, 0, canvas.width, canvas.height);
    cacheCtx.restore();
    cacheCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    this.renderSceneObjectsToCache(cacheCtx, {
      excludeIds: new Set(this.selectedIds),
    });
  }

  private clearDragBaseCache(): void {
    this.dragBaseCache = null;
    this.dragBaseCacheCtx = null;
  }

  private buildPanBaseCache(): void {
    const canvas = this.ctx.canvas;
    if (!this.panBaseCache) {
      this.panBaseCache = document.createElement('canvas');
      this.panBaseCacheCtx = this.panBaseCache.getContext('2d');
    }

    if (!this.panBaseCacheCtx) {
      throw new Error('Pan base cache context unavailable');
    }

    this.panBaseCache.width = canvas.width;
    this.panBaseCache.height = canvas.height;
    this.panBaseCacheCtx.drawImage(canvas, 0, 0);
  }

  private clearPanBaseCache(): void {
    this.panBaseCache = null;
    this.panBaseCacheCtx = null;
  }

  private redrawPanPreview(): void {
    if (!this.panDrag || !this.panBaseCache) return;

    const canvas = this.ctx.canvas;
    const dx = (this.viewOffsetX - this.panDrag.startViewOffsetX) * this.dpr;
    const dy = (this.viewOffsetY - this.panDrag.startViewOffsetY) * this.dpr;

    this.ctx.save();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(0, 0, canvas.width, canvas.height);
    this.ctx.drawImage(this.panBaseCache, dx, dy);
    this.ctx.restore();
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  private renderSceneObjectsToCache(
    cacheCtx: CanvasRenderingContext2D,
    options: {
      pathStart?: number;
      imageStart?: number;
      textStart?: number;
      tableStart?: number;
      excludeIds?: ReadonlySet<string>;
    } = {},
  ): void {
    const pathStart = options.pathStart ?? 0;
    const imageStart = options.imageStart ?? 0;
    const textStart = options.textStart ?? 0;
    const tableStart = options.tableStart ?? 0;
    const excludeIds = options.excludeIds;

    cacheCtx.save();
    cacheCtx.translate(this.viewOffsetX, this.viewOffsetY);
    cacheCtx.scale(this.viewScale, this.viewScale);

    const sorted = getSceneObjectsSorted(this.paths, this.images, this.texts, this.tables);
    const pathIds = new Set(this.paths.slice(pathStart).map((path) => path.id));
    const imageIds = new Set(this.images.slice(imageStart).map((image) => image.id));
    const textIds = new Set(this.texts.slice(textStart).map((text) => text.id));
    const tableIds = new Set(this.tables.slice(tableStart).map((table) => table.id));

    for (const obj of sorted) {
      if (excludeIds?.has(obj.id)) continue;
      if (this.hiddenSceneObjectIds.has(obj.id)) continue;

      if ('points' in obj) {
        if (excludeIds || pathStart === 0 || pathIds.has(obj.id)) {
          renderPath(cacheCtx, obj);
        }
      } else if (isTextObject(obj)) {
        if (excludeIds || textStart === 0 || textIds.has(obj.id)) {
          renderText(cacheCtx, obj);
        }
      } else if (isTableObject(obj)) {
        if (excludeIds || tableStart === 0 || tableIds.has(obj.id)) {
          renderTable(cacheCtx, obj);
        }
      } else if (excludeIds || imageStart === 0 || imageIds.has(obj.id)) {
        const htmlImg = getCachedImage(obj.id);
        if (htmlImg) renderImage(cacheCtx, obj, htmlImg);
      }
    }

    cacheCtx.restore();
  }

  private rebuildSceneCache(): void {
    const cacheCtx = this.ensureSceneCacheCanvas();
    const canvas = this.ctx.canvas;

    cacheCtx.save();
    cacheCtx.setTransform(1, 0, 0, 1, 0, 0);
    cacheCtx.fillStyle = '#ffffff';
    cacheCtx.fillRect(0, 0, canvas.width, canvas.height);
    cacheCtx.restore();
    cacheCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    this.renderSceneObjectsToCache(cacheCtx, {
      pathStart: 0,
      imageStart: 0,
      textStart: 0,
      tableStart: 0,
    });

    this.sceneCacheValid = true;
    this.sceneCacheRenderedPaths = this.paths.length;
    this.sceneCacheRenderedImages = this.images.length;
    this.sceneCacheRenderedTexts = this.texts.length;
    this.sceneCacheRenderedTables = this.tables.length;
    this.sceneCacheViewKey = this.getSceneCacheViewKey();
  }

  private syncSceneCache(): void {
    const viewKey = this.getSceneCacheViewKey();

    if (!this.sceneCacheValid || this.sceneCacheViewKey !== viewKey) {
      this.rebuildSceneCache();
      return;
    }

    const pathsAdded = this.paths.length - this.sceneCacheRenderedPaths;
    const imagesAdded = this.images.length - this.sceneCacheRenderedImages;
    const textsAdded = this.texts.length - this.sceneCacheRenderedTexts;
    const tablesAdded = this.tables.length - this.sceneCacheRenderedTables;

    if (pathsAdded === 0 && imagesAdded === 0 && textsAdded === 0 && tablesAdded === 0) {
      return;
    }

    if (
      pathsAdded !== 1 ||
      imagesAdded !== 0 ||
      textsAdded !== 0 ||
      tablesAdded !== 0 ||
      this.sceneCacheRenderedPaths > this.paths.length ||
      this.sceneCacheRenderedImages > this.images.length ||
      this.sceneCacheRenderedTexts > this.texts.length ||
      this.sceneCacheRenderedTables > this.tables.length
    ) {
      this.rebuildSceneCache();
      return;
    }

    const cacheCtx = this.ensureSceneCacheCanvas();
    this.renderSceneObjectsToCache(cacheCtx, {
      pathStart: this.sceneCacheRenderedPaths,
      imageStart: this.sceneCacheRenderedImages,
      textStart: this.sceneCacheRenderedTexts,
      tableStart: this.sceneCacheRenderedTables,
    });
    this.sceneCacheRenderedPaths = this.paths.length;
    this.sceneCacheRenderedImages = this.images.length;
    this.sceneCacheRenderedTexts = this.texts.length;
    this.sceneCacheRenderedTables = this.tables.length;
  }

  private renderPreviewDot(point: StrokePoint, options: DrawingOptions, preset: ToolPreset): void {
    const width = pressureToWidth(point, options.baseWidth, options.minWidth, options.maxWidth);
    this.paintPreviewDab(point.x, point.y, width, options, preset, 0);
  }

  private renderPreviewSegment(from: StrokePoint, to: StrokePoint): void {
    if (!this.strokeOptions || !this.strokePreset) return;

    const opts = this.strokeOptions;
    const preset = this.strokePreset;
    const widthFrom = pressureToWidth(from, opts.baseWidth, opts.minWidth, opts.maxWidth);
    const widthTo = pressureToWidth(to, opts.baseWidth, opts.minWidth, opts.maxWidth);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.hypot(dx, dy);
    const step = Math.max(1, Math.min(dist, 3));
    const steps = Math.ceil(dist / step);

    for (let i = 0; i <= steps; i++) {
      const t = steps === 0 ? 0 : i / steps;
      const x = from.x + dx * t;
      const y = from.y + dy * t;
      const w = widthFrom + (widthTo - widthFrom) * t;
      this.paintPreviewDab(x, y, w, opts, preset, i);
    }
  }

  private paintPreviewDab(
    x: number,
    y: number,
    width: number,
    options: DrawingOptions,
    preset: ToolPreset,
    seed: number,
  ): void {
    const ctx = this.ctx;
    const radius = width / 2;

    ctx.save();
    ctx.translate(this.viewOffsetX, this.viewOffsetY);
    ctx.scale(this.viewScale, this.viewScale);

    if (options.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = options.color;
      ctx.globalAlpha = options.opacity;
    }

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    if (preset.textured && options.tool === 'pencil') {
      for (let j = 0; j < 2; j++) {
        const jitter = 0.35;
        const ox = (Math.sin(seed * 127.1 + j * 17.3) * 0.5) * width * jitter;
        const oy = (Math.cos(seed * 311.7 + j * 41.9) * 0.5) * width * jitter;
        ctx.globalAlpha = preset.opacity * 0.35;
        ctx.beginPath();
        ctx.arc(x + ox, y + oy, radius * 0.55, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }
}
