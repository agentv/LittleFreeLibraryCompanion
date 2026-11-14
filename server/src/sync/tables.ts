// Wire format of synced records (camelCase, mirrors mobile/src/types/models.ts)
// and how each maps to its table.
import { z } from 'zod';

const uuid = z.string().uuid();
const iso = z.string().datetime({ offset: true });
const text = (max: number) => z.string().max(max);
const lat = z.number().min(-90).max(90);
const lng = z.number().min(-180).max(180);
const locationSource = z.enum(['gps', 'last_known', 'manual_pin']);

export const librarySchema = z.object({
  id: uuid,
  name: text(200).min(1),
  charterNumber: text(50).nullable(),
  description: text(4000).nullable(),
  latitude: lat,
  longitude: lng,
  locationAccuracyM: z.number().nonnegative().nullable(),
  locationSource,
  addressLine: text(300).nullable(),
  city: text(120).nullable(),
  county: text(120).nullable(),
  region: text(120).nullable(),
  postalCode: text(30).nullable(),
  country: text(120).nullable(),
  addressSource: z.enum(['typed', 'suggestion']).nullable(),
  addressStatus: z.enum(['missing', 'confirmed']),
  coverPhotoId: uuid.nullable(),
  createdBy: uuid,
  createdOnDeviceId: uuid,
  createdAt: iso,
  deletedAt: iso.nullable(),
});

export const visitSchema = z.object({
  id: uuid,
  libraryId: uuid,
  userId: uuid,
  visitedAt: iso,
  latitude: lat.nullable(),
  longitude: lng.nullable(),
  locationAccuracyM: z.number().nonnegative().nullable(),
  locationSource: locationSource.nullable(),
  /** Optional: the phone reported the position as mocked (R25). */
  positionMocked: z.boolean().nullable().optional(),
  createdOnDeviceId: uuid,
  stockLevel: z.enum(['empty', 'low', 'good', 'overflowing']).nullable(),
  condition: z.enum(['good', 'needs_cleaning', 'damaged']).nullable(),
  doorOk: z.boolean().nullable(),
  itemsRemoved: z.boolean().nullable(),
  createdAt: iso,
  deletedAt: iso.nullable(),
});

export const commentSchema = z.object({
  id: uuid,
  visitId: uuid,
  userId: uuid,
  createdOnDeviceId: uuid,
  body: text(10000).min(1),
  createdAt: iso,
  deletedAt: iso.nullable(),
});

export const attachmentSchema = z.object({
  id: uuid,
  visitId: uuid,
  commentId: uuid.nullable(),
  createdOnDeviceId: uuid,
  kind: z.enum(['photo', 'audio']),
  role: z.enum(['shelf', 'establishing', 'location']).nullable(),
  storagePath: text(500).nullable(),
  thumbnailStoragePath: text(500).nullable(),
  mimeType: text(100),
  sizeBytes: z.number().int().nonnegative().nullable(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  durationS: z.number().nonnegative().nullable(),
  caption: text(1000).nullable(),
  sortOrder: z.number().int(),
  capturedAt: iso.nullable(),
  latitude: lat.nullable(),
  longitude: lng.nullable(),
  createdAt: iso,
  deletedAt: iso.nullable(),
});

export type SyncedTable = 'libraries' | 'visits' | 'comments' | 'attachments';
export const SYNCED_TABLES: SyncedTable[] = ['libraries', 'visits', 'comments', 'attachments'];

export interface TableSpec {
  table: SyncedTable;
  schema: z.ZodObject<z.ZodRawShape>;
  /** camelCase field -> column, for fields the client sends. */
  fields: Record<string, string>;
  /** Fields kept from the first write; later pushes can't change them. */
  immutable: string[];
  /** Column naming who owns the row (edit rights, R15). */
  ownerColumn: string;
  /** Field the client sends for the owner, if any (attachments have none). */
  ownerField: string | null;
  /** Extra server-side columns returned on pull: column -> field. */
  serverFields: Record<string, string>;
}

function snake(field: string): string {
  return field.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
}
function fieldsOf(schema: z.ZodObject<z.ZodRawShape>): Record<string, string> {
  return Object.fromEntries(Object.keys(schema.shape).map((k) => [k, snake(k)]));
}

const common = { updated_at: 'updatedAt', change_seq: 'changeSeq' };

export const TABLES: Record<SyncedTable, TableSpec> = {
  libraries: {
    table: 'libraries',
    schema: librarySchema,
    fields: fieldsOf(librarySchema),
    immutable: ['id', 'createdBy', 'createdOnDeviceId', 'createdAt'],
    ownerColumn: 'created_by',
    ownerField: 'createdBy',
    serverFields: common,
  },
  visits: {
    table: 'visits',
    schema: visitSchema,
    fields: fieldsOf(visitSchema),
    immutable: ['id', 'libraryId', 'userId', 'createdOnDeviceId', 'createdAt'],
    ownerColumn: 'user_id',
    ownerField: 'userId',
    serverFields: {
      ...common,
      flag_far_from_library: 'flagFarFromLibrary',
      flag_low_accuracy: 'flagLowAccuracy',
      flag_mocked: 'flagMocked',
    },
  },
  comments: {
    table: 'comments',
    schema: commentSchema,
    fields: fieldsOf(commentSchema),
    immutable: ['id', 'visitId', 'userId', 'createdOnDeviceId', 'createdAt'],
    ownerColumn: 'user_id',
    ownerField: 'userId',
    serverFields: common,
  },
  attachments: {
    table: 'attachments',
    schema: attachmentSchema,
    fields: fieldsOf(attachmentSchema),
    immutable: ['id', 'visitId', 'commentId', 'kind', 'createdOnDeviceId', 'createdAt'],
    ownerColumn: 'created_by',
    ownerField: null,
    serverFields: { ...common, created_by: 'createdBy' },
  },
};

/** SELECT list returning wire-format field names. */
export function selectList(spec: TableSpec): string {
  const cols = [
    ...Object.entries(spec.fields).map(([f, c]) => `${c} as "${f}"`),
    ...Object.entries(spec.serverFields).map(([c, f]) => `${c} as "${f}"`),
  ];
  return cols.join(', ');
}

export const ADDRESS_FIELDS = ['addressLine', 'city', 'county', 'region', 'postalCode', 'country'] as const;
