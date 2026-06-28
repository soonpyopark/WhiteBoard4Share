import { useCallback, useEffect, useRef, useState } from 'react';
import type { DrawingEngine } from '../engine/drawingEngine';
import type { TableObject } from '../engine/types';
import { getTableTopLeft, TABLE_MAX_COLS, TABLE_MAX_ROWS } from '../engine/tableRenderer';
import type { TableToolSettings } from '../tableToolSettings';
import { MAIN_COLOR_PALETTE } from '../tableToolSettings';
import {
  applySessionAxisColor,
  axisColorsFromTable,
  createEmptyAxisColorState,
  deleteColAxisColor,
  deleteColAxisSeq,
  deleteRowAxisColor,
  deleteRowAxisSeq,
  getCellFillColor,
  getCellTextColor,
  insertColAxisColor,
  insertColAxisSeq,
  insertRowAxisColor,
  insertRowAxisSeq,
  resetSessionAxisColors,
  type TableAxisColorPatch,
  type TableAxisColorState,
} from '../lib/table/tableColors';
import { resolveSessionRowHeights, getHeaderHeightForFont } from '../lib/table/tableRowSizing';
import {
  clampColWidth,
  clampRowHeight,
  getTableColWidths,
  getTableRowHeights,
} from '../lib/table/tableDimensions';
import {
  appendCol,
  appendRow,
  applyLayoutToSession,
  createTableLayoutState,
  deleteColAt,
  deleteRowAt,
  insertColAt,
  insertRowAt,
  layoutFromSession,
  removeLastCol,
  removeLastRow,
  type TableLayoutState,
} from '../lib/table/tableStructure';

export interface TableEditSession extends TableAxisColorState {
  id: string | null;
  topLeftX: number;
  topLeftY: number;
  rows: number;
  cols: number;
  cells: string[][];
  colWidths: number[];
  rowHeights: number[];
  activeRow: number;
  activeCol: number;
}

interface TableEditorOverlayProps {
  session: TableEditSession;
  settings: TableToolSettings;
  engineRef: React.MutableRefObject<DrawingEngine | null>;
  onSessionChange: (session: TableEditSession) => void;
  onCellInputChange?: (session: TableEditSession) => void;
  onCommit: (session: TableEditSession) => void;
  onCancel: () => void;
}

type ContextMenuTarget =
  | { kind: 'row'; index: number; x: number; y: number }
  | { kind: 'col'; index: number; x: number; y: number }
  | { kind: 'cell'; row: number; col: number; x: number; y: number };

type MenuColorPanel = {
  target: 'row' | 'col';
  type: 'fill' | 'text';
  index: number;
  flyoutLeft: number;
  flyoutTop: number;
} | null;

const GUTTER_SIZE = 28;
const EDITOR_FRAME_PADDING = 10;

function cloneCells(cells: string[][]): string[][] {
  return cells.map((row) => [...row]);
}

function swatchStyle(color: string): React.CSSProperties {
  return color === '#ffffff'
    ? { backgroundColor: color, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.12)' }
    : { backgroundColor: color };
}

