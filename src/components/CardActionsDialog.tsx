interface CardActionsDialogProps {
  open: boolean;
  boardTitle: string;
  hasShareLink: boolean;
  onClose: () => void;
  onShareLink: () => void;
  onRename: () => void;
  onCopy: () => void;
  onExport: () => void;
  onDelete: () => void;
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function ExportIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

export function CardActionsDialog({
  open,
  boardTitle,
  hasShareLink,
  onClose,
  onShareLink,
  onRename,
  onCopy,
  onExport,
  onDelete,
}: CardActionsDialogProps) {
  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-dialog card-actions-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="card-actions-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="card-actions-dialog-title" className="modal-title">
          화이트보드 작업
        </h2>
        <p className="modal-body card-actions-dialog-subtitle" title={boardTitle}>
          {boardTitle}
        </p>
        <div className="card-actions-list" role="menu">
          <button type="button" className="card-actions-item" role="menuitem" onClick={onShareLink}>
            <span className="card-actions-icon">
              <LinkIcon />
            </span>
            {hasShareLink ? '공유링크해제' : '공유링크생성'}
          </button>
          <button type="button" className="card-actions-item" role="menuitem" onClick={onRename}>
            <span className="card-actions-icon">
              <PencilIcon />
            </span>
            이름 바꾸기
          </button>
          <button type="button" className="card-actions-item" role="menuitem" onClick={onCopy}>
            <span className="card-actions-icon">
              <CopyIcon />
            </span>
            복사
          </button>
          <button type="button" className="card-actions-item" role="menuitem" onClick={onExport}>
            <span className="card-actions-icon">
              <ExportIcon />
            </span>
            내보내기
          </button>
          <button
            type="button"
            className="card-actions-item danger"
            role="menuitem"
            onClick={onDelete}
          >
            <span className="card-actions-icon">
              <TrashIcon />
            </span>
            삭제
          </button>
        </div>
        <div className="modal-actions">
          <button type="button" className="modal-btn modal-btn--secondary" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
