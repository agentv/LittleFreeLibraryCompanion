// Test harness: a fresh database per test file, the real schema and policies,
// and fakes for Supabase Auth, S3 and attestation.
//
// Needs a Postgres 15+ you can create databases on:
//   TEST_DATABASE_ADMIN_URL=postgres://postgres@localhost:5432/postgres npm test
import { generateKeyPairSync, randomUUID, sign, type KeyObject } from 'node:crypto';
import pg from 'pg';
import { SignJWT } from 'jose';
import { createApp } from '../src/app.js';
import type { AuthProvider, Session } from '../src/auth/gotrue.js';
import { createPool, type Pool } from '../src/db/pool.js';
import { migrate } from '../src/db/migrate.js';
import type { AttestationResult, AttestationVerifier } from '../src/devices/attestation.js';
import { canonicalRequest } from '../src/devices/crypto.js';
import type { MediaStorage } from '../src/media/storage.js';

export const JWT_SECRET = 'test-secret-at-least-32-characters-long!';

export class FakeMedia implements MediaStorage {
  objects = new Map<string, number>();
  async createUpload(key: string, contentType: string, maxBytes: number) {
    return { url: 'https://s3.test/bucket', fields: { key, 'Content-Type': contentType, maxBytes: String(maxBytes) }, key, expiresAt: new Date().toISOString() };
  }
  async downloadUrl(key: string) {
    return `https://s3.test/bucket/${key}?signed`;
  }
  async head(key: string) {
    const size = this.objects.get(key);
    return size === undefined ? null : { sizeBytes: size };
  }
}

export class FakeAttestation implements AttestationVerifier {
  result: AttestationResult = 'passed';
  async verify() {
    return this.result;
  }
}

export class FakeAuth implements AuthProvider {
  sessions = new Map<string, string>(); // refresh token -> user id
  accounts: { email: string; displayName: string; userId: string }[] = [];
  async sendSignInCode() {}
  async verifySignInCode(): Promise<Session | null> {
    return null;
  }
  async refresh(refreshToken: string): Promise<Session | null> {
    const userId = this.sessions.get(refreshToken);
    if (!userId) return null;
    return { accessToken: 'new-access', refreshToken: 'new-refresh', expiresIn: 3600, userId };
  }
  async createAccount(email: string, displayName: string) {
    if (this.accounts.some((a) => a.email === email)) return { error: 'exists' as const };
    const userId = randomUUID();
    this.accounts.push({ email, displayName, userId });
    return { userId };
  }
}

export interface TestMember {
  id: string;
  email: string;
  token: string;
}

export interface TestDevice {
  id: string;
  publicKey: string;
  privateKey: KeyObject;
}

export interface Harness {
  app: ReturnType<typeof createApp>;
  pool: Pool;
  owner: pg.Client;
  media: FakeMedia;
  auth: FakeAuth;
  attestation: FakeAttestation;
  clock: { now: Date };
  close(): Promise<void>;
  member(opts?: { role?: 'steward' | 'admin'; status?: 'pending' | 'active' | 'suspended' }): Promise<TestMember>;
  device(member: TestMember, opts?: { status?: 'pending' | 'trusted' | 'revoked'; expiresInDays?: number }): Promise<TestDevice>;
  call(method: string, path: string, body?: unknown, as?: { member?: TestMember; device?: TestDevice; timestamp?: string }): Promise<{ status: number; json: any }>;
}

export function newKeyPair(): { publicKey: string; privateKey: KeyObject } {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  return { publicKey: publicKey.export({ format: 'der', type: 'spki' }).toString('base64'), privateKey };
}

export function signWith(privateKey: KeyObject, message: string): string {
  return sign('sha256', Buffer.from(message), privateKey).toString('base64');
}

export async function accessToken(id: string, email: string, secret = JWT_SECRET): Promise<string> {
  return new SignJWT({ email, user_metadata: { display_name: 'Test' } })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(id)
    .setAudience('authenticated')
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(secret));
}

