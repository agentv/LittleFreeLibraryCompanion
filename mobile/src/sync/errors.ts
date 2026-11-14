/** Errors thrown by RemoteSync and MediaStore adapters. */
export type SyncErrorCode =
  | 'offline'
  | 'timeout'
  | 'unauthorized'
  | 'forbidden'
  | 'device_untrusted'
  | 'device_revoked'
  | 'version_unsupported'
  | 'conflict'
  | 'rate_limited'
  | 'bad_request'
  | 'not_found'
  | 'server_error'
  | 'upload_failed';

export class SyncError extends Error {
  readonly code: SyncErrorCode;
  readonly deviceReason?: string;
  constructor(code: SyncErrorCode, message: string, deviceReason?: string) {
    super(message);
    this.code = code;
    this.deviceReason = deviceReason;
  }
}

/** Errors that mean "try again later", not "something is wrong". */
export function isTransient(code: SyncErrorCode): boolean {
  return code === 'offline' || code === 'timeout' || code === 'rate_limited' || code === 'server_error' || code === 'upload_failed';
}