export function TableEditorOverlay({
  session,
  settings,
  engineRef,
  onSessionChange,
  onCellInputChange,
  onCommit,
  onCancel,
}: TableEditorOverlayProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const suppressBlurUntilRef = useRef(0);
  const activeInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuTarget | null>(null);
  const [menuColorPanel, setMenuColorPanel] = useState<MenuColorPanel>(null);
  const menuColorPickerOpenRef = useRef(false);

  useEffect(() => {
    suppressBlurUntilRef.current = performance.now() + 200;
    const frame = window.requestAnimationFrame(() => {
      activeInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [session.id, session.topLeftX, session.topLeftY, session.activeRow, session.activeCol]);

  useEffect(() => {
    if (!contextMenu) {
      setMenuColorPanel(null);
      return;
    }
    const closeMenu = () => {
      menuColorPickerOpenRef.current = false;
      setContextMenu(null);
    };
    const isTableMenuUiTarget = (target: Element) =>
      !!target.closest?.('.canvas-table-editor__menu') ||
      !!target.closest?.('.canvas-table-editor__menu-palette-flyout');

    const closeMenuFromPointer = (event: Event) => {
      const target = event.target as Element;
      if (isTableMenuUiTarget(target)) return;

      closeMenu();
    };
    window.addEventListener('pointerdown', closeMenuFromPointer, true);
    window.addEventListener('scroll', closeMenu, true);
    return () => {
      window.removeEventListener('pointerdown', closeMenuFromPointer, true);
      window.removeEventListener('scroll', closeMenu, true);
    };
  }, [contextMenu]);

  const armSuppressBlur = useCallback((durationMs = 500) => {
    suppressBlurUntilRef.current = performance.now() + durationMs;
  }, []);

  const activateOnPointerDown = useCallback(
    (event: React.PointerEvent, action: () => void) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      armSuppressBlur();
      action();
    },
    [armSuppressBlur],
  );

  const handlePanelBlur = useCallback(
    (event: React.FocusEvent<HTMLDivElement>) => {
      if (performance.now() < suppressBlurUntilRef.current) return;
      if (contextMenu) return;
      const next = event.relatedTarget as Node | null;
      if (next && panelRef.current?.contains(next)) return;

      // iOS Safari: relatedTarget is often null when tapping buttons inside the panel.
      window.requestAnimationFrame(() => {
        if (performance.now() < suppressBlurUntilRef.current) return;
        const active = document.activeElement;
        if (active && panelRef.current?.contains(active)) return;
        onCommit(session);
      });
    },
    [contextMenu, onCommit, session],
  );

  const engine = engineRef.current;
  if (!engine) return null;

  const fontFamily = settings.fontFamily;
  const fontSize = settings.fontSize;
  const color = settings.color;
  const borderColor = settings.borderColor;
  const defaultColWidth = settings.cellWidth;
  const defaultRowHeight = settings.cellHeight;
  const scale = engine.getViewScale();
  const screen = engine.worldToScreen(session.topLeftX, session.topLeftY);
  const toScreenPx = (value: number) => Math.max(1, Math.ceil(value * scale));
  const scaledGutter = toScreenPx(GUTTER_SIZE);
  const scaledHeader = toScreenPx(getHeaderHeightForFont(fontSize));
  const scaledColWidths = session.colWidths.map((width) => toScreenPx(width));
  const effectiveRowHeights = resolveSessionRowHeights(session, fontSize, defaultRowHeight);
  const scaledRowHeights = effectiveRowHeights.map((height) => toScreenPx(height));
  const gridWidth = scaledGutter + scaledColWidths.reduce((total, width) => total + width, 0);

  const pushSession = useCallback(
    (next: TableEditSession) => {
      onSessionChange(next);
      onCellInputChange?.(next);
    },
    [onCellInputChange, onSessionChange],
  );

  const updateSessionLayout = (
    layout: TableLayoutState,
    activeRow = session.activeRow,
    activeCol = session.activeCol,
    colorPatch?: TableAxisColorPatch,
  ) => {
    pushSession({
      ...applyLayoutToSession(session, layout, activeRow, activeCol),
      ...colorPatch,
    });
  };

  const updateCell = (row: number, col: number, value: string) => {
    const nextCells = cloneCells(session.cells);
    nextCells[row][col] = value;
    const nextSession = { ...session, cells: nextCells, activeRow: row, activeCol: col };
    onSessionChange(nextSession);
    onCellInputChange?.(nextSession);
  };

  const handleCellKeyDown = (
    rowIndex: number,
    colIndex: number,
    cell: string,
    event: React.KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (event.key === 'Enter' && event.altKey) {
      event.preventDefault();
      const el = event.currentTarget;
      const start = el.selectionStart ?? cell.length;
      const end = el.selectionEnd ?? cell.length;
      const nextValue = `${cell.slice(0, start)}\n${cell.slice(end)}`;
      updateCell(rowIndex, colIndex, nextValue);
      const nextCaret = start + 1;
      window.requestAnimationFrame(() => {
        const input = activeInputRef.current;
        if (!input) return;
        input.selectionStart = nextCaret;
        input.selectionEnd = nextCaret;
      });
      return;
    }

    if (event.key === 'Enter' && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
    }
  };

  const updateColWidth = (colIndex: number, width: number) => {
    const nextColWidths = [...session.colWidths];
    nextColWidths[colIndex] = clampColWidth(width);
    onSessionChange({ ...session, colWidths: nextColWidths });
  };

  const updateRowHeight = (rowIndex: number, height: number) => {
    const nextRowHeights = [...session.rowHeights];
    nextRowHeights[rowIndex] = clampRowHeight(height);
    onSessionChange({ ...session, rowHeights: nextRowHeights });
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (contextMenu) {
        setContextMenu(null);
        return;
      }
      onCancel();
      return;
    }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      onCommit(session);
    }
  };

  const openRowMenu = (index: number, event: React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    armSuppressBlur();
    setMenuColorPanel(null);
    setContextMenu({ kind: 'row', index, x: event.clientX, y: event.clientY });
  };

  const openColMenu = (index: number, event: React.PointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    armSuppressBlur();
    setMenuColorPanel(null);
    setContextMenu({ kind: 'col', index, x: event.clientX, y: event.clientY });
  };

  const openCellMenu = (row: number, col: number, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    suppressBlurUntilRef.current = performance.now() + 300;
    onSessionChange({ ...session, activeRow: row, activeCol: col });
    setMenuColorPanel(null);
    setContextMenu({ kind: 'cell', row, col, x: event.clientX, y: event.clientY });
  };

  const runStructureAction = (
    action: () => TableLayoutState,
    activeRow?: number,
    activeCol?: number,
    colorPatch?: TableAxisColorPatch,
  ) => {
    updateSessionLayout(action(), activeRow ?? session.activeRow, activeCol ?? session.activeCol, colorPatch);
    setContextMenu(null);
  };

  const setAxisColor = (
    target: 'row' | 'col',
    index: number,
    type: 'fill' | 'text',
    color: string | null,
  ) => {
    pushSession(applySessionAxisColor(session, target, index, type, color));
  };

  const resetAxisColors = (target: 'row' | 'col', index: number) => {
    pushSession(resetSessionAxisColors(session, target, index));
  };

  const colorSource = {
    color,
    rowFillColors: session.rowFillColors,
    colFillColors: session.colFillColors,
    rowTextColors: session.rowTextColors,
    colTextColors: session.colTextColors,
    rowFillColorSeq: session.rowFillColorSeq,
    colFillColorSeq: session.colFillColorSeq,
    rowTextColorSeq: session.rowTextColorSeq,
    colTextColorSeq: session.colTextColorSeq,
  };

  const openColorPanel = (
    target: 'row' | 'col',
    type: 'fill' | 'text',
    index: number,
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const flyoutWidth = 152;
    const flyoutHeight = 168;
    const gap = 6;
    setMenuColorPanel((prev) =>
      prev?.target === target && prev.type === type && prev.index === index
        ? null
        : {
            target,
            type,
            index,
            flyoutLeft: Math.min(rect.right + gap, window.innerWidth - flyoutWidth - 8),
            flyoutTop: Math.min(rect.top, window.innerHeight - flyoutHeight - 8),
          },
    );
  };

  const startColResize = (colIndex: number, event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    armSuppressBlur(600);
    const startX = event.clientX;
    const startWidth = session.colWidths[colIndex] ?? defaultColWidth;

    const handleMove = (moveEvent: PointerEvent) => {
      const delta = (moveEvent.clientX - startX) / scale;
      updateColWidth(colIndex, startWidth + delta);
    };

    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };

  const startRowResize = (rowIndex: number, event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    armSuppressBlur(600);
    const startY = event.clientY;
    const startHeight = session.rowHeights[rowIndex] ?? defaultRowHeight;

    const handleMove = (moveEvent: PointerEvent) => {
      const delta = (moveEvent.clientY - startY) / scale;
      updateRowHeight(rowIndex, startHeight + delta);
    };

    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };

  const renderContextMenu = () => {
    if (!contextMenu) return null;

    const items: Array<{ label: string; disabled?: boolean; onClick: () => void }> = [];

    if (contextMenu.kind === 'row' || contextMenu.kind === 'cell') {
      const rowIndex = contextMenu.kind === 'row' ? contextMenu.index : contextMenu.row;
      items.push(
        {
          label: '위에 행 삽입',
          disabled: session.rows >= TABLE_MAX_ROWS,
          onClick: () =>
            runStructureAction(
              () => insertRowAt(layoutFromSession(session), rowIndex, 'above', defaultRowHeight),
              rowIndex,
              session.activeCol,
              {
                rowFillColors: insertRowAxisColor(session.rowFillColors, rowIndex),
                rowTextColors: insertRowAxisColor(session.rowTextColors, rowIndex),
                rowFillColorSeq: insertRowAxisSeq(session.rowFillColorSeq, rowIndex),
                rowTextColorSeq: insertRowAxisSeq(session.rowTextColorSeq, rowIndex),
              },
            ),
        },
        {
          label: '아래 행 삽입',
          disabled: session.rows >= TABLE_MAX_ROWS,
          onClick: () =>
            runStructureAction(
              () => insertRowAt(layoutFromSession(session), rowIndex, 'below', defaultRowHeight),
              rowIndex + 1,
              session.activeCol,
              {
                rowFillColors: insertRowAxisColor(session.rowFillColors, rowIndex + 1),
                rowTextColors: insertRowAxisColor(session.rowTextColors, rowIndex + 1),
                rowFillColorSeq: insertRowAxisSeq(session.rowFillColorSeq, rowIndex + 1),
                rowTextColorSeq: insertRowAxisSeq(session.rowTextColorSeq, rowIndex + 1),
              },
            ),
        },
        {
          label: '이 행 삭제',
          disabled: session.rows <= 1,
          onClick: () => {
            if (!window.confirm(`${rowIndex + 1}행을 삭제할까요?`)) return;
            runStructureAction(() => deleteRowAt(layoutFromSession(session), rowIndex), undefined, undefined, {
              rowFillColors: deleteRowAxisColor(session.rowFillColors, rowIndex),
              rowTextColors: deleteRowAxisColor(session.rowTextColors, rowIndex),
              rowFillColorSeq: deleteRowAxisSeq(session.rowFillColorSeq, rowIndex),
              rowTextColorSeq: deleteRowAxisSeq(session.rowTextColorSeq, rowIndex),
            });
          },
        },
      );
    }

    if (contextMenu.kind === 'col' || contextMenu.kind === 'cell') {
      const colIndex = contextMenu.kind === 'col' ? contextMenu.index : contextMenu.col;
      items.push(
        {
          label: '왼쪽 열 삽입',
          disabled: session.cols >= TABLE_MAX_COLS,
          onClick: () =>
            runStructureAction(
              () => insertColAt(layoutFromSession(session), colIndex, 'left', defaultColWidth),
              session.activeRow,
              colIndex,
              {
                colFillColors: insertColAxisColor(session.colFillColors, colIndex),
                colTextColors: insertColAxisColor(session.colTextColors, colIndex),
                colFillColorSeq: insertColAxisSeq(session.colFillColorSeq, colIndex),
                colTextColorSeq: insertColAxisSeq(session.colTextColorSeq, colIndex),
              },
            ),
        },
        {
          label: '오른쪽 열 삽입',
          disabled: session.cols >= TABLE_MAX_COLS,
          onClick: () =>
            runStructureAction(
              () => insertColAt(layoutFromSession(session), colIndex, 'right', defaultColWidth),
              session.activeRow,
              colIndex + 1,
              {
                colFillColors: insertColAxisColor(session.colFillColors, colIndex + 1),
                colTextColors: insertColAxisColor(session.colTextColors, colIndex + 1),
                colFillColorSeq: insertColAxisSeq(session.colFillColorSeq, colIndex + 1),
                colTextColorSeq: insertColAxisSeq(session.colTextColorSeq, colIndex + 1),
              },
            ),
        },
        {
          label: '이 열 삭제',
          disabled: session.cols <= 1,
          onClick: () => {
            if (!window.confirm(`${colIndex + 1}열을 삭제할까요?`)) return;
            runStructureAction(() => deleteColAt(layoutFromSession(session), colIndex), undefined, undefined, {
              colFillColors: deleteColAxisColor(session.colFillColors, colIndex),
              colTextColors: deleteColAxisColor(session.colTextColors, colIndex),
              colFillColorSeq: deleteColAxisSeq(session.colFillColorSeq, colIndex),
              colTextColorSeq: deleteColAxisSeq(session.colTextColorSeq, colIndex),
            });
          },
        },
      );
    }

    const renderColorControls = (target: 'row' | 'col', index: number, labelPrefix: string) => {
      const fillKey = target === 'row' ? 'rowFillColors' : 'colFillColors';
      const textKey = target === 'row' ? 'rowTextColors' : 'colTextColors';
      const currentFill = session[fillKey][index];
      const currentText = session[textKey][index];
      const panelActive = menuColorPanel?.target === target && menuColorPanel.index === index;

      return (
        <div key={`${target}-${index}-colors`} className="canvas-table-editor__menu-section">
          <div className="canvas-table-editor__menu-section-title">{labelPrefix} 색상</div>
          <button
            type="button"
            className={`canvas-table-editor__menu-color-toggle${panelActive && menuColorPanel?.type === 'fill' ? ' active' : ''}`}
            onPointerDown={(event) =>
              activateOnPointerDown(event, () => openColorPanel(target, 'fill', index, event))
            }
          >
            <span>배경색</span>
            <span
              className="canvas-table-editor__menu-color-preview"
              style={swatchStyle(currentFill ?? '#ffffff')}
              aria-hidden="true"
            />
          </button>
          <button
            type="button"
            className={`canvas-table-editor__menu-color-toggle${panelActive && menuColorPanel?.type === 'text' ? ' active' : ''}`}
            onPointerDown={(event) =>
              activateOnPointerDown(event, () => openColorPanel(target, 'text', index, event))
            }
          >
            <span>글자색</span>
            <span
              className="canvas-table-editor__menu-color-preview"
              style={swatchStyle(currentText ?? color)}
              aria-hidden="true"
            />
          </button>
          <button
            type="button"
            className="canvas-table-editor__menu-reset"
            onPointerDown={(event) =>
              activateOnPointerDown(event, () => {
                resetAxisColors(target, index);
                setMenuColorPanel(null);
              })
            }
          >
            색상 초기화
          </button>
        </div>
      );
    };

    const renderColorPaletteFlyout = () => {
      if (!menuColorPanel) return null;

      const { target, type, index, flyoutLeft, flyoutTop } = menuColorPanel;
      const fillKey = target === 'row' ? 'rowFillColors' : 'colFillColors';
      const textKey = target === 'row' ? 'rowTextColors' : 'colTextColors';
      const labelPrefix = target === 'row' ? `${index + 1}행` : `${index + 1}열`;

      return (
        <div
          className="canvas-table-editor__menu-palette-flyout"
          style={{ left: `${flyoutLeft}px`, top: `${flyoutTop}px` }}
          role="group"
          aria-label={`${labelPrefix} ${type === 'fill' ? '배경색' : '글자색'}`}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="canvas-table-editor__menu-palette">
            {MAIN_COLOR_PALETTE.map((paletteColor) => (
              <button
                key={`${target}-${type}-${paletteColor}`}
                type="button"
                className="canvas-table-editor__menu-swatch"
                style={swatchStyle(paletteColor)}
                aria-label={paletteColor}
                onPointerDown={(event) =>
                  activateOnPointerDown(event, () => {
                    setAxisColor(target, index, type, paletteColor);
                    setMenuColorPanel(null);
                  })
                }
              />
            ))}
            <label className="canvas-table-editor__menu-swatch canvas-table-editor__menu-swatch--picker" title="사용자 색상">
              <input
                type="color"
                value={
                  (type === 'fill' ? session[fillKey][index] : session[textKey][index]) ??
                  (type === 'fill' ? '#ffffff' : color)
                }
                className="canvas-table-editor__menu-hidden-color"
                onPointerDown={(event) => {
                  event.stopPropagation();
                  menuColorPickerOpenRef.current = true;
                  armSuppressBlur(60_000);
                }}
                onFocus={() => {
                  menuColorPickerOpenRef.current = true;
                  armSuppressBlur(60_000);
                }}
                onBlur={() => {
                  window.setTimeout(() => {
                    menuColorPickerOpenRef.current = false;
                  }, 200);
                }}
                onChange={(event) => {
                  setAxisColor(target, index, type, event.target.value);
                }}
              />
              <span aria-hidden="true">🎨</span>
            </label>
          </div>
        </div>
      );
    };

    const rowIndex =
      contextMenu.kind === 'row' ? contextMenu.index : contextMenu.kind === 'cell' ? contextMenu.row : -1;
    const colIndex =
      contextMenu.kind === 'col' ? contextMenu.index : contextMenu.kind === 'cell' ? contextMenu.col : -1;

    return (
      <>
        <div
          className="canvas-table-editor__menu"
          style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              disabled={item.disabled}
              onPointerDown={(event) => {
                if (item.disabled) return;
                activateOnPointerDown(event, item.onClick);
              }}
            >
              {item.label}
            </button>
          ))}
          {rowIndex >= 0 && renderColorControls('row', rowIndex, `${rowIndex + 1}행`)}
          {colIndex >= 0 && renderColorControls('col', colIndex, `${colIndex + 1}열`)}
        </div>
        {renderColorPaletteFlyout()}
      </>
    );
  };

  return (
    <>
      <div
        ref={panelRef}
        className="canvas-table-editor-root"
        style={{
          left: `${screen.x - EDITOR_FRAME_PADDING - scaledGutter}px`,
          top: `${screen.y - EDITOR_FRAME_PADDING - toScreenPx(getHeaderHeightForFont(fontSize))}px`,
        }}
        onPointerDown={(event) => event.stopPropagation()}
        onPointerDownCapture={(event) => {
          const target = event.target as Element;
          if (
            target.closest('button') ||
            target.closest('.canvas-table-editor__col-resize') ||
            target.closest('.canvas-table-editor__row-resize')
          ) {
            armSuppressBlur();
          }
        }}
        onBlur={handlePanelBlur}
        onKeyDown={handleKeyDown}
        role="group"
        aria-label="표 편집"
      >
        <div className="canvas-table-editor__toolbar">
          <button
            type="button"
            disabled={session.rows >= TABLE_MAX_ROWS}
            onPointerDown={(event) =>
              activateOnPointerDown(event, () =>
                updateSessionLayout(appendRow(layoutFromSession(session), defaultRowHeight), session.activeRow, session.activeCol, {
                  rowFillColors: insertRowAxisColor(session.rowFillColors, session.rows),
                  rowTextColors: insertRowAxisColor(session.rowTextColors, session.rows),
                  rowFillColorSeq: insertRowAxisSeq(session.rowFillColorSeq, session.rows),
                  rowTextColorSeq: insertRowAxisSeq(session.rowTextColorSeq, session.rows),
                }),
              )
            }
          >
            행+
          </button>
          <button
            type="button"
            disabled={session.rows <= 1}
            onPointerDown={(event) =>
              activateOnPointerDown(event, () =>
                updateSessionLayout(removeLastRow(layoutFromSession(session)), session.activeRow, session.activeCol, {
                  rowFillColors: deleteRowAxisColor(session.rowFillColors, session.rows - 1),
                  rowTextColors: deleteRowAxisColor(session.rowTextColors, session.rows - 1),
                  rowFillColorSeq: deleteRowAxisSeq(session.rowFillColorSeq, session.rows - 1),
                  rowTextColorSeq: deleteRowAxisSeq(session.rowTextColorSeq, session.rows - 1),
                }),
              )
            }
          >
            행-
          </button>
          <button
            type="button"
            disabled={session.cols >= TABLE_MAX_COLS}
            onPointerDown={(event) =>
              activateOnPointerDown(event, () =>
                updateSessionLayout(appendCol(layoutFromSession(session), defaultColWidth), session.activeRow, session.activeCol, {
                  colFillColors: insertColAxisColor(session.colFillColors, session.cols),
                  colTextColors: insertColAxisColor(session.colTextColors, session.cols),
                  colFillColorSeq: insertColAxisSeq(session.colFillColorSeq, session.cols),
                  colTextColorSeq: insertColAxisSeq(session.colTextColorSeq, session.cols),
                }),
              )
            }
          >
            열+
          </button>
          <button
            type="button"
            disabled={session.cols <= 1}
            onPointerDown={(event) =>
              activateOnPointerDown(event, () =>
                updateSessionLayout(removeLastCol(layoutFromSession(session)), session.activeRow, session.activeCol, {
                  colFillColors: deleteColAxisColor(session.colFillColors, session.cols - 1),
                  colTextColors: deleteColAxisColor(session.colTextColors, session.cols - 1),
                  colFillColorSeq: deleteColAxisSeq(session.colFillColorSeq, session.cols - 1),
                  colTextColorSeq: deleteColAxisSeq(session.colTextColorSeq, session.cols - 1),
                }),
              )
            }
          >
            열-
          </button>
          <span className="canvas-table-editor__size">
            {session.rows}×{session.cols}
          </span>
        </div>
        <div className="canvas-table-editor">
          <div
            className="canvas-table-editor__grid-wrap"
            style={{
              width: `${gridWidth}px`,
            }}
          >
            <table
              className="canvas-table-editor__grid"
              style={{
                fontFamily,
                fontSize: `${toScreenPx(fontSize)}px`,
                color,
                ['--table-border-color' as string]: borderColor,
              }}
            >
              <thead>
                <tr>
                  <th
                    className="canvas-table-editor__corner"
                    style={{
                      width: `${scaledGutter}px`,
                      minWidth: `${scaledGutter}px`,
                      minHeight: `${scaledHeader}px`,
                      height: `${scaledHeader}px`,
                    }}
                  />
                  {session.colWidths.map((colWidth, colIndex) => (
                    <th
                      key={`col-${colIndex}`}
                      className="canvas-table-editor__col-header"
                        style={{
                          width: `${scaledColWidths[colIndex] ?? toScreenPx(colWidth)}px`,
                          minWidth: `${scaledColWidths[colIndex] ?? toScreenPx(colWidth)}px`,
                          minHeight: `${scaledHeader}px`,
                          height: `${scaledHeader}px`,
                        }}
                    >
                      <button
                        type="button"
                        className="canvas-table-editor__header-btn"
                        onPointerDown={(event) => openColMenu(colIndex, event)}
                        aria-label={`${colIndex + 1}열 메뉴`}
                      >
                        {colIndex + 1}
                      </button>
                      <div
                        className="canvas-table-editor__col-resize"
                        onPointerDown={(event) => startColResize(colIndex, event)}
                        aria-hidden="true"
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {session.cells.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    <th
                      className="canvas-table-editor__row-header"
                        style={{
                          width: `${scaledGutter}px`,
                          minWidth: `${scaledGutter}px`,
                          minHeight: `${scaledRowHeights[rowIndex]}px`,
                          height: `${scaledRowHeights[rowIndex]}px`,
                        }}
                    >
                      <button
                        type="button"
                        className="canvas-table-editor__header-btn"
                        onPointerDown={(event) => openRowMenu(rowIndex, event)}
                        aria-label={`${rowIndex + 1}행 메뉴`}
                      >
                        {rowIndex + 1}
                      </button>
                      <div
                        className="canvas-table-editor__row-resize"
                        onPointerDown={(event) => startRowResize(rowIndex, event)}
                        aria-hidden="true"
                      />
                    </th>
                    {row.map((cell, colIndex) => (
                      <td
                        key={colIndex}
                        style={{
                          width: `${scaledColWidths[colIndex] ?? toScreenPx(session.colWidths[colIndex] ?? defaultColWidth)}px`,
                          minWidth: `${scaledColWidths[colIndex] ?? toScreenPx(session.colWidths[colIndex] ?? defaultColWidth)}px`,
                          minHeight: `${scaledRowHeights[rowIndex]}px`,
                          height: `${scaledRowHeights[rowIndex]}px`,
                          backgroundColor: getCellFillColor(colorSource, rowIndex, colIndex),
                          color: getCellTextColor(colorSource, rowIndex, colIndex),
                        }}
                        onContextMenu={(event) => openCellMenu(rowIndex, colIndex, event)}
                      >
                        <textarea
                          ref={
                            rowIndex === session.activeRow && colIndex === session.activeCol
                              ? activeInputRef
                              : undefined
                          }
                          rows={1}
                          value={cell}
                          onChange={(event) => updateCell(rowIndex, colIndex, event.target.value)}
                          onKeyDown={(event) => handleCellKeyDown(rowIndex, colIndex, cell, event)}
                          onFocus={() =>
                            onSessionChange({ ...session, activeRow: rowIndex, activeCol: colIndex })
                          }
                          aria-label={`셀 ${rowIndex + 1}-${colIndex + 1}`}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {renderContextMenu()}
    </>
  );
}

export function getTableEditorTopLeft(table: TableObject): { x: number; y: number } {
  return getTableTopLeft(table);
}

export function isTableSessionEmpty(session: TableEditSession): boolean {
  return !session.cells.some((row) => row.some((cell) => cell.trim().length > 0));
}

export function createTableEditSession(
  topLeftX: number,
  topLeftY: number,
  rows: number,
  cols: number,
  existing?: TableObject | null,
  settings?: TableToolSettings,
): TableEditSession {
  if (existing) {
    const colors = axisColorsFromTable(existing);
    return {
      id: existing.id,
      topLeftX,
      topLeftY,
      rows: existing.rows,
      cols: existing.cols,
      cells: existing.cells.map((row) => [...row]),
      colWidths: getTableColWidths(existing),
      rowHeights: getTableRowHeights(existing),
      ...colors,
      activeRow: 0,
      activeCol: 0,
    };
  }

  const cellWidth = settings?.cellWidth ?? 80;
  const cellHeight = settings?.cellHeight ?? 32;
  const layout = createTableLayoutState(rows, cols, cellWidth, cellHeight);
  const colors = createEmptyAxisColorState(layout.rows, layout.cols);

  return {
    id: null,
    topLeftX,
    topLeftY,
    rows: layout.rows,
    cols: layout.cols,
    cells: layout.cells,
    colWidths: layout.colWidths,
    rowHeights: layout.rowHeights,
    ...colors,
    activeRow: 0,
    activeCol: 0,
  };
}
