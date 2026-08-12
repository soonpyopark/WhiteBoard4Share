import { useCallback, useEffect, useState } from 'react';
import { normalizeWebServerPort, type WebServerMode } from '../../../shared/webServerConfig.ts';
import {
  allowFirewall,
  applyServerConfig,
  fetchServerInfo,
  removeFirewall,
  type ServerInfoDto,
} from '../../api/settings.ts';
import { useAppDialogs } from '../useAppDialogs.tsx';

const DEFAULT_PORT = 3008;

function statusLabel(info: ServerInfoDto | null): string {
  if (!info) return '확인 중…';
  if (!info.running) return '중지됨';
  return info.mode === 'lan' ? '실행 중 · Web (LAN)' : '실행 중 · Local (127.0.0.1)';
}

function lanUrls(info: ServerInfoDto | null): string[] {
  if (!info?.running || info.mode !== 'lan') return [];
  const port = info.port ?? info.configuredPort;
  return info.addresses.map((address) => `http://${address}:${port}`);
}

export function ServerSettingsPanel() {
  const { alert: appAlert, confirm: appConfirm, dialogs } = useAppDialogs();
  const [info, setInfo] = useState<ServerInfoDto | null>(null);
  const [portDraft, setPortDraft] = useState(String(DEFAULT_PORT));
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchServerInfo();
      setInfo(next);
      setPortDraft(String(next.port ?? next.configuredPort));
      setLoadError('');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '서버 정보를 불러오지 못했습니다.');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  const draftPortOrAlert = async (): Promise<number | null> => {
    const port = normalizeWebServerPort(portDraft);
    if (port == null) {
      await appAlert({ title: '서버 관리', body: '포트는 1~65535 사이 숫자여야 합니다.' });
      return null;
    }
    return port;
  };

  const applyConfig = async (
    patch: { port?: number; mode?: WebServerMode },
    successBody: string,
  ) => {
    const result = await applyServerConfig(patch);
    setInfo(result.info);

    if (!result.restarted || !result.info.appUrl) {
      await appAlert({ title: '서버 관리', body: successBody });
      return;
    }

    await appAlert({
      title: '서버 관리',
      body: `${successBody}\n\n서버를 다시 시작했습니다. 확인을 누르면 새 주소로 이동합니다.\n${result.info.appUrl}`,
    });
    window.location.replace(result.info.appUrl);
  };

  const handleSavePort = () =>
    run(async () => {
      const port = await draftPortOrAlert();
      if (port == null) return;
      try {
        await applyConfig({ port }, `포트를 ${port}(으)로 저장했습니다.`);
      } catch (error) {
        await appAlert({
          title: '서버 관리',
          body: error instanceof Error ? error.message : '포트를 저장하지 못했습니다.',
        });
        await refresh();
      }
    });

  const handleChangeMode = (mode: WebServerMode) =>
    run(async () => {
      const port = await draftPortOrAlert();
      if (port == null) return;

      if (mode === 'local' && info?.mode === 'lan') {
        const ok = await appConfirm({
          title: '서버 관리',
          body: 'Local 모드로 바꾸면 다른 PC·모바일에서의 접속이 모두 끊깁니다.\n계속할까요?',
          confirmLabel: '변경',
        });
        if (!ok) return;
      }

      try {
        await applyConfig(
          { port, mode },
          mode === 'lan'
            ? 'Web (LAN) 모드로 전환했습니다. 같은 네트워크의 다른 기기에서 접속할 수 있습니다.'
            : 'Local 모드로 전환했습니다. 이 PC에서만 접속할 수 있습니다.',
        );
      } catch (error) {
        await appAlert({
          title: '서버 관리',
          body: error instanceof Error ? error.message : '서버 모드를 바꾸지 못했습니다.',
        });
        await refresh();
      }
    });

  const handleAllowFirewall = () =>
    run(async () => {
      const port = await draftPortOrAlert();
      if (port == null) return;
      try {
        const result = await allowFirewall(port);
        await appAlert({ title: '방화벽', body: result.message });
      } catch (error) {
        await appAlert({
          title: '방화벽',
          body: error instanceof Error ? error.message : '방화벽 규칙을 추가하지 못했습니다.',
        });
      }
    });

  const handleRemoveFirewall = () =>
    run(async () => {
      const port = await draftPortOrAlert();
      if (port == null) return;
      const ok = await appConfirm({
        title: '방화벽',
        body: `TCP ${port} 인바운드 허용 규칙을 제거할까요?`,
        confirmLabel: '제거',
      });
      if (!ok) return;
      try {
        const result = await removeFirewall(port);
        await appAlert({ title: '방화벽', body: result.message });
      } catch (error) {
        await appAlert({
          title: '방화벽',
          body: error instanceof Error ? error.message : '방화벽 규칙을 제거하지 못했습니다.',
        });
      }
    });

  const displayPort = info?.port ?? info?.configuredPort ?? DEFAULT_PORT;
  const addresses = lanUrls(info);

  return (
    <div className="wb-settings-stack">
      {dialogs}

      {loadError ? (
        <div className="wb-settings-stack">
          <p className="wb-settings-error">{loadError}</p>
          <button
            type="button"
            className="modal-btn modal-btn--secondary"
            onClick={() => void refresh()}
          >
            다시 시도
          </button>
        </div>
      ) : null}

      <section className="wb-settings-section">
        <h3 className="wb-settings-section-title">포트</h3>
        <p className="wb-settings-help">
          HTTP·Yjs 서버가 사용하는 TCP 포트입니다. 저장하면{' '}
          <code>data/.wb4s-settings.json</code>에 기록되어 <code>.env</code>의 <code>PORT</code>보다
          우선 적용됩니다. 저장하지 않으면 .env(없으면 {DEFAULT_PORT})를 따릅니다.
        </p>
        <div className="wb-settings-row">
          <input
            type="number"
            min={1}
            max={65535}
            inputMode="numeric"
            aria-label="서버 포트"
            className="modal-input wb-settings-port"
            value={portDraft}
            disabled={busy}
            onChange={(event) => setPortDraft(event.target.value)}
          />
          <button
            type="button"
            className="modal-btn modal-btn--primary"
            disabled={busy}
            onClick={handleSavePort}
          >
            포트 저장
          </button>
        </div>
      </section>

      <section className="wb-settings-section">
        <h3 className="wb-settings-section-title">접속 범위</h3>
        <p className="wb-settings-help">
          Local은 이 PC에서만, Web (LAN)은 같은 네트워크의 다른 기기에서도 접속할 수 있습니다.
          선택한 값은 설정에 저장되어 다음 실행에도 유지되며 .env의 <code>HOSTNAME</code>보다
          우선합니다. 포트·모드 변경은 서버 PC의 <code>127.0.0.1</code> 접속에서만 가능합니다.
        </p>

        <dl className="wb-settings-dl">
          <div>
            <dt>상태</dt>
            <dd>{statusLabel(info)}</dd>
          </div>
          <div>
            <dt>포트</dt>
            <dd>{displayPort}</dd>
          </div>
          <div>
            <dt>접속 주소</dt>
            <dd className="wb-settings-break">
              {info?.appUrl ?? '—'}
              {addresses.length > 0 ? `, ${addresses.join(', ')}` : ''}
            </dd>
          </div>
        </dl>

        <div className="wb-settings-row">
          <button
            type="button"
            className="modal-btn modal-btn--secondary"
            disabled={busy || info?.mode === 'local'}
            onClick={() => handleChangeMode('local')}
          >
            {info?.mode === 'local' ? '✓ Local 사용 중' : 'Local (127.0.0.1)'}
          </button>
          <button
            type="button"
            className="modal-btn modal-btn--secondary"
            disabled={busy || info?.mode === 'lan'}
            onClick={() => handleChangeMode('lan')}
          >
            {info?.mode === 'lan' ? '✓ Web (LAN) 사용 중' : 'Web (LAN)'}
          </button>
          <button
            type="button"
            className="modal-btn modal-btn--secondary"
            disabled={busy}
            onClick={() => void refresh()}
          >
            상태 새로고침
          </button>
        </div>
      </section>

      <section className="wb-settings-section">
        <h3 className="wb-settings-section-title">방화벽 인바운드 허용</h3>
        <p className="wb-settings-help">
          Web (LAN) 모드에서 다른 기기가 접속하려면 Windows 방화벽에서 위 포트의 TCP 인바운드를
          허용해야 합니다. 권한이 부족하면 UAC 확인 창이 뜹니다.
        </p>
        <div className="wb-settings-row">
          <button
            type="button"
            className="modal-btn modal-btn--secondary"
            disabled={busy}
            onClick={handleAllowFirewall}
          >
            허용 규칙 추가
          </button>
          <button
            type="button"
            className="modal-btn modal-btn--secondary wb-settings-danger"
            disabled={busy}
            onClick={handleRemoveFirewall}
          >
            허용 규칙 제거
          </button>
        </div>
      </section>
    </div>
  );
}
