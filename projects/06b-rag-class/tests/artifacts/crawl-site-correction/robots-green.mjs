import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { setImmediate as yieldLoop } from 'node:timers/promises';
const ts = createRequire(import.meta.url)(process.argv[2] ?? 'typescript');
const source = readFileSync('services/worker/src/crawl/robots.ts', 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { parseRobots } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
const allows = parseRobots('User-agent: *\nDisallow: /' + '*a'.repeat(25) + 'b$');
assert.equal(allows('https://fixture.test/' + 'a'.repeat(100)), true);
assert.equal(allows('https://fixture.test/' + 'a'.repeat(100) + 'b'), false);
const benign = parseRobots('User-agent: *\nDisallow: /*.pdf$\nDisallow: /Case\nDisallow: /a%2fb\nDisallow: /%7euser\nDisallow: /привет');
for (const [path, expected] of [['/a.pdf', false], ['/a.pdf?x', true], ['/case', true], ['/Case', false], ['/a%2Fb', false], ['/a/b', true], ['/~user', false], ['/привет', false]]) assert.equal(benign('https://x.test' + path), expected);
const priority = parseRobots('User-agent: *\nDisallow: /\nUser-agent: N6bBot\nDisallow: /private\nAllow: /private/same\nDisallow: /private/same');
assert.equal(priority('https://x.test/'), true);
assert.equal(priority('https://x.test/private'), false);
assert.equal(priority('https://x.test/private/same'), true);
let heartbeats = 0, matches = 0;
const started = performance.now();
const beat = setInterval(() => heartbeats++, 2);
const ceiling = AbortSignal.timeout(30);
while (!ceiling.aborted) { allows('https://fixture.test/' + 'a'.repeat(100)); matches++; await yieldLoop(); }
clearInterval(beat);
assert(heartbeats > 0); assert(matches > 0); assert(performance.now() - started < 1000);
console.log(JSON.stringify({ sourceSHA256: createHash('sha256').update(source).digest('hex'), node: process.version,
  heartbeats, matches, elapsedMs: performance.now() - started, ceiling: ceiling.aborted, assertions: 'adversarial + benign + UA/priority/percent/UTF8 + shared event-loop heartbeat and timer ceiling passed' }));
