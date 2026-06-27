import { useState, type FormEvent } from 'react';
import { useDeptSession } from '../context/DeptSessionContext.tsx';
import type { UserRole } from '../../shared/auth.ts';

function adminRoleLabel(role: UserRole | null): string | null {
  if (role === 'super') return '총괄관리자';
  if (role === 'dept') return '부서관리자';
  return null;
}

export function GalleryAuthBar() {
  const {
    departments,
    selectedDept,
    authenticated,
    username,
    displayName,
    setDisplayName,
    commitDisplayName,
    role,
    login,
    logout,
    switchDept,
  } = useDeptSession();

  const [loginUsername, setLoginUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = authenticated && (role === 'super' || role === 'dept');
  const adminLabel = adminRoleLabel(role);
  const showAdminLogin = !isAdmin;

  const handleDeptChange = async (dept: string) => {
    setError(null);
    try {
      await switchDept(dept);
    } catch (err) {
      setError(err instanceof Error ? err.message : '부서 전환에 실패했습니다');
    }
  };

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      await login(loginUsername, password);
      setPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그인에 실패했습니다');
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
      setLoginUsername('');
      setPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그아웃에 실패했습니다');
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <div className="gallery-auth-bar">
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

      <div className="gallery-auth-dept">
        <span className="gallery-auth-label">부서 :</span>
        <label className="gallery-auth-field">
          <select
            className="gallery-auth-select"
            value={selectedDept}
            onChange={(event) => void handleDeptChange(event.target.value)}
            aria-label="부서 선택"
          >
            {departments.map((dept) => (
              <option key={dept} value={dept}>
                {dept}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isAdmin ? (
        <div className="gallery-auth-admin">
          <span className="gallery-auth-admin-badge">
            {adminLabel}, {username}
          </span>
          <button
            type="button"
            className="gallery-auth-logout"
            onClick={() => void handleLogout()}
            disabled={loggingOut}
          >
            {loggingOut ? '로그아웃 중…' : '로그아웃'}
          </button>
        </div>
      ) : showAdminLogin ? (
        <form className="gallery-auth-form" onSubmit={(event) => void handleLogin(event)}>
          <span className="gallery-auth-label gallery-auth-label--inline">관리자</span>
          <input
            type="text"
            className="gallery-auth-input"
            value={loginUsername}
            onChange={(event) => setLoginUsername(event.target.value)}
            placeholder="아이디"
            autoComplete="username"
            aria-label="관리자 아이디"
          />
          <input
            type="password"
            className="gallery-auth-input"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="비밀번호"
            autoComplete="current-password"
            aria-label="관리자 비밀번호"
          />
          <button type="submit" className="gallery-auth-login" disabled={submitting}>
            {submitting ? '로그인 중…' : '관리자 로그인'}
          </button>
        </form>
      ) : null}

      {error && (
        <span className="gallery-auth-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
