import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
const sourceRoot = process.env.N5_UPLOAD_GUARD_ROOT ?? '.';
// Стражи проверяют исходник. Отдельный mutation runner меняет реальные файлы и запускает эти тесты.
describe('upload source guards', () => {
  it('quota SQL uses two statements', () => {
    const source = readFileSync(path.join(sourceRoot, 'packages/db/src/quota.ts'), 'utf8');
    expect(source).toMatch(/VALUES \(\$1, \$2, \$3, 0\)\s+ON CONFLICT \(scope, scope_key, day\) DO NOTHING/);
    expect(source).toMatch(/UPDATE quota_counter SET used = used \+ \$4/);
    expect(source).toMatch(/used::bigint \+ \$4 <= \$5 RETURNING used/);
    expect(source).not.toMatch(/DO UPDATE/);
  });
  it('upload quota precedes initiation', () => {
    const source = readFileSync(path.join(sourceRoot, 'apps/web/src/server/video.ts'), 'utf8');
    const quota = source.indexOf("await checkAndConsumeQuota(tx, this.limits, account, 'upload'");
    const initiation = source.indexOf('await this.storage.initiate(objectKey)');
    expect(quota).toBeGreaterThan(0); expect(initiation).toBeGreaterThan(quota);
  });
  it('refund only for file properties', () => {
    const source = readFileSync(path.join(sourceRoot, 'packages/db/src/quota.ts'), 'utf8');
    expect(source).toContain('if (!FILE_FAILURES.includes(reason)) return false;');
    const values = source.match(/FILE_FAILURES[^=]*= \[([^\]]*)\]/)?.[1];
    expect(values).toBeDefined(); expect(values).not.toContain('refused_');
    for (const value of ['too_large', 'not_media', 'no_audio', 'too_short', 'too_long', 'probe_timeout']) expect(values).toContain(value);
  });
});
