/**
 * Public entry point for the membership subsystem. Import from here only.
 */
import type { Member, Permission } from './types';
export type {
  AuthProvider,
  Member,
  MemberDirectory,
  MemberStatus,
  Membership,
  Permission,
  ReviewItem,
  Session,
} from './types';
export type {
  DeviceAttestation,
  DeviceIdentity,
  DeviceKeyStore,
  DeviceRegistry,
  DeviceTrustState,
} from './devices';

const ACTIVE_STEWARD: Permission[] = ['library.create', 'visit.create', 'content.editOwn'];
const ADMIN: Permission[] = [
  ...ACTIVE_STEWARD,
  'content.editAny',
  'member.approve',
  'member.suspend',
];

/**
 * Permission rules, independent of any backend. Pending and suspended
 * members can sign in and browse but not submit. The backend must
 * enforce the same rules (see docs/backend-requirements.md).
 */
export function can(member: Member, permission: Permission): boolean {
  if (member.status !== 'active') return false;
  const allowed = member.role === 'admin' ? ADMIN : ACTIVE_STEWARD;
  return allowed.includes(permission);
}

/** Plain words for a member's status, for badges and banners. */
export const MEMBER_STATUS_LABEL: Record<Member['status'], string> = {
  pending: 'Waiting for approval',
  active: 'Active member',
  suspended: 'Suspended',
};
