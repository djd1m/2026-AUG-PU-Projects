import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const all = process.argv.includes('--all');
const files = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes:true }).catch(() => [])) {
    if (['node_modules','.runtime','prototype','docs','.claude'].includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (/\.m?js$/.test(path)) files.push(path);
  }
}
for (const dir of ['apps','shared','variants','scripts','tests']) await walk(join(root, dir));
const failures = [];
for (const file of files) {
  const source = await readFile(file, 'utf8');
  if (source.split('\n').length > 500) failures.push(`${relative(root,file)} exceeds500lines`);
  const check = spawnSync(process.execPath, ['--check', file], { encoding:'utf8' });
  if (check.status !== 0) failures.push(check.stderr);
  for (const match of source.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)) {
    const dep = match[1];
    if (dep.startsWith('.')) {
      const path = resolve(dirname(file),dep);
      if (!(await stat(path).catch(()=>null))?.isFile()) failures.push(`${relative(root,file)} missing import ${dep}`);
    }
    const browser = file.includes('/variants/') || /\/shared\/(ui|client|contracts)\//.test(file);
    if (browser && (dep.includes('/domain/') || dep.includes('/application/') || dep.includes('/infrastructure/') || dep==='pg' || dep.startsWith('node:'))) {
      failures.push(`${relative(root,file)} imports server module ${dep}`);
    }
    const variant = file.match(/\/variants\/([^/]+)\/app\//)?.[1];
    const targetVariant = dep.startsWith('.') ? resolve(dirname(file),dep).match(/\/variants\/([^/]+)\//)?.[1] : undefined;
    if (variant && targetVariant && variant!==targetVariant) failures.push(`${variant} imports another variant ${targetVariant}`);
  }
}
const slugs = ['a-merchant','b-customer','c-partner','d-agent'];
const entries = [];
for (const slug of slugs) {
  if ((await stat(join(root,'variants',slug,'app/index.html')).catch(()=>null))?.isFile()) entries.push(slug);
  else if (all) failures.push(`Missing functional entry ${slug}`);
}
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log(JSON.stringify({checkedModules:files.length,functionalEntries:entries,scope:all?'all4':'available source only; not whole-product acceptance'},null,2));
