// Thin client for Supabase Auth (GoTrue). The app never calls GoTrue directly:
// every auth call goes through this service so refresh can be bound to a device
// (backend R30). Kept behind an interface so the auth provider can be replaced.
import { serviceRoleToken } from './jwt.js';

export interface Session {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  userId: string;
}

export interface AuthProvider {
  /** Email a one-time code / magic link to an existing account. */
  sendSignInCode(email: string): Promise<void>;
  /** Exchange the emailed code for a session. Null if the code is wrong or expired. */
  verifySignInCode(email: string, code: string): Promise<Session | null>;
  /** Rotate a refresh token. Null if it's invalid. */
  refresh(refreshToken: string): Promise<Session | null>;
  /** Create an account (web sign-up form) and email a confirmation link. Returns the user id. */
  createAccount(email: string, displayName: string): Promise<{ userId: string } | { error: 'exists' }>;
}

interface GoTrueSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: { id: string };
}

export function createGoTrueProvider(baseUrl: string, jwtSecret: string, publicUrl: string): AuthProvider {
  async function call(path: string, body: unknown, admin = false, method = 'POST'): Promise<Response> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (admin) headers.authorization = `Bearer ${await serviceRoleToken(jwtSecret)}`;
    return fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  }
  const toSession = (s: GoTrueSession): Session => ({
    accessToken: s.access_token,
    refreshToken: s.refresh_token,
    expiresIn: s.expires_in,
    userId: s.user.id,
  });

  return {
    async sendSignInCode(email) {
      // create_user false: accounts come only from the sign-up form (R11a).
      // Unknown emails get the same response, so nobody can probe for accounts.
      await call('/otp', { email, create_user: false });
    },
    async verifySignInCode(email, code) {
      const res = await call('/verify', { type: 'email', email, token: code });
      if (!res.ok) return null;
      return toSession((await res.json()) as GoTrueSession);
    },
    async refresh(refreshToken) {
      const res = await call('/token?grant_type=refresh_token', { refresh_token: refreshToken });
      if (!res.ok) return null;
      return toSession((await res.json()) as GoTrueSession);
    },
    async createAccount(email, displayName) {
      const res = await call('/admin/users', { email, email_confirm: false, user_metadata: { display_name: displayName } }, true);
      if (res.status === 422 || res.status === 409) return { error: 'exists' };
      if (!res.ok) throw new Error(`GoTrue create user failed: ${res.status}`);
      const user = (await res.json()) as { id: string };
      await call('/magiclink', { email, redirect_to: `${publicUrl}/signup/done` });
      return { userId: user.id };
    },
  };
}
