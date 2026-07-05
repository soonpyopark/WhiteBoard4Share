import { useEffect, useRef, useState } from 'react';
import { EditorView, type EditorEmbedMode } from '../components/EditorView.tsx';
import { EmbedDeptSessionProvider } from '../context/DeptSessionContext.tsx';
import { parseWhiteboardFileText } from '../lib/whiteboard/whiteboardFile.ts';
import '../App.css';

type ExportApi = {
  exportDocument: () => string;
};

let requestCounter = 0;

function postResponse(id: number, result?: unknown, error?: string) {
  window.parent.postMessage(
    {
      type: 'wb4s-response',
      id,
      result,
      error,
    },
    '*',
  );
}

export function EmbedApp() {
  const [embedMode, setEmbedMode] = useState<EditorEmbedMode | null>(null);
  const exportApiRef = useRef<ExportApi | null>(null);

  useEffect(() => {
    document.documentElement.classList.add('wb4s-embed-mode');

    const onMessage = async (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object' || data.type !== 'wb4s-request') return;

      const id = Number(data.id);
      const method = String(data.method ?? '');
      const params = data.params ?? {};

      try {
        switch (method) {
          case 'ready':
            postResponse(id, true);
            return;
          case 'init': {
            const payload = parseWhiteboardFileText(String(params.documentJson ?? '{}'));
            setEmbedMode({
              initialPayload: payload,
              roomId: String(params.roomId ?? ''),
              syncServerUrl: String(params.syncServerUrl ?? ''),
              userName: String(params.userName ?? '사용자'),
              onReady: (api) => {
                exportApiRef.current = api;
              },
              onCollabStatus: (status) => {
                window.parent.postMessage(
                  {
                    type: 'wb4s-collab-status',
                    ...status,
                  },
                  '*',
                );
              },
            });
            postResponse(id, true);
            return;
          }
          case 'exportDocument': {
            const json = exportApiRef.current?.exportDocument();
            if (!json) {
              postResponse(id, undefined, 'Editor is not ready');
              return;
            }
            postResponse(id, json);
            return;
          }
          default:
            postResponse(id, undefined, `Unknown method: ${method}`);
        }
      } catch (err) {
        postResponse(id, undefined, err instanceof Error ? err.message : 'Request failed');
      }
    };

    window.addEventListener('message', onMessage);
    window.parent.postMessage({ type: 'wb4s-host-ready' }, '*');

    return () => {
      window.removeEventListener('message', onMessage);
    };
  }, []);

  if (!embedMode) {
    return (
      <div className="editor-loading">
        <p>화이트보드 편집기 준비 중…</p>
      </div>
    );
  }

  return (
    <EmbedDeptSessionProvider userName={embedMode.userName}>
      <EditorView
        whiteboardId="embed"
        byDept="embed"
        embedMode={embedMode}
        onBack={() => {}}
      />
    </EmbedDeptSessionProvider>
  );
}

export function nextEmbedRequestId() {
  requestCounter += 1;
  return requestCounter;
}
