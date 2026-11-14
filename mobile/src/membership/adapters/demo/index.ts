/**
 * Demo mode: a pretend backend on the phone so the app can be tried before
 * the server is deployed (ENV.demoMode). Any email works; the code is 123456.
 */
import { ENV } from '../../../config/env';
import type { CredentialsProvider } from '../../../server';
import type { Device, UUID } from '../../../types/models';
import type { DeviceIdentity, DeviceRegistry, DeviceTrustState } from '../../devices';
import type { AuthProvider, Member, MemberDirectory, ReviewItem, Session } from '../../types';
import type { SecretStore } from '../secure-store/secrets';

export const DEMO_CODE = ENV.demoSignInCode;
export const DEMO_MEMBER_ID = '00000000-0000-4000-8000-000000000001';
const SESSION_KEY = 'lfl.demoSession.v1';
const DAY = 24 * 3600 * 1000;

export function createDemoMembership(opts: { secrets: SecretStore; signUpUrl: string; deviceId: UUID }) {
  const listeners = new Set<(s: Session | null) => void>();
  let session: Session | null | undefined;

  const member = (email: string): Member => ({
    id: DEMO_MEMBER_ID,
    email,
    displayName: email.split('@')[0]!.replace(/^\w/, (c) => c.toUpperCase()),
    role: 'admin',
    status: 'active',
  });

  async function load() {
    if (session !== undefined) return session;
    const raw = await opts.secrets.get(SESSION_KEY);
    session = raw ? (JSON.parse(raw) as Session) : null;
    return session;
  }
  async function save(next: Session | null) {
    session = next;
    if (next) await opts.secrets.set(SESSION_KEY, JSON.stringify(next));
    else await opts.secrets.delete(SESSION_KEY);
    listeners.forEach((l) => l(next));
  }

  const auth: AuthProvider = {
    signUpUrl: opts.signUpUrl,
    async requestSignIn() {},
    async completeSignIn(email, code) {
      if (code.trim() !== DEMO_CODE) throw new Error(`In demo mode the code is ${DEMO_CODE}.`);
      const next: Session = { member: member(email.trim() || 'steward@example.org'), accessToken: 'demo', expiresAt: new Date(Date.now() + DAY).toISOString() };
      await save(next);
      return next;
    },
    getSession: load,
    async refreshMember() {
      return (await load())?.member ?? null;
    },
    signOut: () => save(null),
    onSessionChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  const now = () => new Date().toISOString();
  const thisDevice = (): Device => ({
    id: opts.deviceId,
    memberId: DEMO_MEMBER_ID,
    platform: 'ios',
    model: 'This phone',
    appVersion: '1.0.0',
    attestation: 'unavailable',
    status: 'trusted',
    registeredAt: now(),
    lastVerifiedAt: now(),
    trustExpiresAt: new Date(Date.now() + 30 * DAY).toISOString(),
    lastSeenAt: now(),
    revokedAt: null,
    revokedBy: null,
  });

  let state: DeviceTrustState = {
    deviceId: opts.deviceId,
    registered: true,
    status: 'trusted',
    attestation: 'unavailable',
    trustExpiresAt: thisDevice().trustExpiresAt,
    lastCheckedAt: now(),
  };
  const device: DeviceIdentity = {
    getDeviceId: async () => opts.deviceId,
    ensureTrusted: async () => state,
    getState: async () => state,
    signRequest: async () => 'demo',
    markRevoked: async () => undefined,
    markExpired: async () => undefined,
    reset: async () => undefined,
    onStateChange: () => () => undefined,
  };

  const devices: DeviceRegistry = {
    getChallenge: async () => 'demo',
    register: async () => thisDevice(),
    reverify: async () => thisDevice(),
    status: async () => ({ status: 'trusted', trustExpiresAt: state.trustExpiresAt }),
    listMine: async () => [thisDevice()],
    revoke: async () => undefined,
  };

  let members: Member[] = [
    { id: '00000000-0000-4000-8000-0000000000a1', email: 'robin@example.org', displayName: 'Robin', role: 'steward', status: 'pending', createdAt: now() },
    { id: '00000000-0000-4000-8000-0000000000a2', email: 'sam@example.org', displayName: 'Sam', role: 'steward', status: 'active', createdAt: now() },
  ];
  let pendingDevices: Device[] = [
    { ...thisDevice(), id: '00000000-0000-4000-8000-0000000000d1', memberId: members[1]!.id, model: 'Pixel 8', platform: 'android', status: 'pending', trustExpiresAt: null },
  ];
  let review: ReviewItem[] = [
    {
      id: '00000000-0000-4000-8000-0000000000r1',
      kind: 'address_conflict',
      status: 'open',
      table: 'libraries',
      recordId: '00000000-0000-4000-8000-00000000b001',
      memberId: members[1]!.id,
      deviceId: null,
      reason: 'address_conflict',
      payload: { proposed: { addressLine: '1206 Maple Ave', city: 'Springfield' }, current: { addressLine: '1204 Maple Ave', city: 'Springfield' } },
      createdAt: now(),
    },
  ];
  const setStatus = (id: UUID, status: Member['status']) => {
    members = members.map((m) => (m.id === id ? { ...m, status } : m));
    return members.find((m) => m.id === id)!;
  };
  const directory: MemberDirectory = {
    listMembers: async (f) => members.filter((m) => !f?.status || m.status === f.status),
    approve: async (id) => setStatus(id, 'active'),
    suspend: async (id) => setStatus(id, 'suspended'),
    setRole: async (id, role) => {
      members = members.map((m) => (m.id === id ? { ...m, role } : m));
      return members.find((m) => m.id === id)!;
    },
    listDevices: async (f) => pendingDevices.filter((d) => !f?.status || d.status === f.status),
    approveDevice: async (id) => void (pendingDevices = pendingDevices.map((d) => (d.id === id ? { ...d, status: 'trusted' } : d))),
    revokeDevice: async (id) => void (pendingDevices = pendingDevices.map((d) => (d.id === id ? { ...d, status: 'revoked' } : d))),
    listReview: async () => review.filter((r) => r.status === 'open'),
    acceptReview: async (id) => void (review = review.map((r) => (r.id === id ? { ...r, status: 'accepted' } : r))),
    rejectReview: async (id) => void (review = review.map((r) => (r.id === id ? { ...r, status: 'rejected' } : r))),
  };

  const credentials: CredentialsProvider = {
    getAccessToken: async () => (await load())?.accessToken ?? null,
    signRequest: async () => ({ deviceId: opts.deviceId, signature: 'demo' }),
    onUnauthorized: async () => false,
  };

  return { auth, device, devices, directory, credentials };
}
