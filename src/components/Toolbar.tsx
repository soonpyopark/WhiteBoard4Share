import { type ReactNode, type RefObject } from 'react';
import { truncateTitle, EDITOR_TITLE_SLOT_CHAR_COUNT } from '../utils/truncateText';

interface ToolbarProps {
  title: string;
  editingTitle: boolean;
  draftTitle: string;
  titleInputRef: RefObject<HTMLInputElement | null>;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  hasSelection: boolean;
  onBack: () => void;
  showBackButton?: boolean;
  onStartEditTitle: () => void;
  onDraftTitleChange: (value: string) => void;
  onCommitTitle: () => void;
  onCancelEditTitle: () => void;
  onExportImage: () => void;
  onExportFile: () => void;
  onShare: () => void;
  hideShare?: boolean;
  shareDisabled?: boolean;
  onDelete: () => void;
  onClear: () => void;
  collabStatus?: ReactNode;
}

export function Toolbar({
  title,
  editingTitle,
  draftTitle,
  titleInputRef,
  saveStatus,
  hasSelection,
  onBack,
  showBackButton = true,
  onStartEditTitle,
  onDraftTitleChange,
  onCommitTitle,
  onCancelEditTitle,
  onExportImage,
  onExportFile,
  onShare,
  hideShare = false,
  shareDisabled = false,
  onDelete,
  onClear,
  collabStatus,
}: ToolbarProps) {
  const { display: titleDisplay, truncated: titleTruncated } = truncateTitle(title);

  return (
    <header className="editor-toolbar">
      <div className="editor-toolbar__top">
        <div className="editor-toolbar__leading">
          {showBackButton && (
            <button type="button" className="back-btn" onClick={onBack}>
              ← 갤러리
            </button>
          )}
          <div
            className="editor-toolbar__title"
            style={{ '--title-slot-chars': EDITOR_TITLE_SLOT_CHAR_COUNT } as React.CSSProperties}
          >
            {editingTitle ? (
              <input
                ref={titleInputRef}
                type="text"
                className="editor-doc-title-input"
                value={draftTitle}
                onChange={(e) => onDraftTitleChange(e.target.value)}
                onBlur={onCommitTitle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    onCommitTitle();
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    onCancelEditTitle();
                  }
                }}
                aria-label="화이트보드 제목"
              />
            ) : (
              <button
                type="button"
                className="editor-doc-title"
                onClick={onStartEditTitle}
                aria-label={titleTruncated ? `제목: ${title}` : undefined}
              >
                <span className="editor-doc-title__text">{titleDisplay}</span>
                {titleTruncated && (
                  <span className="editor-doc-title__tooltip" role="tooltip">
                    {title}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>

        <div className="editor-toolbar__trailing">
          <div className="editor-toolbar__meta">
            {collabStatus ? (
              <div className="editor-toolbar__collab">{collabStatus}</div>
            ) : null}
            <span className={`save-status save-status--${saveStatus}`} aria-live="polite">
              {saveStatus === 'saving' && '저장 중…'}
              {saveStatus === 'saved' && '저장됨'}
              {saveStatus === 'error' && '저장 실패'}
            </span>
          </div>
          <div className="editor-toolbar__buttons">
            <div className="editor-toolbar__buttons-leading">
              <button
                type="button"
                className="action-btn delete-btn"
                onClick={onDelete}
                disabled={!hasSelection}
                title="선택 삭제 (Delete)"
              >
                🗑 삭제
              </button>
              <button
                type="button"
                className="action-btn action-btn--wide share-btn"
                onClick={onShare}
                disabled={shareDisabled}
                title="작성한 내용을 저장하고 공유"
                hidden={hideShare}
              >
                작성 내용 저장
              </button>
            </div>
            <div className="editor-toolbar__buttons-trailing">
              <button
                type="button"
                className="action-btn action-btn--wide export-btn"
                onClick={onExportImage}
                title="화이트보드를 PNG 이미지로 저장"
              >
                이미지로 저장
              </button>
              <button
                type="button"
                className="action-btn action-btn--wide file-export-btn"
                onClick={onExportFile}
                title="화이트보드를 파일로 저장"
              >
                파일로 저장
              </button>
              <button
                type="button"
                className="action-btn action-btn--wide clear-btn"
                onClick={onClear}
                title="전체 지우기"
              >
                전체 지우기
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
