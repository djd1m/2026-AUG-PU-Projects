// Страж проброса окружения (deployment-seams, страж №1) — перенос N5 scripts/check-env-wiring.mjs (#10), адаптирован:
// сервисы web/worker/migrate N6b, импорты @n6b/db и @/…, закрытые списки Boot config check (поля name: 'X' в config.ts).
// Сверяет КАЖДОЕ чтение окружения в исходниках сервиса с environment: этого сервиса в `docker compose config`.
// Не опирается на .env.example — он сам бывает неполон. Коды: 0 потерь нет · 1 потеря названа · 2 проверка НЕ выполнена.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

/** Явные исключения: переменные, которые ставит сам рантайм, а не compose. */
export const EXCEPTIONS = {
  NEXT_RUNTIME: 'Next.js устанавливает среду выполнения',
  NEXT_PHASE: 'Next.js устанавливает фазу сборки',
};
/**
 * Исключения ОДНОГО сервиса (chunk-embed): packages/rag/src/live.ts читает VISITOR_SECRET, только если он задан, — канал
 * visitor есть у web, воркеру не нужен. Список закрытый, с причиной; web это исключение не получает.
 */
export const SERVICE_EXCEPTIONS = {
  worker: { VISITOR_SECRET: 'live.ts читает его только если задан: канала visitor у воркера нет' },
};
export const ROOTS = {
  web: ['apps/web/src'],
  worker: ['services/worker/src'],
  migrate: ['packages/db/src/migrate.ts'],
};
const NAME_RE = /^[A-Z][A-Z0-9_]*$/;

function sourceFiles(location) {
  if (!fs.existsSync(location)) throw new Error(`нет исходника сервиса: ${location}`);
  if (fs.statSync(location).isFile()) return [location];
  return fs.readdirSync(location).flatMap((item) => sourceFiles(path.join(location, item)))
    .filter((f) => /\.tsx?$/.test(f) && !f.endsWith('.d.ts'));
}

function resolveImport(file, name, root) {
  let base;
  if (name.startsWith('.')) base = path.resolve(path.dirname(file), name);
  else if (name === '@n6b/db') base = path.join(root, 'packages/db/src/index');
  else if (name === '@n6b/rag') base = path.join(root, 'packages/rag/src/index');
  else if (name.startsWith('@n6b/')) throw new Error(`workspace-импорт ${name} не описан в стражe`);
  else if (name.startsWith('@/')) base = path.join(root, 'apps/web/src', name.slice(2));
  else return null;
  base = base.replace(/\.js$/, '');
  for (const option of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
    if (fs.existsSync(option) && fs.statSync(option).isFile()) return option;
  }
  throw new Error(`не разрешён импорт ${name} из ${path.relative(root, file)}`);
}

export function collectEnvironment(entries, root) {
  const seen = new Set();
  const names = new Set();
  const walk = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const tree = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    const visit = (node) => {
      // process.env.X / process.env['X']; process.env[динамически] — отказ проверки
      if (ts.isPropertyAccessExpression(node) && node.name.text === 'env' && node.expression.getText(tree) === 'process') {
        const parent = node.parent;
        let name;
        if (ts.isPropertyAccessExpression(parent) && parent.expression === node) name = parent.name.text;
        else if (ts.isElementAccessExpression(parent) && ts.isStringLiteral(parent.argumentExpression)) name = parent.argumentExpression.text;
        // законная передача целиком — значение по умолчанию параметра env закрытого списка либо `const env = process.env`
        // (live.ts): чтения дальше идут как env.X и собираются правилом ниже
        else if (!ts.isParameter(parent) && !(ts.isVariableDeclaration(parent) && parent.name.getText(tree) === 'env')) {
          throw new Error(`динамическое чтение process.env не проверяется: ${path.relative(root, file)}`);
        }
        if (name !== undefined) {
          if (!NAME_RE.test(name)) throw new Error(`непригодное имя переменной ${name}`);
          names.add(name);
        }
      }
      // env.X — параметр окружения закрытых списков (loadWebConfig(env), loadWorkerConfig(env))
      if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'env'
        && NAME_RE.test(node.name.text)) names.add(node.name.text);
      // закрытый список Boot config check: { name: 'X', kind: … }
      if (ts.isPropertyAssignment(node) && node.name.getText(tree) === 'name' && ts.isStringLiteral(node.initializer)
        && NAME_RE.test(node.initializer.text)) names.add(node.initializer.text);
      let specifier;
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier
        && ts.isStringLiteral(node.moduleSpecifier)) specifier = node.moduleSpecifier.text;
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0]
        && ts.isStringLiteral(node.arguments[0])) specifier = node.arguments[0].text;
      if (specifier) {
        const dependency = resolveImport(file, specifier, root);
        if (dependency) walk(dependency);
      }
      ts.forEachChild(node, visit);
    };
    visit(tree);
  };
  entries.flatMap((e) => sourceFiles(path.join(root, e))).forEach(walk);
  if (names.size === 0) throw new Error('ни одного чтения окружения: проверка НЕ выполнена');
  return names;
}

export function checkWiring(compose, root) {
  if (!compose?.services || typeof compose.services !== 'object') throw new Error('пустой compose');
  const missing = [];
  const report = {};
  for (const [service, entries] of Object.entries(ROOTS)) {
    const environment = compose.services[service]?.environment;
    if (!environment || typeof environment !== 'object' || Array.isArray(environment)) {
      throw new Error(`недоступен environment сервиса ${service}`);
    }
    const names = [...collectEnvironment(entries, root)].sort();
    report[service] = names.length;
    for (const name of names) {
      if (!(name in EXCEPTIONS) && !(name in (SERVICE_EXCEPTIONS[service] ?? {}))
        && (environment[name] === undefined || environment[name] === null)) {
        missing.push(`${service}: ${name}`);
      }
    }
  }
  return { missing, report };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
    const { missing, report } = checkWiring(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), root);
    if (missing.length) {
      console.error(`Не проброшены переменные:\n${missing.join('\n')}`);
      process.exitCode = 1;
    } else {
      console.log(`Потерь нет. Проверено чтений: ${Object.entries(report).map(([s, n]) => `${s}=${n}`).join(', ')}. `
        + `Явные исключения: ${Object.keys(EXCEPTIONS).join(', ')}`);
    }
  } catch (error) {
    console.error(`Проверка НЕ ВЫПОЛНЕНА: ${error.message}`);
    process.exitCode = 2;
  }
}
