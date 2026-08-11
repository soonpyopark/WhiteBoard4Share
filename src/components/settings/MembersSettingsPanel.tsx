import { useCallback, useEffect, useMemo, useState } from 'react';
import type { UserRole } from '../../../shared/auth.ts';
import { memberRoleToLabel, type PublicMember } from '../../../shared/members.ts';
import { fetchMembers, saveMembers, type MemberUpsertDto } from '../../api/settings.ts';
import { useDeptSession } from '../../context/DeptSessionContext.tsx';
import { useAppDialogs } from '../useAppDialogs.tsx';

type MemberDraft = PublicMember & {
  password?: string;
  isNew?: boolean;
  markedDelete?: boolean;
};

function createDraft(member: PublicMember): MemberDraft {
  return { ...member, password: '', isNew: false, markedDelete: false };
}

function createNewDraft(departments: string[]): MemberDraft {
  return {
    id: `new-${Date.now()}`,
    username: '',
    role: 'user',
    hasPassword: false,
    disabled: false,
    adminDept: departments[0],
    password: '',
    isNew: true,
    markedDelete: false,
  };
}

export function MembersSettingsPanel() {
  const { alert: appAlert, confirm: appConfirm, dialogs } = useAppDialogs();
  const { folders } = useDeptSession();
  const departments = folders.map((folder) => folder.id);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [members, setMembers] = useState<MemberDraft[]>([]);
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const loadMembers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await fetchMembers();
      setMembers((result.members ?? []).map(createDraft));
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '회원 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members.filter((m) => {
      if (m.markedDelete) return false;
      if (!q) return true;
      return (
        m.username.toLowerCase().includes(q) ||
        (m.displayName ?? '').toLowerCase().includes(q) ||
        memberRoleToLabel(m.role).includes(query.trim())
      );
    });
  }, [members, query]);

  const updateDraft = (id: string, patch: Partial<MemberDraft>) => {
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  };

  const handleAdd = () => {
    const draft = createNewDraft(departments);
    setMembers((prev) => [draft, ...prev]);
    setEditingId(draft.id);
  };

  const handleDelete = async (id: string) => {
    const target = members.find((m) => m.id === id);
    if (!target) return;
    const ok = await appConfirm({
      title: '회원 삭제',
      body: `「${target.username || '새 회원'}」을(를) 삭제할까요?`,
      confirmLabel: '삭제',
    });
    if (!ok) return;
    if (target.isNew) {
      setMembers((prev) => prev.filter((m) => m.id !== id));
      return;
    }
    updateDraft(id, { markedDelete: true });
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const payload: MemberUpsertDto[] = [];
      for (const member of members) {
        if (member.markedDelete) continue;
        const username = member.username.trim();
        if (!username) {
          throw new Error('아이디가 비어 있는 회원이 있습니다.');
        }
        if (member.isNew && !member.password) {
          throw new Error(`${username}: 새 회원의 비밀번호를 입력하세요.`);
        }
        if (member.role === 'dept' && !member.adminDept?.trim()) {
          throw new Error(`${username}: 폴더관리자의 관리 폴더를 선택하세요.`);
        }
        payload.push({
          id: member.isNew ? undefined : member.id,
          username,
          role: member.role,
          password: member.password || undefined,
          adminDept: member.role === 'dept' ? member.adminDept : undefined,
          disabled: Boolean(member.disabled),
          displayName: member.displayName?.trim() || undefined,
        });
      }

      const result = await saveMembers(payload);
      setMembers(result.members.map(createDraft));
      setEditingId(null);
      await appAlert({ title: '회원 관리', body: '회원 정보를 저장했습니다.' });
    } catch (err) {
      await appAlert({
        title: '회원 관리',
        body: err instanceof Error ? err.message : '회원 정보를 저장하지 못했습니다.',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="wb-settings-muted">회원 목록을 불러오는 중…</p>;
  }

  if (error) {
    return (
      <div className="wb-settings-stack">
        <p className="wb-settings-error">{error}</p>
        <button
          type="button"
          className="modal-btn modal-btn--secondary"
          onClick={() => void loadMembers()}
        >
          다시 시도
        </button>
      </div>
    );
  }

  return (
    <div className="wb-settings-stack">
      {dialogs}

      <p className="wb-settings-help">
        Whiteboard4Share 로그인 계정입니다. 역할은 총괄관리자 / 폴더관리자 / 일반사용자입니다.
        회원 파일에 같은 아이디가 있으면 <code>.env</code> 기본 계정보다 우선합니다.
      </p>

      <div className="wb-settings-row">
        <input
          type="search"
          className="modal-input"
          placeholder="아이디·이름 검색"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button type="button" className="modal-btn modal-btn--secondary" onClick={handleAdd}>
          회원 추가
        </button>
        <button
          type="button"
          className="modal-btn modal-btn--primary"
          disabled={saving}
          onClick={() => void handleSave()}
        >
          {saving ? '저장 중…' : '저장'}
        </button>
      </div>

      <ul className="wb-settings-list">
        {visible.length === 0 ? (
          <li className="wb-settings-empty">등록된 회원이 없습니다.</li>
        ) : (
          visible.map((member) => {
            const editing = editingId === member.id;
            return (
              <li key={member.id} className="wb-settings-list-item">
                {editing ? (
                  <div className="wb-settings-stack">
                    <label className="wb-settings-field">
                      <span>아이디</span>
                      <input
                        type="text"
                        className="modal-input"
                        value={member.username}
                        onChange={(event) =>
                          updateDraft(member.id, { username: event.target.value })
                        }
                      />
                    </label>
                    <label className="wb-settings-field">
                      <span>표시 이름 (선택)</span>
                      <input
                        type="text"
                        className="modal-input"
                        value={member.displayName ?? ''}
                        onChange={(event) =>
                          updateDraft(member.id, { displayName: event.target.value })
                        }
                      />
                    </label>
                    <label className="wb-settings-field">
                      <span>역할</span>
                      <select
                        className="modal-input"
                        value={member.role}
                        onChange={(event) =>
                          updateDraft(member.id, { role: event.target.value as UserRole })
                        }
                      >
                        <option value="super">총괄관리자</option>
                        <option value="dept">폴더관리자</option>
                        <option value="user">일반사용자</option>
                      </select>
                    </label>
                    {member.role === 'dept' ? (
                      <label className="wb-settings-field">
                        <span>관리 폴더</span>
                        <select
                          className="modal-input"
                          value={member.adminDept ?? ''}
                          onChange={(event) =>
                            updateDraft(member.id, { adminDept: event.target.value })
                          }
                        >
                          {folders.map((folder) => (
                            <option key={folder.id} value={folder.id}>
                              {folder.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    <label className="wb-settings-field">
                      <span>
                        비밀번호{member.isNew ? '' : ' (변경 시에만 입력)'}
                      </span>
                      <input
                        type="password"
                        className="modal-input"
                        value={member.password ?? ''}
                        autoComplete="new-password"
                        onChange={(event) =>
                          updateDraft(member.id, { password: event.target.value })
                        }
                      />
                    </label>
                    <label className="wb-settings-check">
                      <input
                        type="checkbox"
                        checked={Boolean(member.disabled)}
                        onChange={(event) =>
                          updateDraft(member.id, { disabled: event.target.checked })
                        }
                      />
                      <span>사용 중지</span>
                    </label>
                    <div className="wb-settings-row">
                      <button
                        type="button"
                        className="modal-btn modal-btn--secondary"
                        onClick={() => setEditingId(null)}
                      >
                        접기
                      </button>
                      <button
                        type="button"
                        className="modal-btn modal-btn--secondary wb-settings-danger"
                        onClick={() => void handleDelete(member.id)}
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="wb-settings-list-item-head">
                    <div>
                      <div className="wb-settings-member-name">
                        {member.username}
                        {member.disabled ? (
                          <span className="wb-settings-badge">중지</span>
                        ) : null}
                      </div>
                      <div className="wb-settings-muted">
                        {memberRoleToLabel(member.role)}
                        {member.role === 'dept' && member.adminDept
                          ? ` · ${
                              folders.find((folder) => folder.id === member.adminDept)?.name ??
                              member.adminDept
                            }`
                          : ''}
                        {member.displayName ? ` · ${member.displayName}` : ''}
                      </div>
                    </div>
                    <div className="wb-settings-row">
                      <button
                        type="button"
                        className="modal-btn modal-btn--secondary"
                        onClick={() => setEditingId(member.id)}
                      >
                        편집
                      </button>
                      <button
                        type="button"
                        className="modal-btn modal-btn--secondary wb-settings-danger"
                        onClick={() => void handleDelete(member.id)}
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
