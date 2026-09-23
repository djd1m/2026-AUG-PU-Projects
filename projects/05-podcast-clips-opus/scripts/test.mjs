import { spawn } from 'node:child_process';
// Append mandatory reporters even when callers request another display reporter.
const child = spawn(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', ...process.argv.slice(2),
  '--reporter=default', '--reporter=./scripts/test-skip-reporter.ts'], { stdio: 'inherit', env: process.env });
child.on('error', error => { console.error(error); process.exitCode = 1; });
child.on('exit', (code, signal) => { process.exitCode = signal ? 1 : (code ?? 1); });
