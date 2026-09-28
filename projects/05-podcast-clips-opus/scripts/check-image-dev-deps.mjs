#!/usr/bin/env node
// Страж по СОБРАННОМУ образу: в рантайм-образе нет ни одного пакета, который package-lock.json помечает `dev: true`
// (BACKLOG §5 п. 17). Статическая половина — tests/image-dev-deps.test.ts (по Dockerfile, идёт в `npm test`);
// эта половина смотрит на то, что реально лежит в /app образа, потому что Dockerfile можно прочитать верно и
// собрать неверно.
//
//   node scripts/check-image-dev-deps.mjs <образ> [<образ> ...]
//
// Обход — всё дерево /app (корень, workspace, вложенные, скрытые `.next`, каталоги внутри пакетов), а не только
// корневые пути lockfile (ревью Codex, круги 1–2). Пакет — dev, если lockfile помечает dev ИМЕННО этот путь, либо
// пути в lockfile нет, а пара имя@версия встречается в lockfile только как dev. Пакет вне lockfile — неполнота (код 2).
//
// Коды возврата (guard-must-be-able-to-fail): 0 — каждый образ проверен, dev-пакетов нет, все prod-пакеты на месте;
// 1 — в образе НАЙДЕН dev-пакет или НЕ ХВАТАЕТ prod-пакета (названы образ и пути); 2 — проверка НЕ ВЫПОЛНЕНА: нет
// аргументов, нет docker, образа или node в нём, в lockfile нет dev-записей, в /app нет пакетов, ошибка чтения дерева,
// пакет, которого нет в lockfile ни по пути, ни по имени@версии. Доказанный дефект (1) важнее неполноты (2).
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
const entries = Object.entries(lock.packages ?? {}).filter(([path]) => /(^|\/)node_modules\//.test(path));
const nameOf = path => path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length);
// `devOptional` (нужен и dev, и опционально prod) не считается dev: npm prune --omit=dev вправе его оставить.
const devPaths = new Set(entries.filter(([, meta]) => meta.dev === true).map(([path]) => path));
// Обязательные prod-пакеты: не dev, не optional (платформенные сборки ставятся не все), не ссылки workspace.
const prod = entries.filter(([, meta]) => !meta.dev && !meta.devOptional && !meta.optional && !meta.link).map(([path]) => path);
if (devPaths.size === 0) notRun('в package-lock.json нет ни одной записи dev: true — сверять не с чем');
if (prod.length === 0) notRun('в package-lock.json нет prod-записей для положительного контроля');

