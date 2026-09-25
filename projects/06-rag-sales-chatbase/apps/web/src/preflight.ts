// из N5: projects/05-podcast-clips-opus/apps/web/src/preflight.ts — конфиг из @n6/rag (LoadCeilings)
// Отказ старта web (FR-LIMIT-004): Dockerfile запускает этот файл ДО next start; код 1 и имя переменной.
import { loadWebConfig } from '@n6/rag';
import { readEnvironment } from './server/environment';

try {
  loadWebConfig(readEnvironment());
} catch (error) {
  console.error(`web не запущен: ${error instanceof Error ? error.message : 'не удалось проверить конфигурацию'}`);
  process.exit(1);
}
