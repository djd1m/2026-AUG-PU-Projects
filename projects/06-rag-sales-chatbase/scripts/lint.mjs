// из N5: projects/05-podcast-clips-opus/scripts/lint.mjs — без изменений
// Минимальный статический lint без добавления зависимостей вне разрешённого стека.
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
const errors = [];
function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.next', 'artifacts'].includes(item.name)) continue;
    const file = path.join(dir, item.name);
    if (item.isDirectory()) { walk(file); continue; }
    if (!/\.(ts|tsx|mjs)$/.test(file) || file.endsWith('.d.ts')) continue;
    const source = fs.readFileSync(file, 'utf8');
    if (source.split('\n').length > 500) errors.push(`${file}: больше 500 строк`);
    const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const visit = (node) => {
      if (node.kind === ts.SyntaxKind.AnyKeyword) errors.push(`${file}: запрещён явный any`);
      ts.forEachChild(node, visit);
    };
    visit(tree);
    if (/\beval\s*\(/.test(source) && !file.endsWith('rate-limit.ts')) errors.push(`${file}: запрещён eval`);
  }
}
['apps', 'packages', 'tests'].forEach(walk);
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log('Статические правила: ошибок нет');
