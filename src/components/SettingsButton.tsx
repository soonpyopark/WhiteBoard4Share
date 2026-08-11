import { useState } from 'react';
import { AlertDialog } from './AlertDialog';
import { SettingsView } from './settings/SettingsView';

function GearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96a7.2 7.2 0 0 0-1.62-.94l-.36-2.54A.49.49 0 0 0 13.9 2h-3.8a.49.49 0 0 0-.49.42l-.36 2.54c-.58.23-1.12.54-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.73 8.87a.48.48 0 0 0 .12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94L2.85 14.52a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.3.59.22l2.39-.96c.5.4 1.04.72 1.62.94l.36 2.54c.05.24.25.42.49.42h3.8c.24 0 .44-.18.49-.42l.36-2.54c.58-.22 1.12-.54 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.49.49 0 0 0-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z"
      />
    </svg>
  );
}

type SettingsButtonProps = {
  /** Only total admin (super) may open settings. */
  canOpen: boolean;
};

export function SettingsButton({ canOpen }: SettingsButtonProps) {
  const [open, setOpen] = useState(false);
  const [deniedOpen, setDeniedOpen] = useState(false);

  const handleClick = () => {
    if (!canOpen) {
      setDeniedOpen(true);
      return;
    }
    setOpen(true);
  };

  return (
    <>
      <button
        type="button"
        className="gallery-help-btn"
        aria-label="환경설정"
        title="환경설정"
        onClick={handleClick}
      >
        <GearIcon />
      </button>

      {open ? <SettingsView onClose={() => setOpen(false)} /> : null}

      <AlertDialog
        open={deniedOpen}
        title="환경설정"
        body="환경설정은 총괄관리자만 이용할 수 있습니다."
        onClose={() => setDeniedOpen(false)}
      />
    </>
  );
}
