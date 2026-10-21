import ts from 'typescript';
import { gzipSync } from 'node:zlib';
import { readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export async function buildWidget() {
  const source = fileURLToPath(new URL('../apps/widget/src/index.ts', import.meta.url));
  const output = fileURLToPath(new URL('../apps/web/public/w.js', import.meta.url));
  // Type-check before transpilation; transpileModule alone does not check types.
  const program = ts.createProgram([source], { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None,
    strict: true, noUncheckedIndexedAccess: true, skipLibCheck: true, types: [], noEmit: true });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length) {
    await rm(output, { force: true });
    throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCurrentDirectory: () => process.cwd(), getCanonicalFileName: (name) => name, getNewLine: () => '\n',
    }));
  }
  const result = ts.transpileModule(await readFile(source, 'utf8'), { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, removeComments: true,
  }, reportDiagnostics: true });
  const gzipBytes = gzipSync(result.outputText).byteLength;
  if (result.diagnostics?.length || gzipBytes > 30 * 1024) {
    await rm(output, { force: true }); throw new Error(`widget build rejected: ${gzipBytes} gzip bytes`);
  }
  await mkdir(new URL('../apps/web/public/', import.meta.url), { recursive: true });
  await writeFile(output, result.outputText);
  console.log(JSON.stringify({ output, bytes: Buffer.byteLength(result.outputText), gzipBytes, limit: 30 * 1024 }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await buildWidget();
