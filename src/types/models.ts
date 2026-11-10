/**
 * Core data model. Mirrors docs/features-and-data-model.md section 3.
 * IDs are UUIDs generated on the device so records can be created offline.
 * Timestamps are ISO 8601 strings.
 */

export type UUID = string;
export type ISODateTime = string;

export type UserRole = 'steward' | 'admin';

/**
 * pending: signed up, waiting for an admin to approve; can't submit yet.
 * active: approved; can check in and submit.
 * suspended: blocked from submitting; existing content stays.
 */
export type MemberStatus = 'pending' | 'active' | 'suspended';

export interface User {
  id: UUID;
  displayName: string;
  email: string;
  role: UserRole;
  status: MemberStatus;
  createdAt: ISODateTime;
}

export type AddressSource = 'geocoded' | 'manual';

/**
 * Where an address stands. The phone never geocodes; it sends coordinates
 * and the server fills the address in during sync (backend R22-R24).
 * pending: waiting for the server. resolved: server filled it in.
 * failed: server couldn't find one (steward may type it). manual: typed
 * by a person; the server must never overwrite it.
 */
export type AddressStatus = 'pending' | 'resolved' | 'failed' | 'manual';

/**
 * How a position was obtained. gps: a fresh fix from the phone.
 * last_known: the phone's cached position (may be stale).
 * manual_pin: a person placed it on a map.
 */
export type LocationSource = 'gps' | 'last_known' | 'manual_pin';

export interface Library {
  id: UUID;
  name: string;
  charterNumber: string | null;
  description: string | null;
  latitude: number;
  longitude: number;
  locationAccuracyM: number | null;
  locationSource: LocationSource;
  addressLine: string | null;
  city: string | null;
  county: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  addressSource: AddressSource;
  addressStatus: AddressStatus;
  /** Falls back to the latest establishing shot when null. */
  coverPhotoId: UUID | null;
  createdBy: UUID;
  /** Device that created the record (see docs/device-trust.md). */
  createdOnDeviceId: UUID;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  deletedAt: ISODateTime | null;
}

export type StockLevel = 'empty' | 'low' | 'good' | 'overflowing';
export type ConditionLevel = 'good' | 'needs_cleaning' | 'damaged';

export interface Visit {
  id: UUID;
  libraryId: UUID;
  userId: UUID;
  visitedAt: ISODateTime;
  /** Null when no position could be obtained (location problems are allowed). */
  latitude: number | null;
  longitude: number | null;
  locationAccuracyM: number | null;
  locationSource: LocationSource | null;
  createdOnDeviceId: UUID;
  /** Condition check (optional wizard step). */
  stockLevel: StockLevel | null;
  condition: ConditionLevel | null;
  doorOk: boolean | null;
  itemsRemoved: boolean | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  deletedAt: ISODateTime | null;
}

export interface Comment {
  id: UUID;
  visitId: UUID;
  userId: UUID;
  createdOnDeviceId: UUID;
  body: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  deletedAt: ISODateTime | null;
}

export type AttachmentKind = 'photo' | 'audio';
/** At most one photo per role per visit. */
export type PhotoRole = 'shelf' | 'establishing' | 'location';
export type UploadStatus = 'pending' | 'uploading' | 'done' | 'failed';

export interface Attachment {
  id: UUID;
  visitId: UUID;
  /** Set when the attachment belongs to a comment. */
  commentId: UUID | null;
  createdOnDeviceId: UUID;
  kind: AttachmentKind;
  role: PhotoRole | null;
  /** Object key in S3, once uploaded. */
  storagePath: string | null;
  /** File on the device (device-only field). */
  localUri: string | null;
  /** Photo thumbnail, made on the phone and uploaded alongside the photo. */
  thumbnailStoragePath: string | null;
  /** Device-only field. */
  thumbnailLocalUri: string | null;
  mimeType: string;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  durationS: number | null;
  caption: string | null;
  sortOrder: number;
  capturedAt: ISODateTime | null;
  latitude: number | null;
  longitude: number | null;
  /** Device-only field. */
  uploadStatus: UploadStatus;
  createdAt: ISODateTime;
  deletedAt: ISODateTime | null;
}

/**
 * A phone or tablet registered to a member (docs/device-trust.md).
 * pending: registered, not yet trusted. trusted: may sync.
 * revoked: blocked; its tokens no longer work.
 */
export type DeviceStatus = 'pending' | 'trusted' | 'revoked';

export interface Device {
  id: UUID;
  memberId: UUID;
  /** Public half of a key pair kept in the phone's secure hardware. */
  publicKey: string;
  platform: 'ios' | 'android';
  model: string | null;
  appVersion: string;
  /** Result of App Attest / Play Integrity at registration. */
  attestation: 'passed' | 'failed' | 'unavailable';
  status: DeviceStatus;
  registeredAt: ISODateTime;
  lastSeenAt: ISODateTime | null;
  revokedAt: ISODateTime | null;
  revokedBy: UUID | null;
}

export type ChangeAction = 'create' | 'update' | 'delete';

/**
 * One entry in the rich change history (written by the backend, read-only
 * in the app). See docs/backend-requirements.md R21.
 */
export interface ChangeHistoryEntry {
  id: UUID;
  table: 'libraries' | 'visits' | 'comments' | 'attachments' | 'members' | 'devices';
  recordId: UUID;
  action: ChangeAction;
  changedBy: UUID;
  /** Device the change came from, when it came from the app. */
  deviceId: UUID | null;
  changedAt: ISODateTime;
  /** The time on the device that made the change, if known. */
  deviceTime: ISODateTime | null;
  /** Field name -> before and after values. Empty for create/delete. */
  changes: Record<string, { before: unknown; after: unknown }>;
}

/** Edit rule: you can edit what you created; admins can edit anything. */
export function canEdit(user: Pick<User, 'id' | 'role'>, ownerId: UUID): boolean {
  return user.role === 'admin' || user.id === ownerId;
}
