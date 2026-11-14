/**
 * The check-in draft (4-step wizard) and turning it into records. Nothing is
 * written to the local store until the steward taps Finish; captured files
 * are already in the app's own storage.
 */
import type { LocationFix } from '../location';
import type { Attachment, Comment, PhotoRole, UUID, Visit } from '../types/models';

export interface DraftPhoto {
  id: UUID;
  role: PhotoRole | null;
  localUri: string;
  thumbnailLocalUri: string;
  width: number;
  height: number;
  sizeBytes: number;
  capturedAt: string;
  latitude: number | null;
  longitude: number | null;
  /** Belongs to the written comment rather than the visit. */
  forComment: boolean;
}

export interface DraftAudio {
  id: UUID;
  localUri: string;
  mimeType: string;
  sizeBytes: number;
  durationS: number;
  capturedAt: string;
}

export interface CheckInDraft {
  visitId: UUID;
  libraryId: UUID;
  startedAt: string;
  photos: DraftPhoto[];
  stockLevel: Visit['stockLevel'];
  condition: Visit['condition'];
  doorOk: boolean | null;
  itemsRemoved: boolean | null;
  audio: DraftAudio | null;
  commentId: UUID;
  comment: string;
  position: LocationFix | null;
}

export function newDraft(ids: () => UUID, libraryId: UUID): CheckInDraft {
  return {
    visitId: ids(),
    libraryId,
    startedAt: new Date().toISOString(),
    photos: [],
    stockLevel: null,
    condition: null,
    doorOk: null,
    itemsRemoved: null,
    audio: null,
    commentId: ids(),
    comment: '',
    position: null,
  };
}

/** At most one photo per role per visit: giving a role to one photo takes it from any other. */
export function assignRole(photos: DraftPhoto[], photoId: UUID, role: PhotoRole | null): DraftPhoto[] {
  return photos.map((p) => {
    if (p.id === photoId) return { ...p, role };
    if (role && p.role === role) return { ...p, role: null };
    return p;
  });
}

/** The first role not yet filled, in the wizard's order. */
export function nextOpenRole(photos: DraftPhoto[], skipped: PhotoRole[] = []): PhotoRole | null {
  for (const r of ['shelf', 'establishing', 'location'] as PhotoRole[]) {
    if (!photos.some((p) => p.role === r) && !skipped.includes(r)) return r;
  }
  return null;
}

export type DraftRecord =
  | { table: 'visits'; record: Visit }
  | { table: 'comments'; record: Comment }
  | { table: 'attachments'; record: Attachment };

/** Records to save for a finished check-in, parents first. */
export function draftToRecords(d: CheckInDraft, who: { userId: UUID; deviceId: UUID }, now = new Date().toISOString()): DraftRecord[] {
  const pos = d.position;
  const visit: Visit = {
    id: d.visitId,
    libraryId: d.libraryId,
    userId: who.userId,
    visitedAt: d.startedAt,
    latitude: pos?.latitude ?? null,
    longitude: pos?.longitude ?? null,
    locationAccuracyM: pos?.accuracyM ?? null,
    locationSource: pos?.source ?? null,
    positionMocked: pos ? pos.mocked === true : null,
    createdOnDeviceId: who.deviceId,
    stockLevel: d.stockLevel,
    condition: d.condition,
    doorOk: d.doorOk,
    itemsRemoved: d.itemsRemoved,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  const out: DraftRecord[] = [{ table: 'visits', record: visit }];
  const body = d.comment.trim();
  const hasComment = body.length > 0;
  if (hasComment) {
    out.push({
      table: 'comments',
      record: { id: d.commentId, visitId: d.visitId, userId: who.userId, createdOnDeviceId: who.deviceId, body, createdAt: now, updatedAt: now, deletedAt: null },
    });
  }
  const base = {
    visitId: d.visitId,
    createdOnDeviceId: who.deviceId,
    storagePath: null,
    thumbnailStoragePath: null,
    caption: null,
    uploadStatus: 'pending' as const,
    createdAt: now,
    deletedAt: null,
  };
  d.photos.forEach((p, i) => {
    // A comment photo with no comment text still belongs to the visit.
    const commentId = p.forComment && hasComment ? d.commentId : null;
    out.push({
      table: 'attachments',
      record: {
        ...base,
        id: p.id,
        commentId,
        kind: 'photo',
        role: commentId ? null : p.role,
        localUri: p.localUri,
        thumbnailLocalUri: p.thumbnailLocalUri,
        mimeType: 'image/jpeg',
        sizeBytes: p.sizeBytes,
        width: p.width,
        height: p.height,
        durationS: null,
        sortOrder: i,
        capturedAt: p.capturedAt,
        latitude: p.latitude,
        longitude: p.longitude,
      },
    });
  });
  if (d.audio) {
    out.push({
      table: 'attachments',
      record: {
        ...base,
        id: d.audio.id,
        commentId: null,
        kind: 'audio',
        role: null,
        localUri: d.audio.localUri,
        thumbnailLocalUri: null,
        mimeType: d.audio.mimeType,
        sizeBytes: d.audio.sizeBytes,
        width: null,
        height: null,
        durationS: Math.round(d.audio.durationS * 10) / 10,
        sortOrder: d.photos.length,
        capturedAt: d.audio.capturedAt,
        latitude: null,
        longitude: null,
      },
    });
  }
  return out;
}
