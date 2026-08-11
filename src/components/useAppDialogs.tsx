import { useCallback, useState } from 'react';
import { AlertDialog } from './AlertDialog';
import { ConfirmDialog } from './ConfirmDialog';

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

export function useAppDialogs() {
  const [alertState, setAlertState] = useState<AlertState | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  const alert = useCallback((options: { title?: string; body: string; confirmLabel?: string }) => {
    return new Promise<void>((resolve) => {
      setAlertState({
        title: options.title ?? '알림',
        body: options.body,
        confirmLabel: options.confirmLabel ?? '확인',
        resolve,
      });
    });
  }, []);

  const confirm = useCallback(
    (options: {
      title?: string;
      body: string;
      confirmLabel?: string;
      cancelLabel?: string;
    }) => {
      return new Promise<boolean>((resolve) => {
        setConfirmState({
          title: options.title ?? '확인',
          body: options.body,
          confirmLabel: options.confirmLabel ?? '확인',
          cancelLabel: options.cancelLabel ?? '취소',
          resolve,
        });
      });
    },
    [],
  );

  const dialogs = (
    <>
      <AlertDialog
        open={Boolean(alertState)}
        title={alertState?.title}
        body={alertState?.body ?? ''}
        confirmLabel={alertState?.confirmLabel}
        onClose={() => {
          alertState?.resolve();
          setAlertState(null);
        }}
      />
      <ConfirmDialog
        open={Boolean(confirmState)}
        title={confirmState?.title}
        body={confirmState?.body ?? ''}
        confirmLabel={confirmState?.confirmLabel}
        cancelLabel={confirmState?.cancelLabel}
        onConfirm={() => {
          confirmState?.resolve(true);
          setConfirmState(null);
        }}
        onCancel={() => {
          confirmState?.resolve(false);
          setConfirmState(null);
        }}
      />
    </>
  );

  return { alert, confirm, dialogs };
}
