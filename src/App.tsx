import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { GalleryView } from './components/GalleryView';
import { MadeByCredit } from './components/MadeByCredit';
import { AlertDialog } from './components/AlertDialog';
import { DeptSessionProvider, useDeptSession } from './context/DeptSessionContext';
import { fetchShareLinkInfo } from './api/share.ts';
import { loadAndApplyAccentColor } from './lib/themeAccent.ts';
import { parseShareTokenFromHash } from './utils/shareLink.ts';
import './App.css';
import './Gallery.css';

const EditorView = lazy(() =>
  import('./components/EditorView').then((module) => ({ default: module.EditorView })),
);

type View =
  | { mode: 'gallery' }
  | { mode: 'editor'; id: string; shareToken?: string };

const SSO_ERROR_MESSAGES: Record<string, string> = {
  invalid_state: 'SSO 인증 상태가 올바르지 않습니다. 다시 시도하세요.',
  no_portal_role: '관리자 역할이 없습니다. Keycloak 역할 설정을 확인하세요.',
  unknown_dept: '폴더 정보를 확인할 수 없습니다.',
  token_exchange_failed: 'SSO 토큰 교환에 실패했습니다.',
};

function AppContent() {
  const initialShareToken = parseShareTokenFromHash(
    typeof window !== 'undefined' ? window.location.hash : '',
  );
  const [view, setView] = useState<View>({ mode: 'gallery' });
  const [shareError, setShareError] = useState<string | null>(null);
  const [shareLinkMode] = useState(() => !!initialShareToken);
  const [shareResolving, setShareResolving] = useState(() => !!initialShareToken);
  const [authErrorMessage, setAuthErrorMessage] = useState<string | null>(null);
  const { selectedDept, authenticated, loading: sessionLoading, switchDept } = useDeptSession();
  const shareHandledRef = useRef(false);

  useEffect(() => {
    void loadAndApplyAccentColor();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('auth_error');
    if (!code) return;

    setAuthErrorMessage(SSO_ERROR_MESSAGES[code] ?? 'SSO 로그인에 실패했습니다.');
    params.delete('auth_error');
    const query = params.toString();
    const next = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
    window.history.replaceState({}, '', next);
  }, []);

  const goAppHome = () => {
    if (shareLinkMode) return;
    setView({ mode: 'gallery' });
  };

  useEffect(() => {
    if (sessionLoading || shareHandledRef.current) return;

    const token = parseShareTokenFromHash(window.location.hash);
    if (!token) return;

    shareHandledRef.current = true;

    void (async () => {
      try {
        setShareError(null);
        const info = await fetchShareLinkInfo(token);
        if (info.byDept !== selectedDept) {
          await switchDept(info.byDept);
        }
        setView({ mode: 'editor', id: info.whiteboardId, shareToken: token });
      } catch (err) {
        setShareError(err instanceof Error ? err.message : '공유 링크를 열 수 없습니다');
        if (!shareLinkMode) {
          setView({ mode: 'gallery' });
        }
      } finally {
        setShareResolving(false);
      }
    })();
  }, [sessionLoading, selectedDept, switchDept, shareLinkMode]);

  if (shareResolving) {
    return (
      <div className="app-shell">
        <div className="editor-loading">
          <p>공유 화이트보드를 불러오는 중…</p>
        </div>
      </div>
    );
  }

  if (shareError && shareLinkMode && view.mode !== 'editor') {
    return (
      <div className="app-shell">
        <div className="editor-loading">
          <p>{shareError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {shareError && view.mode === 'gallery' && !shareLinkMode && (
        <div className="app-share-error" role="alert">
          {shareError}
        </div>
      )}
      {view.mode === 'editor' ? (
        <Suspense
          fallback={
            <div className="editor-loading">
              <p>화이트보드를 불러오는 중…</p>
            </div>
          }
        >
          <EditorView
            whiteboardId={view.id}
            byDept={selectedDept}
            shareToken={view.shareToken}
            shareLinkMode={shareLinkMode}
            onBack={() => {
              if (shareLinkMode) return;
              setView({ mode: 'gallery' });
            }}
          />
        </Suspense>
      ) : (
        !shareLinkMode && (
          <GalleryView
            onOpen={(id) => {
              if (!authenticated) return;
              setView({ mode: 'editor', id });
            }}
            onCreate={(id) => {
              if (!authenticated) return;
              setView({ mode: 'editor', id });
            }}
            onAppHome={goAppHome}
          />
        )
      )}
      {view.mode === 'gallery' && !shareLinkMode && <MadeByCredit />}
      <AlertDialog
        open={authErrorMessage !== null}
        title="SSO 로그인 실패"
        body={authErrorMessage ?? ''}
        onClose={() => setAuthErrorMessage(null)}
      />
    </div>
  );
}

function App() {
  return (
    <DeptSessionProvider>
      <AppContent />
    </DeptSessionProvider>
  );
}

export default App;
