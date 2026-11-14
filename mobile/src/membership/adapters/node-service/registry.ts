/** DeviceRegistry over the Node service (backend R27 to R31). */
import type { ServerClient, ServerResult } from '../../../server';
import type { Device } from '../../../types/models';
import type { DeviceRegistry } from '../../devices';

export class RegistryError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

function unwrap<T>(res: ServerResult<T>): T {
  if (!res.ok) throw new RegistryError(res.error.code, res.error.message);
  return res.data;
}

export function createNodeDeviceRegistry(client: () => ServerClient): DeviceRegistry {
  const registry: DeviceRegistry = {
    async getChallenge() {
      return unwrap(await client().request<{ challenge: string }>('POST', '/devices/challenge', {}, { signed: false })).challenge;
    },
    async register(input) {
      const body = {
        deviceId: input.deviceId,
        publicKey: input.publicKey,
        platform: input.platform,
        model: input.model,
        appVersion: input.appVersion,
        challenge: input.challenge,
        challengeSignature: input.signedChallenge,
        attestationToken: input.attestationToken,
      };
      return unwrap(await client().request<{ device: Device }>('POST', '/devices/register', body, { signed: false })).device;
    },
    async reverify(input) {
      const body = {
        challenge: input.challenge,
        challengeSignature: input.signedChallenge,
        attestationToken: input.attestationToken,
        appVersion: input.appVersion,
      };
      return unwrap(await client().request<{ device: Device }>('POST', '/devices/verify', body)).device;
    },
    async status(deviceId) {
      const mine = await registry.listMine();
      const d = mine.find((x) => x.id === deviceId);
      return d ? { status: d.status, trustExpiresAt: d.trustExpiresAt } : null;
    },
    async listMine() {
      return unwrap(await client().request<{ devices: Device[] }>('GET', '/me/devices')).devices;
    },
    async revoke(deviceId) {
      unwrap(await client().request('POST', `/me/devices/${encodeURIComponent(deviceId)}/revoke`, {}));
    },
  };
  return registry;
}
