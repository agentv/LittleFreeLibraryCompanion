/** Admin actions over the Node service (backend R16, R31, review queue). */
import type { ServerClient, ServerResult } from '../../../server';
import type { Device } from '../../../types/models';
import type { Member, MemberDirectory, ReviewItem } from '../../types';
import { RegistryError } from './registry';

function unwrap<T>(res: ServerResult<T>): T {
  if (!res.ok) throw new RegistryError(res.error.code, res.error.message);
  return res.data;
}

const q = (status?: string) => (status ? `?status=${encodeURIComponent(status)}` : '');
const id = (x: string) => encodeURIComponent(x);

export function createNodeMemberDirectory(client: () => ServerClient): MemberDirectory {
  return {
    async listMembers(filter) {
      return unwrap(await client().request<{ members: Member[] }>('GET', `/admin/members${q(filter?.status)}`)).members;
    },
    async approve(memberId) {
      return unwrap(await client().request<{ member: Member }>('POST', `/admin/members/${id(memberId)}/approve`, {})).member;
    },
    async suspend(memberId, reason) {
      return unwrap(await client().request<{ member: Member }>('POST', `/admin/members/${id(memberId)}/suspend`, { reason })).member;
    },
    async setRole(memberId, role) {
      return unwrap(await client().request<{ member: Member }>('POST', `/admin/members/${id(memberId)}/role`, { role })).member;
    },
    async listDevices(filter) {
      return unwrap(await client().request<{ devices: Device[] }>('GET', `/admin/devices${q(filter?.status)}`)).devices;
    },
    async approveDevice(deviceId) {
      unwrap(await client().request('POST', `/admin/devices/${id(deviceId)}/approve`, {}));
    },
    async revokeDevice(deviceId) {
      unwrap(await client().request('POST', `/admin/devices/${id(deviceId)}/revoke`, {}));
    },
    async listReview() {
      return unwrap(await client().request<{ items: ReviewItem[] }>('GET', '/admin/review?status=open')).items;
    },
    async acceptReview(itemId, note) {
      unwrap(await client().request('POST', `/admin/review/${id(itemId)}/accept`, note ? { note } : {}));
    },
    async rejectReview(itemId, note) {
      unwrap(await client().request('POST', `/admin/review/${id(itemId)}/reject`, note ? { note } : {}));
    },
  };
}
