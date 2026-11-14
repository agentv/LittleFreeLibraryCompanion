/**
 * Public entry point for the server subsystem. Import from here only.
 */
import { createFetchServerClient } from './adapters/fetch/client';
import type { CredentialsProvider, ServerClient, ServerConfig, ServerErrorCode } from './types';
export type {
  CredentialsProvider,
  HttpMethod,
  RequestOptions,
  ServerClient,
  ServerConfig,
  ServerError,
  ServerErrorCode,
  ServerResult,
} from './types';
export { canonicalRequest, sha256Hex } from './signing';

/** Messages a steward can understand, for each error code. */
export const SERVER_ERROR_MESSAGES: Record<ServerErrorCode, string> = {
  offline: "No signal right now. Everything is saved and will upload on its own.",
  timeout: 'The server took too long to answer. We will try again.',
  unauthorized: 'Please sign in again.',
  forbidden: "Your account can't do that yet.",
  device_untrusted: 'This phone is waiting to be approved.',
  device_revoked: 'This phone was removed from your account.',
  version_unsupported: 'This version of the app is too old. Please update it.',
  conflict: 'Someone else changed this at the same time.',
  rate_limited: 'Too many requests. We will try again shortly.',
  bad_request: 'Something in this request was not accepted.',
  not_found: "That couldn't be found.",
  server_error: 'Something went wrong on the server. We will try again.',
};

export function createServerClient(config: ServerConfig, credentials: CredentialsProvider): ServerClient {
  return createFetchServerClient(config, credentials);
}
