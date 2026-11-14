/**
 * Membership subsystem contract: who someone is, their role and status,
 * and what they may do. Used to curate who contributes to the data set.
 * Vendor code lives in src/membership/adapters/<vendor>/.
 */
import type { MemberStatus, UUID, UserRole } from '../types/models';

export type { MemberStatus };

export interface Member {
  id: UUID;
  displayName: string;
  email: string;
  role: UserRole;
  status: MemberStatus;
  /** Admin lists include these; GET /v1/me does not. */
  createdAt?: string;
  statusReason?: string | null;
}

export interface Session {
  member: Member;
  /** Token the server subsystem passes to the backend. */
  accessToken: string;
  expiresAt: string;
}

export type Permission =
  | 'library.create'
  | 'visit.create'
  | 'content.editOwn'
  | 'content.editAny'
  | 'member.approve'
  | 'member.suspend';

/**
 * Sign-in only. Accounts are created beforehand on the backend's web
 * sign-up form (backend R11a); the app has no sign-up screen.
 * One implementation per auth provider.
 */
export interface AuthProvider {
  /** Web sign-up form to open in the browser for people without an account. */
  readonly signUpUrl: string;
  /** Send a one-time sign-in code to the email address. */
  requestSignIn(email: string): Promise<void>;
  /** Complete sign-in with the emailed code. */
  completeSignIn(email: string, code: string): Promise<Session>;
  getSession(): Promise<Session | null>;
  /** Fetch the member again (role and status change when an admin acts). */
  refreshMember(): Promise<Member | null>;
  /** Clears tokens. Device keys are wiped by DeviceIdentity.reset. */
  signOut(): Promise<void>;
  onSessionChange(listener: (session: Session | null) => void): () => void;
}

/** A change waiting for an admin: a held push or an address conflict (backend R22a, R32a). */
export interface ReviewItem {
  id: UUID;
  kind: 'held_change' | 'address_conflict';
  status: 'open' | 'accepted' | 'rejected';
  table: 'libraries' | 'visits' | 'comments' | 'attachments';
  recordId: UUID;
  memberId: UUID;
  deviceId: UUID | null;
  reason: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

/** Admin actions on members. One implementation per backend. */
export interface MemberDirectory {
  listMembers(filter?: { status?: MemberStatus }): Promise<Member[]>;
  approve(memberId: UUID): Promise<Member>;
  suspend(memberId: UUID, reason: string): Promise<Member>;
  setRole(memberId: UUID, role: UserRole): Promise<Member>;
  listDevices(filter?: { status?: 'pending' | 'trusted' | 'revoked' }): Promise<import('../types/models').Device[]>;
  approveDevice(deviceId: UUID): Promise<void>;
  revokeDevice(deviceId: UUID): Promise<void>;
  listReview(): Promise<ReviewItem[]>;
  acceptReview(id: UUID, note?: string): Promise<void>;
  rejectReview(id: UUID, note?: string): Promise<void>;
}

/** What the rest of the app uses. */
export interface Membership {
  readonly auth: AuthProvider;
  readonly directory: MemberDirectory;
  readonly device: import('./devices').DeviceIdentity;
  readonly devices: import('./devices').DeviceRegistry;
  /** Hand this to the server subsystem. */
  readonly credentials: import('../server').CredentialsProvider;
  can(member: Member, permission: Permission): boolean;
}
