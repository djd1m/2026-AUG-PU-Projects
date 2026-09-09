import { randomBytes } from 'node:crypto';
import { mkdir, open, readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../.runtime/', import.meta.url));
await mkdir(root, { recursive: true, mode: 0o700 });
for (const name of ['db-admin-password', 'db-app-password']) {
  const path = `${root}/${name}`;
  try {
    const file = await open(path, 'wx', 0o600);
    try { await file.writeFile(randomBytes(32).toString('hex') + '\n'); }
    finally { await file.close(); }
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const value = (await readFile(path, 'utf8')).trim();
    const info = await stat(path);
    if (!/^[a-f0-9]{64}$/.test(value) || (info.mode & 0o077)) {
      throw new Error(`Unsafe existing secret ${name}; refusing to replace a database credential.`);
    }
  }
}
console.log('Database secrets ready; values remain local in ignored .runtime/ (0600).');
