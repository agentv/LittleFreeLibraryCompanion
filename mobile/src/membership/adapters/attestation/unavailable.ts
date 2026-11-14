/**
 * Placeholder until the Apple and Google developer accounts exist (backend
 * Q10). Without attestation, every new phone registers as pending and an
 * admin approves it.
 */
import type { DeviceAttestation } from '../../devices';

export function createUnavailableAttestation(): DeviceAttestation {
  return {
    isSupported: async () => false,
    attest: async () => {
      throw new Error('Attestation is not available in this build.');
    },
  };
}
