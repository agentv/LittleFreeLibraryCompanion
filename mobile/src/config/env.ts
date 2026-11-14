/**
 * Per-build settings, read from EXPO_PUBLIC_* environment variables
 * (put them in mobile/.env.local, which is gitignored). Screens never
 * hard-code the backend's address.
 */

const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/+$/, '');

export const ENV = {
  /** Backend origin, e.g. https://api.example.org (no /v1). */
  apiUrl,
  apiVersion: 'v1',
  requestTimeoutMs: 20_000,
  /**
   * Demo mode: sample data and a pretend server on the phone, so the app
   * can be tried before the backend is deployed. On when the variable is
   * "1", or when no API URL is set.
   */
  demoMode: process.env.EXPO_PUBLIC_DEMO_MODE === '1' || apiUrl === '',
  /** In demo mode, the sign-in code that always works. */
  demoSignInCode: '123456',
  /** The backend's web sign-up form (backend R11a). */
  signUpUrl: apiUrl ? `${apiUrl}/signup` : 'https://example.org/signup',
  /** Where members edit their account (backend R11b). */
  accountUrl: apiUrl ? `${apiUrl}/account` : 'https://example.org/account',
} as const;
