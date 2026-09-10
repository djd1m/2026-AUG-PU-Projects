#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const UPSTREAM_SHA256 = '99e6bff9b0078eb2ec23f7df98b7ac06c894f9018eba4a8c358e8f92e5ec7b06';
const upstream = path.resolve(new URL('../../../.claude/hooks/check-canon.cjs', import.meta.url).pathname);
const root = process.argv[2] || '.';
const fail = (message) => { process.stderr.write(`⚠️  проверка НЕ выполнена: ${message}\n`); process.exitCode = 2; };

let source;
try { source = fs.readFileSync(upstream); } catch (error) { fail(`upstream checker unavailable: ${error.message}`); process.exit(); }
const actual = crypto.createHash('sha256').update(source).digest('hex');
if (actual !== UPSTREAM_SHA256) { fail(`upstream checker SHA256 mismatch (expected ${UPSTREAM_SHA256}, got ${actual})`); process.exit(); }

const original = source.toString('utf8');
let planText;
try { planText = fs.readFileSync(path.join(root, 'docs', 'dispatch-plan.md'), 'utf8'); }
catch { planText = null; }
if (planText !== null && (planText.match(/^##\s+Единицы\s*$/gmi) || []).length !== 1) {
  fail('dispatch plan must contain exactly one `## Единицы` heading'); process.exit();
}
const start = original.indexOf('function unitRows(text) {');
const end = original.indexOf('\n}\n\n// ---------------------------------------------------------------------------', start);
if (start < 0 || end < 0) { fail('upstream unitRows boundary not found'); process.exit(); }
const adapted = `function unitRows(text) {
  const headings = text.match(/^##\\s+Единицы\\s*$/gmi) || [];
  if (headings.length !== 1) return [];
  const sectionStart = text.search(/^##\\s+Единицы\\s*$/mi);
  const after = text.slice(sectionStart + headings[0].length);
  const next = after.search(/^##\\s+/mi);
  const section = next < 0 ? after : after.slice(0, next);
  const rows = [];
  for (const raw of section.split('\\n')) {
    const line = raw.trim();
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length < 4) continue;
    const name = cells[1];
    if (!name || /^:?-+:?$/.test(name) || name.toLowerCase() === 'единица') continue;
    rows.push({ name, writes: cells[2] });
  }
  return rows;
}`;
const transformed = original.slice(0, start) + adapted + original.slice(end + 2);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'n3a-check-canon-'));
const tempFile = path.join(temp, 'check-canon.cjs');
try {
  fs.writeFileSync(tempFile, transformed, { mode: 0o755 });
  const result = spawnSync(process.execPath, [tempFile, root], { cwd: process.cwd(), stdio: 'inherit', timeout: 60000 });
  process.exitCode = result.status ?? 2;
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
