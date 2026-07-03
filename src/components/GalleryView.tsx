import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import {
  copyWhiteboard,
  createShareLink,
  createWhiteboard,
  deleteWhiteboard,
  fetchWhiteboards,
  renameWhiteboard,
  reorderWhiteboards,
  revokeShareLink,
  saveWhiteboard,
  updateShareVisibility,
} from '../api/whiteboards';
import type { WhiteboardSummary } from '../types/whiteboard';
import { GalleryAuthBar } from './GalleryAuthBar';
import { HomeButton } from './HomeButton';
import { SplashOverlay } from './SplashOverlay';
import { WhiteboardCard } from './WhiteboardCard';
import { useDeptSession } from '../context/DeptSessionContext';
import { useGalleryCollab } from '../hooks/useGalleryCollab';
import { documentToSummary, mergeGalleryBoardRemote } from '../lib/collab/gallery-sync';
import { parseWhiteboardFile } from '../lib/whiteboard/whiteboardFile';
import { WHITEBOARD_FILE_EXTENSION } from '../../shared/whiteboard-file';
import { canViewWhiteboardInGallery } from '../../shared/auth';
import { APP_CONFIG } from '../appConfig';

interface GalleryViewProps {
  onOpen: (id: string) => void;
  onCreate: (id: string) => void;
  onAppHome?: () => void;
}

