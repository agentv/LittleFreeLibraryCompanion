/** Reads over the local store that several screens share. */
import type { LocalStore } from '../sync';
import type { Attachment, Library, PhotoRole, UUID, Visit } from '../types/models';

export function visitsFor(store: LocalStore, libraryId: UUID): Visit[] {
  return store.list('visits', { libraryId }).sort((a, b) => b.visitedAt.localeCompare(a.visitedAt));
}

export function latestVisit(store: LocalStore, libraryId: UUID): Visit | null {
  return visitsFor(store, libraryId)[0] ?? null;
}

/** Most recent visit that recorded any condition answer. */
export function latestConditionVisit(store: LocalStore, libraryId: UUID): Visit | null {
  return visitsFor(store, libraryId).find((v) => v.stockLevel || v.condition || v.doorOk !== null || v.itemsRemoved !== null) ?? null;
}

export function attachmentsFor(store: LocalStore, visitId: UUID): Attachment[] {
  return store.list('attachments', { visitId }).sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Latest photo for a role across all visits of a library. */
export function latestRolePhoto(store: LocalStore, libraryId: UUID, role: PhotoRole): Attachment | null {
  for (const v of visitsFor(store, libraryId)) {
    const hit = store.list('attachments', { visitId: v.id, role, kind: 'photo' })[0];
    if (hit) return hit;
  }
  return null;
}

/** Cover photo: the chosen one, else the latest establishing shot. */
export function coverPhoto(store: LocalStore, library: Library): Attachment | null {
  if (library.coverPhotoId) {
    const chosen = store.get('attachments', library.coverPhotoId);
    if (chosen && !chosen.deletedAt) return chosen;
  }
  return latestRolePhoto(store, library.id, 'establishing');
}
