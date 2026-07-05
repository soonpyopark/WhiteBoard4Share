import { useEffect, useRef, useState, type DragEvent } from 'react';
import { formatEditedDate } from '../api/whiteboards';
import type { WhiteboardSummary } from '../types/whiteboard';
import { buildShareLinkUrl } from '../utils/shareLink.ts';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';
import { RenameDialog } from './RenameDialog';
import { ShareLinkCopiedDialog } from './ShareLinkCopiedDialog';
import { ThumbnailPreview } from './ThumbnailPreview';

interface WhiteboardCardProps {
  board: WhiteboardSummary;
  onOpen: (id: string) => void;
  onDelete?: (id: string) => void;
  onRename?: (id: string, title: string) => void;
  onCopy?: (id: string) => void;
  onCreateShareLink?: (id: string) => void;
  onRevokeShareLink?: (id: string) => void;
  onUpdateShareVisibility?: (
    id: string,
    visibility: { isPrivate: boolean; isViewRestricted: boolean },
  ) => void;
  canManage?: boolean;
  isDragging?: boolean;
  isDragOver?: boolean;
  onDragStart?: (event: DragEvent<HTMLButtonElement>) => void;
  onDragEnd?: () => void;
  onDragOver?: (event: DragEvent<HTMLElement>) => void;
  onDragLeave?: () => void;
  onDrop?: (event: DragEvent<HTMLElement>) => void;
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

function LinkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="7.5" cy="15.5" r="5.5" />
      <path d="m21 2-9.6 9.6" />
      <path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

export function WhiteboardCard({
  board,
  onOpen,
  onDelete,
  onRename,
  onCopy,
  onCreateShareLink,
  onRevokeShareLink,
  onUpdateShareVisibility,
  canManage = false,
  isDragging = false,
  isDragOver = false,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: WhiteboardCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [shareLinkDialogOpen, setShareLinkDialogOpen] = useState(false);
  const [shareLinkUrl, setShareLinkUrl] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    if (!menuOpen) return;

    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  const openRename = () => {
    setMenuOpen(false);
    setRenameOpen(true);
  };

  const openCopy = () => {
    setMenuOpen(false);
    onCopy?.(board.id);
  };

  const openDelete = () => {
    setMenuOpen(false);
    setDeleteOpen(true);
  };

  const openCreateShareLink = () => {
    setMenuOpen(false);
    onCreateShareLink?.(board.id);
  };

  const openRevokeShareLink = () => {
    setMenuOpen(false);
    onRevokeShareLink?.(board.id);
  };

  const confirmRename = (title: string) => {
    setRenameOpen(false);
    if (title !== board.title) {
      onRename?.(board.id, title);
    }
  };

  const confirmDelete = () => {
    setDeleteOpen(false);
    onDelete?.(board.id);
  };

  const handleCopyShareLink = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!board.shareToken) return;

    const url = buildShareLinkUrl(board.shareToken);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* clipboard may fail on insecure contexts */
    }

