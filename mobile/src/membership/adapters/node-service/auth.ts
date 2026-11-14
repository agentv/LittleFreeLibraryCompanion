/**
 * Sign-in through the Node service (backend: POST /v1/auth/code, /verify,
 * /refresh, GET /v1/me). Refresh is signed by the device (R30), so it only
 * works once this phone is registered.
 */
import type { ServerClient, ServerError } from '../../../server';
import type { AuthProvider, Member, Session } from '../../types';
import type { SecretStore } from '../secure-store/secrets';

const KEY = 'lfl.session.v1';

interface Stored {
  accessToken: string;
  refreshToken: string;
  /** ISO time the access token expires. */
  expiresAt: string;
  member: Member;
}

interface TokenReply {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  userId: string;
}

export class AuthError extends Error {
  constructor(public readonly error: ServerError) {
    super(error.message);
  }
}

export interface NodeAuth extends AuthProvider {
  /** Access token, refreshed first if it is about to expire. */
  accessToken(): Promise<string | null>;
  /** Refresh now. False means the steward must sign in again (or the device can't sign yet). */
  refresh(): Promise<boolean>;
}

export function createNodeAuth(opts: { client: () => ServerClient; secrets: SecretStore; signUpUrl: string }): NodeAuth {
  let stored: Stored | null | undefined;
  let refreshing: Promise<boolean> | null = null;
  const listeners = new Set<(s: Session | null) => void>();

  const toSession = (s: Stored | null): Session | null =>
    s ? { member: s.member, accessToken: s.accessToken, expiresAt: s.expiresAt } : null;

  async function load(): Promise<Stored | null> {
    if (stored !== undefined) return stored;
    const raw = await opts.secrets.get(KEY);
    try {
      stored = raw ? (JSON.parse(raw) as Stored) : null;
    } catch {
      stored = null;
    }
    return stored;
  }

  async function save(next: Stored | null) {
    stored = next;
    if (next) await opts.secrets.set(KEY, JSON.stringify(next));
    else await opts.secrets.delete(KEY);
    const session = toSession(next);
    listeners.forEach((l) => l(session));
  }

  const expiry = (seconds: number) => new Date(Date.now() + seconds * 1000).toISOString();

  async function fetchMember(accessToken: string): Promise<Member> {
    // Unsigned on purpose (backend): needed before the device is registered.
    const res = await opts.client().request<{ member: Member }>('GET', '/me', undefined, {
      signed: false,
      accessToken,
      retryOnUnauthorized: false,
    });
    if (!res.ok) throw new AuthError(res.error);
    return res.data.member;
  }

  async function doRefresh(): Promise<boolean> {
    const current = await load();
    if (!current) return false;
    const res = await opts.client().request<TokenReply>(
      'POST',
      '/auth/refresh',
      { refreshToken: current.refreshToken },
      { auth: false, signed: true, retryOnUnauthorized: false },
    );
    if (!res.ok) {
      // Offline or a server hiccup: keep the session and try later.
      if (res.error.code === 'offline' || res.error.code === 'timeout' || res.error.code === 'server_error') return false;
      // Not registered yet: the device can't sign, so refresh can't work; keep tokens until they expire.
      if (res.error.code === 'device_untrusted') return false;
      await save(null);
      return false;
    }
    await save({ ...current, accessToken: res.data.accessToken, refreshToken: res.data.refreshToken, expiresAt: expiry(res.data.expiresIn) });
    return true;
  }

  const auth: NodeAuth = {
    signUpUrl: opts.signUpUrl,

    async requestSignIn(email) {
      const res = await opts.client().request<void>('POST', '/auth/code', { email: email.trim() }, { auth: false, signed: false });
      if (!res.ok) throw new AuthError(res.error);
    },

    async completeSignIn(email, code) {
      const res = await opts.client().request<TokenReply>(
        'POST',
        '/auth/verify',
        { email: email.trim(), code: code.trim() },
        { auth: false, signed: false },
      );
      if (!res.ok) throw new AuthError(res.error);
      const member = await fetchMember(res.data.accessToken);
      const next: Stored = {
        accessToken: res.data.accessToken,
        refreshToken: res.data.refreshToken,
        expiresAt: expiry(res.data.expiresIn),
        member,
      };
      await save(next);
      return toSession(next)!;
    },

    async getSession() {
      return toSession(await load());
    },

    async refreshMember() {
      const token = await auth.accessToken();
      const current = await load();
      if (!token || !current) return null;
      try {
        const member = await fetchMember(token);
        await save({ ...current, member });
        return member;
      } catch {
        return current.member;
      }
    },

    async signOut() {
      await save(null);
    },

    onSessionChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async accessToken() {
      const current = await load();
      if (!current) return null;
      if (Date.parse(current.expiresAt) - Date.now() < 60_000) await auth.refresh();
      return (await load())?.accessToken ?? null;
    },

    refresh() {
      if (!refreshing) refreshing = doRefresh().finally(() => (refreshing = null));
      return refreshing;
    },
  };
  return auth;
}
