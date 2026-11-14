/**
 * Demo mode (ENV.demoMode): a pretend server on the phone. Pushes are
 * accepted, the first pull returns sample libraries near `center`, and
 * files "upload" without leaving the phone.
 */
import type { Library, UUID, Visit } from '../../../types/models';
import type { ChangeSet, MediaStore, RemoteSync } from '../../types';

const DAY = 24 * 3600 * 1000;
const DEMO_DEVICE = '00000000-0000-4000-8000-0000000000de';
const SAM = '00000000-0000-4000-8000-0000000000a2';

function offset(center: { latitude: number; longitude: number }, northM: number, eastM: number) {
  const lat = center.latitude + northM / 111_320;
  const lng = center.longitude + eastM / (111_320 * Math.cos((center.latitude * Math.PI) / 180));
  return { latitude: lat, longitude: lng };
}

export function demoSeed(center: { latitude: number; longitude: number }, me: UUID): ChangeSet {
  const now = Date.now();
  const iso = (msAgo: number) => new Date(now - msAgo).toISOString();
  const lib = (id: string, name: string, northM: number, eastM: number, address: Partial<Library> | null): Library => ({
    id,
    name,
    charterNumber: null,
    description: null,
    ...offset(center, northM, eastM),
    locationAccuracyM: 8,
    locationSource: 'gps',
    addressLine: address?.addressLine ?? null,
    city: address?.city ?? null,
    county: null,
    region: address?.region ?? null,
    postalCode: null,
    country: address ? 'US' : null,
    addressSource: address ? 'typed' : null,
    addressStatus: address ? 'confirmed' : 'missing',
    coverPhotoId: null,
    createdBy: me,
    createdOnDeviceId: DEMO_DEVICE,
    createdAt: iso(90 * DAY),
    updatedAt: iso(90 * DAY),
    deletedAt: null,
  });
  const libraries = [
    lib('00000000-0000-4000-8000-00000000b001', 'Maple Avenue Library', 30, 25, { addressLine: '1204 Maple Ave', city: 'Springfield', region: 'IL' }),
    lib('00000000-0000-4000-8000-00000000b002', 'Oak Park Corner', -420, 610, null),
    lib('00000000-0000-4000-8000-00000000b003', 'Elm Street Box', 900, -300, { addressLine: '88 Elm St', city: 'Springfield', region: 'IL' }),
  ];
  const visit = (n: number, libraryId: string, daysAgo: number, by: UUID, c: Partial<Visit>): Visit => ({
    id: `00000000-0000-4000-8000-0000000c${String(n).padStart(4, '0')}`,
    libraryId,
    userId: by,
    visitedAt: iso(daysAgo * DAY),
    latitude: null,
    longitude: null,
    locationAccuracyM: null,
    locationSource: null,
    createdOnDeviceId: DEMO_DEVICE,
    stockLevel: null,
    condition: null,
    doorOk: null,
    itemsRemoved: null,
    createdAt: iso(daysAgo * DAY),
    updatedAt: iso(daysAgo * DAY),
    deletedAt: null,
    ...c,
  });
  const visits = [
    visit(1, libraries[0]!.id, 12, me, { stockLevel: 'low', condition: 'good', doorOk: true, itemsRemoved: false }),
    visit(2, libraries[1]!.id, 5, me, { stockLevel: 'good', condition: 'good', doorOk: true }),
    visit(3, libraries[2]!.id, 17, me, { condition: 'needs_cleaning', stockLevel: 'good' }),
    visit(4, libraries[1]!.id, 24, SAM, { stockLevel: 'overflowing' }),
  ];
  return { libraries, visits, comments: [], attachments: [] };
}

export function createDemoRemoteSync(opts: { me: () => UUID; center: () => Promise<{ latitude: number; longitude: number }> }): RemoteSync {
  return {
    async push(changes) {
      const accepted = (Object.keys(changes) as (keyof ChangeSet)[]).flatMap((t) => (changes[t] ?? []).map((r) => ({ table: t, id: r.id })));
      return { accepted, rejected: [], held: [], flagged: [] };
    },
    async pull(cursor) {
      if (cursor) return { changes: { libraries: [], visits: [], comments: [], attachments: [] }, cursor, hasMore: false };
      return { changes: demoSeed(await opts.center(), opts.me()), cursor: '1', hasMore: false };
    },
  };
}

export function createDemoMediaStore(): MediaStore {
  return {
    async upload(a) {
      return { storagePath: `demo/${a.id}`, thumbnailStoragePath: a.kind === 'photo' ? `demo/${a.id}.thumb` : null };
    },
    async getUrls() {
      return {};
    },
  };
}
