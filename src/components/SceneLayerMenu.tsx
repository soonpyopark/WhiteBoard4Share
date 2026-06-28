import { useEffect, useRef } from 'react';
import type { DrawingEngine } from '../engine/drawingEngine';
import type { LayerMove } from '../engine/sceneObject';
import { isTableObject } from '../engine/types';
import { exportTableToExcel } from '../lib/table/exportTableToExcel';

interface SceneLayerMenuProps {
  x: number;
  y: number;
  engineRef: React.MutableRefObject<DrawingEngine | null>;
  onClose: () => void;
  onChange: () => void;
  onDeleteRequest?: () => void;
}

const MENU_ITEMS: { id: LayerMove; label: string }[] = [
  { id: 'front', label: '맨 위로' },
  { id: 'forward', label: '위로' },
  { id: 'backward', label: '아래로' },
  { id: 'back', label: '맨 아래로' },
];

export function SceneLayerMenu({ x, y, engineRef, onClose, onChange, onDeleteRequest }: SceneLayerMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      onClose();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;

    const rect = menu.getBoundingClientRect();
    const padding = 8;
    let left = x;
    let top = y;

    if (left + rect.width > window.innerWidth - padding) {
      left = window.innerWidth - rect.width - padding;
    }
    if (top + rect.height > window.innerHeight - padding) {
      top = window.innerHeight - rect.height - padding;
    }
    if (left < padding) left = padding;
    if (top < padding) top = padding;

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }, [x, y]);

  const handleAction = (move: LayerMove) => {
    const engine = engineRef.current;
    if (!engine?.reorderSelected(move)) return;
    onChange();
    onClose();
  };

  const handleDelete = () => {
    const engine = engineRef.current;
    if (!engine || engine.getSelectedIds().length === 0) return;
    onClose();
    onDeleteRequest?.();
  };

  const engine = engineRef.current;
  const hasSelection = (engine?.getSelectedIds().length ?? 0) > 0;
  const selected = engine?.getSelectedObject() ?? null;
  const canExportTable =
    (engine?.getSelectedIds().length ?? 0) === 1 && selected !== null && isTableObject(selected);

  const handleExportExcel = () => {
    if (!selected || !isTableObject(selected)) return;
    void exportTableToExcel(selected);
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className="scene-layer-menu"
      style={{ left: x, top: y }}
      role="menu"
      aria-label="개체 메뉴"
    >
      {MENU_ITEMS.map(({ id, label }) => {
        const disabled = !engine?.canReorderSelected(id);
        return (
          <button
            key={id}
            type="button"
            role="menuitem"
            className="scene-layer-menu__item"
            disabled={disabled}
            onClick={() => handleAction(id)}
          >
            {label}
          </button>
        );
      })}
      <div className="scene-layer-menu__divider" role="separator" />
      {canExportTable && (
        <button
          type="button"
          role="menuitem"
          className="scene-layer-menu__item"
          onClick={handleExportExcel}
        >
          엑셀로 저장
        </button>
      )}
      <button
        type="button"
        role="menuitem"
        className="scene-layer-menu__item scene-layer-menu__item--danger"
        disabled={!hasSelection}
        onClick={handleDelete}
      >
        개체 삭제
      </button>
    </div>
  );
}
