// Живой поставщик. В фиче `foundation` он НЕ реализован, и это состояние, а не пропуск:
// ключа на машине нет (DEC-A-009), а «реализация», которую нечем проверить, была бы
// обещанием. Заглушка бросает исключение с названной причиной — тихо вернуть пустой
// ответ нельзя: он был бы неотличим от успешного разбора пустой тарелки.

import type { ModelProvider, ModelRequest, ModelResponse } from './types.js';

export class LiveProviderNotImplemented extends Error {
  constructor() {
    super('живой поставщик модели не реализован в фиче foundation: вызовы наружу вводит фича scan-pipeline');
    this.name = 'LiveProviderNotImplemented';
  }
}

export function createLiveModelProvider(_apiKey: string): ModelProvider {
  return {
    kind: 'live',
    async recognize(_request: ModelRequest): Promise<ModelResponse> {
      throw new LiveProviderNotImplemented();
    },
  };
}
