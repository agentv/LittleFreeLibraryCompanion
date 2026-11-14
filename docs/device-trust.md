# Device verification and authentication

Status: decided 2026-11-13 (Vincent), except open question 4.

## Goal

Know two things about every change that reaches the server:

1. **Who** made it: a signed-in member whose status allows it (membership).
2. **Which device** it came from, and that the device is a real phone running our real app, registered to that member and not revoked.

This lets us curate inputs, cut off a lost or misused phone without touching the member's account, and keep provenance (`createdOnDeviceId`) on every record and change-history entry.

## How it works

### 1. First run: the device gets an identity

- The app creates a **device id** (UUID) and a **key pair** in the phone's secure hardware (iOS Secure Enclave / Android Keystore). The private key never leaves the phone.

### 2. Account first, outside the app

- Stewards create their account **before** using the app, through a **web sign-up form** run by the backend (it works in a phone's browser too). New accounts are `pending` until an admin approves them (membership curation).
- The app has **no sign-up screen**. It only signs in to an existing account. A "Don't have an account?" link opens the web form in the browser.

### 3. Sign in: the member proves who they are

- Email magic link or one-time code (backend R11). The server returns a short-lived **access token** and a **refresh token**.

### 4. Registration: the device proves what it is

1. The app asks the server for a one-time **challenge**.
2. It signs the challenge with the device's private key.
3. It asks Apple (**App Attest**) or Google (**Play Integrity**) for an attestation token over the same challenge. This shows the request comes from our genuine app on a genuine, unmodified phone.
4. It sends: device id, public key, signed challenge, attestation token, platform, model and app version.
5. The server checks the signature and the attestation, stores the device against the member, and sets its status.

### 5. Trust rule (decided)

- Attestation passed → device is **trusted** immediately. No admin step.
- Attestation failed or unavailable (emulator, rooted phone, very old phone) → device stays **pending** until an admin approves it.
- **No limit** on devices per member.
- A pending member's device can register, but nothing can be submitted until the member is approved (membership rule).
- **Shared phones are not supported.** One phone belongs to one member.

### 6. Trust lasts 30 days

- A device's credentials **expire 30 days** after it was last verified. After that the server treats it as untrusted until it verifies again.
- Trust also ends when the device is **removed** (by its member or an admin).
- Renewal: while the device is trusted and online, the app quietly repeats the handshake (new challenge, signature and attestation) in the last days before expiry, so active stewards never notice. If the phone was offline past the 30 days, the steward signs in again and the handshake runs; check-ins saved on the phone wait and upload once it's trusted again.

### 7. Every request

The server subsystem attaches:

- the member's access token,
- the device id,
- a timestamp,
- a signature over method, path, body hash and timestamp.

The server checks all four: token valid, device trusted and belongs to this member, signature matches the stored public key, timestamp within 5 minutes (blocks replays).

### 8. Tokens are tied to the device

- Refresh tokens only work together with the device's signature. Revoking a device stops it syncing at its next request, even if it still holds a token.

### 9. Offline work

- Records created offline carry `createdOnDeviceId`. At sync time the server checks the device's current status. A revoked device's pending uploads are not accepted (see open question 4).

### 10. Managing devices

- Members can see their own devices and revoke a lost phone.
- Admins can see and revoke any device, and approve pending ones.
- Signing out wipes the device keys and tokens. If there are unsynced check-ins, the app warns first.

## Where it lives in the app

- `mobile/src/membership/devices.ts`: `DeviceKeyStore`, `DeviceAttestation`, `DeviceRegistry`, `DeviceIdentity` contracts.
- `mobile/src/server`: asks membership's `CredentialsProvider` for the token and request signature; never reads keys itself.
- Error codes `device_untrusted` and `device_revoked` (mobile/src/server/types.ts) tell the app to stop syncing and explain why.

## Decisions (2026-11-13)

1. New device trusted automatically once attestation passes. ✔
2. No limit on devices per member. ✔
3. Shared phones not supported. ✔
4. Check-ins from a revoked device that never synced: **still open**. Recommendation: hold them for an admin to review rather than throw them away.
5. Failed attestation: device stays pending (admin can approve). ✔
6. Re-verification: device credentials expire after 30 days; the app renews quietly before then. ✔
