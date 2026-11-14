// Photo and audio storage (backend R7 to R10). Files go straight from the
// phone to S3; this service only signs links and checks what arrived.
import { HeadObjectCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface UploadTarget {
  /** POST a multipart form here with `fields` first, then the file as `file`. */
  url: string;
  fields: Record<string, string>;
  key: string;
  expiresAt: string;
}

export interface MediaStorage {
  /** Presigned POST: the size range is enforced by S3 itself. */
  createUpload(key: string, contentType: string, maxBytes: number, ttlSeconds: number): Promise<UploadTarget>;
  downloadUrl(key: string, ttlSeconds: number): Promise<string>;
  /** Size of an uploaded object, or null if it isn't there. */
  head(key: string): Promise<{ sizeBytes: number } | null>;
}

export function createS3Storage(bucket: string, region: string): MediaStorage {
  const s3 = new S3Client({ region });
  return {
    async createUpload(key, contentType, maxBytes, ttlSeconds) {
      const post = await createPresignedPost(s3, {
        Bucket: bucket,
        Key: key,
        Conditions: [
          ['content-length-range', 1, maxBytes],
          ['eq', '$Content-Type', contentType],
        ],
        Fields: { 'Content-Type': contentType },
        Expires: ttlSeconds,
      });
      return { url: post.url, fields: post.fields, key, expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString() };
    },
    async downloadUrl(key, ttlSeconds) {
      return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: ttlSeconds });
    },
    async head(key) {
      try {
        const out = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return { sizeBytes: out.ContentLength ?? 0 };
      } catch (err) {
        const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
        if (status === 404 || status === 403) return null;
        throw err;
      }
    },
  };
}

/** Object keys. Thumbnails sit next to their photo. */
export function mediaKey(p: { libraryId: string; visitId: string; attachmentId: string; ext: string; thumbnail?: boolean }): string {
  return `libraries/${p.libraryId}/visits/${p.visitId}/${p.attachmentId}${p.thumbnail ? '.thumb' : ''}.${p.ext}`;
}

export const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/webp': 'webp',
  'audio/mp4': 'm4a',
  'audio/m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/mpeg': 'mp3',
};
