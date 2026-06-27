import { useEffect, useRef } from 'react';

interface ShareLinkCopiedDialogProps {
  open: boolean;
  url: string;
  onClose: () => void;
}

export function ShareLinkCopiedDialog({ open, url, onClose }: ShareLinkCopiedDialogProps) {
  const urlInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const input = urlInputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, [open, url]);

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
        <p className="modal-body share-link-dialog-hint">
          자동 복사가 되지 않으면 아래 링크를 선택해 복사하세요.
        </p>
        <input
          ref={urlInputRef}
          type="text"
          className="modal-input share-link-dialog-url"
          value={url}
          readOnly
          aria-label="공유 링크"
          onFocus={(e) => e.currentTarget.select()}
          onClick={(e) => e.currentTarget.select()}
        />
        <div className="modal-actions">
          <button type="button" className="modal-btn modal-btn--primary" onClick={onClose}>
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
