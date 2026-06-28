import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAnchoredPopoverPosition } from '../hooks/useAnchoredPopoverPosition';
import { isPresetTextFont } from '../textToolSettings';
import { MAIN_COLOR_PALETTE, TEXT_FONT_OPTIONS, type TableToolSettings } from '../tableToolSettings';

export type TableOptionsPopoverPlacement = 'toolbar' | 'editor';

interface TableOptionsPopoverProps {
  settings: TableToolSettings;
  onChange: (patch: Partial<TableToolSettings>) => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  placement?: TableOptionsPopoverPlacement;
  open: boolean;
  onClose: () => void;
}

type ColorTarget = 'color' | 'borderColor';

function swatchStyle(color: string): React.CSSProperties {
  return color === '#ffffff'
    ? { backgroundColor: color, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.12)' }
    : { backgroundColor: color };
}

function sliderFill(value: number, min: number, max: number): string {
  return `${((value - min) / (max - min)) * 100}%`;
}

const LONG_PRESS_MS = 500;

export function TableOptionsPopover({
  settings,
  onChange,
  anchorRef,
  placement = 'toolbar',
  open,
  onClose,
}: TableOptionsPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);
  const [activeColorTarget, setActiveColorTarget] = useState<ColorTarget>('color');
  const popoverStyle = useAnchoredPopoverPosition(anchorRef, popoverRef, open, [settings.fontSize], {
    fallbackWidth: 260,
    fallbackHeight: 320,
  });

  const activeColor = settings[activeColorTarget];

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const applyColor = useCallback(
    (color: string) => {
      onChange({ [activeColorTarget]: color });
    },
    [activeColorTarget, onChange],
  );

  const getColorSwatchHandlers = useCallback(
    (color: string) => ({
      onClick: () => {
        if (longPressTriggeredRef.current) {
          longPressTriggeredRef.current = false;
          return;
        }
        applyColor(color);
      },
      onDoubleClick: () => {
        applyColor(color);
        onClose();
      },
      onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        longPressTriggeredRef.current = false;
        clearLongPressTimer();
        longPressTimerRef.current = window.setTimeout(() => {
          longPressTimerRef.current = null;
          longPressTriggeredRef.current = true;
          applyColor(color);
          onClose();
        }, LONG_PRESS_MS);
      },
      onPointerUp: () => clearLongPressTimer(),
      onPointerCancel: () => clearLongPressTimer(),
      onPointerLeave: () => clearLongPressTimer(),
    }),
    [applyColor, clearLongPressTimer, onClose],
  );

  useEffect(() => {
    if (open) {
      setActiveColorTarget('color');
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      const el = target as Element;
      if (el.closest?.('.canvas-table-editor-root, .drawing-canvas, .canvas-container')) return;
      onClose();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (placement === 'editor') {
        e.stopPropagation();
      }
      onClose();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [anchorRef, onClose, open, placement]);

  useEffect(() => () => clearLongPressTimer(), [clearLongPressTimer]);

  if (!open) return null;

  const colorTargetLabel = activeColorTarget === 'color' ? '글자색' : '테두리색';

  const keepEditorFocus = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const tag = target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'LABEL') return;
    if (target.closest('label')) return;
    e.preventDefault();
  };

  return createPortal(
    <div
      ref={popoverRef}
      className={`tool-options-popover text-options-popover table-options-popover${placement === 'editor' ? ' table-options-popover--editor' : ''}`}
      style={popoverStyle}
      role="dialog"
      aria-label="표 옵션"
      onMouseDown={placement === 'editor' ? keepEditorFocus : undefined}
    >
      <div className="tool-options-row text-options-font-row">
        <label className="text-options-label" htmlFor="table-font-family">
          글꼴
        </label>
        <div className="text-options-font-fields">
          <select
            id="table-font-family"
            className="text-options-select"
            value={isPresetTextFont(settings.fontFamily) ? settings.fontFamily : ''}
            onChange={(e) => {
              if (e.target.value) onChange({ fontFamily: e.target.value });
            }}
          >
            <option value="">자주 쓰는 글꼴…</option>
            {TEXT_FONT_OPTIONS.map(({ id, label }) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="tool-options-row">
        <label className="text-options-label" htmlFor="table-font-size">
          크기
        </label>
        <div
          className="tool-options-slider-track"
          style={
            {
              '--fill': sliderFill(settings.fontSize, 10, 32),
              '--track-color': settings.color,
            } as React.CSSProperties
          }
        >
          <input
            id="table-font-size"
            type="range"
            min={10}
            max={32}
            step={1}
            value={settings.fontSize}
            onChange={(e) => onChange({ fontSize: Number(e.target.value) })}
            className="tool-options-slider"
            aria-label="글자 크기"
          />
        </div>
        <span className="tool-options-value">{settings.fontSize}</span>
      </div>

      <div className="table-options-color-targets" role="group" aria-label="색상 적용 대상">
        <button
          type="button"
          className={`table-options-color-target${activeColorTarget === 'color' ? ' active' : ''}`}
          onClick={() => setActiveColorTarget('color')}
          aria-pressed={activeColorTarget === 'color'}
        >
          <span className="table-options-color-target__label">글자</span>
          <span
            className="table-options-color-target__preview"
            style={swatchStyle(settings.color)}
            aria-hidden="true"
          />
        </button>
        <button
          type="button"
          className={`table-options-color-target${activeColorTarget === 'borderColor' ? ' active' : ''}`}
          onClick={() => setActiveColorTarget('borderColor')}
          aria-pressed={activeColorTarget === 'borderColor'}
        >
          <span className="table-options-color-target__label">선</span>
          <span
            className="table-options-color-target__preview"
            style={swatchStyle(settings.borderColor)}
            aria-hidden="true"
          />
        </button>
      </div>

      <div className="tool-options-palette" aria-label={`${colorTargetLabel} 팔레트`}>
        {MAIN_COLOR_PALETTE.map((color) => (
          <button
            key={color}
            type="button"
            className={`tool-options-color ${activeColor === color ? 'active' : ''}`}
            style={swatchStyle(color)}
            title={color}
            aria-label={`${colorTargetLabel} ${color}`}
            aria-pressed={activeColor === color}
            {...getColorSwatchHandlers(color)}
          />
        ))}
        <label className="tool-options-color tool-options-color--picker" title="사용자 색상">
          <input
            type="color"
            value={activeColor}
            onChange={(e) => applyColor(e.target.value)}
            className="tool-options-hidden-color"
            aria-label={`${colorTargetLabel} 사용자 색상`}
          />
          <span className="tool-options-picker-icon" aria-hidden="true">
            🎨
          </span>
        </label>
      </div>
    </div>,
    document.body,
  );
}
