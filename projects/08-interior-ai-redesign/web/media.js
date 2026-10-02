import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { mkdir, writeFile, rename, unlink, lstat, opendir, readFile, realpath, open } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { HttpError, UUID, requireUuid } from './boundaries.js';

export const MAX_BYTES = 10485760;
export const MAX_PIXELS = 20000000;
sharp.cache({ memory: 32, files: 0, items: 32 });
sharp.concurrency(1);
export function imageType(bytes) {
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes.length >= 8 && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if (bytes.length >= 12 && bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP') return 'image/webp';
  return null;
}
export async function normalizeImage(bytes, mime) {
  if (bytes.length > MAX_BYTES) throw new HttpError(413, 'image_too_large');
  if (!imageType(bytes) || imageType(bytes) !== mime) throw new HttpError(422, 'invalid_image');
  try {
    const metadata = await sharp(bytes, { limitInputPixels: MAX_PIXELS, failOn: 'warning' }).metadata();
    if (metadata.format !== {'image/jpeg':'jpeg','image/png':'png','image/webp':'webp'}[mime]) throw new HttpError(422, 'invalid_image');
    if (!metadata.width || !metadata.height || metadata.width * metadata.height > MAX_PIXELS) throw new HttpError(413, 'image_too_large');
    if ((metadata.pages ?? 1) !== 1) throw new HttpError(422, 'animated_image_denied');
    const { data, info } = await sharp(bytes, { limitInputPixels: MAX_PIXELS, failOn: 'warning' })
      .rotate().webp({ quality: 90 }).toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height, mime: 'image/webp',
      sha256: createHash('sha256').update(data).digest('hex') };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (/pixel limit/i.test(error.message)) throw new HttpError(413, 'image_too_large');
    throw new HttpError(422, 'invalid_image');
  }
}
export async function prepareStorage(dir) {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  if (await realpath(dir) !== resolve(dir)) throw new Error('Storage symlink denied');
  await mkdir(join(dir,'.tmp'), { recursive: true, mode: 0o700 });
  for (const path of [dir, join(dir,'.tmp')]) {
    const stat = await lstat(path);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Invalid private storage');
  }
  const probe = join(dir,'.tmp',randomUUID());
  await writeFile(probe, '', { flag: 'wx', mode: 0o600 }); await unlink(probe);
}
async function removeFile(path) {
  try { await unlink(path); } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
export function createMedia(pool, dir) {
  return {
    async save(accountId, bytes, mime) {
      const image = await normalizeImage(bytes, mime);
      const id = randomUUID(); const temp = join(dir,'.tmp',id); const final = join(dir,id);
      try {
        await writeFile(temp, image.data, { flag: 'wx', mode: 0o600 });
        await rename(temp, final);
        const { rows } = await pool.query(`INSERT INTO upload(id,account_id,private_key,sha256,width,height,mime)
          VALUES($1,$2,$1,$3,$4,$5,$6) RETURNING id,width,height,mime,created_at`,
          [id, accountId, image.sha256, image.width, image.height, image.mime]);
        return rows[0];
      } catch (error) {
        // Cleanup failures surface as opaque server errors; orphan sweep retries the final UUID.
        await Promise.all([removeFile(temp),removeFile(final)]);
        throw error;
      }
    },
    async list(accountId) {
      const { rows } = await pool.query(`SELECT id,width,height,mime,created_at FROM upload
        WHERE account_id=$1 AND deleted_at IS NULL ORDER BY created_at DESC,id DESC LIMIT 50`, [accountId]);
      return rows;
    },
    async read(accountId, id) {
      requireUuid(id);
      const { rows } = await pool.query(`SELECT private_key,mime FROM upload WHERE id=$1 AND account_id=$2 AND deleted_at IS NULL`, [id, accountId]);
      if (!rows[0]) throw new HttpError(404, 'not_found');
      const path = join(dir,requireUuid(rows[0].private_key));
      try {
        const stat = await lstat(path);
        if (!stat.isFile() || stat.isSymbolicLink()) throw new HttpError(404,'not_found');
        return { data: await readFile(path), mime: rows[0].mime };
      } catch (error) { if (error.code === 'ENOENT') throw new HttpError(404, 'not_found'); throw error; }
    },
    async delete(accountId, id) {
      requireUuid(id);
      const { rowCount } = await pool.query(`UPDATE upload SET deleted_at=now()
        WHERE id=$1 AND account_id=$2 AND deleted_at IS NULL`, [id, accountId]);
      if (!rowCount) throw new HttpError(404, 'not_found');
      try { await removeFile(join(dir,id)); } catch { console.error('media_cleanup_pending'); }
    }
  };
}
// No timer implicit in startup: run hourly via explicit operator maintenance.
// Per-folder cursor survives separate CLI processes. Stream names, retaining at
// most 2*scanLimit; stat/query at most scanLimit and delete at most deleteLimit.
// Lexical batches avoid depending on readdir order or a deleted resume filename.
async function readSweepCursor(path) {
  let file;
  try {
    file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > 64) throw new Error('Invalid sweep cursor');
    const cursor = await file.readFile('utf8');
    if (cursor !== '' && !UUID.test(cursor)) throw new Error('Invalid sweep cursor');
    return cursor;
  } catch (error) { if (error.code === 'ENOENT') return ''; throw error; }
  finally { await file?.close(); }
}
async function sweepBatch(folder, cursor, limit) {
  let names = [];
  for await (const entry of await opendir(folder)) {
    if (!UUID.test(entry.name) || entry.name <= cursor) continue;
    names.push(entry.name);
    if (names.length === limit * 2) names = names.sort().slice(0, limit);
  }
  return names.sort().slice(0, limit);
}
export async function sweepOrphans(pool, dir, now = Date.now(), { scanLimit = 10000, deleteLimit = 1000 } = {}) {
  for (const [value, max] of [[scanLimit,10000],[deleteLimit,1000]]) {
    if (!Number.isSafeInteger(value) || value < 1 || value > max) throw new Error('Invalid sweep budget');
  }
  let removed = 0;
  for (const folder of [dir,join(dir,'.tmp')]) {
    const folderStat = await lstat(folder);
    if (!folderStat.isDirectory() || folderStat.isSymbolicLink()) throw new Error('Invalid private storage');
    const cursorPath = join(folder,'.sweep-cursor');
    let cursor = await readSweepCursor(cursorPath);
    const names = await sweepBatch(folder,cursor,scanLimit);
    let folderRemoved = 0;
    if (!names.length) cursor = ''; // Next invocation starts a new cycle.
    for (const name of names) {
      if (folderRemoved >= deleteLimit) break;
      cursor = name;
      const path = join(folder,name);
      const stat = await lstat(path).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
      if (!stat?.isFile() || now - stat.mtimeMs <= 3600000) continue;
      const { rowCount } = await pool.query('SELECT id FROM upload WHERE private_key=$1 AND deleted_at IS NULL', [name]);
      if (!rowCount) { await removeFile(path); removed++; folderRemoved++; }
    }
    const temp = join(folder,`.sweep-cursor-${randomUUID()}`);
    try {
      await writeFile(temp,cursor,{flag:'wx',mode:0o600});
      await rename(temp,cursorPath);
    } finally { await removeFile(temp); }
  }
  return removed;
}
