interface AlertDialogProps {
  open: boolean;
  title?: string;
  body: string;
  confirmLabel?: string;
  onClose: () => void;
}

export function AlertDialog({
  open,
  title = '알림',
  body,
  confirmLabel = '확인',
  onClose,
}: AlertDialogProps) {
  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="alert-dialog-title"
        aria-describedby="alert-dialog-body"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="alert-dialog-title" className="modal-title">
          {title}
        </h2>
        <p id="alert-dialog-body" className="modal-body modal-body--preline">
          {body}
        </p>
        <div className="modal-actions">
          <button type="button" className="modal-btn modal-btn--primary" onClick={onClose}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
