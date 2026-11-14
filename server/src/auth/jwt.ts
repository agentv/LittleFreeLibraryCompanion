import { jwtVerify, SignJWT } from 'jose';

export interface AccessClaims {
  /** Supabase Auth user id; also the member id. */
  sub: string;
  email: string;
  displayName: string;
}

/** Verifies a Supabase Auth (GoTrue) access token, which is HS256-signed with JWT_SECRET. */
export async function verifyAccessToken(token: string, secret: string): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ['HS256'],
      audience: 'authenticated',
    });
    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') return null;
    const meta = (payload.user_metadata ?? {}) as Record<string, unknown>;
    return {
      sub: payload.sub,
      email: payload.email,
      displayName: typeof meta.display_name === 'string' ? meta.display_name : '',
    };
  } catch {
    return null;
  }
}

/** Mints a token GoTrue accepts for its admin API (role service_role). */
export async function serviceRoleToken(secret: string): Promise<string> {
  return new SignJWT({ role: 'service_role' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(secret));
}
