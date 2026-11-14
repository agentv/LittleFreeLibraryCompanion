/**
 * Capturing files: photos are resized on the phone (1600 px long edge) with
 * a 320 px thumbnail (backend R9, R10), and every file is copied into the
 * app's own storage straight away, never left only in a temp folder.
 */
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { PHOTO_MAX_EDGE_PX, THUMBNAIL_MAX_EDGE_PX } from '../config/limits';

function mediaDir(): Directory {
  const dir = new Directory(Paths.document, 'media');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

async function resizeTo(uri: string, width: number, height: number, maxEdge: number, quality: number) {
  const ctx = ImageManipulator.manipulate(uri);
  if (Math.max(width, height) > maxEdge) ctx.resize(width >= height ? { width: maxEdge } : { height: maxEdge });
  const ref = await ctx.renderAsync();
  const saved = await ref.saveAsync({ compress: quality, format: SaveFormat.JPEG });
  return saved;
}

export interface ProcessedPhoto {
  localUri: string;
  thumbnailLocalUri: string;
  width: number;
  height: number;
  sizeBytes: number;
  mimeType: 'image/jpeg';
}

export async function processPhoto(id: string, source: { uri: string; width: number; height: number }): Promise<ProcessedPhoto> {
  const dir = mediaDir();
  const big = await resizeTo(source.uri, source.width, source.height, PHOTO_MAX_EDGE_PX, 0.8);
  const thumb = await resizeTo(big.uri, big.width, big.height, THUMBNAIL_MAX_EDGE_PX, 0.7);
  const photo = new File(dir, `${id}.jpg`);
  const thumbnail = new File(dir, `${id}.thumb.jpg`);
  new File(big.uri).moveSync(photo);
  new File(thumb.uri).moveSync(thumbnail);
  return {
    localUri: photo.uri,
    thumbnailLocalUri: thumbnail.uri,
    width: big.width,
    height: big.height,
    sizeBytes: photo.size,
    mimeType: 'image/jpeg',
  };
}

export function keepAudio(id: string, uri: string): { localUri: string; sizeBytes: number } {
  const dir = mediaDir();
  const ext = uri.split('.').pop()?.toLowerCase() || 'm4a';
  const target = new File(dir, `${id}.${ext}`);
  new File(uri).moveSync(target);
  return { localUri: target.uri, sizeBytes: target.size };
}

/** Delete a captured file the steward threw away before finishing. */
export function discardFile(uri: string | null | undefined) {
  if (!uri) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // already gone
  }
}

export function audioMimeType(uri: string): string {
  const ext = uri.split('.').pop()?.toLowerCase();
  if (ext === 'mp3') return 'audio/mpeg';
  if (ext === 'aac') return 'audio/aac';
  return 'audio/mp4';
}
