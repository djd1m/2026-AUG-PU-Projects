import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const cases = [
  { file: 'packages/rag/src/site-safety.ts', from: 'addresses.some((x) => !isPublicAddress(x.address))', to: 'false',
    config: 'vitest.config.ts', test: 'packages/rag/tests/unit/site-safety.test.ts', title: 'SC-US-002-3' },
  { file: 'services/worker/src/crawl/store.ts', from: 'if (held.rowCount !== 1)', to: 'if (false)',
    config: 'vitest.int.config.ts', test: 'services/worker/tests/int/crawl.int.test.ts', title: 'stale fence и closed state' },
];
for (const c of cases.filter((c) => !process.argv[2] || c.file.includes(process.argv[2]))) {
  const source = fs.readFileSync(c.file, 'utf8');
  if (!source.includes(c.from)) throw new Error(`Мутация не применима: ${c.file}`);
  let red;
  try {
    fs.writeFileSync(c.file, source.replace(c.from, c.to));
    red = spawnSync('npx', ['vitest', 'run', '--config', c.config, c.test, '-t', c.title], { encoding: 'utf8' });
    process.stdout.write(`МУТАЦИЯ ${c.file}\n${red.stdout}${red.stderr}\nexit=${red.status}\n`);
  } finally { fs.writeFileSync(c.file, source); }
  if (red.status !== 1 || !/\d+ failed/.test(red.stdout + red.stderr)) throw new Error('Ожидаемый red тест не доказан');
  const green = spawnSync('npx', ['vitest', 'run', '--config', c.config, c.test, '-t', c.title], { encoding: 'utf8' });
  process.stdout.write(`ВОССТАНОВЛЕНИЕ ${c.file}\n${green.stdout}${green.stderr}\nexit=${green.status}\n`);
  if (green.status !== 0) throw new Error('Страж не восстановился');
}
