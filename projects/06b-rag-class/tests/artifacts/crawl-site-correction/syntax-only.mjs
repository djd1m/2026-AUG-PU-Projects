import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const ts = createRequire(import.meta.url)(process.argv[2] ?? 'typescript');
const files = ['services/worker/src/crawl/robots.ts', 'services/worker/src/crawl/html.ts', 'services/worker/src/crawl/site.ts', 'services/worker/tests/unit/crawl-rules.test.ts', 'services/worker/tests/unit/crawl-site-correction.test.ts', 'services/worker/tests/int/crawl.int.test.ts'];
let errors = 0;
for (const file of files) {
  const result = ts.transpileModule(readFileSync(file, 'utf8'), { fileName: file, reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
  const diagnostics = (result.diagnostics ?? []).filter(d => d.category === ts.DiagnosticCategory.Error);
  errors += diagnostics.length;
  console.log(JSON.stringify({ file, syntacticErrors: diagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')) }));
}
console.log('Syntax only; not semantic typecheck or build; errors=' + errors);
process.exitCode = errors ? 1 : 0;
