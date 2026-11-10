# Device verification and authentication

Status: proposed design, 2026-11-10. Open questions at the end.

## Goal

Know two things about every change that reaches the server:

1. **Who** made it: a signed-in member whose status allows it (membership).
2. **Which device** it came from, and that the device is a real phone running our real app, registered to that member and not revoked.

This lets us curate inputs, cut off a lost or misused phone without touching the member's account, and keep provenance (`createdOnDeviceId`) on every record and change-history entry.

## How it works

### 1. First run: the device gets an identity

- The app creates a **device id** (UUID) and a **key pair** in the phone's secure hardware (iOS Secure Enclave / Android Keystore). The private key never leaves the phone.

### 2. Sign in: the member proves who they are

- Email magic link or one-time code (backend R11). The server returns a short-lived **access token** and a **refresh token**.

### 3. Registration: the device proves what it is

1. The app asks the server for a one-time **challenge**.
2. It signs the challenge with the device's private key.
3. It asks Apple (**App Attest**) or Google (**Play Integrity**) for an attestation token over the same challenge. This shows the request comes from our genuine app on a genuine, unmodified phone.
4. It sends: device id, public key, signed challenge, attestation token, platform, model and app version.
5. The server checks the signature and the attestation, stores the device against the member, and sets its status.

### 4. Trust rule (proposed)

- Attestation passed and the member is active → device is **trusted** immediately.
- Attestation failed or unavailable (emulator, rooted phone, very old phone) → device is **pending** until an admin approves it.
- A pending member's device is registered but can't submit anything until the member is approved (membership rule).

### 5. Every request

The server subsystem attaches:

- the member's access token,
- the device id,
- a timestamp,
- a signature over method, path, body hash and timestamp.

The server checks all four: token valid, device trusted and belongs to this member, signature matches the stored public key, timestamp within 5 minutes (blocks replays).

### 6. Tokens are tied to the device

- Refresh tokens only work together with the device's signature. Revoking a device stops it syncing at its next request, even if it still holds a token.

### 7. Offline work

- Records created offline carry `createdOnDeviceId`. At sync time the server checks the device's current status. A revoked device's pending uploads are not accepted (see open question 4).

### 8. Managing devices

- Members can see their own devices and revoke a lost phone.
- Admins can see and revoke any device, and approve pending ones.
- Signing out wipes the device keys and tokens. If there are unsynced check-ins, the app warns first.

## Where it lives in the app

- `src/membership/devices.ts`: `DeviceKeyStore`, `DeviceAttestation`, `DeviceRegistry`, `DeviceIdentity` contracts.
- `src/server`: asks membership's `CredentialsProvider` for the token and request signature; never reads keys itself.
- Error codes `device_untrusted` and `device_revoked` (src/server/types.ts) tell the app to stop syncing and explain why.

## Open questions

1. Should a new device be trusted automatically when attestation passes, or should every new device need admin approval?
2. Is there a limit on devices per member (for example 3)?
3. Shared phones: will several stewards ever use one phone? If so, we need fast switching between members on one device.
4. Check-ins from a revoked device that never synced: reject them, or hold them for an admin to review?
5. Should we block phones that fail attestation entirely, or allow them as pending (current proposal)?
6. Should devices re-verify periodically, for example every 30 days?
