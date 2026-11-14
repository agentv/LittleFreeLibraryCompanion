// The web sign-up form (R11a). Accounts are made here, never in the app, and
// start pending until an admin approves them. Works in a phone browser.
import { Hono } from 'hono';
import { z } from 'zod';
import { withSession } from '../db/session.js';
import type { Deps } from '../deps.js';

const form = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  displayName: z.string().trim().min(1).max(100),
});

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
}

// Colours follow the app's "Neighborly" look (terracotta on warm paper).
function page(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><style>
:root{--bg:#FBF6F1;--ink:#2B2420;--accent:#A8482A;--muted:#6B5F57;--line:#E6DCD3}
body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.5 Nunito,system-ui,sans-serif}
main{max-width:28rem;margin:0 auto;padding:2rem 1rem}
h1{font-size:1.6rem;margin:0 0 1rem}
label{display:block;font-weight:700;margin:1rem 0 .25rem}
input{width:100%;box-sizing:border-box;padding:.75rem;border:1px solid var(--line);border-radius:12px;font:inherit;background:#fff}
button{margin-top:1.5rem;width:100%;padding:.85rem;border:0;border-radius:999px;background:var(--accent);color:#fff;font:inherit;font-weight:700}
p.note{color:var(--muted)} p.error{color:var(--accent);font-weight:700}
</style></head><body><main>${body}</main></body></html>`;
}

function formPage(error = '', values: { email?: string; displayName?: string } = {}): string {
  return page(
    'Join as a steward',
    `<h1>Join as a Little Free Library steward</h1>
<p class="note">Create your account here, then sign in from the app. An admin approves new stewards before you can add check-ins.</p>
${error ? `<p class="error">${esc(error)}</p>` : ''}
<form method="post" action="/signup">
<label for="displayName">Your name</label><input id="displayName" name="displayName" autocomplete="name" required value="${esc(values.displayName ?? '')}">
<label for="email">Email</label><input id="email" name="email" type="email" autocomplete="email" required value="${esc(values.email ?? '')}">
<button type="submit">Create account</button></form>`,
  );
}

export function signupRoutes(deps: Deps) {
  const app = new Hono();

  app.get('/', (c) => c.html(formPage()));

  app.post('/', async (c) => {
    const raw = await c.req.parseBody();
    const values = { email: String(raw.email ?? ''), displayName: String(raw.displayName ?? '') };
    const parsed = form.safeParse(values);
    if (!parsed.success) return c.html(formPage('Please enter your name and a valid email address.', values), 400);
    const { email, displayName } = parsed.data;
    const made = await deps.auth.createAccount(email, displayName);
    if ('userId' in made) {
      await withSession(deps.pool, { system: true }, (db) =>
        db.query('insert into members (id, email, display_name) values ($1, $2, $3) on conflict (id) do nothing', [made.userId, email, displayName]),
      );
    }
    // Same answer whether or not the email was already registered.
    return c.html(
      page('Check your email', `<h1>Check your email</h1><p>We sent a link to <strong>${esc(email)}</strong> to confirm your address.</p>
<p class="note">After that, an admin will approve your account. You can sign in to the app now and look around while you wait.</p>`),
    );
  });

  app.get('/done', (c) =>
    c.html(page('Email confirmed', `<h1>Email confirmed</h1><p>Thanks. Open the app and sign in with this email. An admin will approve your account soon.</p>`)),
  );

  return app;
}
