import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchWhiteboard, renameWhiteboard, saveWhiteboard } from '../api/whiteboards';
import { setApiByDept } from '../api/client';
import { CollabStatus } from './CollabStatus';
import { DrawingCanvas } from './DrawingCanvas';
import { DrawingToolsBar } from './DrawingToolsBar';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';
import { MadeByCredit } from './MadeByCredit';
import { Toolbar } from './Toolbar';
import type { TextOptionsPopoverPlacement } from './TextOptionsPopover';
import { getCanvasHint } from '../canvasHint';
import type { DrawingEngine, DeleteSelectedResult } from '../engine/drawingEngine';
import { generateThumbnail, downloadSceneAsPng } from '../engine/thumbnailRenderer';
import { runWhenIdle } from '../utils/idle';
import {
  DEFAULT_DRAW_TOOL_SETTINGS,
  drawSettingsToOptions,
  isDrawSettingsTool,
  settingsFromPath,
  type DrawSettingsTool,
  type DrawToolSettings,
} from '../drawToolSettings';
import { DEFAULT_ERASER_SETTINGS, type EraserSettings } from '../eraserSettings';
import { DEFAULT_TEXT_TOOL_SETTINGS, settingsFromText, type TextToolSettings } from '../textToolSettings';
import {
  DEFAULT_TABLE_TOOL_SETTINGS,
  settingsFromTable,
  type TableToolSettings,
} from '../tableToolSettings';
import type { ImageObject, PathObject, TableObject, TextObject, Tool } from '../engine/types';
import { isImageObject, isTableObject, isTextObject } from '../engine/types';
import type { WhiteboardDocument } from '../types/whiteboard';
import { captureEngineScene } from '../lib/collab/bootstrap';
import {
  shouldShareSceneForHistoryDiff,
} from '../lib/collab/publishHistory';
import type { SceneSnapshot } from '../lib/collab/schema';
import type { SceneWriteEvent } from '../lib/collab/scene-events';
import { useYjsWhiteboard } from '../hooks/useYjsWhiteboard';
import { useWhiteboardPresence } from '../hooks/useWhiteboardPresence';
import { useDeptSession } from '../context/DeptSessionContext';

interface EditorViewProps {
  whiteboardId: string;
  byDept: string;
  shareToken?: string;
  shareLinkMode?: boolean;
  onBack: () => void;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const SAVE_DEBOUNCE_MS = 2500;
const THUMBNAIL_INTERVAL_MS = 30_000;

function buildDeleteConfirmBody(engine: DrawingEngine | null): string | null {
  if (!engine || engine.getSelectedIds().length === 0) return null;

  let pathCount = 0;
  let imageCount = 0;
  let textCount = 0;
  let tableCount = 0;

  for (const obj of engine.getSelectedObjects()) {
    if ('points' in obj) pathCount++;
    else if (isImageObject(obj)) imageCount++;
    else if (isTextObject(obj)) textCount++;
    else if (isTableObject(obj)) tableCount++;
  }

  const parts: string[] = [];
  if (imageCount > 0) parts.push(`이미지 ${imageCount}개`);
  if (tableCount > 0) parts.push(`표 ${tableCount}개`);
  if (textCount > 0) parts.push(`텍스트 ${textCount}개`);
  if (pathCount > 0) parts.push(`그림 ${pathCount}개`);

  if (parts.length === 0) return null;
  return `선택한 ${parts.join(', ')}을(를) 삭제합니다. 되돌리기로 복구할 수 있습니다.`;
}

export function EditorView({
  whiteboardId,
  byDept,
  shareToken,
  shareLinkMode = false,
  onBack,
}: EditorViewProps) {
  const showBackButton = !shareLinkMode && !shareToken;
  const [tool, setTool] = useState<Tool>('pencil');
  const [drawSettingsByTool, setDrawSettingsByTool] = useState<
    Record<DrawSettingsTool, DrawToolSettings>
  >(() => ({ ...DEFAULT_DRAW_TOOL_SETTINGS }));
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('제목 없음');
  const [editingTitle, setEditingTitle] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [initialPaths, setInitialPaths] = useState<PathObject[]>([]);
  const [initialImages, setInitialImages] = useState<ImageObject[]>([]);
  const [initialTexts, setInitialTexts] = useState<TextObject[]>([]);
  const [initialTables, setInitialTables] = useState<TableObject[]>([]);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [drawOptionsOpen, setDrawOptionsOpen] = useState(false);
  const [eraserSettings, setEraserSettings] = useState<EraserSettings>(() => ({
    ...DEFAULT_ERASER_SETTINGS,
  }));
  const [textSettings, setTextSettings] = useState<TextToolSettings>(() => ({
    ...DEFAULT_TEXT_TOOL_SETTINGS,
  }));
  const [tableSettings, setTableSettings] = useState<TableToolSettings>(() => ({
    ...DEFAULT_TABLE_TOOL_SETTINGS,
  }));
  const [textOptionsPlacement, setTextOptionsPlacement] =
    useState<TextOptionsPopoverPlacement>('toolbar');
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteConfirmBody, setDeleteConfirmBody] = useState('');

