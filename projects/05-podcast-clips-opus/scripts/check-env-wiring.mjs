import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

// Только переменные, устанавливаемые самим Next.js; NODE_ENV не исключён.
export const EXCEPTIONS = { NEXT_RUNTIME: 'Next.js устанавливает среду выполнения', NEXT_PHASE: 'Next.js устанавливает фазу сборки' };
const roots = {
  web: ['apps/web/src'],
  'worker-stt': ['apps/worker/workers/stt.ts'],
  'worker-llm': ['apps/worker/workers/select.ts'],
  'worker-video': ['apps/worker/workers/render.ts'],
};
function sourceFiles(location) {
  if (!fs.existsSync(location)) throw new Error('Отсутствует исходник сервиса');
  if (fs.statSync(location).isFile()) return [location];
  return fs.readdirSync(location).flatMap((item) => sourceFiles(path.join(location, item)))
    .filter((f) => /\.tsx?$/.test(f) && !f.endsWith('.d.ts'));
}
function resolveImport(file, name, projectRoot) {
  let base;
  if (name.startsWith('.')) base = path.resolve(path.dirname(file), name);
  else if (name.startsWith('@clipmaker/')) {
    const [pkg, ...rest] = name.slice('@clipmaker/'.length).split('/');
    base = path.join(projectRoot, 'packages', pkg, 'src', rest.join('/') || 'index');
  } else return null;
  base = base.replace(/\.js$/, '');
  for (const option of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
    if (fs.existsSync(option) && fs.statSync(option).isFile()) return option;
  }
  throw new Error(`Не разрешён импорт ${name}`);
}
export function collectEnvironment(entrypoints, projectRoot) {
  const seen = new Set(), names = new Set();
  const walk = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const tree = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    const isEnv = (node) => ts.isPropertyAccessExpression(node) && node.expression.getText(tree) === 'process' && node.name.text === 'env';
    const visit = (node) => {
      if (isEnv(node)) {
        const parent = node.parent;
        let name;
        if (ts.isPropertyAccessExpression(parent) && parent.expression === node) name = parent.name.text;
        else if (ts.isElementAccessExpression(parent) && parent.expression === node && ts.isStringLiteral(parent.argumentExpression)) name = parent.argumentExpression.text;
        else throw new Error(`Динамическое чтение process.env не проверяется: ${path.relative(projectRoot, file)}`);
        if (!/^[A-Z][A-Z0-9_]*$/.test(name)) throw new Error('Непригодное имя переменной');
        names.add(name);
      }
      let specifier;
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) specifier = node.moduleSpecifier.text;
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) specifier = node.arguments[0].text;
      if (specifier) {
        const dependency = resolveImport(file, specifier, projectRoot);
        if (dependency) walk(dependency);
      }
      ts.forEachChild(node, visit);
    };
    visit(tree);
  };
  entrypoints.flatMap((f) => sourceFiles(path.join(projectRoot, f))).forEach(walk);
  if (!names.size) throw new Error('Ни одного чтения окружения: проверка НЕ ВЫПОЛНЕНА');
  return names;
}
export function checkWiring(compose, projectRoot = process.cwd()) {
  if (!compose?.services || typeof compose.services !== 'object') throw new Error('Пустой compose');
  const missing = [];
  for (const [service, entries] of Object.entries(roots)) {
    const environment = compose.services[service]?.environment;
    if (!environment || typeof environment !== 'object' || Array.isArray(environment)) throw new Error(`Недоступен environment: ${service}`);
    for (const name of collectEnvironment(entries, projectRoot)) {
      if (!(name in EXCEPTIONS) && (environment[name] === undefined || environment[name] === null)) missing.push(`${service}: ${name}`);
    }
  }
  return missing;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const missing = checkWiring(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')));
    if (missing.length) { console.error(`Не проброшены переменные:\n${missing.join('\n')}`); process.exitCode = 1; }
    else console.log(`Потерь нет. Явные исключения: ${Object.keys(EXCEPTIONS).join(', ')}`);
  } catch (error) { console.error(`Проверка НЕ ВЫПОЛНЕНА: ${error.message}`); process.exitCode = 2; }
}
