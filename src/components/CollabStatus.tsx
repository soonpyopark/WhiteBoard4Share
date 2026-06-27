interface CollabStatusProps {
  remotePeerCount: number;
  isWsConnected: boolean;
  isSynced: boolean;
  isReady: boolean;
  hasUnsharedChanges: boolean;
  sharedPathCount?: number;
  onReconnect: () => void;
}

export function CollabStatus({
  remotePeerCount,
  isWsConnected,
  isSynced,
  isReady,
  hasUnsharedChanges,
  sharedPathCount,
  onReconnect,
}: CollabStatusProps) {
  let label = '협업 준비 중…';
  let tone: 'idle' | 'ok' | 'warn' = 'idle';

  if (isReady) {
    if (!isWsConnected || !isSynced) {
      label = '협업 연결 끊김';
      tone = 'warn';
    } else if (hasUnsharedChanges) {
      label = '미전송 수정 있음';
      tone = 'idle';
    } else if (remotePeerCount > 0) {
      label = `협업 중 · ${remotePeerCount + 1}명`;
      tone = 'ok';
    } else {
      label = '협업 대기 중';
      tone = 'ok';
    }
  }

  return (
    <div className={`collab-status collab-status--${tone}`}>
      <span className="collab-status-dot" aria-hidden="true" />
      <span className="collab-status-label">{label}</span>
      {isReady && (
        <span className="collab-status-meta">
          공유 {sharedPathCount ?? 0}개
        </span>
      )}
      {isReady && tone === 'warn' && (
        <button type="button" className="collab-status-reconnect" onClick={onReconnect}>
          재연결
        </button>
      )}
    </div>
  );
}
