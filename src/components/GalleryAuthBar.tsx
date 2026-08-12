import { useState } from 'react';
import { folderDisplayLabel } from '../../shared/folders.ts';
import { useDeptSession } from '../context/DeptSessionContext.tsx';
import { LoginDialog } from './LoginDialog';
import { SettingsButton } from './SettingsButton';
import { UpdateHelpButton } from './UpdateHelpButton';

export function GalleryAuthBar() {
  const {
    folders,
    selectedDept,
    authenticated,
    displayName,
    setDisplayName,
    commitDisplayName,
    role,
    login,
    loginWithKeycloak,
    logout,
    switchDept,
    keycloakEnabled,
    allowLocalLogin,
  } = useDeptSession();

  const [loginOpen, setLoginOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);

  const isAdmin = authenticated && role === 'super';
  const isSuper = isAdmin;
  const canOpenLogin = !isAdmin && (allowLocalLogin || keycloakEnabled);

  const handleDeptChange = async (dept: string) => {
    setError(null);
    try {
      await switchDept(dept);
    } catch (err) {
      setError(err instanceof Error ? err.message : '폴더 전환에 실패했습니다');
    }
  };

  const openLogin = () => {
    setLoginError(null);
    setLoginOpen(true);
  };

  const closeLogin = () => {
    if (submitting) return;
    setLoginOpen(false);
    setLoginError(null);
  };

  const handleLogin = async (loginUsername: string, password: string) => {
    if (submitting) return;

    setSubmitting(true);
    setLoginError(null);
    try {
      await login(loginUsername, password);
      setLoginOpen(false);
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : '로그인에 실패했습니다');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    if (loggingOut) return;

    setLoggingOut(true);
    setError(null);
    try {
      await logout();
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그아웃에 실패했습니다');
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <div className="gallery-auth-bar">
      <div className="gallery-auth-identity">
        <div className="gallery-auth-dept">
          <span className="gallery-auth-label">폴더 :</span>
          <label className="gallery-auth-field">
            <select
              className="gallery-auth-select"
              value={selectedDept}
              onChange={(event) => void handleDeptChange(event.target.value)}
              aria-label="폴더 선택"
            >
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folderDisplayLabel(folder)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="gallery-auth-user">
          <span className="gallery-auth-label">사용자 :</span>
          <label className="gallery-auth-field">
            <span className="sr-only">사용자</span>
            <input
              type="text"
              className="gallery-auth-input gallery-auth-display-name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              onBlur={commitDisplayName}
              aria-label="사용자"
            />
          </label>
        </div>
      </div>

      {isAdmin ? (
        <div className="gallery-auth-admin">
          {isSuper ? <SettingsButton canOpen /> : null}
          <UpdateHelpButton />
          <button
            type="button"
            className="gallery-auth-logout"
            onClick={() => void handleLogout()}
            disabled={loggingOut}
          >
            {loggingOut ? '로그아웃 중…' : '로그아웃'}
          </button>
        </div>
      ) : (
        <div className="gallery-auth-actions">
          <UpdateHelpButton />
          {canOpenLogin ? (
            <button type="button" className="gallery-auth-login" onClick={openLogin}>
              로그인
            </button>
          ) : null}
        </div>
      )}

      {error && (
        <span className="gallery-auth-error" role="alert">
          {error}
        </span>
      )}

      <LoginDialog
        open={loginOpen}
        busy={submitting}
        error={loginError}
        allowLocalLogin={allowLocalLogin}
        keycloakEnabled={keycloakEnabled}
        onClose={closeLogin}
        onSubmit={handleLogin}
        onSso={keycloakEnabled ? loginWithKeycloak : undefined}
      />
    </div>
  );
}