export async function createHarness(): Promise<Harness> {
  const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
  if (!adminUrl) throw new Error('Set TEST_DATABASE_ADMIN_URL to a Postgres URL that can create databases (see test/helpers.ts).');
  const dbName = `lfl_test_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`create database ${dbName}`);
  await admin.end();

  const ownerUrl = new URL(adminUrl);
  ownerUrl.pathname = `/${dbName}`;
  await migrate(ownerUrl.toString());
  const owner = new pg.Client({ connectionString: ownerUrl.toString() });
  await owner.connect();
  await owner.query(`alter role lfl_api login password 'lfl_api_test'`);

  const apiUrl = new URL(ownerUrl.toString());
  apiUrl.username = 'lfl_api';
  apiUrl.password = 'lfl_api_test';
  const pool = createPool(apiUrl.toString());

  const media = new FakeMedia();
  const auth = new FakeAuth();
  const attestation = new FakeAttestation();
  const clock = { now: new Date() };
  const app = createApp({
    pool,
    jwtSecret: JWT_SECRET,
    publicUrl: 'https://lfl.test',
    apiVersions: ['v1'],
    auth,
    attestation,
    media,
    now: () => clock.now,
  });

  const h: Harness = {
    app,
    pool,
    owner,
    media,
    auth,
    attestation,
    clock,
    async close() {
      await pool.end();
      await owner.end();
      const a = new pg.Client({ connectionString: adminUrl });
      await a.connect();
      await a.query(`drop database if exists ${dbName} with (force)`);
      await a.end();
    },
    async member(opts = {}) {
      const id = randomUUID();
      const email = `${id.slice(0, 8)}@example.test`;
      await owner.query('insert into members (id, email, display_name, role, status) values ($1, $2, $3, $4, $5)', [
        id, email, 'Test', opts.role ?? 'steward', opts.status ?? 'active',
      ]);
      return { id, email, token: await accessToken(id, email) };
    },
    async device(member, opts = {}) {
      const id = randomUUID();
      const { publicKey, privateKey } = newKeyPair();
      const status = opts.status ?? 'trusted';
      const expires = new Date(clock.now.getTime() + (opts.expiresInDays ?? 30) * 86400000).toISOString();
      await owner.query(
        `insert into devices (id, member_id, public_key, platform, app_version, attestation, status, last_verified_at, trust_expires_at)
         values ($1, $2, $3, 'ios', '1.0.0', $4, $5, now(), $6)`,
        [id, member.id, publicKey, status === 'pending' ? 'unavailable' : 'passed', status, status === 'pending' ? null : expires],
      );
      return { id, publicKey, privateKey };
    },
    async call(method, path, body, as = {}) {
      const raw = body === undefined ? '' : JSON.stringify(body);
      const headers: Record<string, string> = {};
      if (body !== undefined) headers['content-type'] = 'application/json';
      if (as.member) headers.authorization = `Bearer ${as.member.token}`;
      if (as.device) {
        const ts = as.timestamp ?? clock.now.toISOString();
        headers['x-device-id'] = as.device.id;
        headers['x-timestamp'] = ts;
        headers['x-signature'] = signWith(as.device.privateKey, canonicalRequest(method, path, raw, ts));
      }
      const res = await app.request(path, { method, headers, body: raw || undefined });
      const text = await res.text();
      return { status: res.status, json: text ? JSON.parse(text) : null };
    },
  };
  return h;
}

// Record builders in the app's wire format.
export function library(member: TestMember, device: TestDevice, over: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    name: 'Corner Library',
    charterNumber: null,
    description: null,
    latitude: 45.5,
    longitude: -122.6,
    locationAccuracyM: 8,
    locationSource: 'gps',
    addressLine: null,
    city: null,
    county: null,
    region: null,
    postalCode: null,
    country: null,
    addressSource: null,
    addressStatus: 'missing',
    coverPhotoId: null,
    createdBy: member.id,
    createdOnDeviceId: device.id,
    createdAt: new Date().toISOString(),
    deletedAt: null,
    ...over,
  };
}

export function visit(member: TestMember, device: TestDevice, libraryId: string, over: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    libraryId,
    userId: member.id,
    visitedAt: new Date().toISOString(),
    latitude: 45.5,
    longitude: -122.6,
    locationAccuracyM: 10,
    locationSource: 'gps',
    createdOnDeviceId: device.id,
    stockLevel: 'good',
    condition: 'good',
    doorOk: true,
    itemsRemoved: false,
    createdAt: new Date().toISOString(),
    deletedAt: null,
    ...over,
  };
}

export function attachment(device: TestDevice, visitId: string, over: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    visitId,
    commentId: null,
    createdOnDeviceId: device.id,
    kind: 'photo',
    role: 'shelf',
    storagePath: null,
    thumbnailStoragePath: null,
    mimeType: 'image/jpeg',
    sizeBytes: 500000,
    width: 1600,
    height: 1200,
    durationS: null,
    caption: null,
    sortOrder: 0,
    capturedAt: null,
    latitude: null,
    longitude: null,
    createdAt: new Date().toISOString(),
    deletedAt: null,
    ...over,
  };
}
