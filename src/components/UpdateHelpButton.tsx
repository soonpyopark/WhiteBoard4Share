import { useCallback, useState } from 'react';
import { runUpdateCheck, type UpdateDialogApi } from '../lib/checkForUpdates';
import { AlertDialog } from './AlertDialog';
import { ConfirmDialog } from './ConfirmDialog';

function HelpCircleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M11 18h2v-2h-2v2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-2.21 0-4 1.79-4 4h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z"
      />
    </svg>
  );
}

type AlertState = {
  title: string;
  body: string;
  confirmLabel: string;
  resolve: () => void;
};

type ConfirmState = {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  resolve: (ok: boolean) => void;
};

/** Circle “?” — runs GitHub Releases update check and shows the result as a center modal. */
export function UpdateHelpButton() {
  const [checking, setChecking] = useState(false);
  const [alertState, setAlertState] = useState<AlertState | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  const handleUpdateCheck = useCallback(async () => {
    if (checking) return;
    setChecking(true);
    try {
      const api: UpdateDialogApi = {
        alert: (message, options) =>
          new Promise((resolve) => {
            setAlertState({
              title: options?.title ?? '알림',
              body: message,
              confirmLabel: options?.confirmLabel ?? '확인',
              resolve,
            });
          }),
        confirm: (message, options) =>
          new Promise((resolve) => {
            setConfirmState({
              title: options?.title ?? '확인',
              body: message,
              confirmLabel: options?.confirmLabel ?? '확인',
              cancelLabel: options?.cancelLabel ?? '취소',
              resolve,
            });
          }),
      };
      await runUpdateCheck(api);
    } finally {
      setChecking(false);
    }
  }, [checking]);

  return (
    <div className="gallery-help">
      <button
        type="button"
        className="gallery-help-btn"
        aria-label="업데이트 확인"
        title={checking ? '업데이트 확인 중…' : '업데이트 확인'}
        aria-busy={checking}
        disabled={checking}
        onClick={() => void handleUpdateCheck()}
      >
        <HelpCircleIcon />
      </button>

      <AlertDialog
        open={alertState !== null}
        title={alertState?.title}
        body={alertState?.body ?? ''}
        confirmLabel={alertState?.confirmLabel}
        onClose={() => {
          const resolve = alertState?.resolve;
          setAlertState(null);
          resolve?.();
        }}
      />

      <ConfirmDialog
        open={confirmState !== null}
        title={confirmState?.title}
        body={confirmState?.body ?? ''}
        confirmLabel={confirmState?.confirmLabel}
        cancelLabel={confirmState?.cancelLabel}
        onConfirm={() => {
          const resolve = confirmState?.resolve;
          setConfirmState(null);
          resolve?.(true);
        }}
        onCancel={() => {
          const resolve = confirmState?.resolve;
          setConfirmState(null);
          resolve?.(false);
        }}
      />
    </div>
  );
}
