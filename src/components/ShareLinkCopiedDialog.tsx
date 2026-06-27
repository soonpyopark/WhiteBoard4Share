interface ShareLinkCopiedDialogProps {
  open: boolean;
  url: string;
  onClose: () => void;
}

export function ShareLinkCopiedDialog({ open, url, onClose }: ShareLinkCopiedDialogProps) {
  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-link-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="share-link-dialog-title" className="modal-title">
          공유링크가 복사되었습니다.
        </h2>
        <p className="modal-body share-link-dialog-url">{url}</p>
        <div className="modal-actions">
          <button type="button" className="modal-btn modal-btn--primary" onClick={onClose}>
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
