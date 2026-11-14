import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

// Mirrors ServerErrorCode in mobile/src/server/types.ts (the app's side of the contract).
export type ErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'device_untrusted'
  | 'device_revoked'
  | 'version_unsupported'
  | 'conflict'
  | 'rate_limited'
  | 'bad_request'
  | 'not_found'
  | 'server_error';

export type DeviceReason = 'pending_approval' | 'attestation_failed' | 'expired';

const STATUS: Record<ErrorCode, ContentfulStatusCode> = {
  unauthorized: 401,
  forbidden: 403,
  device_untrusted: 403,
  device_revoked: 403,
  version_unsupported: 410,
  conflict: 409,
  rate_limited: 429,
  bad_request: 400,
  not_found: 404,
  server_error: 500,
};

export class ApiError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public deviceReason?: DeviceReason,
  ) {
    super(message);
  }
}

export function errorResponse(c: Context, err: ApiError) {
  return c.json(
    { error: { code: err.code, message: err.message, ...(err.deviceReason ? { deviceReason: err.deviceReason } : {}) } },
    STATUS[err.code],
  );
}
