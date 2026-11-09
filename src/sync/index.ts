/**
 * Public entry point for the sync subsystem. Import from here only.
 * Adapters (SQLite, Supabase, S3) are not built yet; createSyncEngine
 * will wire chosen adapters together.
 */
export type {
  ChangeSet,
  LocalStore,
  MediaStore,
  RemoteSync,
  SyncEngine,
  SyncState,
  SyncStatus,
  SyncedTable,
} from './types';

import type { LocalStore, MediaStore, RemoteSync, SyncEngine } from './types';

export interface SyncAdapters {
  store: LocalStore;
  remote: RemoteSync;
  media: MediaStore;
}

export function createSyncEngine(_adapters: SyncAdapters): SyncEngine {
  throw new Error('Sync engine not implemented yet');
}
