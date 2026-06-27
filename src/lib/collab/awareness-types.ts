export interface AwarenessUser {
  name: string;
  color: string;
}

export interface AwarenessCursor {
  x: number;
  y: number;
}

export interface AwarenessState {
  user?: AwarenessUser;
  cursor?: AwarenessCursor | null;
}

export interface RemotePeer {
  clientId: number;
  user: AwarenessUser;
  cursor: AwarenessCursor | null;
}
