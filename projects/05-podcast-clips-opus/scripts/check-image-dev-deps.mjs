#!/usr/bin/env node
// Страж по СОБРАННОМУ образу: в рантайм-образе нет ни одного пакета, который package-lock.json помечает `dev: true`
// (BACKLOG §5 п. 17). Статическая половина — tests/image-dev-deps.test.ts (по Dockerfile, идёт в `npm test`);
// эта половина смотрит на то, что реально лежит в /app образа, потому что Dockerfile можно прочитать верно и
// собрать неверно.
//
//   node scripts/check-image-dev-deps.mjs <образ> [<образ> ...]
//
// Обход — ВСЕ каталоги node_modules под /app (корень, workspace, вложенные), а не только корневые пути lockfile
// (ревью Codex, круг 1: dev-пакет в apps/web/node_modules иначе не виден). Пакет считается dev, если lockfile помечает
// dev ИМЕННО этот путь, либо пути в lockfile нет, а имя встречается в lockfile только как dev.
//
// Коды возврата (guard-must-be-able-to-fail): 0 — каждый образ проверен, dev-пакетов нет, все prod-пакеты на месте;
// 1 — в образе НАЙДЕН dev-пакет или НЕ ХВАТАЕТ prod-пакета (названы образ и пути); 2 — проверка НЕ ВЫПОЛНЕНА: нет
// аргументов, нет docker, образа или node в нём, в lockfile нет dev-записей, в /app нет ни одного пакета.
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
const nonDevNames = new Set(entries.filter(([, meta]) => meta.dev !== true).map(([path]) => nameOf(path)));
const devOnlyNames = new Set([...devPaths].map(nameOf).filter(name => !nonDevNames.has(name)));
// Обязательные prod-пакеты: не dev, не optional (платформенные сборки ставятся не все), не ссылки workspace.
const prod = entries.filter(([, meta]) => !meta.dev && !meta.devOptional && !meta.optional && !meta.link).map(([path]) => path);
if (devPaths.size === 0) notRun('в package-lock.json нет ни одной записи dev: true — сверять не с чем');
if (prod.length === 0) notRun('в package-lock.json нет prod-записей для положительного контроля');

// Внутри образа — только node и fs: печатает JSON со ВСЕМИ путями пакетов под /app/**/node_modules.
const probe = `const fs=require('fs'),p=require('path');const out=[];
function pkgs(dir,rel){let names;try{names=fs.readdirSync(dir)}catch{return}
for(const n of names){if(n.startsWith('.'))continue;const full=p.join(dir,n);
if(n.startsWith('@')){for(const s of (()=>{try{return fs.readdirSync(full)}catch{return[]}})())visit(p.join(full,s),rel+'/'+n+'/'+s);}
else visit(full,rel+'/'+n);}}
function visit(full,rel){let st;try{st=fs.lstatSync(full)}catch{return}out.push(rel.replace(/^\\//,''));
if(st.isDirectory()&&!st.isSymbolicLink())pkgs(p.join(full,'node_modules'),rel+'/node_modules');}
function walk(dir,rel){let names;try{names=fs.readdirSync(dir,{withFileTypes:true})}catch{return}
for(const d of names){if(!d.isDirectory()||d.isSymbolicLink())continue;
if(d.name==='node_modules')pkgs(p.join(dir,d.name),rel+'/node_modules');
else if(!d.name.startsWith('.'))walk(p.join(dir,d.name),rel+'/'+d.name);}}
walk('/app','');process.stdout.write(JSON.stringify(out));`;
let failed = false;
for (const image of images) {
  const run = spawnSync('docker', ['run', '--rm', '--network', 'none', '--entrypoint', 'node', image, '-e', probe],
    { encoding: 'utf8', timeout: 180_000, maxBuffer: 64 * 1024 * 1024 });
  if (run.error) notRun(`docker не запустился для ${image}: ${run.error.message}`);
  if (run.status !== 0) notRun(`образ ${image} не проверен (код ${run.status}): ${run.stderr.trim().slice(0, 400)}`);
  let found;
  try { found = JSON.parse(run.stdout); } catch { notRun(`образ ${image}: ответ пробы не разобран: ${run.stdout.slice(0, 200)}`); }
  if (!Array.isArray(found) || found.length === 0) notRun(`образ ${image}: под /app нет ни одного пакета node_modules`);
  const present = new Set(found);
  const dev = found.filter(path => devPaths.has(path) || (!(path in lock.packages) && devOnlyNames.has(nameOf(path))));
  const missing = prod.filter(path => !present.has(path));
  if (dev.length > 0) {
    failed = true;
    console.error(`❌ ${image}: ${dev.length} dev-пакетов в рантайм-образе, напр. ${dev.slice(0, 8).join(', ')}`);
  }
  if (missing.length > 0) {
    failed = true;
    console.error(`❌ ${image}: нет ${missing.length} prod-пакетов из ${prod.length}, напр. ${missing.slice(0, 8).join(', ')}`);
  }
  if (dev.length === 0 && missing.length === 0) {
    console.log(`✅ ${image}: пакетов под /app ${found.length}; dev-пакетов 0 (по ${devPaths.size} записям dev: true); prod-пакетов на месте ${prod.length} из ${prod.length}`);
  }
}
process.exit(failed ? 1 : 0);
