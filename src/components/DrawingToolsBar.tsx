import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { Tool } from '../engine/types';
import { EraserOptionsPopover } from './EraserOptionsPopover';
import { TextOptionsPopover, type TextOptionsPopoverPlacement } from './TextOptionsPopover';
import { TableOptionsPopover, type TableOptionsPopoverPlacement } from './TableOptionsPopover';
import { ToolOptionsPopover } from './ToolOptionsPopover';
import {
  isDrawSettingsTool,
  type DrawSettingsTool,
  type DrawToolSettings,
} from '../drawToolSettings';
import type { EraserSettings } from '../eraserSettings';
import type { TextToolSettings } from '../textToolSettings';
import type { TableToolSettings } from '../tableToolSettings';

interface DrawingToolsBarProps {
  tool: Tool;
  drawSettings: DrawToolSettings;
  eraserSettings: EraserSettings;
  textSettings: TextToolSettings;
  tableSettings: TableToolSettings;
  drawOptionsOpen: boolean;
  textOptionsPlacement: TextOptionsPopoverPlacement;
  tableOptionsPlacement: TableOptionsPopoverPlacement;
  canUndo: boolean;
  canRedo: boolean;
  onToolChange: (tool: Tool) => void;
  onAttachImage?: () => void;
  onDrawSettingsChange: (patch: Partial<DrawToolSettings>) => void;
  onEraserSettingsChange: (patch: Partial<EraserSettings>) => void;
  onTextSettingsChange: (patch: Partial<TextToolSettings>) => void;
  onTableSettingsChange: (patch: Partial<TableToolSettings>) => void;
  onDrawOptionsClose: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

function UndoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8 7H5.5C4.12 7 3 8.12 3 9.5V12"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 4L3 7L6 10"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 12C6 16.42 9.58 20 14 20C18.42 20 22 16.42 22 12C22 7.58 18.42 4 14 4H8"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SelectIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4.5 3.5v14.8l4.6-3.5 2.7 5.6 2.5-1.2-2.7-5.6 5.4-.5L4.5 3.5z"
        fill="#ffffff"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M16 7H18.5C19.88 7 21 8.12 21 9.5V12"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M18 4L21 7L18 10"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M18 12C18 16.42 14.42 20 10 20C5.58 20 2 16.42 2 12C2 7.58 5.58 4 10 4H16"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ImageAttachIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect
        x="3"
        y="5"
        width="18"
        height="14"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <circle cx="8.5" cy="10" r="1.75" fill="currentColor" />
      <path
        d="M3 16l5.5-5.5a1.5 1.5 0 012.12 0L14 14l2-2a1.5 1.5 0 012.12 0L21 15"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TextToolIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 5h12M12 5v14M9 19h6"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TableToolIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="5" width="16" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
      <path d="M4 10h16M4 15h16M10 5v14M15 5v14" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

const TOOLS_BAR_POSITION_KEY = 'whiteboard4share-tools-bar-position';
const TOOLS_BAR_POSITION_MOBILE_KEY = 'whiteboard4share-tools-bar-position-mobile';
const TOOLS_BAR_MOBILE_BREAKPOINT = 768;

type ToolsBarDockSide = 'left' | 'right' | 'bottom' | null;

type ToolsBarPosition = {
  left: number;
  top: number;
  dock: ToolsBarDockSide;
};

function useMobileToolsBar(): boolean {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(`(max-width: ${TOOLS_BAR_MOBILE_BREAKPOINT}px)`).matches;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia(`(max-width: ${TOOLS_BAR_MOBILE_BREAKPOINT}px)`);
    const handleChange = (event: MediaQueryListEvent) => {
      setIsMobile(event.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return isMobile;
}

function readStoredToolsBarPosition(mobile: boolean): ToolsBarPosition | null {
  if (typeof window === 'undefined') return null;

  const storageKey = mobile ? TOOLS_BAR_POSITION_MOBILE_KEY : TOOLS_BAR_POSITION_KEY;

  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ToolsBarPosition>;
    if (typeof parsed.left === 'number' && typeof parsed.top === 'number') {
      if (mobile) {
        return { left: parsed.left, top: parsed.top, dock: null };
      }

      const dock =
        parsed.dock === 'left' || parsed.dock === 'right' || parsed.dock === 'bottom'
          ? parsed.dock
          : null;
      return {
        left: dock === 'right' ? 0 : parsed.left,
        top: dock === 'bottom' ? 0 : parsed.top,
        dock,
      };
    }
  } catch {
    /* ignore invalid stored value */
  }

  return null;
}

function sameToolsBarPosition(a: ToolsBarPosition | null, b: ToolsBarPosition): boolean {
  return a !== null && a.left === b.left && a.top === b.top && a.dock === b.dock;
}

function writeStoredToolsBarPosition(mobile: boolean, next: ToolsBarPosition): void {
  try {
    localStorage.setItem(
      mobile ? TOOLS_BAR_POSITION_MOBILE_KEY : TOOLS_BAR_POSITION_KEY,
      JSON.stringify(next),
    );
  } catch {
    /* ignore quota errors */
  }
}

function computeCenterToolsBarPosition(
  bar: HTMLElement,
  parent: HTMLElement,
): ToolsBarPosition {
  return clampToolsBarPosition(
    (parent.clientWidth - bar.offsetWidth) / 2,
    (parent.clientHeight - bar.offsetHeight) / 2,
    null,
    bar,
    parent,
  );
}

function normalizeToolsBarPosition(next: ToolsBarPosition, mobile: boolean): ToolsBarPosition {
  return mobile ? { ...next, dock: null } : next;
}

const TOOLS_BAR_EDGE_THRESHOLD = 4;

function readDockSideFromGeometry(
  bar: HTMLElement,
  parent: HTMLElement,
  positionLeft: number,
  positionTop: number,
): ToolsBarDockSide {
  const maxTop = Math.max(0, parent.clientHeight - bar.offsetHeight);
  if (positionTop >= maxTop - TOOLS_BAR_EDGE_THRESHOLD) return 'bottom';

  const barRect = bar.getBoundingClientRect();
  const parentRect = parent.getBoundingClientRect();
  const bottomGap = parentRect.height - (barRect.bottom - parentRect.top);
  if (bottomGap <= TOOLS_BAR_EDGE_THRESHOLD) return 'bottom';

  const maxLeft = Math.max(0, parent.clientWidth - bar.offsetWidth);
  if (positionLeft <= TOOLS_BAR_EDGE_THRESHOLD) return 'left';
  if (positionLeft >= maxLeft - TOOLS_BAR_EDGE_THRESHOLD) return 'right';

  const rightGap = parentRect.width - (barRect.right - parentRect.left);
  if (rightGap <= TOOLS_BAR_EDGE_THRESHOLD) return 'right';

  return null;
}

function clampToolsBarPosition(
  left: number,
  top: number,
  dock: ToolsBarDockSide,
  bar: HTMLElement,
  parent: HTMLElement,
): ToolsBarPosition {
  const maxTop = Math.max(0, parent.clientHeight - bar.offsetHeight);
  const maxLeft = Math.max(0, parent.clientWidth - bar.offsetWidth);

  if (dock === 'bottom') {
    return {
      left: Math.min(Math.max(0, left), maxLeft),
      top: 0,
      dock: 'bottom',
    };
  }
  if (dock === 'left') {
    return { left: 0, top: Math.min(Math.max(0, top), maxTop), dock: 'left' };
  }
  if (dock === 'right') {
    return { left: 0, top: Math.min(Math.max(0, top), maxTop), dock: 'right' };
  }

  return {
    left: Math.min(Math.max(0, left), maxLeft),
    top: Math.min(Math.max(0, top), maxTop),
    dock: null,
  };
}

function DragHandleIcon() {
  return (
    <svg width="10" height="16" viewBox="0 0 10 16" aria-hidden="true">
      {[0, 6, 12].map((cy) =>
        [2, 8].map((cx) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.35" fill="currentColor" />
        )),
      )}
    </svg>
  );
}

const TOOLS: { id: Tool; label: string; icon: ReactNode }[] = [
  { id: 'text', label: '텍스트', icon: <TextToolIcon /> },
  { id: 'hand', label: '손 — 화면 이동', icon: '✋' },
  { id: 'select', label: '선택', icon: <SelectIcon /> },
  { id: 'lasso', label: '올가미', icon: '➰' },
  { id: 'pencil', label: '연필', icon: '✏️' },
  { id: 'pen', label: '볼펜', icon: '🖊️' },
  { id: 'highlighter', label: '형광펜', icon: '🖍️' },
  { id: 'eraser', label: '지우개', icon: '🧹' },
  { id: 'image', label: '사진 첨부', icon: <ImageAttachIcon /> },
  { id: 'table', label: '표', icon: <TableToolIcon /> },
];

export function DrawingToolsBar({
  tool,
  drawSettings,
  eraserSettings,
  textSettings,
  tableSettings,
  drawOptionsOpen,
  textOptionsPlacement,
  tableOptionsPlacement,
  canUndo,
  canRedo,
  onToolChange,
  onAttachImage,
  onDrawSettingsChange,
  onEraserSettingsChange,
  onTextSettingsChange,
  onTableSettingsChange,
  onDrawOptionsClose,
  onUndo,
  onRedo,
}: DrawingToolsBarProps) {
  const isMobileFloating = useMobileToolsBar();
  const barRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originLeft: number;
    originTop: number;
  } | null>(null);
  const [position, setPosition] = useState<ToolsBarPosition | null>(() =>
    isMobileFloating ? readStoredToolsBarPosition(true) : null,
  );
  const isDraggingRef = useRef(false);
  const toolButtonRefs = useRef<Partial<Record<DrawSettingsTool, HTMLButtonElement | null>>>({});
  const drawAnchorRef = useRef<HTMLButtonElement | null>(null);
  const eraserAnchorRef = useRef<HTMLButtonElement | null>(null);
  const textAnchorRef = useRef<HTMLButtonElement | null>(null);
  const tableAnchorRef = useRef<HTMLButtonElement | null>(null);
  const showEraserOptions = tool === 'eraser' && drawOptionsOpen;
  const showTextOptions = tool === 'text' && drawOptionsOpen && textOptionsPlacement === 'toolbar';
  const showTableOptions =
    tool === 'table' && drawOptionsOpen && tableOptionsPlacement === 'toolbar';

