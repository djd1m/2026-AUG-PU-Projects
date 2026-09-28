#!/usr/bin/env node
// Страж по СОБРАННОМУ образу: в рантайм-образе нет ни одного пакета, который package-lock.json помечает `dev: true`
// (BACKLOG §5 п. 17). Статическая половина — tests/image-dev-deps.test.ts (по Dockerfile, идёт в `npm test`);
// эта половина смотрит на то, что реально лежит в /app образа, потому что Dockerfile можно прочитать верно и
// собрать неверно.
//
//   node scripts/check-image-dev-deps.mjs <образ> [<образ> ...]
//
// Коды возврата (guard-must-be-able-to-fail): 0 — каждый образ проверен, dev-пакетов нет;
// 1 — в образе НАЙДЕН dev-пакет (названы образ и пути); 2 — проверка НЕ ВЫПОЛНЕНА: нет аргументов, нет docker,
// образа нет, в lockfile нет dev-записей, либо в образе нет положительного контроля (ни одного prod-пакета из
// lockfile) — пустой /app/node_modules не должен читаться как «чисто».
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const images = process.argv.slice(2);
const notRun = message => { console.error(`❌ проверка НЕ ВЫПОЛНЕНА: ${message}`); process.exit(2); };
if (images.length === 0) notRun('не назван ни один образ');

let lock;
try { lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8')); } catch (error) { notRun(`package-lock.json не прочитан: ${error.message}`); }
const entries = Object.entries(lock.packages ?? {}).filter(([path]) => path.startsWith('node_modules/'));
// `devOptional` (нужен и dev, и опционально prod) не считается dev: npm prune --omit=dev вправе его оставить.
const dev = entries.filter(([, meta]) => meta.dev === true).map(([path]) => path);
const prod = entries.filter(([, meta]) => !meta.dev && !meta.devOptional && !meta.optional && !meta.link).map(([path]) => path);
if (dev.length === 0) notRun('в package-lock.json нет ни одной записи dev: true — сверять не с чем');
if (prod.length === 0) notRun('в package-lock.json нет prod-записей для положительного контроля');

// Внутри образа — только node и fs: список приходит на stdin, ответ — JSON на stdout.
const probe = `let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const {dev,prod}=JSON.parse(s);const fs=require('fs');
const has=p=>fs.existsSync('/app/'+p);process.stdout.write(JSON.stringify({dev:dev.filter(has),prod:prod.filter(has).length}));});`;
let failed = false;
for (const image of images) {
  const run = spawnSync('docker', ['run', '--rm', '-i', '--network', 'none', '--entrypoint', 'node', image, '-e', probe],
    { input: JSON.stringify({ dev, prod }), encoding: 'utf8', timeout: 120_000 });
  if (run.error) notRun(`docker не запустился для ${image}: ${run.error.message}`);
  if (run.status !== 0) notRun(`образ ${image} не проверен (код ${run.status}): ${run.stderr.trim().slice(0, 400)}`);
  let found;
  try { found = JSON.parse(run.stdout); } catch { notRun(`образ ${image}: ответ пробы не разобран: ${run.stdout.slice(0, 200)}`); }
  if (found.prod === 0) notRun(`образ ${image}: в /app/node_modules нет ни одного prod-пакета — положительный контроль не прошёл`);
  if (found.dev.length > 0) {
    failed = true;
    console.error(`❌ ${image}: ${found.dev.length} dev-пакетов в рантайм-образе, напр. ${found.dev.slice(0, 8).join(', ')}`);
  } else {
    console.log(`✅ ${image}: dev-пакетов 0 из ${dev.length} по lockfile; prod-пакетов на месте ${found.prod} из ${prod.length}`);
  }
}
process.exit(failed ? 1 : 0);
