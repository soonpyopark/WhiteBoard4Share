import { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAnchoredPopoverPosition } from '../hooks/useAnchoredPopoverPosition';
import { MAIN_COLOR_PALETTE, type TableToolSettings } from '../tableToolSettings';

interface TableOptionsPopoverProps {
  settings: TableToolSettings;
  onChange: (patch: Partial<TableToolSettings>) => void;
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
}

function swatchStyle(color: string): React.CSSProperties {
  return color === '#ffffff'
    ? { backgroundColor: color, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.12)' }
    : { backgroundColor: color };
}

function sliderFill(value: number, min: number, max: number): string {
  return `${((value - min) / (max - min)) * 100}%`;
}

export function TableOptionsPopover({
  settings,
  onChange,
  anchorRef,
  open,
  onClose,
}: TableOptionsPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const popoverStyle = useAnchoredPopoverPosition(anchorRef, popoverRef, open, [settings.fontSize], {
    fallbackWidth: 240,
    fallbackHeight: 220,
  });

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [anchorRef, onClose, open]);

  const handleFontSizeChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onChange({ fontSize: Number.parseInt(event.target.value, 10) });
    },
    [onChange],
  );

  if (!open) return null;

  return createPortal(
    <div
      ref={popoverRef}
      className="tool-options-popover table-options-popover"
      style={popoverStyle}
      role="dialog"
      aria-label="표 옵션"
    >
      <div className="tool-options-row">
        <span className="text-options-label">크기</span>
        <input
          type="range"
          min={10}
          max={32}
          step={1}
          value={settings.fontSize}
          onChange={handleFontSizeChange}
          className="tool-options-slider"
          style={{ backgroundSize: `${sliderFill(settings.fontSize, 10, 32)} 100%` }}
        />
        <span className="tool-options-value">{settings.fontSize}px</span>
      </div>
      <div className="tool-options-row">
        <span className="text-options-label">글자</span>
        <div className="tool-options-swatches">
          {MAIN_COLOR_PALETTE.map((color) => (
            <button
              key={color}
              type="button"
              className={`tool-options-swatch${settings.color === color ? ' active' : ''}`}
              style={swatchStyle(color)}
              onClick={() => onChange({ color })}
              aria-label={`글자색 ${color}`}
            />
          ))}
        </div>
      </div>
      <div className="tool-options-row">
        <span className="text-options-label">선</span>
        <div className="tool-options-swatches">
          {MAIN_COLOR_PALETTE.map((color) => (
            <button
              key={color}
              type="button"
              className={`tool-options-swatch${settings.borderColor === color ? ' active' : ''}`}
              style={swatchStyle(color)}
              onClick={() => onChange({ borderColor: color })}
              aria-label={`테두리색 ${color}`}
            />
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
