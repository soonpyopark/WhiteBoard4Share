/**
 * In-process y-websocket server (y-websocket 2.x `bin/utils` equivalent).
 * y-websocket 3+ is client-only; @y/websocket-server currently depends on Yjs 14.
 */
import type { IncomingMessage } from 'node:http';
import type { WebSocket } from 'ws';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as map from 'lib0/map';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as syncProtocol from 'y-protocols/sync';
import * as Y from 'yjs';

const wsReadyStateConnecting = 0;
const wsReadyStateOpen = 1;
const messageSync = 0;
const messageAwareness = 1;
const pingTimeout = 30_000;

class WSSharedDoc extends Y.Doc {
  readonly name: string;
  readonly conns = new Map<WebSocket, Set<number>>();
  readonly awareness: awarenessProtocol.Awareness;

  constructor(name: string) {
    super({ gc: true });
    this.name = name;
    this.awareness = new awarenessProtocol.Awareness(this);
    this.awareness.setLocalState(null);
    this.awareness.on('update', (changes: { added: number[]; updated: number[]; removed: number[] }, conn: unknown) => {
      const changedClients = changes.added.concat(changes.updated, changes.removed);
      if (conn != null) {
        const connControlledIDs = this.conns.get(conn as WebSocket);
        if (connControlledIDs) {
          changes.added.forEach((clientID) => connControlledIDs.add(clientID));
          changes.removed.forEach((clientID) => connControlledIDs.delete(clientID));
        }
      }
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageAwareness);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients),
      );
      const buff = encoding.toUint8Array(encoder);
      this.conns.forEach((_, c) => send(this, c, buff));
    });
    this.on('update', (update: Uint8Array) => {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageSync);
      syncProtocol.writeUpdate(encoder, update);
      const message = encoding.toUint8Array(encoder);
      this.conns.forEach((_, conn) => send(this, conn, message));
    });
  }
}

const docs = new Map<string, WSSharedDoc>();

function getYDoc(docname: string, gc = true): WSSharedDoc {
  return map.setIfUndefined(docs, docname, () => {
    const doc = new WSSharedDoc(docname);
    doc.gc = gc;
    return doc;
  });
}

function messageListener(conn: WebSocket, doc: WSSharedDoc, message: Uint8Array): void {
  try {
    const encoder = encoding.createEncoder();
    const decoder = decoding.createDecoder(message);
    const messageType = decoding.readVarUint(decoder);
    switch (messageType) {
      case messageSync:
        encoding.writeVarUint(encoder, messageSync);
        syncProtocol.readSyncMessage(decoder, encoder, doc, conn);
        if (encoding.length(encoder) > 1) {
          send(doc, conn, encoding.toUint8Array(encoder));
        }
        break;
      case messageAwareness:
        awarenessProtocol.applyAwarenessUpdate(doc.awareness, decoding.readVarUint8Array(decoder), conn);
        break;
      default:
        break;
    }
  } catch (err) {
    console.error('[yjs-sync] message error:', err);
  }
}

function closeConn(doc: WSSharedDoc, conn: WebSocket): void {
  if (doc.conns.has(conn)) {
    const controlledIds = doc.conns.get(conn) ?? new Set<number>();
    doc.conns.delete(conn);
    awarenessProtocol.removeAwarenessStates(doc.awareness, Array.from(controlledIds), null);
    if (doc.conns.size === 0) {
      docs.delete(doc.name);
      doc.destroy();
    }
  }
  try {
    conn.close();
  } catch {
    /* already closed */
  }
}

function send(doc: WSSharedDoc, conn: WebSocket, payload: Uint8Array): void {
  if (conn.readyState !== wsReadyStateConnecting && conn.readyState !== wsReadyStateOpen) {
    closeConn(doc, conn);
    return;
  }
  try {
    conn.send(payload, {}, (err) => {
      if (err != null) closeConn(doc, conn);
    });
  } catch {
    closeConn(doc, conn);
  }
}

export function setupWSConnection(
  conn: WebSocket,
  req: IncomingMessage,
  { docName = (req.url || '').slice(1).split('?')[0], gc = true }: { docName?: string; gc?: boolean } = {},
): void {
  conn.binaryType = 'arraybuffer';
  const doc = getYDoc(docName, gc);
  doc.conns.set(conn, new Set());
  conn.on('message', (message: ArrayBuffer | Buffer) => {
    const bytes = message instanceof ArrayBuffer ? new Uint8Array(message) : new Uint8Array(message);
    messageListener(conn, doc, bytes);
  });

  let pongReceived = true;
  const pingInterval = setInterval(() => {
    if (!pongReceived) {
      if (doc.conns.has(conn)) closeConn(doc, conn);
      clearInterval(pingInterval);
      return;
    }
    if (doc.conns.has(conn)) {
      pongReceived = false;
      try {
        conn.ping();
      } catch {
        closeConn(doc, conn);
        clearInterval(pingInterval);
      }
    }
  }, pingTimeout);

  conn.on('close', () => {
    closeConn(doc, conn);
    clearInterval(pingInterval);
  });
  conn.on('pong', () => {
    pongReceived = true;
  });

  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync);
  syncProtocol.writeSyncStep1(encoder, doc);
  send(doc, conn, encoding.toUint8Array(encoder));
  const awarenessStates = doc.awareness.getStates();
  if (awarenessStates.size > 0) {
    const awarenessEncoder = encoding.createEncoder();
    encoding.writeVarUint(awarenessEncoder, messageAwareness);
    encoding.writeVarUint8Array(
      awarenessEncoder,
      awarenessProtocol.encodeAwarenessUpdate(doc.awareness, Array.from(awarenessStates.keys())),
    );
    send(doc, conn, encoding.toUint8Array(awarenessEncoder));
  }
}
