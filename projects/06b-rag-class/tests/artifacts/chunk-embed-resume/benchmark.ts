import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { setTimeout, setImmediate } from 'node:timers/promises';

const cases = [
  { name: 'prose-100x1000', pages: 100, words: 1000, form: 'prose' },
  { name: 'prose-100x3000', pages: 100, words: 3000, form: 'prose' },
  { name: 'lists-100x1000', pages: 100, words: 1000, form: 'lists' },
  { name: 'no-punctuation-100x3000', pages: 100, words: 3000, form: 'plain' },
  { name: 'single-paragraph-6000', pages: 1, words: 6000, form: 'plain' },
];
const vocabulary = 'Shipping within the city takes one to two business days nationwide from three to seven Returns are accepted within fourteen days if the packaging and receipt are kept'.split(' ');
function document(page: number, words: number, form: string): string {
  const tokens = Array.from({ length: words }, (_, i) => vocabulary[(i + page) % vocabulary.length]!);
  if (form === 'plain') return tokens.join(' ');
  const lines: string[] = [];
  for (let i = 0; i < tokens.length; i += 40) {
    const line = tokens.slice(i, i + 40);
    if (form === 'prose') {
      for (let j = 9; j < line.length; j += 10) line[j] += '.';
    }
    lines.push(line.join(' '));
  }
  return lines.join('\n');
}
for (const [mode, path] of [['original', '/app/tmp/chunk-original.ts'], ['candidate', '/app/packages/rag/src/chunk.ts']]) {
  const m = await import(path!);
  console.log(JSON.stringify({ mode, source_sha256: createHash('sha256').update(readFileSync(path!)).digest('hex'), warmup: 'countTokens(warmup)' }));
  m.countTokens('warmup');
  for (const c of cases) {
    const docs = Array.from({ length: c.pages }, (_, i) => document(i, c.words, c.form));
    const inputSha = createHash('sha256').update(JSON.stringify(docs)).digest('hex');
    let previous = performance.now();
    let lag = 0;
    let ticks = 0;
    const timer = globalThis.setInterval(() => {
      const now = performance.now();
      lag = Math.max(lag, now - previous - 10);
      previous = now;
      ticks += 1;
    }, 10);
    await setTimeout(20);
    let parts = 0;
    const start = performance.now();
    for (const doc of docs) {
      const split = mode === 'original' ? m.splitIntoChunks(doc) : await m.splitIntoChunksAsync(doc, async () => {});
      parts += split.length;
      if (split.some((p: { tokens: number }) => p.tokens > 500)) throw new Error('cap exceeded');
    }
    const elapsed = performance.now() - start;
    await setImmediate();
    await setTimeout(20);
    globalThis.clearInterval(timer);
    console.log(JSON.stringify({ mode, ...c, input_sha256: inputSha, elapsed_ms: elapsed, max_timer_lag_ms: lag, ticks, parts }));
    if (mode === 'candidate' && lag >= 30000) throw new Error('event-loop lag >= 30 seconds');
  }
}
