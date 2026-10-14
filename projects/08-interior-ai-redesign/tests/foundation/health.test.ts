import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { freshDb } from '../helpers/db';
import { checkReady } from '../../apps/web/src/server/health';
import type { Base } from '../../apps/web/src/server/composition';
let db: Awaited<ReturnType<typeof freshDb>>, dir: string;
beforeAll(async () => { db = await freshDb(); dir = await mkdtemp(path.join(os.tmpdir(), 'n8-foundation-')); });
afterAll(async () => { if (db) await db.close(); if (dir) await rm(dir, { recursive: true, force: true }); });
describe('SC-US-017 readiness', () => {
  it('actual schema and private storage ready; schema drift/missing storage refuses without network', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch'); const base = { pool: db.pool, config: { assetDir: dir } } as Base;
    expect(await checkReady(base)).toBe(true); expect(await checkReady({ ...base, config: { ...base.config, assetDir: dir + '/missing' } })).toBe(false);
    await db.pool.query("UPDATE _schema_migration SET sha='invalid'"); expect(await checkReady(base)).toBe(false); expect(fetch).not.toHaveBeenCalled(); fetch.mockRestore();
  });
});