  const engineRef = useRef<DrawingEngine | null>(null);
  const attachImageRef = useRef<((at?: { x: number; y: number }) => void) | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<WhiteboardDocument | null>(null);
  const saveGenerationRef = useRef(0);
  const isDirtyRef = useRef(false);
  const lastThumbnailAtRef = useRef(0);
  const persistRef = useRef<(options?: { forceThumbnail?: boolean }) => Promise<void>>(async () => {});

  const collab = useYjsWhiteboard(whiteboardId, byDept);
  const { displayName } = useDeptSession();
  const presence = useWhiteboardPresence(collab.collabSession, displayName);
  const [engineInstanceId, setEngineInstanceId] = useState(0);
  const handleEngineInstance = useCallback((id: number) => {
    setEngineInstanceId(id);
  }, []);

  useEffect(() => {
    setApiByDept(byDept);
  }, [byDept]);

  useEffect(() => {
    if (loading || !docRef.current) return;

    const tryBind = () => {
      const engine = engineRef.current;
      const doc = docRef.current;
      if (!engine || !doc) return;

      void collab.bindEngine(engine, doc).catch(() => {});
    };

    tryBind();
    const interval = window.setInterval(tryBind, 200);
    return () => window.clearInterval(interval);
  }, [loading, collab.bindEngine, whiteboardId, engineInstanceId]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const doc = await fetchWhiteboard(whiteboardId, shareToken);
        if (cancelled) return;
        docRef.current = doc;
        setTitle(doc.title);
        setInitialPaths(doc.paths);
        setInitialImages(doc.images ?? []);
        setInitialTexts(doc.texts ?? []);
        setInitialTables(doc.tables ?? []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '불러오기 실패');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [whiteboardId, byDept, shareToken]);

  const persist = useCallback(async (options?: { forceThumbnail?: boolean }) => {
    const engine = engineRef.current;
    if (!engine) return;
    if (!isDirtyRef.current && !options?.forceThumbnail) return;

    const generation = ++saveGenerationRef.current;
    setSaveStatus('saving');

    await new Promise<void>((resolve) => {
      runWhenIdle(resolve);
    });

    if (generation !== saveGenerationRef.current) return;

    const paths = engine.getPathsSnapshot();
    const images = engine.getImagesSnapshot();
    const texts = engine.getTextsSnapshot();
    const tables = engine.getTablesSnapshot();

    let thumbnail = docRef.current?.thumbnail;
    const shouldRefreshThumbnail =
      options?.forceThumbnail ||
      Date.now() - lastThumbnailAtRef.current >= THUMBNAIL_INTERVAL_MS;

    if (shouldRefreshThumbnail) {
      thumbnail = generateThumbnail(paths, images, 320, 200, texts, tables);
      lastThumbnailAtRef.current = Date.now();
    }

    if (generation !== saveGenerationRef.current) return;

    try {
      const token = shareToken ?? docRef.current?.shareToken;
      const doc = await saveWhiteboard(whiteboardId, { title, paths, images, texts, tables, thumbnail }, token);
      if (generation !== saveGenerationRef.current) return;
      docRef.current = doc;
      isDirtyRef.current = false;
      setSaveStatus('saved');
    } catch {
      if (generation === saveGenerationRef.current) {
        setSaveStatus('error');
      }
    }
  }, [whiteboardId, title, shareToken]);

