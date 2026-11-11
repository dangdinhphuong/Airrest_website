import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../api/app';
import { CONFIG_KEYS } from '../config/configKeys';
import { PERM } from '../config/permissions';
import { generateTicketCode } from '../lib/codes';
import { closeDb, freshDb, mkAdmin, one } from './support/db';

const run = process.env.RUN_DB_TESTS ? describe : describe.skip;

run('nền tảng plan 2', () => {
  beforeAll(async () => freshDb({ roles: true }));
  afterAll(async () => closeDb());

  it('cấu hình cancellation.fee có mặc định đúng và parse được', () => {
    const k = CONFIG_KEYS['cancellation.fee'];
    expect(() => k.schema.parse(k.default)).not.toThrow();
    expect(k.default.STANDARD.freeHours).toBe(24);
  });

  it('GET /v1/admin/configs liệt kê cancellation.fee ở version 0', async () => {
    const t = (await mkAdmin([PERM.ADMIN_CONFIG_READ])).token;
    const res = await request(createApp()).get('/v1/admin/configs').set({ Authorization: `Bearer ${t}` });
    const list = res.body.items ?? res.body.configs;
    expect(list.find((i: any) => i.key === 'cancellation.fee')).toMatchObject({ version: 0, isDefault: true });
  });

  it('vai trò được gán đúng quyền mới', async () => {
    const perms = async (key: string) => (await one<{ permissions: string[] }>('SELECT permissions FROM roles WHERE key = $1 AND hotel_id IS NULL', [key]))!.permissions;
    expect(await perms('SUPPORT')).toContain('support:handle');
    expect(await perms('SUPPORT')).not.toContain('request:handle');
    expect(await perms('OPS')).toEqual(expect.arrayContaining(['shuttle:handle', 'hotel:scope:all']));
    expect(await perms('hotel_owner')).toEqual(expect.arrayContaining(['request:handle', 'shuttle:handle']));
    expect(await perms('SYSADMIN')).toEqual(expect.arrayContaining(['request:handle', 'support:handle', 'shuttle:handle']));
  });

  it('generateTicketCode đúng định dạng', () => {
    expect(generateTicketCode()).toMatch(/^SP-[0-9A-HJKMNP-TV-Z]{8}$/);
  });
});
