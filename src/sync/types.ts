/**
 * Sync subsystem contract. Screens depend on these interfaces only;
 * vendor code lives in src/sync/adapters/<vendor>/.
 * See docs/architecture.md and docs/backend-requirements.md.
 */
import type { AddressSuggestion, Attachment, Comment, Library, UUID, Visit } from '../types/models';

/** Tables that sync between device and backend. */
export interface SyncedRecords {
  libraries: Library;
  visits: Visit;
  comments: Comment;
  attachments: Attachment;
}
export type SyncedTable = keyof SyncedRecords;

/**
 * The on-device database. The UI reads and writes only through this,
 * so it behaves the same online and offline.
 */
export interface LocalStore {
  get<T extends SyncedTable>(table: T, id: UUID): Promise<SyncedRecords[T] | null>;
  list<T extends SyncedTable>(table: T, where?: Partial<SyncedRecords[T]>): Promise<SyncedRecords[T][]>;
  /** Insert or update; marks the row as needing upload. */
  save<T extends SyncedTable>(table: T, record: SyncedRecords[T]): Promise<void>;
  /** Soft delete (sets deletedAt); marks the row as needing upload. */
  remove(table: SyncedTable, id: UUID): Promise<void>;
}

/** A batch of changes in one direction. */
export interface ChangeSet {
  libraries: Library[];
  visits: Visit[];
  comments: Comment[];
  attachments: Attachment[];
}

/** Talks to the backend for row data. One implementation per backend. */
export interface RemoteSync {
  /** Send local changes. Returns ids the server rejected, with reasons. */
  push(changes: ChangeSet): Promise<{ rejected: { id: UUID; reason: string }[] }>;
  /** Fetch changes since a cursor the server gave us last time. */
  pull(cursor: string | null): Promise<{
    changes: ChangeSet;
    cursor: string;
    /** Nice-to-have (FEATURES.addressSuggestions); absent or empty is normal. */
    addressSuggestions?: AddressSuggestion[];
  }>;
}

/** Uploads and fetches photo/audio files. One implementation per storage service. */
export interface MediaStore {
  /** Upload a local file; resolves to the storage path to save on the Attachment. */
  upload(attachment: Attachment, onProgress?: (fraction: number) => void): Promise<string>;
  /** A URL the app can display or play. May be short-lived. */
  getUrl(storagePath: string): Promise<string>;
}

export type SyncState = 'idle' | 'syncing' | 'offline' | 'error';

export interface SyncStatus {
  state: SyncState;
  /** Rows and files waiting to go up ("3 items waiting to upload"). */
  pendingCount: number;
  lastSyncedAt: string | null;
  lastError: string | null;
}

/** What the rest of the app uses. */
export interface SyncEngine {
  readonly store: LocalStore;
  /** Run one sync now (also runs automatically when online). */
  syncNow(): Promise<void>;
  getStatus(): SyncStatus;
  subscribe(listener: (status: SyncStatus) => void): () => void;
}
