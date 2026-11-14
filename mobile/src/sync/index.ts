/**
 * Public entry point for the sync subsystem. Import from here only.
 */
import { createEngine } from './engine';
import type { LocalStore, MediaStore, RemoteSync, SyncEngine, SyncGate } from './types';
import type { SyncError } from './errors';
export type {
  ChangeSet,
  LocalStore,
  MediaStore,
  PushResult,
  RemoteSync,
  RowSyncInfo,
  RowSyncState,
  StoredRow,
  SyncEngine,
  SyncGate,
  SyncState,
  SyncStatus,
  SyncedRecords,
  SyncedTable,
} from './types';
export { SYNCED_TABLES } from './types';
export { SyncError, isTransient } from './errors';
export type { SyncErrorCode } from './errors';
export { countPending, needsFileUpload, waitingVisitIds } from './engine';
export type { RowPersistence } from './localStore';
export { createLocalStore, memoryPersistence } from './localStore';

export interface SyncAdapters {
  store: LocalStore;
  remote: RemoteSync;
  media: MediaStore;
  gate: SyncGate;
  onError?: (err: SyncError) => void;
}

export function createSyncEngine(adapters: SyncAdapters): SyncEngine {
  return createEngine(adapters);
}

/** Plain words for push rejections and holds (backend push reasons). */
export function describeSyncNote(note: string | null): string {
  if (!note) return '';
  if (note.startsWith('device_')) return 'Waiting for an admin to approve this phone.';
  if (note.startsWith('invalid')) return `The server couldn't accept this (${note.replace(/^invalid:\s*/, '')}).`;
  const map: Record<string, string> = {
    address_conflict: 'The new address is waiting for an admin, because it differs from the one on record.',
    owner_mismatch: 'Only the person who added this, or an admin, can change it.',
    device_mismatch: 'This was made on another phone.',
    permission_denied: "You can't change this.",
    member_not_active: 'Your account is waiting for approval.',
    parent_missing: 'Waiting for the library or visit to upload first.',
    role_taken: 'Another photo already fills this role on the visit.',
    file_missing: 'The file is still uploading.',
    file_too_large: 'The file is too large.',
    audio_too_long: 'The voice note is longer than 90 seconds.',
    unsupported_type: 'This kind of file is not supported.',
    batch_too_large: 'Too many changes at once; they will go in smaller batches.',
  };
  return map[note] ?? note;
}
