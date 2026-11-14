import { Hono } from 'hono';
import { ZodError } from 'zod';
import { adminRoutes } from './admin/routes.js';
import { authRoutes } from './auth/routes.js';
import type { Deps } from './deps.js';
import { deviceRoutes } from './devices/routes.js';
import { ApiError, errorResponse } from './http/errors.js';
import { meRoutes } from './me/routes.js';
import { mediaRoutes } from './media/routes.js';
import { signupRoutes } from './signup/routes.js';
import { syncRoutes } from './sync/routes.js';

export function createApp(deps: Deps) {
  const app = new Hono();

  app.onError((err, c) => {
    if (err instanceof ApiError) return errorResponse(c, err);
    if (err instanceof ZodError) {
      const issue = err.issues[0];
      return errorResponse(c, new ApiError('bad_request', `${issue?.path.join('.') || 'body'}: ${issue?.message ?? 'invalid'}`));
    }
    console.error(err);
    return errorResponse(c, new ApiError('server_error', 'Something went wrong on the server.'));
  });

  const v1 = new Hono();
  v1.get('/health', (c) => c.json({ apiVersions: deps.apiVersions, serverTime: deps.now().toISOString() }));
  v1.route('/auth', authRoutes(deps));
  v1.route('/me', meRoutes(deps));
  v1.route('/devices', deviceRoutes(deps));
  v1.route('/sync', syncRoutes(deps));
  v1.route('/media', mediaRoutes(deps));
  v1.route('/admin', adminRoutes(deps));
  app.route('/v1', v1);

  // Unknown API versions (R20): tell old or future apps plainly.
  app.all('/:version{v[0-9]+}/*', (c) => errorResponse(c, new ApiError('version_unsupported', 'This app version is no longer supported. Please update.')));
  app.get('/health', (c) => c.json({ ok: true }));
  app.route('/signup', signupRoutes(deps));
  app.notFound((c) => errorResponse(c, new ApiError('not_found', 'Not found.')));
  return app;
}
