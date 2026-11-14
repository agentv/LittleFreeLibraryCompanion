// Signed links for photos and audio (R7, R8). Upload links only for active
// members on trusted devices, and only for attachments of an existing visit.
import { Hono } from 'hono';
import { z } from 'zod';
import { withSession } from '../db/session.js';
import type { Deps } from '../deps.js';
import { parseJson, requireDevice, requireMember, type Vars } from '../http/context.js';
import { ApiError } from '../http/errors.js';
import { LIMITS } from '../limits.js';
import { MIME_EXT, mediaKey } from './storage.js';

const uploadBody = z.object({
  attachmentId: z.string().uuid(),
  visitId: z.string().uuid(),
  kind: z.enum(['photo', 'audio']),
  mimeType: z.string(),
});

const urlsBody = z.object({ paths: z.array(z.string().max(500)).min(1).max(200) });

export function mediaRoutes(deps: Deps) {
  const app = new Hono<{ Variables: Vars }>();
  app.use('*', requireMember(deps), requireDevice(deps, 'trusted'));

  /** Returns a presigned POST for the file and, for photos, one for its thumbnail. */
  app.post('/upload-urls', async (c) => {
    const body = uploadBody.parse(parseJson(c));
    const member = c.get('member');
    if (member.status !== 'active') throw new ApiError('forbidden', 'Your account is waiting for approval.');
    const ext = MIME_EXT[body.mimeType];
    if (!ext || !body.mimeType.startsWith(body.kind === 'photo' ? 'image/' : 'audio/')) {
      throw new ApiError('bad_request', 'Unsupported file type.');
    }
    const visit = await withSession(deps.pool, { memberId: member.id }, async (db) => {
      const r = await db.query<{ library_id: string }>('select library_id from visits where id = $1', [body.visitId]);
      return r.rows[0];
    });
    if (!visit) throw new ApiError('conflict', 'Sync the visit before uploading its files.');
    const base = { libraryId: visit.library_id, visitId: body.visitId, attachmentId: body.attachmentId };
    const ttl = LIMITS.uploadUrlTtlSeconds;
    const file = await deps.media.createUpload(
      mediaKey({ ...base, ext }),
      body.mimeType,
      body.kind === 'photo' ? LIMITS.photoMaxBytes : LIMITS.audioMaxBytes,
      ttl,
    );
    const thumbnail =
      body.kind === 'photo'
        ? await deps.media.createUpload(mediaKey({ ...base, ext: 'jpg', thumbnail: true }), 'image/jpeg', LIMITS.thumbnailMaxBytes, ttl)
        : null;
    return c.json({ file, thumbnail });
  });

  /** Short-lived download links, in a batch, for paths the member can see. */
  app.post('/download-urls', async (c) => {
    const { paths } = urlsBody.parse(parseJson(c));
    const member = c.get('member');
    const known = await withSession(deps.pool, { memberId: member.id }, async (db) => {
      const r = await db.query<{ p: string }>(
        `select storage_path as p from attachments where storage_path = any($1) and deleted_at is null
         union select thumbnail_storage_path from attachments where thumbnail_storage_path = any($1) and deleted_at is null`,
        [paths],
      );
      return new Set(r.rows.map((x) => x.p));
    });
    const urls: Record<string, string> = {};
    for (const p of paths) if (known.has(p)) urls[p] = await deps.media.downloadUrl(p, LIMITS.downloadUrlTtlSeconds);
    const expiresAt = new Date(deps.now().getTime() + LIMITS.downloadUrlTtlSeconds * 1000).toISOString();
    return c.json({ urls, expiresAt });
  });

  return app;
}
