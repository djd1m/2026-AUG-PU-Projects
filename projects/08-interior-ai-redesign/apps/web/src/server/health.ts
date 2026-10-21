import { constants } from 'node:fs';
import { access, lstat, statfs } from 'node:fs/promises';
import { schemaReady } from '@n8/db/schema';
import type { Base } from './composition';
export async function checkReady(base: Pick<Base, 'pool'|'config'>): Promise<boolean> {
  try {
    if (base.config.aiLive && Date.parse(base.config.aiLive.rateValidUntil) <= Date.now()) return false;
    if (!await schemaReady(base.pool)) return false;
    const storage = await lstat(base.config.assetDir);
    if (!storage.isDirectory() || storage.isSymbolicLink()) return false;
    await access(base.config.assetDir, constants.R_OK | constants.W_OK | constants.X_OK);
    const space = await statfs(base.config.assetDir, { bigint: true });
    return space.bavail * space.bsize >= 512n * 1024n * 1024n;
  } catch { return false; }
}
