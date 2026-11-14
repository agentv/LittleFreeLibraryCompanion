// Runtime configuration, read once from the environment. See .env.example.

export interface Config {
  port: number;
  /** Postgres URL for role lfl_api (subject to row-level security). */
  databaseUrl: string;
  /** Supabase Auth (GoTrue) base URL, e.g. http://auth:9999 inside Docker. */
  gotrueUrl: string;
  /** Secret GoTrue signs access tokens with (HS256). Shared with GoTrue only. */
  jwtSecret: string;
  /** Public URL of this service, used in sign-in links and the sign-up page. */
  publicUrl: string;
  s3: {
    bucket: string;
    region: string;
  };
  /** API versions this build serves (backend R20). */
  apiVersions: string[];
  features: {
    /** Nice-to-have (R22). Off: no suggestions are produced or returned. */
    addressSuggestions: boolean;
  };
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

export function loadConfig(): Config {
  return {
    port: Number(process.env.PORT ?? 8080),
    databaseUrl: required('DATABASE_URL'),
    gotrueUrl: required('GOTRUE_URL'),
    jwtSecret: required('JWT_SECRET'),
    publicUrl: required('PUBLIC_URL'),
    s3: {
      bucket: required('S3_BUCKET'),
      region: required('AWS_REGION'),
    },
    apiVersions: ['v1'],
    features: {
      addressSuggestions: process.env.FEATURE_ADDRESS_SUGGESTIONS === 'on',
    },
  };
}
