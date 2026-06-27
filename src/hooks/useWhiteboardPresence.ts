import { useCallback, useEffect, useRef, useState } from 'react';

import type { CollabSession } from '../lib/collab/doc-manager.ts';

import type {

  AwarenessCursor,

  AwarenessState,

  AwarenessUser,

  RemotePeer,

} from '../lib/collab/awareness-types.ts';

import {

  buildLocalAwarenessUser,

  displayUserName,

} from '../lib/collab/presence-user.ts';



const CURSOR_THROTTLE_MS = 48;



function readRemotePeers(session: CollabSession): RemotePeer[] {

  const awareness = session.wsProvider.awareness;

  const localClientId = awareness.clientID;

  const peers: RemotePeer[] = [];



  awareness.getStates().forEach((state, clientId) => {

    if (clientId === localClientId) return;



    const typed = state as AwarenessState;

    if (!typed.user) return;



    peers.push({

      clientId,

      user: typed.user,

      cursor: typed.cursor ?? null,

    });

  });



  return peers;

}



function snapshotPeers(peers: RemotePeer[]): string {

  return JSON.stringify(

    peers.map((peer) => ({

      id: peer.clientId,

      n: peer.user.name,

      c: peer.user.color,

      x: peer.cursor ? Math.round(peer.cursor.x) : null,

      y: peer.cursor ? Math.round(peer.cursor.y) : null,

    })),

  );

}



export function useWhiteboardPresence(

  session: CollabSession | null,

  displayName: string,

) {

  const [localUser, setLocalUser] = useState<AwarenessUser>(() => ({

    name: displayUserName(displayName),

    color: '#1E88E5',

  }));

  const [remotePeers, setRemotePeers] = useState<RemotePeer[]>([]);

  const lastCursorSent = useRef(0);

  const localUserRef = useRef(localUser);

  const peersSnapshotRef = useRef('');



  const updateLocalState = useCallback(

    (next: Partial<AwarenessState>) => {

      if (!session) return;

      const awareness = session.wsProvider.awareness;

      awareness.setLocalState({

        ...(awareness.getLocalState() ?? {}),

        ...next,

      });

    },

    [session],

  );



  useEffect(() => {

    if (!session) return;



    const awareness = session.wsProvider.awareness;

    const user = buildLocalAwarenessUser(awareness.clientID, displayName);

    localUserRef.current = user;

    setLocalUser(user);

    updateLocalState({ user, cursor: null });

  }, [session, displayName, updateLocalState]);



  useEffect(() => {

    if (!session) {

      setRemotePeers([]);

      peersSnapshotRef.current = '';

      return;

    }



    const awareness = session.wsProvider.awareness;



    const syncPeers = () => {

      const nextPeers = readRemotePeers(session);

      const snapshot = snapshotPeers(nextPeers);

      if (snapshot !== peersSnapshotRef.current) {

        peersSnapshotRef.current = snapshot;

        setRemotePeers(nextPeers);

      }

    };



    syncPeers();

    awareness.on('change', syncPeers);

    awareness.on('update', syncPeers);



    return () => {

      awareness.off('change', syncPeers);

      awareness.off('update', syncPeers);

    };

  }, [session]);



  const updateCursor = useCallback(

    (cursor: AwarenessCursor | null) => {

      const now = Date.now();

      if (cursor && now - lastCursorSent.current < CURSOR_THROTTLE_MS) {

        return;

      }

      lastCursorSent.current = now;

      updateLocalState({

        cursor,

        user: localUserRef.current,

      });

    },

    [updateLocalState],

  );



  return {

    localUser,

    remotePeers,

    updateCursor,

    clearCursor: () => updateCursor(null),

  };

}

