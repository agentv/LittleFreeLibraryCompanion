import { can, type Member, type Permission } from '../membership';
import { useSession } from './context';

/** The signed-in member (null while loading or signed out) and a permission check. */
export function useMe(): { me: Member | null; can: (p: Permission) => boolean } {
  const session = useSession();
  const me = session?.member ?? null;
  return { me, can: (p) => (me ? can(me, p) : false) };
}
