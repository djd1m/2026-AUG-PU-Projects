import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require(process.argv[2] ?? 'typescript');
const file = 'services/worker/src/crawl/robots.ts';
const current = readFileSync(file, 'utf8');
const original = spawnSync('git', ['show', '7cb555ce9d01792a46baff3dfcd6c16d4bb9b9da:projects/06b-rag-class/' + file], { encoding: 'utf8' });
assert.equal(original.status, 0, original.stderr);
const sha = (s) => createHash('sha256').update(s).digest('hex');
function probe(source, green) {
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const uri = 'data:text/javascript;base64,' + Buffer.from(js).toString('base64');
  const code = `
    import assert from 'node:assert/strict';
    import { writeSync } from 'node:fs';
    import { setImmediate as yieldLoop } from 'node:timers/promises';
    import { parseRobots } from ${JSON.stringify(uri)};
    const allows = parseRobots('User-agent: *\\nDisallow: /' + '*a'.repeat(25) + 'b$');
    const started = performance.now();
    writeSync(1, 'real source loaded; adversarial match begins\\n');
    assert.equal(allows('https://fixture.test/' + 'a'.repeat(100)), true);
    assert.equal(allows('https://fixture.test/' + 'a'.repeat(100) + 'b'), false);
    const benign = parseRobots('User-agent: *\\nDisallow: /*.pdf$\\nDisallow: /Case\\nDisallow: /a%2fb\\nDisallow: /%7euser\\nDisallow: /привет');
    for (const [path, expected] of [['/a.pdf', false], ['/a.pdf?x', true], ['/case', true], ['/Case', false], ['/a%2Fb', false], ['/a/b', true], ['/~user', false], ['/привет', false]]) assert.equal(benign('https://x.test' + path), expected);
    const priority = parseRobots('User-agent: *\\nDisallow: /\\nUser-agent: N6bBot\\nDisallow: /private\\nAllow: /private/same\\nDisallow: /private/same');
    assert.equal(priority('https://x.test/'), true);
    assert.equal(priority('https://x.test/private'), false);
    assert.equal(priority('https://x.test/private/same'), true);
    let heartbeats = 0, matches = 0;
    const beat = setInterval(() => heartbeats++, 2);
    const ceiling = AbortSignal.timeout(30);
    while (!ceiling.aborted) { allows('https://fixture.test/' + 'a'.repeat(100)); matches++; await yieldLoop(); }
    clearInterval(beat);
    assert(heartbeats > 0); assert(matches > 0); assert(performance.now() - started < 1000);
    console.log(JSON.stringify({heartbeats, matches, elapsedMs: performance.now() - started, ceiling: ceiling.aborted}));
  `;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', code], { timeout: green ? 10000 : 3000, encoding: 'utf8' });
  console.log(JSON.stringify({ mode: green ? 'restored-green' : 'expected-red', sourceSHA256: sha(source), node: process.version,
    command: 'node --input-type=module -e <transpiled exact robots source + assertions>; external timeout ' + (green ? '10000ms' : '3000ms'),
    exit: child.status, signal: child.signal, error: child.error?.code ?? null, stdout: child.stdout, stderr: child.stderr }));
  if (green) { assert.equal(child.error?.code, undefined); assert.equal(child.status, 0, child.stderr); }
  else { assert.equal(child.error?.code, 'ETIMEDOUT'); assert.match(child.stdout, /adversarial match begins/); }
}
assert.notEqual(sha(original.stdout), sha(current));
probe(original.stdout, false);
probe(current, true);
console.log('Expected-red and restored-green verified; no product source was mutated.');
