import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  fetchAuthSession,
  fetchDepartments,
  joinSession,
  login as loginRequest,
  logout as logoutRequest,
  switchDepartment,
  type AuthSession,
} from '../api/auth.ts';
import { setApiByDept } from '../api/client.ts';
import { getOrCreateLocalUserName, saveLocalUserName } from '../lib/collab/presence-user.ts';
import type { UserRole } from '../../shared/auth.ts';

interface DeptSessionContextValue {
  departments: string[];
  selectedDept: string;
  setSelectedDept: (dept: string) => void;
  authenticated: boolean;
  username: string;
  displayName: string;
  setDisplayName: (name: string) => void;
  commitDisplayName: () => void;
  role: UserRole | null;
  canCreateWhiteboard: boolean;
  keycloakEnabled: boolean;
  allowLocalLogin: boolean;
  homeUrl: string | null;
  homeTarget: 'self' | 'blank';
  login: (username: string, password: string) => Promise<void>;
  loginWithKeycloak: () => void;
  switchDept: (dept: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  loading: boolean;
}

const DeptSessionContext = createContext<DeptSessionContextValue | null>(null);

function applyAuthSession(
  session: AuthSession,
  setters: {
    setAuthenticated: (v: boolean) => void;
    setSelectedDeptState: (v: string) => void;
    setUsername: (v: string) => void;
    setDisplayName: (v: string) => void;
    setRole: (v: UserRole | null) => void;
    setCanCreateWhiteboard: (v: boolean) => void;
    setKeycloakEnabled: (v: boolean) => void;
    setAllowLocalLogin: (v: boolean) => void;
    setHomeUrl: (v: string | null) => void;
    setHomeTarget: (v: 'self' | 'blank') => void;
  },
) {
  setters.setKeycloakEnabled(Boolean(session.keycloakEnabled));
  setters.setAllowLocalLogin(session.allowLocalLogin ?? true);
  setters.setHomeUrl(session.homeUrl ?? null);
  setters.setHomeTarget(session.homeTarget ?? 'self');
  setters.setAuthenticated(session.authenticated);

  if (session.authenticated && session.byDept) {
    setters.setSelectedDeptState(session.byDept);
    setApiByDept(session.byDept);
    setters.setUsername(session.username ?? '');
    if (session.displayName?.trim()) {
      setters.setDisplayName(session.displayName.trim());
    }
    setters.setRole(session.role ?? 'user');
    setters.setCanCreateWhiteboard(session.canCreateWhiteboard ?? false);
  } else {
    setApiByDept(null);
    setters.setUsername('');
    setters.setRole(null);
    setters.setCanCreateWhiteboard(false);
  }
}

function isAdminRole(role: UserRole | null | undefined): boolean {
  return role === 'super' || role === 'dept';
}

export function DeptSessionProvider({ children }: { children: ReactNode }) {
  const [departments, setDepartments] = useState<string[]>([]);
  const [selectedDept, setSelectedDeptState] = useState('0000001');
  const [authenticated, setAuthenticated] = useState(false);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState(() => getOrCreateLocalUserName());
  const [role, setRole] = useState<UserRole | null>(null);
  const [canCreateWhiteboard, setCanCreateWhiteboard] = useState(false);
  const [keycloakEnabled, setKeycloakEnabled] = useState(false);
  const [allowLocalLogin, setAllowLocalLogin] = useState(true);
  const [homeUrl, setHomeUrl] = useState<string | null>(null);
  const [homeTarget, setHomeTarget] = useState<'self' | 'blank'>('self');
  const [loading, setLoading] = useState(true);

  const displayNameRef = useRef(displayName);
  const roleRef = useRef(role);
  displayNameRef.current = displayName;
  roleRef.current = role;

  const applySession = useCallback((session: AuthSession) => {
    applyAuthSession(session, {
      setAuthenticated,
      setSelectedDeptState,
      setUsername,
      setDisplayName,
      setRole,
      setCanCreateWhiteboard,
      setKeycloakEnabled,
      setAllowLocalLogin,
      setHomeUrl,
      setHomeTarget,
    });
    roleRef.current = session.authenticated ? (session.role ?? 'user') : null;
  }, []);

  const joinAsUser = useCallback(
    async (dept: string, name: string) => {
      const trimmedName = name.trim() || getOrCreateLocalUserName();
      setApiByDept(dept);
      const result = await joinSession({
        displayName: trimmedName,
        byDept: dept,
      });
      applySession({ ...result, authenticated: true });
    },
    [applySession],
  );

  const refreshSession = useCallback(async () => {
    const session = await fetchAuthSession();
    if (session.authenticated) {
      applySession(session);
      return;
    }
    await joinAsUser(selectedDept, displayNameRef.current);
  }, [applySession, joinAsUser, selectedDept]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [{ departments: deptList }, session] = await Promise.all([
          fetchDepartments(),
          fetchAuthSession(),
        ]);
        if (cancelled) return;

        setDepartments(deptList);
        const deptForJoin = deptList.includes(selectedDept) ? selectedDept : deptList[0] ?? '';
        if (deptForJoin) {
          setSelectedDeptState(deptForJoin);
        }

        if (session.authenticated) {
          applySession(session);
        } else if (deptForJoin) {
          await joinAsUser(deptForJoin, displayNameRef.current);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applySession, joinAsUser]);

  const setSelectedDept = useCallback((dept: string) => {
    setSelectedDeptState(dept);
  }, []);

  const setDisplayNameValue = useCallback((name: string) => {
    setDisplayName(name);
  }, []);

  const commitDisplayName = useCallback(() => {
    setDisplayName((current) => {
      const trimmed = current.trim();
      const finalName = trimmed || getOrCreateLocalUserName();
      saveLocalUserName(finalName);

      if (!isAdminRole(roleRef.current)) {
        void joinAsUser(selectedDept, finalName);
      }

      return finalName;
    });
  }, [joinAsUser, selectedDept]);

  const login = useCallback(
    async (loginUsername: string, password: string) => {
      const result = await loginRequest({
        username: loginUsername,
        password,
        byDept: selectedDept,
        displayName: displayNameRef.current,
      });
      applySession({ ...result, authenticated: true });
    },
    [selectedDept, applySession],
  );

  const switchDept = useCallback(
    async (dept: string) => {
      setSelectedDeptState(dept);
      setApiByDept(dept);

      if (!authenticated || !isAdminRole(roleRef.current)) {
        await joinAsUser(dept, displayNameRef.current);
        return;
      }

      const result = await switchDepartment(dept);
      applySession({ ...result, authenticated: true });
    },
    [authenticated, applySession, joinAsUser],
  );

  const loginWithKeycloak = useCallback(() => {
    window.location.href = '/api/auth/keycloak/login';
  }, []);

  const logout = useCallback(async () => {
    if (keycloakEnabled && isAdminRole(roleRef.current)) {
      window.location.href = '/api/auth/keycloak/logout';
      return;
    }

    await logoutRequest();
    setAuthenticated(false);
    setUsername('');
    setRole(null);
    setCanCreateWhiteboard(false);
    await joinAsUser(selectedDept, displayNameRef.current);
  }, [joinAsUser, keycloakEnabled, selectedDept]);

  const value = useMemo(
    () => ({
      departments,
      selectedDept,
      setSelectedDept,
      authenticated,
      username,
      displayName,
      setDisplayName: setDisplayNameValue,
      commitDisplayName,
      role,
      canCreateWhiteboard,
      keycloakEnabled,
      allowLocalLogin,
      homeUrl,
      homeTarget,
      login,
      loginWithKeycloak,
      switchDept,
      logout,
      refreshSession,
      loading,
    }),
    [
      departments,
      selectedDept,
      setSelectedDept,
      authenticated,
      username,
      displayName,
      setDisplayNameValue,
      commitDisplayName,
      role,
      canCreateWhiteboard,
      keycloakEnabled,
      allowLocalLogin,
      homeUrl,
      homeTarget,
      login,
      loginWithKeycloak,
      switchDept,
      logout,
      refreshSession,
      loading,
    ],
  );

  return <DeptSessionContext.Provider value={value}>{children}</DeptSessionContext.Provider>;
}

export function useDeptSession(): DeptSessionContextValue {
  const context = useContext(DeptSessionContext);
  if (!context) {
    throw new Error('useDeptSession must be used within DeptSessionProvider');
  }
  return context;
}

/** EduCowork iframe embed — API/SSO 없이 표시 이름만 제공 */
export function EmbedDeptSessionProvider({
  userName,
  children,
}: {
  userName: string;
  children: ReactNode;
}) {
  const value = useMemo<DeptSessionContextValue>(
    () => ({
      departments: ['embed'],
      selectedDept: 'embed',
      setSelectedDept: () => {},
      authenticated: true,
      username: userName,
      displayName: userName,
      setDisplayName: () => {},
      commitDisplayName: () => {},
      role: 'user',
      canCreateWhiteboard: false,
      keycloakEnabled: false,
      allowLocalLogin: false,
      homeUrl: null,
      homeTarget: 'self',
      login: async () => {},
      loginWithKeycloak: () => {},
      switchDept: async () => {},
      logout: async () => {},
      refreshSession: async () => {},
      loading: false,
    }),
    [userName],
  );

  return <DeptSessionContext.Provider value={value}>{children}</DeptSessionContext.Provider>;
}