  persistRef.current = persist;

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      void persistRef.current();
    }, SAVE_DEBOUNCE_MS);
  }, []);

  const handlePathsChange = useCallback(() => {
    isDirtyRef.current = true;
    scheduleSave();
  }, [scheduleSave]);

  const handleDeferredDrawChange = useCallback(() => {
    if (collab.isReady) {
      collab.markUnsharedChanges();
    }
  }, [collab.isReady, collab.markUnsharedChanges]);

  const drawSettings = isDrawSettingsTool(tool)
    ? drawSettingsByTool[tool]
    : drawSettingsByTool.pen;

  const handleSelectionChange = useCallback((ids: string[]) => {
    setSelectedIds(ids);
    if (ids.length === 1 && engineRef.current) {
      const selected = engineRef.current.getSelectedObject();
      if (selected && isTextObject(selected)) {
        setTextSettings(settingsFromText(selected));
        return;
      }
      if (selected && isTableObject(selected)) {
        setTableSettings(settingsFromTable(selected));
        return;
      }

      const path = engineRef.current.getSelectedPath();
      if (path && path.tool !== 'eraser' && isDrawSettingsTool(path.tool)) {
        const drawTool = path.tool;
        const fromPath = settingsFromPath(path);
        setDrawSettingsByTool((prev) => ({
          ...prev,
          [drawTool]: { ...prev[drawTool], ...fromPath },
        }));
      }
    }
  }, []);

  const handleTableEditStart = useCallback((existing: TableObject | null) => {
    if (existing) {
      setTableSettings(settingsFromTable(existing));
      setTool('table');
      setDrawOptionsOpen(true);
      return;
    }
    setDrawOptionsOpen(false);
  }, []);

  const handleTableCellLiveSync = useCallback(
    (table: TableObject) => {
      if (collab.isReady) {
        collab.publishTableUpsert(table);
      }
    },
    [collab.isReady, collab.publishTableUpsert],
  );

  const handleTableEditEnd = useCallback(() => {
    setDrawOptionsOpen(false);
  }, []);

  const handleTableAdded = useCallback(() => {
    setTool('select');
    setDrawOptionsOpen(false);
  }, []);

  const handleTextEditStart = useCallback((existing: TextObject | null) => {
    if (existing) {
      setTextSettings(settingsFromText(existing));
      setTool('text');
      setDrawOptionsOpen(true);
      setTextOptionsPlacement('editor');
      return;
    }
    setDrawOptionsOpen(false);
    setTextOptionsPlacement('toolbar');
  }, []);

  const handleTextEditEnd = useCallback(() => {
    setDrawOptionsOpen(false);
    setTextOptionsPlacement('toolbar');
  }, []);

  const handleTextAdded = useCallback(() => {
    setTool('select');
    setDrawOptionsOpen(false);
  }, []);

  const handleImageAdded = useCallback(() => {
    setTool('select');
    setDrawOptionsOpen(false);
  }, []);

  const handleToolChange = (newTool: Tool) => {
    if (isDrawSettingsTool(newTool)) {
      if (newTool === tool && drawOptionsOpen) {
        setDrawOptionsOpen(false);
        return;
      }
      setTool(newTool);
      setDrawOptionsOpen(true);
      return;
    }

    if (newTool === 'eraser') {
      if (newTool === tool && drawOptionsOpen) {
        setDrawOptionsOpen(false);
        return;
      }
      setTool(newTool);
      setDrawOptionsOpen(true);
      return;
    }

    if (newTool === 'image') {
      setTool('image');
      setDrawOptionsOpen(false);
      return;
    }

    if (newTool === 'text') {
      if (newTool === tool && drawOptionsOpen) {
        setDrawOptionsOpen(false);
        return;
      }
      setTool('text');
      setDrawOptionsOpen(true);
      setTextOptionsPlacement('toolbar');
      return;
    }

    if (newTool === 'table') {
      if (newTool === tool && drawOptionsOpen) {
        setDrawOptionsOpen(false);
        return;
      }
      setTool('table');
      setDrawOptionsOpen(true);
      return;
    }

    setTool(newTool);
    setDrawOptionsOpen(false);
  };

  const applyDrawSettingsToSelection = (settings: DrawToolSettings, activeTool: Tool) => {
    if (selectedIds.length !== 1 || !isDrawSettingsTool(activeTool)) return;
    const opts = drawSettingsToOptions(activeTool, settings);
    engineRef.current?.updateSelectedPathStyle({
      color: opts.color,
      opacity: opts.opacity,
      baseWidth: opts.baseWidth,
      minWidth: opts.minWidth,
      maxWidth: opts.maxWidth,
      lineEnd: opts.lineEnd,
    });
  };

  const handleEraserSettingsChange = (patch: Partial<EraserSettings>) => {
    setEraserSettings((prev) => ({ ...prev, ...patch }));
  };

  const handleTableSettingsChange = (patch: Partial<TableToolSettings>) => {
    const nextSettings = { ...tableSettings, ...patch };
    setTableSettings(nextSettings);
    engineRef.current?.updateSelectedTableStyle(nextSettings);
  };

  const handleTextSettingsChange = (patch: Partial<TextToolSettings>) => {
    const nextSettings = { ...textSettings, ...patch };
    setTextSettings(nextSettings);
    engineRef.current?.updateSelectedTextStyle(nextSettings);
  };

  const handleDrawSettingsChange = (patch: Partial<DrawToolSettings>) => {
    if (!isDrawSettingsTool(tool)) return;

    const nextSettings = { ...drawSettingsByTool[tool], ...patch };
    setDrawSettingsByTool((prev) => ({
      ...prev,
      [tool]: nextSettings,
    }));
    applyDrawSettingsToSelection(nextSettings, tool);
  };

  const handleCollabSceneEvents = useCallback(
    (events: SceneWriteEvent[]) => {
      if (!collab.isReady || events.length === 0) return;
      collab.publishSceneEvents(events);
    },
    [collab.isReady, collab.publishSceneEvents],
  );

  const handleObjectDeleted = useCallback((_result: DeleteSelectedResult) => {
    setSelectedIds([]);
  }, []);

  const handleDeleteRequest = useCallback(() => {
    const body = buildDeleteConfirmBody(engineRef.current);
    if (!body) return;
    setDeleteConfirmBody(body);
    setDeleteConfirmOpen(true);
  }, []);

  const handleDeleteConfirm = useCallback(() => {
    const result = engineRef.current?.deleteSelected();
    if (result) {
      handleObjectDeleted(result);
    }
    setDeleteConfirmOpen(false);
  }, [handleObjectDeleted]);

  const handleDelete = handleDeleteRequest;

  const handleClear = () => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.clear();
    isDirtyRef.current = true;
    setSelectedIds([]);
    setClearConfirmOpen(false);

    void (async () => {
      if (collab.isReady) {
        collab.shareScene();
      } else {
        collab.markUnsharedChanges();
      }
      await flushPersist({ forceThumbnail: true });
    })();
  };

  const flushPersist = useCallback(async (options?: { forceThumbnail?: boolean }) => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    await persistRef.current(options);
  }, []);

  const handleShare = () => {
    void (async () => {
      await flushPersist({ forceThumbnail: true });
      collab.shareScene();
    })();
  };

  const handleClearRequest = () => {
    setClearConfirmOpen(true);
  };

  const handleExportImage = () => {
    const engine = engineRef.current;
    if (!engine) return;
    downloadSceneAsPng(
      engine.getPathsSnapshot(),
      engine.getImagesSnapshot(),
      title,
      engine.getTextsSnapshot(),
      engine.getTablesSnapshot(),
    );
  };

  const publishHistorySceneSync = useCallback(
    (
      before: SceneSnapshot,
      after: SceneSnapshot,
      deferredBefore: { ids: Set<string>; deletes: Set<string> },
    ) => {
      if (!collab.isReady) return;

      if (shouldShareSceneForHistoryDiff(before, after)) {
        collab.shareScene();
        return;
      }

      const engine = engineRef.current;
      if (!engine) return;

      const patch = engine.buildHistoryCollabPatch(before, after, deferredBefore);
      if (patch) {
        collab.publishSceneEvents([patch]);
      }
    },
    [collab.isReady, collab.publishSceneEvents, collab.shareScene],
  );

  const handleUndo = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;

    const before = captureEngineScene(engine);
    const deferredBefore = engine.snapshotDeferredDrawState();
    const changed = await engine.undo();
    if (!changed) return;

    publishHistorySceneSync(before, captureEngineScene(engine), deferredBefore);
  }, [publishHistorySceneSync]);

  const handleRedo = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;

    const before = captureEngineScene(engine);
    const deferredBefore = engine.snapshotDeferredDrawState();
    const changed = await engine.redo();
    if (!changed) return;

    publishHistorySceneSync(before, captureEngineScene(engine), deferredBefore);
  }, [publishHistorySceneSync]);

  const handleHistoryChange = useCallback((state: { canUndo: boolean; canRedo: boolean }) => {
    setCanUndo(state.canUndo);
    setCanRedo(state.canRedo);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;

      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        void handleUndo();
      } else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
        e.preventDefault();
        void handleRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  useEffect(() => {
    if (editingTitle) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [editingTitle]);

  const startEditTitle = () => {
    setDraftTitle(title);
    setEditingTitle(true);
  };

  const cancelEditTitle = () => {
    setEditingTitle(false);
    setDraftTitle(title);
  };

  const commitTitle = async () => {
    const next = draftTitle.trim() || '제목 없음';
    setEditingTitle(false);
    if (next === title) return;

    const prevTitle = title;
    setTitle(next);
    setSaveStatus('saving');
    try {
      const doc = await renameWhiteboard(whiteboardId, next);
      docRef.current = doc;
      setSaveStatus('saved');
    } catch {
      setSaveStatus('error');
      setTitle(prevTitle);
    }
  };

  const handleBack = async () => {
    await flushPersist({ forceThumbnail: true });
    onBack();
  };

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, []);

  if (loading) {
    return (
      <div className="editor-loading">
        <p>화이트보드를 불러오는 중…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="editor-loading">
        <p>{error}</p>
        {showBackButton && (
          <button type="button" onClick={onBack}>
            갤러리로 돌아가기
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="app editor">
      <Toolbar
        title={title}
        editingTitle={editingTitle}
        draftTitle={draftTitle}
        titleInputRef={titleInputRef}
        saveStatus={saveStatus}
        hasSelection={selectedIds.length > 0}
        onBack={() => void handleBack()}
        showBackButton={showBackButton}
        onStartEditTitle={startEditTitle}
        onDraftTitleChange={setDraftTitle}
        onCommitTitle={() => void commitTitle()}
        onCancelEditTitle={cancelEditTitle}
        onExportImage={handleExportImage}
        onShare={handleShare}
        shareDisabled={!collab.isReady || !collab.isWsConnected || !collab.isSynced}
        onDelete={handleDelete}
        onClear={handleClearRequest}
        collabStatus={
          <CollabStatus
            remotePeerCount={collab.remotePeerCount}
            isWsConnected={collab.isWsConnected}
            isSynced={collab.isSynced}
            isReady={collab.isReady}
            hasUnsharedChanges={collab.hasUnsharedChanges}
            sharedPathCount={collab.sharedPathCount}
            onReconnect={collab.reconnect}
          />
        }
      />

      <DeleteConfirmDialog
        open={clearConfirmOpen}
        title="전체 지우기"
        body="모든 그림과 이미지가 삭제됩니다. 되돌리기로 복구할 수 있습니다."
        confirmLabel="지우기"
        onConfirm={handleClear}
        onCancel={() => setClearConfirmOpen(false)}
      />

      <DeleteConfirmDialog
        open={deleteConfirmOpen}
        title="개체 삭제"
        body={deleteConfirmBody}
        confirmLabel="삭제"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteConfirmOpen(false)}
      />

      <main className="workspace">
        <div className="workspace-canvas-area">
          <DrawingToolsBar
            tool={tool}
            drawSettings={drawSettings}
            eraserSettings={eraserSettings}
            textSettings={textSettings}
            tableSettings={tableSettings}
            drawOptionsOpen={drawOptionsOpen}
            textOptionsPlacement={textOptionsPlacement}
            canUndo={canUndo}
            canRedo={canRedo}
            onToolChange={handleToolChange}
            onAttachImage={() => attachImageRef.current?.()}
            onDrawSettingsChange={handleDrawSettingsChange}
            onEraserSettingsChange={handleEraserSettingsChange}
            onTextSettingsChange={handleTextSettingsChange}
            onTableSettingsChange={handleTableSettingsChange}
            onDrawOptionsClose={() => setDrawOptionsOpen(false)}
            onUndo={() => void handleUndo()}
            onRedo={() => void handleRedo()}
          />
          <DrawingCanvas
          key={whiteboardId}
          tool={tool}
          drawSettings={drawSettings}
          eraserSettings={eraserSettings}
          engineRef={engineRef}
          initialPaths={initialPaths}
          initialImages={initialImages}
          initialTexts={initialTexts}
          initialTables={initialTables}
          textSettings={textSettings}
          tableSettings={tableSettings}
          textOptionsOpen={tool === 'text' && drawOptionsOpen && textOptionsPlacement === 'editor'}
          tableOptionsOpen={tool === 'table' && drawOptionsOpen}
          onTextSettingsChange={handleTextSettingsChange}
          onTableSettingsChange={handleTableSettingsChange}
          onTextOptionsClose={() => setDrawOptionsOpen(false)}
          onTableOptionsClose={() => setDrawOptionsOpen(false)}
          onSelectionChange={handleSelectionChange}
          onPathsChange={handlePathsChange}
          onDeferredDrawChange={handleDeferredDrawChange}
          onHistoryChange={handleHistoryChange}
          attachImageRef={attachImageRef}
          onImageAdded={handleImageAdded}
          onTextAdded={handleTextAdded}
          onTableAdded={handleTableAdded}
          onTextEditStart={handleTextEditStart}
          onTextEditEnd={handleTextEditEnd}
          onTableEditStart={handleTableEditStart}
          onTableEditEnd={handleTableEditEnd}
          onTableCellLiveSync={handleTableCellLiveSync}
          onDeleteRequest={handleDeleteRequest}
          onObjectDeleted={handleObjectDeleted}
          onCollabSceneEvents={handleCollabSceneEvents}
          remotePeers={presence.remotePeers}
          onCursorMove={presence.updateCursor}
          onCursorClear={presence.clearCursor}
          onEngineInstance={handleEngineInstance}
        />
        </div>
      </main>

      <MadeByCredit hint={getCanvasHint(tool)} />
    </div>
  );
}
