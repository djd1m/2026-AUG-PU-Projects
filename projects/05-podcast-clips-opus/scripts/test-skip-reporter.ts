import type { Reporter } from 'vitest/reporters';
export default class SkipReporter implements Reporter {
  onTestRunEnd: NonNullable<Reporter['onTestRunEnd']> = (modules) => {
    const skipped = modules.flatMap(module => [...module.children.allTests()]
      .filter(test => test.result().state === 'skipped'));
    if (!skipped.length) return;
    const missing = ['DATABASE_URL', 'REDIS_URL', 'S3_ENDPOINT'].filter(name => !process.env[name]);
    const reason = missing.length ? `отсутствуют ${missing.join(', ')}` : 'условие skip/фильтр тестов (проверьте конфигурацию окружения)';
    console.error(`\nWARNING: ПРОПУЩЕНО ${skipped.length} тестов; ${reason}. Это НЕ успешная полная проверка.`);
    const counts = new Map<string, number>();
    for (const test of skipped) counts.set(test.module.moduleId, (counts.get(test.module.moduleId) ?? 0) + 1);
    for (const [file, count] of counts) console.error(`  ${file}: ${count} skipped`);
    if (process.env.N5_ACCEPTANCE === '1') {
      console.error('N5_ACCEPTANCE=1: приёмка запрещает любые пропуски.');
      process.exitCode = 1;
    }
  };
}
