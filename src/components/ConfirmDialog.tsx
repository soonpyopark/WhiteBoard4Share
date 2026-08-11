interface ConfirmDialogProps {
  open: boolean;
  title?: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Two-button confirm dialog (공유·업데이트 확인 등). */
export function ConfirmDialog({
  open,
  title = '확인',
  body,
  confirmLabel = '확인',
  cancelLabel = '취소',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-body"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="confirm-dialog-title" className="modal-title">
          {title}
        </h2>
        <p id="confirm-dialog-body" className="modal-body modal-body--preline">
          {body}
        </p>
        <div className="modal-actions">
          <button type="button" className="modal-btn modal-btn--primary" onClick={onConfirm}>
            {confirmLabel}
          </button>
          <button type="button" className="modal-btn modal-btn--secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
