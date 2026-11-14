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
export const SYNCED_TABLES: SyncedTable[] = ['libraries', 'visits', 'comments', 'attachments'];

/**
 * Where one row stands with the server.
 * local: changed on the phone, not accepted yet.
 * synced: the server has this version.
 * flagged: applied, but part of it (an address) waits for an admin.
 * held: the server is holding it for an admin (untrusted phone); not resent.
 * rejected: the server refused it; `note` says why. Not resent until edited.
 */
export type RowSyncState = 'local' | 'synced' | 'flagged' | 'held' | 'rejected';

export interface RowSyncInfo {
  state: RowSyncState;
  note: string | null;
}

export interface StoredRow<T extends SyncedTable = SyncedTable> {
  table: T;
  record: SyncedRecords[T];
  sync: RowSyncInfo;
  /** Bumped on every local save, so a push can tell if the row changed meanwhile. */
  version: number;
}

/**
 * The on-device database. The UI reads and writes only through this,
 * so it behaves the same online and offline.
 */
export interface LocalStore {
  get<T extends SyncedTable>(table: T, id: UUID): SyncedRecords[T] | null;
  /** Rows that aren't soft-deleted, optionally filtered by exact field values. */
  list<T extends SyncedTable>(table: T, where?: Partial<SyncedRecords[T]>): SyncedRecords[T][];
  syncInfo(table: SyncedTable, id: UUID): RowSyncInfo | null;
  /** Insert or update; marks the row as needing upload. */
  save<T extends SyncedTable>(table: T, record: SyncedRecords[T]): Promise<void>;
  /** Save several rows in one transaction (e.g. a finished check-in). */
  saveAll(rows: { [T in SyncedTable]: { table: T; record: SyncedRecords[T] } }[SyncedTable][]): Promise<void>;
  /** Soft delete (sets deletedAt); marks the row as needing upload. */
  remove(table: SyncedTable, id: UUID): Promise<void>;
  /** Change a device-only field without marking the row for upload. */
  patchLocal<T extends SyncedTable>(table: T, id: UUID, patch: Partial<SyncedRecords[T]>): Promise<void>;

  // Used by the sync engine.
  dirtyRows(): StoredRow[];
  setSyncState(updates: { table: SyncedTable; id: UUID; version: number; sync: RowSyncInfo }[]): Promise<void>;
  /** Merge rows from a pull. Rows with unsent local changes are kept as they are. */
  applyRemote(changes: ChangeSet): Promise<void>;
  getMeta(key: string): string | null;
  setMeta(key: string, value: string | null): Promise<void>;
  /** Wipe everything (sign-out). */
  clear(): Promise<void>;
  /** Called after any change, local or pulled. */
  subscribe(listener: () => void): () => void;
}

/** A batch of changes in one direction. */
export interface ChangeSet {
  libraries: Library[];
  visits: Visit[];
  comments: Comment[];
  attachments: Attachment[];
}

export interface RowOutcome {
  table: SyncedTable;
  id: UUID;
  reason: string;
}

export interface PushResult {
  accepted: { table: SyncedTable; id: UUID }[];
  rejected: RowOutcome[];
  /** Waiting for an admin (untrusted phone). Keep on the phone; don't resend. */
  held: RowOutcome[];
  /** Applied, but part of it (an address) waits for an admin. */
  flagged: RowOutcome[];
}

/** Talks to the backend for row data. One implementation per backend. Throws SyncError. */
export interface RemoteSync {
  push(changes: Partial<ChangeSet>): Promise<PushResult>;
  /** Fetch changes since a cursor the server gave us last time. */
  pull(cursor: string | null): Promise<{
    changes: ChangeSet;
    cursor: string;
    hasMore: boolean;
    /** Nice-to-have (FEATURES.addressSuggestions); absent or empty is normal. */
    addressSuggestions?: AddressSuggestion[];
  }>;
}

/** Uploads and fetches photo/audio files. One implementation per storage service. Throws SyncError. */
export interface MediaStore {
  /** Upload the attachment's local file (and photo thumbnail); resolves to the storage paths to save. */
  upload(
    attachment: Attachment,
    onProgress?: (fraction: number) => void,
  ): Promise<{ storagePath: string; thumbnailStoragePath: string | null }>;
  /** URLs the app can display or play, by storage path. May be short-lived. */
  getUrls(storagePaths: string[]): Promise<Record<string, string>>;
}

export type SyncState = 'idle' | 'syncing' | 'offline' | 'error' | 'paused';

export interface SyncStatus {
  state: SyncState;
  /** Rows and files waiting to go up ("3 items waiting to upload"). */
  pendingCount: number;
  /** Rows the server is holding for an admin. */
  heldCount: number;
  lastSyncedAt: string | null;
  lastError: string | null;
  /** Why syncing is paused (phone not approved, removed, member not active). */
  pausedReason: string | null;
}

/** Decides, before each run, what this phone may do (provided by the app's wiring from membership). */
export interface SyncGate {
  (): Promise<{ push: boolean; pull: boolean; upload: boolean; reason: string | null }>;
}

/** What the rest of the app uses. */
export interface SyncEngine {
  readonly store: LocalStore;
  readonly media: MediaStore;
  /** Run one sync now (also runs automatically when online). */
  syncNow(): Promise<void>;
  getStatus(): SyncStatus;
  subscribe(listener: (status: SyncStatus) => void): () => void;
}
