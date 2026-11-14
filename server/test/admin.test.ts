import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from './helpers.js';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => h?.close());

describe('health and versions', () => {
  it('reports API versions and server time', async () => {
    const r = await h.call('GET', '/v1/health');
    expect(r.json.apiVersions).toEqual(['v1']);
  });
  it('tells an app on an unknown API version to update', async () => {
    const r = await h.call('GET', '/v2/sync/pull');
    expect(r.status).toBe(410);
    expect(r.json.error.code).toBe('version_unsupported');
  });
  it('asks for sign-in without a token', async () => {
    expect((await h.call('GET', '/v1/me')).status).toBe(401);
  });
});

describe('sign-up form', () => {
  it('creates a pending member', async () => {
    const res = await h.app.request('/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'email=New.Steward%40example.test&displayName=New+Steward',
    });
    expect(res.status).toBe(200);
    const row = await h.owner.query(`select role, status, display_name from members where email = 'new.steward@example.test'`);
    expect(row.rows[0]).toEqual({ role: 'steward', status: 'pending', display_name: 'New Steward' });
  });
  it('escapes what people type', async () => {
    const res = await h.app.request('/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'email=bad&displayName=%3Cscript%3E',
    });
    expect(res.status).toBe(400);
    expect(await res.text()).not.toContain('<script>');
  });
});

describe('member and device administration', () => {
  it('approves, suspends and changes roles; stewards cannot', async () => {
    const admin = await h.member({ role: 'admin' });
    const adminPhone = await h.device(admin);
    const newbie = await h.member({ status: 'pending' });

    const list = await h.call('GET', '/v1/admin/members?status=pending', undefined, { member: admin, device: adminPhone });
    expect(list.json.members.map((m: any) => m.id)).toContain(newbie.id);

    let r = await h.call('POST', `/v1/admin/members/${newbie.id}/approve`, {}, { member: admin, device: adminPhone });
    expect(r.json.member.status).toBe('active');
    r = await h.call('POST', `/v1/admin/members/${newbie.id}/suspend`, { reason: 'spam' }, { member: admin, device: adminPhone });
    expect(r.json.member).toMatchObject({ status: 'suspended', statusReason: 'spam' });

    const steward = await h.member();
    const phone = await h.device(steward);
    r = await h.call('POST', `/v1/admin/members/${newbie.id}/approve`, {}, { member: steward, device: phone });
    expect(r.status).toBe(403);
  });

  it('approves a pending device and lets members remove their own', async () => {
    const admin = await h.member({ role: 'admin' });
    const adminPhone = await h.device(admin);
    const m = await h.member();
    const pending = await h.device(m, { status: 'pending' });
    const r = await h.call('POST', `/v1/admin/devices/${pending.id}/approve`, {}, { member: admin, device: adminPhone });
    expect(r.json.device.status).toBe('trusted');
    expect((await h.call('GET', '/v1/sync/pull', undefined, { member: m, device: pending })).status).toBe(200);

    const mine = await h.call('GET', '/v1/me/devices', undefined, { member: m, device: pending });
    expect(mine.json.devices).toHaveLength(1);
    const rev = await h.call('POST', `/v1/me/devices/${pending.id}/revoke`, {}, { member: m, device: pending });
    expect(rev.status).toBe(200);
    expect((await h.call('GET', '/v1/sync/pull', undefined, { member: m, device: pending })).json.error.code).toBe('device_revoked');
  });
});