  const updatePosition = useCallback((next: ToolsBarPosition) => {
    setPosition((current) => (sameToolsBarPosition(current, next) ? current : next));
  }, []);

  const syncBarLayout = useCallback(
    (next: ToolsBarPosition, persist = false) => {
      const normalized = normalizeToolsBarPosition(next, isMobileFloating);
      setPosition((current) => (sameToolsBarPosition(current, normalized) ? current : normalized));
      if (persist && isMobileFloating) {
        writeStoredToolsBarPosition(true, normalized);
      }
    },
    [isMobileFloating],
  );

  const resolveBarLayout = useCallback(
    (left: number, top: number, dock: ToolsBarDockSide, persist = false) => {
      const bar = barRef.current;
      const parent = bar?.offsetParent as HTMLElement | null;
      if (!bar || !parent) return;

      const resolvedDock = isMobileFloating
        ? null
        : dock ?? readDockSideFromGeometry(bar, parent, left, top);
      const next = clampToolsBarPosition(left, top, resolvedDock, bar, parent);
      syncBarLayout(next, persist);
    },
    [isMobileFloating, syncBarLayout],
  );

  const getBarPosition = useCallback((): ToolsBarPosition | null => {
    const bar = barRef.current;
    const parent = bar?.offsetParent as HTMLElement | null;
    if (!bar || !parent) return null;

    const barRect = bar.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    return clampToolsBarPosition(
      barRect.left - parentRect.left,
      barRect.top - parentRect.top,
      null,
      bar,
      parent,
    );
  }, []);

