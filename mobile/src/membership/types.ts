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
  createdAt: string;
  approvedAt: string | null;
  approvedBy: UUID | null;
}

export interface Session {
  member: Member;
  /** Token the sync subsystem passes to the backend. */
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
  /** Send a sign-in link or code to the email address. */
  requestSignIn(email: string): Promise<void>;
  /** Complete sign-in from the link/code. */
  completeSignIn(token: string): Promise<Session>;
  getSession(): Promise<Session | null>;
  signOut(): Promise<void>;
  onSessionChange(listener: (session: Session | null) => void): () => void;
}

/** Admin actions on members. One implementation per backend. */
export interface MemberDirectory {
  listMembers(filter?: { status?: MemberStatus; role?: UserRole }): Promise<Member[]>;
  approve(memberId: UUID): Promise<Member>;
  suspend(memberId: UUID, reason: string): Promise<Member>;
  setRole(memberId: UUID, role: UserRole): Promise<Member>;
}

/** What the rest of the app uses. */
export interface Membership {
  readonly auth: AuthProvider;
  readonly directory: MemberDirectory;
  can(member: Member, permission: Permission): boolean;
}
