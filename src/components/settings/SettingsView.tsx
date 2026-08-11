import { useCallback, useEffect, useRef, useState } from 'react';
import {
  isValidIpOrCidr,
  normalizeAllowedIpCidrs,
  type AllowedIpEntry,
} from '../../../shared/ipCidrCore.ts';
import {
  buildIpAllowlistPayload,
  ipAllowlistExportFilename,
  parseIpAllowlistPayload,
} from '../../../shared/ipAllowlistIo.ts';
import { fetchSettings, updateSettingsApi } from '../../api/settings.ts';
import { downloadTextFile, readFileAsText } from '../../lib/downloadTextFile.ts';
import { useAppDialogs } from '../useAppDialogs.tsx';
import { GeneralSettingsPanel } from './GeneralSettingsPanel.tsx';
import { FoldersSettingsPanel } from './FoldersSettingsPanel.tsx';
import { MembersSettingsPanel } from './MembersSettingsPanel.tsx';
import { ServerSettingsPanel } from './ServerSettingsPanel.tsx';

type SettingsTabId = 'general' | 'folders' | 'server' | 'ip' | 'members';

const SETTINGS_TABS: { id: SettingsTabId; label: string }[] = [
  { id: 'general', label: '일반' },
  { id: 'folders', label: '폴더 관리' },
  { id: 'server', label: '서버 관리' },
  { id: 'ip', label: '접근 가능 IP 대역' },
  { id: 'members', label: '회원 관리' },
];

type SettingsViewProps = {
  onClose: () => void;
};

