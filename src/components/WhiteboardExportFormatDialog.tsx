import {
  WHITEBOARD_FILE_EXTENSION,
  WHITEBOARD_JSON_EXTENSION,
  type WhiteboardFileExtension,
} from '../../shared/whiteboard-file.ts';

interface WhiteboardExportFormatDialogProps {
  open: boolean;
  title?: string;
  onClose: () => void;
  onSelect: (extension: WhiteboardFileExtension) => void;
}

export function WhiteboardExportFormatDialog({
  open,
  title = '화이트보드 내보내기',
  onClose,
  onSelect,
}: WhiteboardExportFormatDialogProps) {
  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wb-export-format-title"
        aria-describedby="wb-export-format-body"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="wb-export-format-title" className="modal-title">
          {title}
        </h2>
        <p id="wb-export-format-body" className="modal-body">
          저장할 파일 형식을 선택하세요. 내용은 동일하며, 확장자만 다릅니다.
        </p>
        <div className="modal-actions">
          <button
            type="button"
            className="modal-btn modal-btn--secondary"
            onClick={() => onSelect(WHITEBOARD_FILE_EXTENSION)}
          >
            {WHITEBOARD_FILE_EXTENSION}
          </button>
          <button
            type="button"
            className="modal-btn modal-btn--primary"
            onClick={() => onSelect(WHITEBOARD_JSON_EXTENSION)}
          >
            {WHITEBOARD_JSON_EXTENSION}
          </button>
          <button type="button" className="modal-btn modal-btn--secondary" onClick={onClose}>
            취소
          </button>
        </div>
      </div>
    </div>
  );
}
