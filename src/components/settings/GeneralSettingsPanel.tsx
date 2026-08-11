import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchSettings, updateSettingsApi } from '../../api/settings.ts';
import {
  ACCENT_COLOR_PRESETS,
  applyAccentColor,
  currentAccentColor,
  normalizeAccentColor,
} from '../../lib/themeAccent.ts';
import { useAppDialogs } from '../useAppDialogs.tsx';

type DataRootState = {
  configured: string | null;
  effective: string;
  defaultDataRoot: string;
  canEdit: boolean;
};

type AutoLaunchState = {
  supported: boolean;
  enabled: boolean;
  startHidden: boolean;
  execPath: string;
  reason: string;
};

function hasDesktopApi(): boolean {
  return Boolean(window.wb4s?.isElectron);
}

export function GeneralSettingsPanel() {
  const { alert: appAlert, confirm: appConfirm, dialogs } = useAppDialogs();
  const [dataRoot, setDataRoot] = useState<DataRootState | null>(null);
  const [autoLaunch, setAutoLaunch] = useState<AutoLaunchState | null>(null);
  const [accent, setAccent] = useState(currentAccentColor);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [desktopApi, setDesktopApi] = useState(hasDesktopApi);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    setDesktopApi(hasDesktopApi());
  }, []);

  const refresh = useCallback(async () => {
    try {
      const settings = await fetchSettings();
      setDataRoot(
        settings.dataRootState ?? {
          configured: settings.dataRoot ?? null,
          effective: settings.dataDir,
          defaultDataRoot: settings.dataDir,
          canEdit: false,
        },
      );
      setAccent(applyAccentColor(settings.themeAccentColor ?? settings.defaultAccentColor));
      setLoadError('');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '설정을 불러오지 못했습니다.');
    }

    if (window.wb4s?.getAutoLaunch) {
      try {
        setAutoLaunch(await window.wb4s.getAutoLaunch());
      } catch {
        setAutoLaunch(null);
      }
    } else {
      setAutoLaunch(null);
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

  const persistAccent = (color: string) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void (async () => {
        if (busy) return;
        setBusy(true);
        try {
          await updateSettingsApi({ themeAccentColor: color });
        } catch (error) {
          await appAlert({
            title: '테마 색상',
            body: error instanceof Error ? error.message : '테마 색상을 저장하지 못했습니다.',
          });
          await refresh();
        } finally {
          setBusy(false);
        }
      })();
    }, 250);
  };

  const chooseAccent = (color: string) => {
    const next = normalizeAccentColor(color, accent);
    if (next === accent) return;
    setAccent(applyAccentColor(next));
    persistAccent(next);
  };

  const requireDesktopApi = async (title: string, body: string): Promise<boolean> => {
    if (hasDesktopApi() && window.wb4s) return true;
    await appAlert({ title, body });
    return false;
  };

  const applyDataRootCore = async (nextPath: string | null, confirmBody: string) => {
    if (
      !(await requireDesktopApi(
        '데이터 디렉터리',
        '데이터 디렉터리는 서버가 실행 중인 PC의 Whiteboard4Share 앱에서만 변경할 수 있습니다.',
      )) ||
      !window.wb4s
    ) {
      return;
    }
    const ok = await appConfirm({
      title: '데이터 디렉터리',
      body: confirmBody,
      confirmLabel: '저장 후 다시 시작',
    });
    if (!ok) return;
    try {
      await window.wb4s.applyDataRoot(nextPath);
    } catch (error) {
      await appAlert({
        title: '데이터 디렉터리',
        body: error instanceof Error ? error.message : '데이터 디렉터리를 바꾸지 못했습니다.',
      });
      await refresh();
    }
  };

  const chooseDataRoot = () =>
    run(async () => {
      if (
        !(await requireDesktopApi(
          '데이터 디렉터리',
          '데이터 디렉터리는 서버가 실행 중인 PC의 Whiteboard4Share 앱에서만 변경할 수 있습니다.',
        )) ||
        !window.wb4s
      ) {
        return;
      }
      const picked = await window.wb4s.pickDirectory({
        title: '데이터 디렉터리 폴더 선택',
      });
      if (!picked) return;
      if (dataRoot?.effective && picked === dataRoot.effective && dataRoot.configured) {
        await appAlert({ title: '데이터 디렉터리', body: '이미 사용 중인 폴더입니다.' });
        return;
      }
      await applyDataRootCore(
        picked,
        `선택한 폴더를 데이터 디렉터리로 쓰고 앱을 다시 시작합니다.\n\n${picked}\n\n기존 파일은 자동으로 옮기지 않습니다.`,
      );
    });

  const resetDataRoot = () => {
    if (!dataRoot?.configured) return;
    void run(async () => {
      await applyDataRootCore(
        null,
        `프로그램 폴더의 기본 데이터 경로로 되돌리고 앱을 다시 시작합니다.\n\n${dataRoot.defaultDataRoot}`,
      );
    });
  };

  const applyAutoLaunch = (patch: { enabled?: boolean; startHidden?: boolean }) =>
    run(async () => {
      if (!autoLaunch?.supported || !window.wb4s?.setAutoLaunch) return;
      try {
        setAutoLaunch(
          await window.wb4s.setAutoLaunch({
            enabled: patch.enabled ?? autoLaunch.enabled,
            startHidden: patch.startHidden ?? autoLaunch.startHidden,
          }),
        );
      } catch (error) {
        await appAlert({
          title: '프로그램 실행',
          body: error instanceof Error ? error.message : '자동 실행 설정을 바꾸지 못했습니다.',
        });
        await refresh();
      }
    });

  const usingCustomDataRoot = Boolean(dataRoot?.configured);

  return (
    <div className="wb-settings-stack">
      {dialogs}

      {loadError ? <p className="wb-settings-error">{loadError}</p> : null}

      <section className="wb-settings-section">
        <h3 className="wb-settings-section-title">데이터 디렉터리</h3>
        <p className="wb-settings-help">
          화이트보드·회원 데이터가 저장되는 폴더입니다. 지정하지 않으면 프로그램 폴더 아래{' '}
          <code>data</code>를 사용합니다. 변경 후 앱을 다시 시작해야 적용됩니다.
        </p>

        {dataRoot ? (
          <div className="wb-settings-stack">
            <p className="wb-settings-path">{dataRoot.effective}</p>
            <p className="wb-settings-muted">
              {usingCustomDataRoot
                ? `직접 지정한 경로를 사용 중입니다.${
                    dataRoot.configured && dataRoot.configured !== dataRoot.effective
                      ? ` (설정: ${dataRoot.configured})`
                      : ''
                  }`
                : `기본 경로를 사용 중입니다 (${dataRoot.defaultDataRoot}).`}
            </p>

            {!desktopApi ? (
              <p className="wb-settings-note">
                데이터 디렉터리는 서버가 실행 중인 PC의 Whiteboard4Share 앱에서만 변경할 수
                있습니다.
              </p>
            ) : null}

            <div className="wb-settings-row">
              <button
                type="button"
                className="modal-btn modal-btn--secondary"
                disabled={busy || !desktopApi}
                onClick={() => void chooseDataRoot()}
              >
                폴더 선택…
              </button>
              <button
                type="button"
                className="modal-btn modal-btn--secondary"
                disabled={busy || !desktopApi || !usingCustomDataRoot}
                onClick={resetDataRoot}
              >
                기본값으로
              </button>
            </div>
          </div>
        ) : (
          <p className="wb-settings-muted">데이터 디렉터리 정보를 불러오는 중입니다…</p>
        )}
      </section>

      <section className="wb-settings-section">
        <h3 className="wb-settings-section-title">프로그램 실행</h3>
        <p className="wb-settings-help">
          Windows에 로그인하면 Whiteboard4Share를 자동으로 실행해 서버를 바로 올립니다. 실행 파일
          경로가 그대로 등록되므로, 포터블 드라이브의 문자가 바뀌면 이 항목을 껐다 다시 켜 주세요.
        </p>

        {!desktopApi ? (
          <p className="wb-settings-note">
            자동 실행은 서버가 실행 중인 PC의 Whiteboard4Share 앱에서만 설정할 수 있습니다.
          </p>
        ) : autoLaunch?.supported ? (
          <div className="wb-settings-stack">
            <label className="wb-settings-check">
              <input
                type="checkbox"
                checked={autoLaunch.enabled}
                disabled={busy}
                onChange={(event) => applyAutoLaunch({ enabled: event.target.checked })}
              />
              <span>PC가 시작할 때 프로그램 자동 실행</span>
            </label>
            <label
              className={`wb-settings-check wb-settings-check--nested${
                autoLaunch.enabled ? '' : ' is-disabled'
              }`}
            >
              <input
                type="checkbox"
                checked={autoLaunch.startHidden}
                disabled={busy || !autoLaunch.enabled}
                onChange={(event) => applyAutoLaunch({ startHidden: event.target.checked })}
              />
              <span>창을 열지 않고 트레이에서만 시작</span>
            </label>
            <p className="wb-settings-muted wb-settings-break">등록 경로: {autoLaunch.execPath}</p>
          </div>
        ) : (
          <p className="wb-settings-note">
            {autoLaunch?.reason ?? '자동 실행 상태를 확인하는 중입니다…'}
          </p>
        )}
      </section>

      <section className="wb-settings-section">
        <h3 className="wb-settings-section-title">테마 색상</h3>
        <p className="wb-settings-help">
          버튼, 선택 표시 등 강조 요소에 쓰이는 색상입니다. 서버 설정에 저장되므로 이
          Whiteboard4Share에 접속하는 모든 기기에 같은 색이 적용됩니다.
        </p>

        <div className="wb-settings-swatch-row" role="listbox" aria-label="테마 색상">
          {ACCENT_COLOR_PRESETS.map((color) => {
            const selected = color === accent;
            return (
              <button
                key={color}
                type="button"
                role="option"
                aria-selected={selected}
                aria-label={`테마 색상 ${color}`}
                title={color}
                disabled={busy}
                className={`wb-settings-swatch${selected ? ' is-active' : ''}`}
                style={{ backgroundColor: color }}
                onClick={() => chooseAccent(color)}
              />
            );
          })}
        </div>

        <label className="wb-settings-color-picker-row">
          직접 선택
          <input
            type="color"
            aria-label="테마 색상 직접 선택"
            value={accent}
            disabled={busy}
            onChange={(event) => chooseAccent(event.target.value)}
          />
          <span className="wb-settings-color-hex">{accent}</span>
        </label>
      </section>
    </div>
  );
}
