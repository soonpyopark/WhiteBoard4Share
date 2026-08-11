import { useCallback, useEffect, useState } from 'react';
import { folderDisplayLabel, type FolderInfo } from '../../../shared/folders.ts';
import {
  createFolderApi,
  deleteFolderApi,
  fetchFolders,
  renameFolderApi,
  reorderFoldersApi,
} from '../../api/auth.ts';
import { useDeptSession } from '../../context/DeptSessionContext.tsx';
import { useAppDialogs } from '../useAppDialogs.tsx';

async function relaunchAppIfPossible(): Promise<boolean> {
  if (!window.wb4s?.relaunch) return false;
  await window.wb4s.relaunch();
  return true;
}

export function FoldersSettingsPanel() {
  const { alert: appAlert, confirm: appConfirm, dialogs } = useAppDialogs();
  const {
    folders: sessionFolders,
    setFolders,
    selectedDept,
    switchDept,
  } = useDeptSession();
  const [folders, setLocalFolders] = useState<FolderInfo[]>(sessionFolders);
  const [draftNames, setDraftNames] = useState<Record<string, string>>({});
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');

  const applyFolders = useCallback(
    (next: FolderInfo[]) => {
      setLocalFolders(next);
      setFolders(next);
      setDraftNames(Object.fromEntries(next.map((folder) => [folder.id, folder.name])));
    },
    [setFolders],
  );

  const refresh = useCallback(async () => {
    setLoadError('');
    try {
      const result = await fetchFolders();
      applyFolders(result.folders);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '폴더 목록을 불러오지 못했습니다.');
    }
  }, [applyFolders]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } catch (error) {
      await appAlert({
        title: '폴더 관리',
        body: error instanceof Error ? error.message : '요청에 실패했습니다.',
      });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = () =>
    void run(async () => {
      const result = await createFolderApi(newName);
      applyFolders(result.folders);
      setNewName('');
      await appAlert({
        title: '폴더 관리',
        body: `「${folderDisplayLabel(result.folder)}」폴더를 만들었습니다.`,
      });
    });

  const handleRename = (folder: FolderInfo) =>
    void run(async () => {
      const nextName = (draftNames[folder.id] ?? folder.name).trim();
      if (nextName === folder.name) return;

      const ok = await appConfirm({
        title: '폴더 이름 변경',
        body:
          `데이터 폴더 「${folder.name}」의 실제 이름을 「${nextName}」으로 바꿉니다.\n` +
          `공유 링크·회원 관리 폴더 설정도 함께 갱신되며, 적용을 위해 앱을 다시 시작합니다.`,
        confirmLabel: '이름 변경 후 재시작',
      });
      if (!ok) {
        setDraftNames((prev) => ({ ...prev, [folder.id]: folder.name }));
        return;
      }

      const result = await renameFolderApi(folder.id, nextName);
      applyFolders(result.folders);
      if (selectedDept === result.fromId) {
        await switchDept(result.toId);
      }

      if (result.requiresRestart) {
        const relaunched = await relaunchAppIfPossible();
        if (!relaunched) {
          await appAlert({
            title: '폴더 관리',
            body: '폴더 디렉터리 이름을 바꿨습니다. 서버(또는 앱)를 다시 시작해 주세요.',
          });
        }
      }
    });

  const handleMove = (index: number, direction: -1 | 1) =>
    void run(async () => {
      const target = index + direction;
      if (target < 0 || target >= folders.length) return;
      const ids = folders.map((folder) => folder.id);
      const [moved] = ids.splice(index, 1);
      ids.splice(target, 0, moved!);
      const result = await reorderFoldersApi(ids);
      applyFolders(result.folders);
    });

  const handleDelete = (folder: FolderInfo) =>
    void run(async () => {
      const ok = await appConfirm({
        title: '폴더 삭제',
        body: `「${folderDisplayLabel(folder)}」폴더를 삭제할까요?\n폴더 안의 화이트보드도 함께 삭제됩니다.`,
        confirmLabel: '삭제',
      });
      if (!ok) return;

      const applyDeleteResult = async (result: { folders: FolderInfo[] }) => {
        applyFolders(result.folders);
        if (selectedDept === folder.id && result.folders[0]) {
          await switchDept(result.folders[0].id);
        }
      };

      try {
        const result = await deleteFolderApi(folder.id);
        await applyDeleteResult(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : '폴더를 삭제하지 못했습니다.';
        if (!message.includes('화이트보드')) throw error;
        const force = await appConfirm({
          title: '폴더 삭제',
          body: `${message}\n그래도 폴더와 화이트보드를 모두 삭제할까요?`,
          confirmLabel: '강제 삭제',
        });
        if (!force) return;
        const result = await deleteFolderApi(folder.id, { force: true });
        await applyDeleteResult(result);
      }
    });

  if (loadError) {
    return (
      <div className="wb-settings-stack">
        <p className="wb-settings-error">{loadError}</p>
        <button type="button" className="modal-btn modal-btn--secondary" onClick={() => void refresh()}>
          다시 시도
        </button>
      </div>
    );
  }

  return (
    <div className="wb-settings-stack">
      {dialogs}

      <section className="wb-settings-section">
        <h3 className="wb-settings-section-title">폴더 관리</h3>
        <p className="wb-settings-help">
          폴더 이름은 데이터 디렉터리의 실제 폴더명입니다. 이름을 바꾸면 디스크의 폴더가
          이동하고, 앱이 다시 시작됩니다. ↑↓ 로 갤러리 표시 순서만 바꿀 수 있습니다.
        </p>

        <ul className="wb-folder-manage-list">
          {folders.map((folder, index) => (
            <li key={folder.id} className="wb-folder-manage-item">
              <div className="wb-folder-manage-main">
                <input
                  className="modal-input"
                  value={draftNames[folder.id] ?? folder.name}
                  disabled={busy}
                  aria-label={`${folderDisplayLabel(folder)} 이름`}
                  onChange={(event) =>
                    setDraftNames((prev) => ({
                      ...prev,
                      [folder.id]: event.target.value,
                    }))
                  }
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      handleRename(folder);
                    }
                  }}
                />
              </div>
              <div className="wb-folder-manage-actions">
                <button
                  type="button"
                  className="modal-btn modal-btn--secondary"
                  disabled={busy || index === 0}
                  aria-label="위로"
                  onClick={() => handleMove(index, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="modal-btn modal-btn--secondary"
                  disabled={busy || index >= folders.length - 1}
                  aria-label="아래로"
                  onClick={() => handleMove(index, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="modal-btn modal-btn--secondary"
                  disabled={busy || (draftNames[folder.id] ?? folder.name).trim() === folder.name}
                  onClick={() => handleRename(folder)}
                >
                  이름 변경
                </button>
                <button
                  type="button"
                  className="modal-btn modal-btn--danger"
                  disabled={busy || folders.length <= 1}
                  onClick={() => handleDelete(folder)}
                >
                  삭제
                </button>
              </div>
            </li>
          ))}
        </ul>

        <div className="wb-folder-manage-create">
          <input
            className="modal-input"
            placeholder="새 폴더 이름"
            value={newName}
            disabled={busy}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void handleCreate();
              }
            }}
          />
          <button
            type="button"
            className="modal-btn modal-btn--primary"
            disabled={busy || !newName.trim()}
            onClick={() => void handleCreate()}
          >
            폴더 추가
          </button>
        </div>
      </section>
    </div>
  );
}
