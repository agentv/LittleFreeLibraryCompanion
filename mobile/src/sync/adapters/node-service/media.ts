/**
 * MediaStore over the Node service and S3 presigned POSTs (backend R7, R8, R10):
 * ask for upload targets, send each file straight to S3, cache download links.
 */
import { File, UploadType } from 'expo-file-system';
import type { ServerClient } from '../../../server';
import { SyncError } from '../../errors';
import type { MediaStore } from '../../types';
import { unwrap } from './remote';

interface UploadTarget {
  url: string;
  fields: Record<string, string>;
  key: string;
  expiresAt: string;
}

async function postToS3(target: UploadTarget, localUri: string, mimeType: string, onProgress?: (f: number) => void) {
  const file = new File(localUri);
  if (!file.exists) throw new SyncError('upload_failed', 'The file is no longer on this phone.');
  const res = await file
    .upload(target.url, {
      httpMethod: 'POST',
      uploadType: UploadType.MULTIPART,
      fieldName: 'file',
      mimeType,
      parameters: target.fields,
      onProgress: onProgress ? (p) => onProgress(p.totalBytes ? p.bytesSent / p.totalBytes : 0) : undefined,
    })
    .catch((err: unknown) => {
      throw new SyncError('offline', err instanceof Error ? err.message : 'Upload failed.');
    });
  if (res.status < 200 || res.status >= 300) throw new SyncError('upload_failed', `Upload failed (${res.status}).`);
}

export function createNodeMediaStore(client: () => ServerClient): MediaStore {
  const cache = new Map<string, { url: string; until: number }>();

  return {
    async upload(a, onProgress) {
      if (!a.localUri) throw new SyncError('upload_failed', 'Nothing to upload.');
      const targets = unwrap(
        await client().request<{ file: UploadTarget; thumbnail: UploadTarget | null }>('POST', '/media/upload-urls', {
          attachmentId: a.id,
          visitId: a.visitId,
          kind: a.kind,
          mimeType: a.mimeType,
        }),
      );
      await postToS3(targets.file, a.localUri, a.mimeType, onProgress);
      let thumbnailStoragePath: string | null = null;
      if (targets.thumbnail && a.thumbnailLocalUri) {
        await postToS3(targets.thumbnail, a.thumbnailLocalUri, 'image/jpeg');
        thumbnailStoragePath = targets.thumbnail.key;
      }
      return { storagePath: targets.file.key, thumbnailStoragePath };
    },

    async getUrls(paths) {
      const now = Date.now();
      const out: Record<string, string> = {};
      const missing: string[] = [];
      for (const p of paths) {
        const hit = cache.get(p);
        if (hit && hit.until > now) out[p] = hit.url;
        else missing.push(p);
      }
      for (let i = 0; i < missing.length; i += 200) {
        const res = unwrap(
          await client().request<{ urls: Record<string, string>; expiresAt: string }>('POST', '/media/download-urls', {
            paths: missing.slice(i, i + 200),
          }),
        );
        // Refresh a few minutes early.
        const until = Date.parse(res.expiresAt) - 5 * 60_000;
        for (const [p, url] of Object.entries(res.urls)) {
          cache.set(p, { url, until });
          out[p] = url;
        }
      }
      return out;
    },
  };
}
