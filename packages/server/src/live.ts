import type { Document } from '@hocuspocus/server';
import type * as Y from 'yjs';
import type { Sync } from './sync.js';

// The server's write path into a project's document (connector design
// decision 4): through Hocuspocus's direct connection, so open editors get
// the change at once, offline clients merge it on reconnect, and the store
// and its summary stay the single one in sync.ts.
//
// A direct connection skips onAuthenticate: callers check first that the
// project is the user's and not in the bin.

export interface LiveDocument {
  // The document as the open clients have it. Read it, never write it here:
  // writes go through transact.
  readonly doc: Y.Doc;
  // Runs fn as one local transaction that every connected client receives,
  // and answers what fn returns. An error thrown by fn rejects it. Yjs does
  // not roll back: fn checks everything before it changes anything.
  transact<T>(fn: (doc: Y.Doc) => T): Promise<T>;
  // A stateless message to every client of the document.
  broadcast(message: string): void;
  // Ends the connection and stores the document at once; the summary row and
  // the stored message follow from onStoreDocument.
  close(): Promise<void>;
}

// Opens the project's document, loading it from the database when no one has
// it open. Keep it open across a read, an await and a write: the document
// then stays the same object in memory, and every check repeated inside
// transact sees what the clients see.
export async function openLiveDocument(sync: Sync, projectId: string, userId: string): Promise<LiveDocument> {
  const connection = await sync.hocuspocus.openDirectConnection(projectId, { userId, sessionHash: null, grantId: null });
  const document = connection.document as Document;
  let closed = false;
  return {
    doc: document,
    async transact<T>(fn: (doc: Y.Doc) => T): Promise<T> {
      if (closed) throw new Error('The live document is closed.');
      let result!: T;
      // The function runs synchronously inside Y.Doc.transact; awaiting the
      // call carries an error thrown in it to the caller.
      await connection.transact((doc) => {
        result = fn(doc);
      });
      return result;
    },
    broadcast(message) {
      if (!closed) document.broadcastStateless(message);
    },
    async close() {
      if (closed) return;
      closed = true;
      await connection.disconnect();
    },
  };
}

// Runs fn as one transaction on the project's live document, then stores it.
// An error inside fn reaches the caller; the connection is closed either way.
export async function withLiveDocument<T>(
  sync: Sync,
  projectId: string,
  userId: string,
  fn: (doc: Y.Doc) => T,
): Promise<T> {
  const live = await openLiveDocument(sync, projectId, userId);
  try {
    return await live.transact(fn);
  } finally {
    await live.close();
  }
}

const isHighSurrogate = (code: number) => code >= 0xd800 && code <= 0xdbff;
const isLowSurrogate = (code: number) => code >= 0xdc00 && code <= 0xdfff;

// Makes the prep document read `next` with the smallest edit: the common
// prefix and suffix stay, and one delete and one insert change what is
// between, so cursors and concurrent typing elsewhere survive. Never splits
// a surrogate pair. Call it inside a transaction.
export function setDocumentText(doc: Y.Doc, next: string): void {
  const text = doc.getText('document');
  const old = text.toString();
  if (old === next) return;
  const max = Math.min(old.length, next.length);
  let start = 0;
  while (start < max && old.charCodeAt(start) === next.charCodeAt(start)) start++;
  if (start > 0 && isHighSurrogate(old.charCodeAt(start - 1))) start--;
  let end = 0;
  while (end < max - start && old.charCodeAt(old.length - 1 - end) === next.charCodeAt(next.length - 1 - end)) end++;
  if (end > 0 && isLowSurrogate(old.charCodeAt(old.length - end))) end--;
  const removed = old.length - start - end;
  if (removed > 0) text.delete(start, removed);
  const inserted = next.slice(start, next.length - end);
  if (inserted) text.insert(start, inserted);
}

// Tells a project's open clients that a snapshot was made, when any has it
// open.
export function snapshotMessage(snapshot: { id: string; kind: string }): string {
  return JSON.stringify({ type: 'snapshot', id: snapshot.id, kind: snapshot.kind });
}

export function broadcastToProject(sync: Sync, projectId: string, message: string): void {
  sync.hocuspocus.documents.get(projectId)?.broadcastStateless(message);
}