export function SettingsView({ onClose }: SettingsViewProps) {
  const { alert: appAlert, confirm: appConfirm, dialogs } = useAppDialogs();
  const [allowedIpCidrs, setAllowedIpCidrs] = useState<AllowedIpEntry[]>([]);
  const [activeTab, setActiveTab] = useState<SettingsTabId>('general');
  const [ipCidrDraft, setIpCidrDraft] = useState('');
  const [ipDescriptionDraft, setIpDescriptionDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const descriptionSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ipImportInputRef = useRef<HTMLInputElement | null>(null);

  const applySettings = useCallback((settings: { allowedIpCidrs?: AllowedIpEntry[] }) => {
    setAllowedIpCidrs(normalizeAllowedIpCidrs(settings?.allowedIpCidrs ?? []));
  }, []);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const settings = await fetchSettings();
      applySettings(settings);
      setIpCidrDraft('');
      setIpDescriptionDraft('');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '설정을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [applySettings]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    return () => {
      if (descriptionSaveTimerRef.current) clearTimeout(descriptionSaveTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const persistSettings = async (
    patch: { allowedIpCidrs?: AllowedIpEntry[] },
    { silent = true }: { silent?: boolean } = {},
  ) => {
    setSaving(true);
    try {
      const next = await updateSettingsApi({
        allowedIpCidrs: normalizeAllowedIpCidrs(patch.allowedIpCidrs ?? allowedIpCidrs),
      });
      applySettings(next);
      if (!silent) {
        void appAlert({ title: '환경설정', body: '설정을 저장했습니다.' });
      }
      return true;
    } catch (error) {
      void appAlert({
        title: '환경설정',
        body: error instanceof Error ? error.message : '설정 저장에 실패했습니다.',
      });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const addAllowedIp = async () => {
    const value = ipCidrDraft.trim();
    if (!value) {
      void appAlert({ title: '환경설정', body: '허용 IP 주소를 입력해 주세요.' });
      return;
    }
    if (!isValidIpOrCidr(value)) {
      void appAlert({
        title: '환경설정',
        body: '올바른 IPv4 주소, CIDR, 또는 IP 범위 형식이 아닙니다.\n예: 192.168.0.0/24, 10.0.0.30, 221.168.1.0-221.168.12.255',
      });
      return;
    }
    const key = value.toLowerCase();
    if (allowedIpCidrs.some((item) => item.cidr.toLowerCase() === key)) {
      void appAlert({ title: '환경설정', body: '이미 등록된 IP/CIDR/범위 입니다.' });
      return;
    }
    const description = ipDescriptionDraft.trim();
    const nextList = [
      ...allowedIpCidrs,
      description ? { cidr: value, description } : { cidr: value },
    ];
    setAllowedIpCidrs(nextList);
    setIpCidrDraft('');
    setIpDescriptionDraft('');
    await persistSettings({ allowedIpCidrs: nextList });
  };

  const removeAllowedIp = async (cidr: string) => {
    const nextList = allowedIpCidrs.filter((item) => item.cidr !== cidr);
    setAllowedIpCidrs(nextList);
    await persistSettings({ allowedIpCidrs: nextList });
  };

  const handleExportIp = () => {
    try {
      const payload = buildIpAllowlistPayload(allowedIpCidrs);
      downloadTextFile(ipAllowlistExportFilename(), `${JSON.stringify(payload, null, 2)}\n`);
      void appAlert({
        title: '내보내기',
        body:
          allowedIpCidrs.length === 0
            ? '허용 IP가 비어 있는 목록을 내보냈습니다.'
            : `허용 IP ${allowedIpCidrs.length}건을 내보냈습니다.`,
      });
    } catch (error) {
      void appAlert({
        title: '내보내기',
        body: error instanceof Error ? error.message : '내보내기에 실패했습니다.',
      });
    }
  };

  const handleImportIp = async (event: { target: HTMLInputElement }) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const text = await readFileAsText(file);
      const { allowedIpCidrs: nextList } = parseIpAllowlistPayload(text);
      const ok = await appConfirm({
        title: '가져오기',
        body:
          nextList.length === 0
            ? `「${file.name}」의 허용 IP가 비어 있습니다.\n현재 목록을 모두 지울까요?`
            : `「${file.name}」에서 허용 IP ${nextList.length}건을 가져옵니다.\n현재 목록을 이 내용으로 바꿀까요?`,
        confirmLabel: '가져오기',
      });
      if (!ok) return;
      const saved = await persistSettings({ allowedIpCidrs: nextList });
      if (saved) {
        void appAlert({
          title: '가져오기',
          body:
            nextList.length === 0
              ? '허용 IP 목록을 비웠습니다.'
              : `허용 IP ${nextList.length}건을 가져왔습니다.`,
        });
      }
    } catch (error) {
      void appAlert({
        title: '가져오기',
        body: error instanceof Error ? error.message : '가져오기에 실패했습니다.',
      });
    }
  };

  const updateAllowedIpDescription = (cidr: string, description: string) => {
    const trimmed = description.trim();
    const nextList = allowedIpCidrs.map((item) => {
      if (item.cidr !== cidr) return item;
      if (!trimmed) return { cidr: item.cidr };
      return { cidr: item.cidr, description: trimmed };
    });
    setAllowedIpCidrs(nextList);

    if (descriptionSaveTimerRef.current) clearTimeout(descriptionSaveTimerRef.current);
    descriptionSaveTimerRef.current = setTimeout(() => {
      void persistSettings({ allowedIpCidrs: nextList });
    }, 400);
  };

  return (
    <div className="modal-overlay wb-settings-overlay" onClick={onClose}>
      <div
        className="wb-settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wb-settings-title"
        onClick={(event) => event.stopPropagation()}
      >
        {dialogs}
        <div className="wb-settings-header">
          <h2 id="wb-settings-title" className="wb-settings-title">
            환경설정
          </h2>
          <button type="button" className="wb-settings-close" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>

        <div className="wb-settings-tabs" role="tablist" aria-label="환경설정">
          {SETTINGS_TABS.map((tab) => {
            const selected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                className={`wb-settings-tab${selected ? ' is-active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="wb-settings-body">
          {activeTab === 'general' ? (
            <div role="tabpanel">
              <GeneralSettingsPanel />
            </div>
          ) : null}

          {activeTab === 'folders' ? (
            <div role="tabpanel">
              <FoldersSettingsPanel />
            </div>
          ) : null}

          {activeTab === 'server' ? (
            <div role="tabpanel">
              <ServerSettingsPanel />
            </div>
          ) : null}

          {activeTab === 'ip' ? (
            loading ? (
              <p className="wb-settings-muted">설정을 불러오는 중…</p>
            ) : loadError ? (
              <div className="wb-settings-stack">
                <p className="wb-settings-error">{loadError}</p>
                <button
                  type="button"
                  className="modal-btn modal-btn--secondary"
                  onClick={() => void loadSettings()}
                >
                  다시 시도
                </button>
              </div>
            ) : (
              <div className="wb-settings-stack" role="tabpanel">
                <p className="wb-settings-help">
                  목록이 비어 있으면 모든 IP에서 접속할 수 있습니다. 항목을 추가하면 등록된
                  주소·대역·범위에서만 Whiteboard4Share에 접속할 수 있습니다. 단일 IP, CIDR(
                  <code>192.168.0.0/24</code>), 범위(<code>221.168.1.0-221.168.12.255</code>) 형식을
                  지원합니다. 서버 PC의 <code>127.0.0.1</code> 은 항상 허용됩니다.
                </p>
                <div className="wb-settings-row">
                  <button
                    type="button"
                    className="modal-btn modal-btn--secondary"
                    disabled={saving}
                    onClick={handleExportIp}
                  >
                    내보내기
                  </button>
                  <button
                    type="button"
                    className="modal-btn modal-btn--secondary"
                    disabled={saving}
                    onClick={() => ipImportInputRef.current?.click()}
                  >
                    가져오기
                  </button>
                  <input
                    ref={ipImportInputRef}
                    type="file"
                    accept="application/json,.json"
                    className="sr-only"
                    onChange={(event) => void handleImportIp(event)}
                  />
                </div>

                <ul className="wb-settings-list">
                  {allowedIpCidrs.length === 0 ? (
                    <li className="wb-settings-empty">등록된 허용 IP가 없습니다.</li>
                  ) : (
                    allowedIpCidrs.map((entry) => (
                      <li key={entry.cidr} className="wb-settings-list-item">
                        <div className="wb-settings-list-item-head">
                          <span className="wb-settings-mono">{entry.cidr}</span>
                          <button
                            type="button"
                            className="modal-btn modal-btn--secondary wb-settings-danger"
                            disabled={saving}
                            onClick={() => void removeAllowedIp(entry.cidr)}
                          >
                            삭제
                          </button>
                        </div>
                        <label className="wb-settings-inline-label">
                          <span>설명</span>
                          <input
                            type="text"
                            className="modal-input"
                            placeholder="예: 본사 사내망, VPN 대역"
                            value={entry.description ?? ''}
                            onChange={(event) =>
                              updateAllowedIpDescription(entry.cidr, event.target.value)
                            }
                          />
                        </label>
                      </li>
                    ))
                  )}
                </ul>

                <div className="wb-settings-card">
                  <label className="wb-settings-field">
                    <span>허용 IP 주소</span>
                    <input
                      type="text"
                      className="modal-input"
                      placeholder="예: 192.168.0.0/24, 10.0.0.30, 221.168.1.0-221.168.12.255"
                      value={ipCidrDraft}
                      onChange={(event) => setIpCidrDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          void addAllowedIp();
                        }
                      }}
                    />
                  </label>
                  <label className="wb-settings-field">
                    <span>설명 (선택)</span>
                    <input
                      type="text"
                      className="modal-input"
                      placeholder="예: 본사 사내망, VPN 대역"
                      value={ipDescriptionDraft}
                      onChange={(event) => setIpDescriptionDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          void addAllowedIp();
                        }
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className="modal-btn modal-btn--primary"
                    disabled={saving}
                    onClick={() => void addAllowedIp()}
                  >
                    {saving ? '저장 중…' : 'IP 추가'}
                  </button>
                </div>
              </div>
            )
          ) : null}

          {activeTab === 'members' ? (
            <div role="tabpanel">
              <MembersSettingsPanel />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
