// Выбор реализации по ПРОВЕРЕННОЙ конфигурации. Нераспознанное значение сюда не доходит:
// оно уже уронило старт в `env.ts` (`honest-configuration` CFG-I3, CFG-I8).

import type { RecognizerConfig } from '@n4/shared';
import { createFakeModelProvider } from './fake.js';
import { createLiveModelProvider } from './live.js';
import type { ModelProvider } from './types.js';

export function selectModelProvider(config: RecognizerConfig): ModelProvider {
  if (config.modelProvider === 'fake') return createFakeModelProvider();
  if (config.anthropicApiKey === undefined) {
    // Недостижимо при корректной загрузке конфигурации. Оставлено НАМЕРЕННО: если кто-то
    // обойдёт валидатор, отказать здесь дешевле, чем отправить запрос без ключа.
    throw new Error('ANTHROPIC_API_KEY отсутствует при N4_MODEL_PROVIDER=live');
  }
  return createLiveModelProvider(config.anthropicApiKey);
}