    setShareLinkUrl(url);
    setShareLinkDialogOpen(true);
  };

  const handleDragStart = (event: DragEvent<HTMLButtonElement>) => {
    suppressClickRef.current = true;
    if (cardRef.current) {
      event.dataTransfer.setDragImage(
        cardRef.current,
        cardRef.current.offsetWidth / 2,
        cardRef.current.offsetHeight / 2,
      );
    }
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', board.id);
    onDragStart?.(event);
  };

  const handleDragEnd = () => {
    onDragEnd?.();
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  };

  const handlePreviewClick = () => {
    if (suppressClickRef.current) return;
    onOpen(board.id);
  };

  return (
    <>
      <article
        ref={cardRef}
        className={`whiteboard-card${isDragging ? ' whiteboard-card--dragging' : ''}${isDragOver ? ' whiteboard-card--drag-over' : ''}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <div className="card-preview-wrap">
          <button
            type="button"
            className={`card-preview-btn${canManage ? ' card-preview-btn--draggable' : ''}`}
            draggable={canManage}
            onClick={handlePreviewClick}
            onDragStart={canManage ? handleDragStart : undefined}
            onDragEnd={canManage ? handleDragEnd : undefined}
            aria-label={
              canManage ? `${board.title} 열기 또는 드래그하여 순서 변경` : `${board.title} 열기`
            }
            title={canManage ? '클릭하여 열기, 드래그하여 순서 변경' : undefined}
          >
            <div className="card-preview">
              <ThumbnailPreview
                thumbnail={board.thumbnail}
                cacheKey={`${board.id}-${board.updatedAt}`}
                alt={`${board.title} 미리보기`}
              />
            </div>
          </button>
          {canManage && (
            <div className="card-share-tags-overlay">
              <button
                type="button"
                className={`card-status-tag card-status-tag--private${
                  board.isPrivate ? ' card-status-tag--active' : ' card-status-tag--inactive'
                }`}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  const isPrivate = !(board.isPrivate ?? false);
                  onUpdateShareVisibility?.(board.id, {
                    isPrivate,
                    isViewRestricted: isPrivate ? (board.isViewRestricted ?? false) : false,
                  });
                }}
                aria-pressed={board.isPrivate ?? false}
                title="비공개"
                aria-label="비공개"
              >
                <span className="card-status-tag__label" aria-hidden="true">
                  비
                </span>
              </button>
              <button
                type="button"
                className={`card-status-tag card-status-tag--restricted${
                  (board.isPrivate ?? false) && (board.isViewRestricted ?? false)
                    ? ' card-status-tag--active'
                    : ' card-status-tag--inactive'
                }`}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (!(board.isPrivate ?? false)) return;
                  onUpdateShareVisibility?.(board.id, {
                    isPrivate: true,
                    isViewRestricted: !(board.isViewRestricted ?? false),
                  });
                }}
                disabled={!(board.isPrivate ?? false)}
                aria-pressed={(board.isPrivate ?? false) && (board.isViewRestricted ?? false)}
                title="열람제한"
                aria-label="열람제한"
              >
                <span className="card-status-tag__icon card-status-tag__icon--key" aria-hidden="true">
                  <KeyIcon />
                </span>
              </button>
              <button
                type="button"
                className={`card-status-tag card-status-tag--sharing${
                  board.shareToken ? ' card-status-tag--active' : ' card-status-tag--inactive'
                }`}
                onClick={(event) => {
                  if (!board.shareToken) {
                    event.preventDefault();
                    event.stopPropagation();
                    return;
                  }
                  void handleCopyShareLink(event);
                }}
                disabled={!board.shareToken}
                title={board.shareToken ? '공유 링크 복사' : '공유 안 함'}
                aria-pressed={!!board.shareToken}
                aria-label="공유"
              >
                <span className="card-status-tag__icon card-status-tag__icon--link" aria-hidden="true">
                  <LinkIcon />
                </span>
              </button>
            </div>
          )}
        </div>

        <div className="card-meta">
          <div className="card-title-block">
            <button
              type="button"
              className="card-title-btn"
              onClick={() => onOpen(board.id)}
              title={board.title}
            >
              <span className="card-title">{board.title}</span>
              <span className="card-date">{formatEditedDate(board.updatedAt)}</span>
            </button>
          </div>

          {canManage && (
            <div className="card-menu-wrap" ref={menuRef}>
              <button
                type="button"
                className="card-menu-btn"
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="더 보기"
                aria-expanded={menuOpen}
              >
                ···
              </button>
              {menuOpen && (
                <div className="card-menu">
                  {board.shareToken ? (
                    <button type="button" className="card-menu-item" onClick={openRevokeShareLink}>
                      <span className="card-menu-icon">
                        <LinkIcon />
                      </span>
                      공유링크해제
                    </button>
                  ) : (
                    <button type="button" className="card-menu-item" onClick={openCreateShareLink}>
                      <span className="card-menu-icon">
                        <LinkIcon />
                      </span>
                      공유링크생성
                    </button>
                  )}
                  <button type="button" className="card-menu-item" onClick={openRename}>
                    <span className="card-menu-icon">
                      <PencilIcon />
                    </span>
                    이름 바꾸기
                  </button>
                  <button type="button" className="card-menu-item" onClick={openCopy}>
                    <span className="card-menu-icon">
                      <CopyIcon />
                    </span>
                    복사
                  </button>
                  <button type="button" className="card-menu-item danger" onClick={openDelete}>
                    <span className="card-menu-icon">
                      <TrashIcon />
                    </span>
                    삭제
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </article>

      <ShareLinkCopiedDialog
        open={shareLinkDialogOpen}
        url={shareLinkUrl}
        onClose={() => setShareLinkDialogOpen(false)}
      />

      <RenameDialog
        open={renameOpen}
        initialTitle={board.title}
        onConfirm={confirmRename}
        onCancel={() => setRenameOpen(false)}
      />

      <DeleteConfirmDialog
        open={deleteOpen}
        title="화이트보드 삭제"
        body={`「${board.title}」을(를) 삭제합니다. 삭제하면 영구적으로 제거되며, 다른 사용자 갤러리에서도 즉시 사라집니다.`}
        confirmLabel="삭제"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteOpen(false)}
      />
    </>
  );
}
