// Выбор реализации по ПРОВЕРЕННОЙ конфигурации. Нераспознанное значение сюда не доходит:
// оно уже уронило старт в `env.ts` (`honest-configuration` CFG-I3, CFG-I8).

import type { RecognizerConfig } from '@n4/shared';
import { createFakeModelProvider, type FakeModelProviderOptions } from './fake.js';
import { createLiveModelProvider, type ImageFetcher } from './live.js';
import type { ModelProvider } from './types.js';

export function selectModelProvider(config: RecognizerConfig, images?: ImageFetcher, fakeOptions?: FakeModelProviderOptions): ModelProvider {
  if (config.modelProvider === 'fake') return createFakeModelProvider(fakeOptions);
  if (config.anthropicApiKey === undefined) {
    // Недостижимо при корректной загрузке конфигурации. Оставлено НАМЕРЕННО: если кто-то
    // обойдёт валидатор, отказать здесь дешевле, чем отправить запрос без ключа.
    throw new Error('ANTHROPIC_API_KEY отсутствует при N4_MODEL_PROVIDER=live');
  }
  if (images === undefined) {
    throw new Error('N4_MODEL_PROVIDER=live требует ImageFetcher для загрузки нормализованной копии — не передан вызывающим кодом');
  }
  return createLiveModelProvider(config.anthropicApiKey, images);
}
