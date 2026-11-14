// Apple App Attest / Google Play Integrity checks (backend R28).
// Each platform's verifier sits behind this interface. Until the Apple Team ID,
// bundle id and Google Cloud project exist, NotConfiguredVerifier answers
// "unavailable", so devices register as pending and an admin approves them.

export type AttestationResult = 'passed' | 'failed' | 'unavailable';

export interface AttestationInput {
  platform: 'ios' | 'android';
  /** App Attest attestation object or Play Integrity token, base64. */
  token: string | null;
  /** The one-time challenge the token was made over. */
  challenge: string;
  deviceId: string;
  publicKey: string;
}

export interface AttestationVerifier {
  verify(input: AttestationInput): Promise<AttestationResult>;
}

export class NotConfiguredVerifier implements AttestationVerifier {
  async verify(): Promise<AttestationResult> {
    return 'unavailable';
  }
}

/** Routes each platform to its own verifier. */
export class PlatformVerifier implements AttestationVerifier {
  constructor(private readonly byPlatform: Partial<Record<'ios' | 'android', AttestationVerifier>>) {}
  async verify(input: AttestationInput): Promise<AttestationResult> {
    if (!input.token) return 'unavailable';
    const verifier = this.byPlatform[input.platform];
    return verifier ? verifier.verify(input) : 'unavailable';
  }
}
