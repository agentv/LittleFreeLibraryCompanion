/**
 * fetch-based client for the Node service (backend "Requirements from the
 * backend"). Adds the access token and the device signature, maps every
 * failure to a ServerError, and never throws.
 */
import { sha256Hex } from '../../signing';
import type {
  CredentialsProvider,
  HttpMethod,
  RequestOptions,
  ServerClient,
  ServerConfig,
  ServerError,
  ServerErrorCode,
  ServerResult,
} from '../../types';

const KNOWN_CODES: ServerErrorCode[] = [
  'unauthorized',
  'forbidden',
  'device_untrusted',
  'device_revoked',
  'version_unsupported',
  'conflict',
  'rate_limited',
  'bad_request',
  'not_found',
  'server_error',
];

function codeForStatus(status: number): ServerErrorCode {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  if (status === 410) return 'version_unsupported';
  if (status === 429) return 'rate_limited';
  if (status >= 400 && status < 500) return 'bad_request';
  return 'server_error';
}

async function toError(res: Response): Promise<ServerError> {
  let body: { error?: { code?: string; message?: string; deviceReason?: ServerError['deviceReason'] } } | null = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  const raw = body?.error?.code as ServerErrorCode | undefined;
  const code = raw && KNOWN_CODES.includes(raw) ? raw : codeForStatus(res.status);
  const retryAfter = Number(res.headers.get('retry-after'));
  return {
    code,
    message: body?.error?.message ?? `Request failed (${res.status}).`,
    ...(body?.error?.deviceReason ? { deviceReason: body.error.deviceReason } : {}),
    ...(Number.isFinite(retryAfter) && retryAfter > 0 ? { retryAfterMs: retryAfter * 1000 } : {}),
  };
}

export function createFetchServerClient(config: ServerConfig, credentials: CredentialsProvider): ServerClient {
  const root = `${config.baseUrl}/${config.apiVersion}`;
  // Path part of the base URL (usually empty). React Native's URL class is
  // incomplete, so this avoids it.
  const basePath = config.baseUrl.replace(/^[a-z]+:\/\/[^/]+/i, '');

  async function send<T>(method: HttpMethod, path: string, body: unknown, options: RequestOptions): Promise<ServerResult<T>> {
    const url = `${root}${path}`;
    const text = body === undefined ? '' : JSON.stringify(body);
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (text) headers['Content-Type'] = 'application/json';

    if (options.auth !== false) {
      const token = options.accessToken ?? (await credentials.getAccessToken());
      if (!token) return { ok: false, error: { code: 'unauthorized', message: 'Please sign in.' } };
      headers.Authorization = `Bearer ${token}`;
    }
    if (options.signed !== false) {
      const timestamp = new Date().toISOString();
      // The server checks the path it received, query included.
      const signed = await credentials.signRequest({
        method,
        path: `${basePath}/${config.apiVersion}${path}`,
        bodyHash: sha256Hex(text),
        timestamp,
      });
      if (!signed) return { ok: false, error: { code: 'device_untrusted', message: 'This phone is not registered yet.', deviceReason: 'pending_approval' } };
      headers['X-Device-Id'] = signed.deviceId;
      headers['X-Timestamp'] = timestamp;
      headers['X-Signature'] = signed.signature;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    let res: Response;
    try {
      res = await fetch(url, { method, headers, body: text || undefined, signal: controller.signal });
    } catch (err) {
      const aborted = (err as { name?: string })?.name === 'AbortError';
      return {
        ok: false,
        error: aborted
          ? { code: 'timeout', message: 'The server took too long to answer.' }
          : { code: 'offline', message: 'No connection to the server.' },
      };
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) return { ok: false, error: await toError(res) };
    if (res.status === 204) return { ok: true, data: undefined as T };
    try {
      return { ok: true, data: (await res.json()) as T };
    } catch {
      return { ok: false, error: { code: 'server_error', message: 'The server sent an unreadable answer.' } };
    }
  }

  const client: ServerClient = {
    config,
    async request<T>(method: HttpMethod, path: string, body?: unknown, options: RequestOptions = {}) {
      const first = await send<T>(method, path, body, options);
      if (
        !first.ok &&
        first.error.code === 'unauthorized' &&
        options.auth !== false &&
        options.retryOnUnauthorized !== false &&
        (await credentials.onUnauthorized())
      ) {
        return send<T>(method, path, body, options);
      }
      return first;
    },
    health() {
      return send('GET', '/health', undefined, { auth: false, signed: false });
    },
  };
  return client;
}