  const handleDragPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const visual = getBarPosition();
    if (!visual) return;

    isDraggingRef.current = true;
    if (!position) {
      updatePosition(visual);
    } else if (position.dock) {
      updatePosition({ ...visual, dock: null });
    }

    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originLeft: visual.left,
      originTop: visual.top,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleDragPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragStateRef.current;
    const bar = barRef.current;
    const parent = bar?.offsetParent as HTMLElement | null;
    if (!drag || drag.pointerId !== event.pointerId || !bar || !parent) return;

    const next = clampToolsBarPosition(
      drag.originLeft + (event.clientX - drag.startX),
      drag.originTop + (event.clientY - drag.startY),
      null,
      bar,
      parent,
    );
    updatePosition(next);
  };

  const handleDragPointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    dragStateRef.current = null;
    isDraggingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    resolveBarLayout(
      drag.originLeft + (event.clientX - drag.startX),
      drag.originTop + (event.clientY - drag.startY),
      null,
      true,
    );
  };

  useLayoutEffect(() => {
    if (isDraggingRef.current) return;

    const bar = barRef.current;
    const parent = bar?.offsetParent as HTMLElement | null;
    if (!bar || !parent) return;

    if (isMobileFloating) {
      const applyMobileLayout = () => {
        const stored = readStoredToolsBarPosition(true);
        const next = normalizeToolsBarPosition(
          stored ?? computeCenterToolsBarPosition(bar, parent),
          true,
        );
        syncBarLayout(next, !stored);
      };

      applyMobileLayout();
      if (!readStoredToolsBarPosition(true)) {
        requestAnimationFrame(applyMobileLayout);
      }
      return;
    }

    setPosition(null);
  }, [isMobileFloating, syncBarLayout]);

  useEffect(() => {
    if (!position) return;

    const handleResize = () => {
      if (isDraggingRef.current) return;
      resolveBarLayout(position.left, position.top, position.dock, false);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [position, resolveBarLayout]);

  const dockSide = isMobileFloating ? null : (position?.dock ?? null);
  const barStyle = position
    ? dockSide === 'bottom'
      ? {
          bottom: 0,
          top: 'auto' as const,
          left: `${position.left}px`,
        }
      : {
          top: `${position.top}px`,
          ...(dockSide === null ? { left: `${position.left}px` } : {}),
        }
    : isMobileFloating && !position
      ? { visibility: 'hidden' as const }
      : undefined;

  const positionClass = isMobileFloating
    ? ' canvas-tools-bar--floating canvas-tools-bar--mobile'
    : dockSide === 'left'
      ? ' canvas-tools-bar--dock-left'
      : dockSide === 'right'
        ? ' canvas-tools-bar--dock-right'
        : dockSide === 'bottom'
          ? ' canvas-tools-bar--dock-bottom'
          : ' canvas-tools-bar--floating';

  return (
    <div
      ref={barRef}
      className={`canvas-tools-bar${position ? positionClass : ''}`}
      style={barStyle}
      aria-label="도구"
    >
      <div className="canvas-tools-bar__inner">
        <button
          type="button"
          className="canvas-tools-bar__drag-handle"
          onPointerDown={handleDragPointerDown}
          onPointerMove={handleDragPointerMove}
          onPointerUp={handleDragPointerUp}
          onPointerCancel={handleDragPointerUp}
          title="도구 모음 이동"
          aria-label="도구 모음 이동"
        >
          <DragHandleIcon />
        </button>
        <div className={isMobileFloating ? 'canvas-tools-bar__tool-panel' : 'canvas-tools-bar__tools-flow'}>
        <div className="history-group" role="group" aria-label="실행 취소">
          <button
            type="button"
            className="tool-btn tool-btn--icon"
            onClick={onUndo}
            disabled={!canUndo}
            title="되돌리기 (Ctrl+Z)"
            aria-label="되돌리기"
          >
            <UndoIcon />
          </button>
          <button
            type="button"
            className="tool-btn tool-btn--icon"
            onClick={onRedo}
            disabled={!canRedo}
            title="다시반영하기 (Ctrl+Y)"
            aria-label="다시반영하기"
          >
            <RedoIcon />
          </button>
        </div>

        <div className="toolbar-section toolbar-section--tools">
          <div className="tool-group" role="group" aria-label="Drawing tools">
            {TOOLS.map(({ id, label, icon }) => (
              <button
                key={id}
                ref={(el) => {
                  if (isDrawSettingsTool(id)) {
                    toolButtonRefs.current[id] = el;
                    if (tool === id) drawAnchorRef.current = el;
                  }
                  if (id === 'eraser') {
                    if (tool === id) eraserAnchorRef.current = el;
                  }
                  if (id === 'text') {
                    textAnchorRef.current = el;
                  }
                  if (id === 'table') {
                    tableAnchorRef.current = el;
                  }
                }}
                type="button"
                className={`tool-btn tool-btn--icon ${tool === id ? 'active' : ''}`}
                onClick={() => {
                  if (id === 'image') {
                    onAttachImage?.();
                  }
                  onToolChange(id);
                }}
                title={label}
                aria-label={label}
                aria-pressed={tool === id}
              >
                <span className="tool-icon" aria-hidden="true">
                  {icon}
                </span>
              </button>
            ))}
          </div>

          {isDrawSettingsTool(tool) && drawOptionsOpen && (
            <ToolOptionsPopover
              tool={tool}
              settings={drawSettings}
              onChange={onDrawSettingsChange}
              anchorRef={drawAnchorRef}
              onClose={onDrawOptionsClose}
            />
          )}

          {showEraserOptions && (
            <EraserOptionsPopover
              settings={eraserSettings}
              onChange={onEraserSettingsChange}
              anchorRef={eraserAnchorRef}
              onClose={onDrawOptionsClose}
            />
          )}

          {showTextOptions && (
            <TextOptionsPopover
              settings={textSettings}
              onChange={onTextSettingsChange}
              anchorRef={textAnchorRef}
              placement="toolbar"
              open={showTextOptions}
              onClose={onDrawOptionsClose}
            />
          )}

          {showTableOptions && (
            <TableOptionsPopover
              settings={tableSettings}
              onChange={onTableSettingsChange}
              anchorRef={tableAnchorRef}
              open={showTableOptions}
              onClose={onDrawOptionsClose}
            />
          )}
        </div>
        </div>
      </div>
    </div>
  );
}
