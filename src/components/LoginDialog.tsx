import { useEffect, useRef, useState, type FormEvent } from 'react';

export type LoginDialogProps = {
  open: boolean;
  busy?: boolean;
  error?: string | null;
  /** Show local id/password fields (when local auth is allowed). */
  allowLocalLogin?: boolean;
  /** Show Keycloak SSO action. */
  keycloakEnabled?: boolean;
  onClose: () => void;
  onSubmit: (username: string, password: string) => void | Promise<void>;
  onSso?: () => void;
};

function PasswordVisibilityIcon({ visible }: { visible: boolean }) {
  if (visible) {
    return (
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path
          fill="currentColor"
          d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5C21.27 7.61 17 4.5 12 4.5zm0 12.5c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78 3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"
      />
    </svg>
  );
}

/** Neo Calendar–style centered login overlay. */
export function LoginDialog({
  open,
  busy = false,
  error = null,
  allowLocalLogin = true,
  keycloakEnabled = false,
  onClose,
  onSubmit,
  onSso,
}: LoginDialogProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const idInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setUsername('');
    setPassword('');
    setShowPassword(false);

    let cancelled = false;
    let attempts = 0;
    const tryFocus = (): void => {
      if (cancelled) return;
      const el = idInputRef.current;
      if (!el) return;
      el.focus({ preventScroll: true });
      attempts += 1;
      if (document.activeElement !== el && attempts < 10) {
        window.setTimeout(tryFocus, 50);
      }
    };
    const timer = window.setTimeout(tryFocus, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, busy, onClose]);

  if (!open) return null;

  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault();
    if (!allowLocalLogin) return;
    void onSubmit(username.trim(), password);
  };

  const canSubmit = allowLocalLogin && Boolean(username.trim() && password) && !busy;

  return (
    <div className="wb-login-backdrop" role="presentation" onClick={busy ? undefined : onClose}>
      <div
        className="wb-login-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wb-login-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <form className="wb-login-form" onSubmit={handleSubmit}>
          <button
            type="button"
            className="wb-login-close"
            onClick={onClose}
            disabled={busy}
            aria-label="로그인 창 닫기"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path
                fill="currentColor"
                d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
              />
            </svg>
          </button>

          <h2 id="wb-login-dialog-title" className="wb-login-title">
            로그인
          </h2>
          <p className="wb-login-subtitle">관리자 계정으로 로그인한 뒤 화이트보드를 관리합니다.</p>
          {allowLocalLogin ? (
            <p className="wb-login-default-hint">기본 계정: admin / admin1234</p>
          ) : null}

          {allowLocalLogin ? (
            <div className="wb-login-fields">
              <label className="wb-login-label">
                아이디
                <input
                  ref={idInputRef}
                  type="text"
                  className="wb-login-input"
                  value={username}
                  autoComplete="username"
                  disabled={busy}
                  onChange={(event) => setUsername(event.target.value)}
                />
              </label>
              <label className="wb-login-label">
                비밀번호
                <div className="wb-login-password-wrap">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="wb-login-input wb-login-input--password"
                    value={password}
                    autoComplete="current-password"
                    disabled={busy}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                  <button
                    type="button"
                    className="wb-login-eye"
                    aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 표시'}
                    aria-pressed={showPassword}
                    disabled={busy}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => setShowPassword((prev) => !prev)}
                  >
                    <PasswordVisibilityIcon visible={showPassword} />
                  </button>
                </div>
              </label>
            </div>
          ) : (
            <p className="wb-login-subtitle">로컬 로그인이 비활성화되어 있습니다. SSO로 접속하세요.</p>
          )}

          {error ? (
            <p className="wb-login-error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="wb-login-footer">
            <div className="wb-login-actions">
              <button type="button" className="wb-login-btn" onClick={onClose} disabled={busy}>
                취소
              </button>
              {keycloakEnabled && onSso ? (
                <button
                  type="button"
                  className="wb-login-btn"
                  onClick={onSso}
                  disabled={busy}
                >
                  SSO
                </button>
              ) : null}
              {allowLocalLogin ? (
                <button
                  type="submit"
                  className="wb-login-btn wb-login-btn--primary"
                  disabled={!canSubmit}
                >
                  {busy ? '로그인 중…' : '로그인'}
                </button>
              ) : null}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