// Внутри образа — только node и fs. Обходит ВСЁ дерево /app, включая скрытые каталоги (`.next`) и каталоги внутри
// пакетов (`next/vendor/node_modules`) — ревью Codex, круг 2. Каждый элемент каталога с именем node_modules — пакет:
// путь, имя и версия из его package.json. Любая ошибка чтения, кроме «такого пути нет», — в errors (→ код 2).
const probe = `const fs=require('fs'),p=require('path');const pkgs=[],errors=[];
const soft=e=>e&&(e.code==='ENOENT'||e.code==='ENOTDIR');
function ls(dir){try{return fs.readdirSync(dir,{withFileTypes:true})}catch(e){if(!soft(e))errors.push(dir+': '+e.code);return[]}}
function meta(dir){try{const j=JSON.parse(fs.readFileSync(p.join(dir,'package.json'),'utf8'));return{name:j.name,version:j.version}}
catch(e){if(!soft(e))errors.push(dir+'/package.json: '+(e.code||e.message));return{}}}
function add(full,rel,d){pkgs.push({path:rel,link:d.isSymbolicLink(),...(d.isSymbolicLink()?{}:meta(full))});}
function walk(dir,rel){for(const d of ls(dir)){if(d.isSymbolicLink()||!d.isDirectory())continue;
const full=p.join(dir,d.name),r=rel?rel+'/'+d.name:d.name;
if(d.name==='node_modules'){for(const e of ls(full)){if(e.name.startsWith('.'))continue;const f=p.join(full,e.name),er=r+'/'+e.name;
if(e.name.startsWith('@')&&e.isDirectory()&&!e.isSymbolicLink()){for(const s of ls(f))add(p.join(f,s.name),er+'/'+s.name,s)}else add(f,er,e)}}
walk(full,r);}}
walk('/app','');process.stdout.write(JSON.stringify({pkgs,errors}));`;
// Итог по КАЖДОМУ образу отдельно (ревью Codex, круг 3): неполнота одного образа не прячется за дефектом другого и
// не получает ✅. Общий код: 1, если хоть в одном образе доказан дефект; иначе 2, если хоть один не проверен целиком.
let defect = false, incomplete = false;
const skip = (image, message) => { incomplete = true; console.error(`❌ ${image}: проверка НЕ ВЫПОЛНЕНА — ${message}`); };
for (const image of images) {
  const run = spawnSync('docker', ['run', '--rm', '--network', 'none', '--entrypoint', 'node', image, '-e', probe],
    { encoding: 'utf8', timeout: 180_000, maxBuffer: 64 * 1024 * 1024 });
  if (run.error) { skip(image, `docker не запустился: ${run.error.message}`); continue; }
  if (run.status !== 0) { skip(image, `код ${run.status}: ${run.stderr.trim().slice(0, 400)}`); continue; }
  let result;
  try { result = JSON.parse(run.stdout); } catch { skip(image, `ответ пробы не разобран: ${run.stdout.slice(0, 200)}`); continue; }
  const found = result?.pkgs;
  if (!Array.isArray(found) || found.length === 0) { skip(image, 'под /app нет ни одного пакета node_modules'); continue; }
  const present = new Set(found.map(pkg => pkg.path));
  const dev = [], unknown = [];
  for (const pkg of found) {
    if (pkg.link) continue;                       // ссылка workspace: цель обходится как обычный каталог
    const known = lock.packages[pkg.path];
    if (known) { if (known.dev === true) dev.push(pkg.path); continue; }
    // Пути нет в lockfile: сверяем ИМЯ И ВЕРСИЮ (одно имя бывает и dev, и prod разных версий — postcss).
    const same = entries.filter(([path, meta]) => nameOf(path) === pkg.name && meta.version === pkg.version);
    if (same.some(([, meta]) => meta.dev !== true)) continue;
    if (same.length > 0) dev.push(`${pkg.path} (${pkg.name}@${pkg.version})`);
    else unknown.push(`${pkg.path} (${pkg.name ?? '?'}@${pkg.version ?? '?'})`);
  }
  const missing = prod.filter(path => !present.has(path));
  const errors = Array.isArray(result.errors) ? result.errors : ['проба не вернула список ошибок'];
  if (dev.length > 0) {
    defect = true;
    console.error(`❌ ${image}: ${dev.length} dev-пакетов в рантайм-образе, напр. ${dev.slice(0, 8).join(', ')}`);
  }
  if (missing.length > 0) {
    defect = true;
    console.error(`❌ ${image}: нет ${missing.length} prod-пакетов из ${prod.length}, напр. ${missing.slice(0, 8).join(', ')}`);
  }
  if (errors.length > 0 || unknown.length > 0) {
    skip(image, `обход неполон — ошибок чтения ${errors.length} (${errors.slice(0, 3).join('; ')}), `
      + `пакетов вне lockfile ${unknown.length} (${unknown.slice(0, 5).join(', ')})`);
    continue;
  }
  if (dev.length === 0 && missing.length === 0) {
    console.log(`✅ ${image}: пакетов под /app ${found.length}; dev-пакетов 0 (по ${devPaths.size} записям dev: true); prod-пакетов на месте ${prod.length} из ${prod.length}`);
  }
}
process.exit(defect ? 1 : incomplete ? 2 : 0);
