import { useEffect, useState } from 'react';
import type { DrawingEngine } from '../engine/drawingEngine.ts';
import type { RemotePeer } from '../lib/collab/awareness-types.ts';
import { displayUserName, getReadableTextColor } from '../lib/collab/presence-user.ts';

interface RemoteCursorsProps {
  peers: RemotePeer[];
  engineRef: React.RefObject<DrawingEngine | null>;
  engineReady: boolean;
}

function CursorPointer({ color }: { color: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      className="remote-cursor-icon"
      aria-hidden="true"
    >
      <path
        d="M5.5 3.5L18 11.5L11.5 13.5L9.5 20.5L5.5 3.5Z"
        fill={color}
        stroke="#ffffff"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function RemoteCursors({ peers, engineRef, engineReady }: RemoteCursorsProps) {
  const [, setFrame] = useState(0);

  useEffect(() => {
    if (!engineReady || peers.length === 0) return;

    let raf = 0;
    const tick = () => {
      setFrame((value) => value + 1);
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [engineReady, peers.length]);

  if (!engineReady) return null;

  const engine = engineRef.current;
  if (!engine) return null;

  return (
    <div className="remote-cursors" aria-hidden="true">
      {peers
        .filter((peer) => peer.cursor)
        .map((peer) => {
          const screen = engine.worldToScreen(peer.cursor!.x, peer.cursor!.y);
          return (
            <div
              key={peer.clientId}
              className="remote-cursor"
              style={{
                left: screen.x,
                top: screen.y,
              }}
            >
              <CursorPointer color={peer.user.color} />
              <span
                className="remote-cursor-label"
                style={{
                  backgroundColor: peer.user.color,
                  color: getReadableTextColor(peer.user.color),
                }}
              >
                {displayUserName(peer.user.name)}
              </span>
            </div>
          );
        })}
    </div>
  );
}
