/**
 * Server subsystem contract: the one way the app talks to the backend.
 * Sync and membership adapters send their requests through this, so the
 * backend's address, API version, credentials and error handling live in
 * one replaceable place. Vendor/transport code lives in
 * src/server/adapters/<vendor>/.
 */

export interface ServerConfig {
  /** e.g. https://api.example.org (set per build; never hard-coded in screens). */
  baseUrl: string;
  /** API version the app speaks, e.g. "v1" (backend R20). */
  apiVersion: string;
  timeoutMs: number;
}

/**
 * Supplies credentials for each request. Provided by membership so the
 * server subsystem never reads membership internals.
 */
export interface CredentialsProvider {
  /** Member access token, refreshed as needed; null when signed out. */
  getAccessToken(): Promise<string | null>;
  /** This device's id and a signature over the request (docs/device-trust.md). */
  signRequest(req: { method: string; path: string; bodyHash: string; timestamp: string }): Promise<{
    deviceId: string;
    signature: string;
  } | null>;
  /**
   * Called once when the server answers `unauthorized`. Returns true if a
   * fresh access token is now available and the request should be retried.
   */
  onUnauthorized(): Promise<boolean>;
}

export type ServerErrorCode =
  | 'offline' // no network; caller should queue and retry later
  | 'timeout'
  | 'unauthorized' // token missing or expired; sign in again
  | 'forbidden' // signed in but not allowed (e.g. pending member)
  | 'device_untrusted' // device pending or failed verification
  | 'device_revoked' // device blocked; stop syncing, tell the steward
  | 'version_unsupported' // app too old; ask the steward to update
  | 'conflict'
  | 'rate_limited'
  | 'bad_request' // the app sent something the server can't use
  | 'not_found'
  | 'server_error';

export interface ServerError {
  code: ServerErrorCode;
  message: string;
  /** When to try again, if the server said. */
  retryAfterMs?: number;
  /** For device_untrusted: why. expired means re-verify (30-day trust lapsed). */
  deviceReason?: 'pending_approval' | 'attestation_failed' | 'expired';
}

export type ServerResult<T> = { ok: true; data: T } | { ok: false; error: ServerError };

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestOptions {
  /** Send the access token (default true). */
  auth?: boolean;
  /** Sign the request with the device key (default true). */
  signed?: boolean;
  /** Retry once after a token refresh on `unauthorized` (default true). */
  retryOnUnauthorized?: boolean;
  /** Use this access token instead of asking the CredentialsProvider (right after sign-in). */
  accessToken?: string;
}

export interface ServerClient {
  readonly config: ServerConfig;
  request<T>(method: HttpMethod, path: string, body?: unknown, options?: RequestOptions): Promise<ServerResult<T>>;
  /** Cheap reachability and version check. */
  health(): Promise<ServerResult<{ apiVersions: string[]; serverTime: string }>>;
}
