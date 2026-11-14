/** "1 check-in waiting to upload" and why syncing might be paused. */
import { useOnline, useSyncStatus } from '../services/context';
import { Banner } from './kit';

export function SyncBanner() {
  const status = useSyncStatus();
  const online = useOnline();
  if (status.pausedReason && status.pausedReason !== 'Signed out.') return <Banner icon="shield">{status.pausedReason}</Banner>;
  if (status.pendingCount > 0) {
    const n = status.pendingCount;
    const what = `${n} item${n === 1 ? '' : 's'} waiting to upload.`;
    return <Banner>{online ? `${what} Uploading now.` : `${what} It will go when you have signal.`}</Banner>;
  }
  if (status.heldCount > 0) return <Banner icon="shield">{`${status.heldCount} item${status.heldCount === 1 ? ' is' : 's are'} waiting for an admin to review.`}</Banner>;
  if (status.state === 'error' && status.lastError) return <Banner icon="shield">{`Sync problem: ${status.lastError}`}</Banner>;
  return null;
}
