/** RemoteSync over the Node service: POST /v1/sync/push, GET /v1/sync/pull. */
import type { ServerClient, ServerResult } from '../../../server';
import { SyncError } from '../../errors';
import type { ChangeSet, PushResult, RemoteSync } from '../../types';

export function unwrap<T>(res: ServerResult<T>): T {
  if (!res.ok) throw new SyncError(res.error.code, res.error.message, res.error.deviceReason);
  return res.data;
}

/** Device-only fields stay on the phone (the server ignores them anyway). */
function wire(changes: Partial<ChangeSet>): Partial<ChangeSet> {
  if (!changes.attachments) return changes;
  return {
    ...changes,
    attachments: changes.attachments.map(({ localUri: _l, thumbnailLocalUri: _t, uploadStatus: _u, ...rest }) => rest as never),
  };
}

const empty = (): ChangeSet => ({ libraries: [], visits: [], comments: [], attachments: [] });

export function createNodeRemoteSync(client: () => ServerClient): RemoteSync {
  return {
    async push(changes) {
      return unwrap(await client().request<PushResult>('POST', '/sync/push', { changes: wire(changes) }));
    },
    async pull(cursor) {
      const path = cursor ? `/sync/pull?cursor=${encodeURIComponent(cursor)}` : '/sync/pull';
      const res = unwrap(await client().request<{ changes: Partial<ChangeSet>; cursor: string; hasMore: boolean }>('GET', path));
      return { changes: { ...empty(), ...res.changes }, cursor: res.cursor, hasMore: res.hasMore };
    },
  };
}
