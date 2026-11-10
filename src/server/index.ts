/**
 * Public entry point for the server subsystem. Import from here only.
 * The transport adapter (e.g. fetch-based) is not built yet.
 */
export type {
  CredentialsProvider,
  ServerClient,
  ServerConfig,
  ServerError,
  ServerErrorCode,
  ServerResult,
} from './types';

import type { CredentialsProvider, ServerClient, ServerConfig } from './types';

export function createServerClient(_config: ServerConfig, _credentials: CredentialsProvider): ServerClient {
  throw new Error('Server client not implemented yet');
}
