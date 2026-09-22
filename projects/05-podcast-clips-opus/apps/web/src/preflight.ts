import { loadWebConfig } from '@clipmaker/shared/config';
import { readEnvironment } from './server/environment';

try {
  loadWebConfig(readEnvironment());
} catch (error) {
  console.error(`web не запущен: ${error instanceof Error ? error.message : 'не удалось проверить конфигурацию'}`);
  process.exit(1);
}