function moveBoard(
  boards: WhiteboardSummary[],
  draggedId: string,
  targetId: string,
): WhiteboardSummary[] | null {
  if (draggedId === targetId) return null;

  const fromIndex = boards.findIndex((board) => board.id === draggedId);
  const toIndex = boards.findIndex((board) => board.id === targetId);
  if (fromIndex < 0 || toIndex < 0) return null;

  const next = [...boards];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

export function GalleryView({ onOpen, onCreate, onAppHome }: GalleryViewProps) {
  const {
    authenticated,
    selectedDept,
    canCreateWhiteboard,
    role,
    loading: sessionLoading,
    homeUrl,
    homeTarget,
  } = useDeptSession();

  const [boards, setBoards] = useState<WhiteboardSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [splashOpen, setSplashOpen] = useState(false);
  const deletedBoardIdsRef = useRef<Set<string>>(new Set());
  const importInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!authenticated) {
      setBoards([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const list = await fetchWhiteboards();
      setBoards(list.filter((board) => !deletedBoardIdsRef.current.has(board.id)));
    } catch (err) {
      setError(err instanceof Error ? err.message : '목록을 불러올 수 없습니다');
    } finally {
      setLoading(false);
    }
  }, [authenticated, selectedDept]);

  useEffect(() => {
    if (sessionLoading) return;
    setBoards([]);
    void load();
  }, [load, sessionLoading]);

  const handleRemoteDelete = useCallback((id: string) => {
    deletedBoardIdsRef.current.add(id);
    setBoards((prev) => prev.filter((board) => board.id !== id));
  }, []);

  const handleDeletedIdsChange = useCallback((deletedIds: string[]) => {
    deletedBoardIdsRef.current = new Set(deletedIds);
    setBoards((prev) => prev.filter((board) => !deletedBoardIdsRef.current.has(board.id)));
  }, []);

  const handleRemoteCreate = useCallback((board: WhiteboardSummary) => {
    if (deletedBoardIdsRef.current.has(board.id)) return;
    setBoards((prev) => {
      if (prev.some((item) => item.id === board.id)) return prev;
      return [board, ...prev];
    });
  }, []);

  const handleRemoteVisibility = useCallback(
    (board: WhiteboardSummary) => {
      if (deletedBoardIdsRef.current.has(board.id)) return;

      const session = { role: role ?? 'user', byDept: selectedDept };
      const canView = canViewWhiteboardInGallery(session, board, selectedDept);

      setBoards((prev) => {
        const index = prev.findIndex((item) => item.id === board.id);

        if (!canView) {
          if (index < 0) return prev;
          return prev.filter((item) => item.id !== board.id);
        }

        if (index >= 0) {
          return prev.map((item) =>
            item.id === board.id ? mergeGalleryBoardRemote(item, board) : item,
          );
        }

        return [board, ...prev];
      });
    },
    [role, selectedDept],
  );

  const { publishDelete, publishCreate, publishVisibility } = useGalleryCollab(
    selectedDept,
    authenticated && !sessionLoading,
    handleRemoteDelete,
    handleRemoteCreate,
    handleRemoteVisibility,
    handleDeletedIdsChange,
  );

  const persistOrder = useCallback(async (nextBoards: WhiteboardSummary[]) => {
    try {
      const ordered = await reorderWhiteboards(nextBoards.map((board) => board.id));
      setBoards(ordered);
    } catch (err) {
      setError(err instanceof Error ? err.message : '순서 저장에 실패했습니다');
      await load();
    }
  }, [load]);

  const handleDragStart = useCallback((boardId: string) => {
    setDraggingId(boardId);
    setDragOverId(null);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
    setDragOverId(null);
  }, []);

  const handleDragOver = useCallback(
    (event: DragEvent<HTMLElement>, boardId: string) => {
      if (!draggingId || draggingId === boardId) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      setDragOverId(boardId);
    },
    [draggingId],
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLElement>, targetId: string) => {
      event.preventDefault();
      if (!draggingId) return;

      const next = moveBoard(boards, draggingId, targetId);
      setDraggingId(null);
      setDragOverId(null);
      if (!next) return;

      setBoards(next);
      void persistOrder(next);
    },
    [boards, draggingId, persistOrder],
  );

  const handleCreate = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const doc = await createWhiteboard();
      publishCreate(documentToSummary(doc));
      onCreate(doc.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : '생성에 실패했습니다');
    } finally {
      setCreating(false);
    }
  };

  const handleImportClick = () => {
    if (importing) return;
    importInputRef.current?.click();
  };

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || importing) return;

    setImporting(true);
    setError(null);
    try {
      const payload = await parseWhiteboardFile(file);
      const doc = await createWhiteboard();
      const saved = await saveWhiteboard(doc.id, payload);
      publishCreate(documentToSummary(saved));
      onCreate(saved.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : '파일을 불러오지 못했습니다');
    } finally {
      setImporting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteWhiteboard(id);
      deletedBoardIdsRef.current.add(id);
      setBoards((prev) => prev.filter((b) => b.id !== id));
      publishDelete(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : '삭제에 실패했습니다');
    }
  };

  const handleRename = async (id: string, title: string) => {
    try {
      const doc = await renameWhiteboard(id, title);
      setBoards((prev) =>
        prev.map((b) =>
          b.id === id ? { ...b, title: doc.title, updatedAt: doc.updatedAt } : b,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '이름 변경에 실패했습니다');
    }
  };

  const handleCopy = async (id: string) => {
    try {
      await copyWhiteboard(id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '복사에 실패했습니다');
    }
  };

  const handleCreateShareLink = async (id: string) => {
    try {
      const { shareToken } = await createShareLink(id);
      setBoards((prev) =>
        prev.map((board) => (board.id === id ? { ...board, shareToken } : board)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '공유 링크 생성에 실패했습니다');
    }
  };

  const handleRevokeShareLink = async (id: string) => {
    try {
      await revokeShareLink(id);
      setBoards((prev) =>
        prev.map((board) =>
          board.id === id ? { ...board, shareToken: undefined } : board,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '공유 링크 해제에 실패했습니다');
    }
  };

  const handleUpdateShareVisibility = async (
    id: string,
    visibility: { isPrivate: boolean; isViewRestricted: boolean },
  ) => {
    try {
      const updated = await updateShareVisibility(id, visibility);
      setBoards((prev) =>
        prev.map((board) =>
          board.id === id
            ? {
                ...board,
                isPrivate: updated.isPrivate,
                isViewRestricted: updated.isViewRestricted,
                updatedAt: updated.updatedAt,
              }
            : board,
        ),
      );
      publishVisibility(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : '공유 설정 저장에 실패했습니다');
    }
  };

  const handleAppHome = () => {
    onAppHome?.();
    window.scrollTo(0, 0);
    document.querySelector('.gallery-main')?.scrollTo(0, 0);
    void load();
  };

  return (
    <div className="gallery">
      <SplashOverlay open={splashOpen} onClose={() => setSplashOpen(false)} />
      <header className="gallery-header">
        <div className="gallery-header-left">
          <HomeButton onAppHome={handleAppHome} homeUrl={homeUrl} homeTarget={homeTarget} />
          <button
            type="button"
            className="gallery-title-btn"
            onClick={() => setSplashOpen(true)}
            aria-label={`${APP_CONFIG.title} 정보 보기`}
          >
            <span className="gallery-title">
              {APP_CONFIG.title}{' '}
              <span className="gallery-version">v{APP_CONFIG.version}</span>
            </span>
          </button>
        </div>
        <div className="gallery-header-actions">
          <GalleryAuthBar />
        </div>
      </header>

      <main className="gallery-main">
        {error && (
          <div className="gallery-error" role="alert">
            {error}
            <button type="button" onClick={load}>
              다시 시도
            </button>
          </div>
        )}

        {sessionLoading || loading ? (
          <p className="gallery-loading">불러오는 중…</p>
        ) : boards.length === 0 && !canCreateWhiteboard ? (
          <div className="gallery-empty">
            <p className="gallery-login-hint">
              등록된 화이트보드가 없습니다.
              <br />
              관리자가 생성하면 함께 편집할 수 있습니다.
            </p>
          </div>
        ) : (
          <div className="gallery-grid">
            {canCreateWhiteboard && (
              <>
                <input
                  ref={importInputRef}
                  type="file"
                  accept={`.wb4s,application/json,*${WHITEBOARD_FILE_EXTENSION}`}
                  className="gallery-import-input"
                  aria-hidden="true"
                  tabIndex={-1}
                  onChange={(event) => void handleImportFile(event)}
                />
                <button
                  type="button"
                  className="load-whiteboard-card"
                  onClick={handleImportClick}
                  disabled={importing}
                >
                  <span className="load-card-icon">↑</span>
                  <span className="load-card-label">
                    {importing ? '불러오는 중…' : '파일 불러오기'}
                  </span>
                </button>
                <button
                  type="button"
                  className="new-whiteboard-card"
                  onClick={handleCreate}
                  disabled={creating}
                >
                  <span className="new-card-icon">+</span>
                  <span className="new-card-label">
                    {creating ? '생성 중…' : '새 화이트보드'}
                  </span>
                </button>
              </>
            )}

            {boards.map((board) => (
              <WhiteboardCard
                key={`${selectedDept}-${board.id}`}
                board={board}
                onOpen={onOpen}
                onDelete={canCreateWhiteboard ? handleDelete : undefined}
                onRename={canCreateWhiteboard ? handleRename : undefined}
                onCopy={canCreateWhiteboard ? handleCopy : undefined}
                onCreateShareLink={canCreateWhiteboard ? handleCreateShareLink : undefined}
                onRevokeShareLink={canCreateWhiteboard ? handleRevokeShareLink : undefined}
                onUpdateShareVisibility={
                  canCreateWhiteboard ? handleUpdateShareVisibility : undefined
                }
                canManage={canCreateWhiteboard}
                isDragging={draggingId === board.id}
                isDragOver={dragOverId === board.id && draggingId !== board.id}
                onDragStart={
                  canCreateWhiteboard ? () => handleDragStart(board.id) : undefined
                }
                onDragEnd={canCreateWhiteboard ? handleDragEnd : undefined}
                onDragOver={
                  canCreateWhiteboard
                    ? (event) => handleDragOver(event, board.id)
                    : undefined
                }
                onDragLeave={
                  canCreateWhiteboard
                    ? () => {
                        if (dragOverId === board.id) {
                          setDragOverId(null);
                        }
                      }
                    : undefined
                }
                onDrop={
                  canCreateWhiteboard ? (event) => handleDrop(event, board.id) : undefined
                }
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
