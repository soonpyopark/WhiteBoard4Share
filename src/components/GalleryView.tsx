import { useCallback, useEffect, useState, type DragEvent } from 'react';
import {
  copyWhiteboard,
  createShareLink,
  createWhiteboard,
  deleteWhiteboard,
  fetchWhiteboards,
  renameWhiteboard,
  reorderWhiteboards,
  revokeShareLink,
  updateShareVisibility,
} from '../api/whiteboards';
import type { WhiteboardSummary } from '../types/whiteboard';
import { GalleryAuthBar } from './GalleryAuthBar';
import { HomeButton } from './HomeButton';
import { WhiteboardCard } from './WhiteboardCard';
import { useDeptSession } from '../context/DeptSessionContext';

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
    loading: sessionLoading,
  } = useDeptSession();

  const [boards, setBoards] = useState<WhiteboardSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

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
      setBoards(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : '목록을 불러올 수 없습니다');
    } finally {
      setLoading(false);
    }
  }, [authenticated, selectedDept]);

  useEffect(() => {
    if (sessionLoading) return;
    void load();
  }, [load, sessionLoading]);

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
      onCreate(doc.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : '생성에 실패했습니다');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteWhiteboard(id);
      setBoards((prev) => prev.filter((b) => b.id !== id));
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
      <header className="gallery-header">
        <div className="gallery-header-left">
          <HomeButton onAppHome={handleAppHome} />
          <h1 className="gallery-title">
            WhiteBoard4Share <span className="gallery-version">v1.0.1</span>
          </h1>
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
            )}

            {boards.map((board) => (
              <WhiteboardCard
                key={board.id}
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
