// Выбор реализации по ПРОВЕРЕННОЙ конфигурации. Нераспознанное значение сюда не доходит:
// оно уже уронило старт в `env.ts` (`honest-configuration` CFG-I3, CFG-I8).

import type { RecognizerConfig } from '@n4/shared';
import { createFakeModelProvider, type FakeModelProviderOptions } from './fake.js';
import { createLiveModelProvider, type ImageFetcher } from './live.js';
import { createOpenRouterModelProvider } from './openrouter.js';
import type { ModelProvider } from './types.js';

export function selectModelProvider(config: RecognizerConfig, images?: ImageFetcher, fakeOptions?: FakeModelProviderOptions): ModelProvider {
  if (config.modelProvider === 'fake') return createFakeModelProvider(fakeOptions);
  if (config.modelProvider === 'openrouter') {
    // Та же форма отказов, что у `live` ниже: недостижимо при корректной загрузке
    // конфигурации (DEC-A-045/046), оставлено на случай, если валидатор кто-то обойдёт.
    if (config.openrouterApiKey === undefined) {
      throw new Error('OPENROUTER_API_KEY отсутствует при N4_MODEL_PROVIDER=openrouter');
    }
    if (images === undefined) {
      throw new Error('N4_MODEL_PROVIDER=openrouter требует ImageFetcher для загрузки нормализованной копии — не передан вызывающим кодом');
    }
    return createOpenRouterModelProvider(config.openrouterApiKey, images);
  }
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
