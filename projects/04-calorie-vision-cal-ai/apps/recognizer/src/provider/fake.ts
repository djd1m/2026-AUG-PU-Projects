// Детерминированный фейк (DEC-A-009). Наружу НЕ ходит ни одним байтом: сетевого клиента
// в этом файле нет вовсе, и это проверяемо чтением, а не обещанием.
//
// Детерминизм нужен не для красоты: тест, у которого ответ меняется от прогона к прогону,
// не отличает «поменялся ответ» от «поменялся код».
//
// Фейк УВАЖАЕТ ДЕДЛАЙН, и это не украшение: если бы он отвечал мгновенно всегда, ветка
// «не успели» не исполнялась бы НИ РАЗУ до живого прогона — а именно она стоит денег
// (попытка оплачена, результат выброшен). Задержка задаётся явно параметром, а не
// выводится из входа: случайно пересекающий дедлайн тест мигает и потому ничего не значит.
//
// РАСШИРЕНИЕ фичи `scan-pipeline`: тесты границы эскалации (AC-12), конкурентной эскалации
// (AC-13), устаревшей аренды с управляемой задержкой (AC-17) и провайдер-отказов (AC-16)
// нуждаются в УПРАВЛЯЕМОМ фейке — детерминированная форма ответа этого не даёт. Опции
// необязательны: без них поведение то же, что в `foundation`.
//
// Две группы опций СОСУЩЕСТВУЮТ, а не заменяют друг друга: `latencyMs` — постоянная
// задержка провайдера (`foundation`, проверка дедлайна), `delayMs(request)` — задержка,
// зависящая от КОНКРЕТНОГО запроса (`scan-pipeline`, гонка аренды). Заданы обе — берётся
// та, что зависит от запроса: она объявлена позже и адресована именно этому вызову.

import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { ModelCallAborted, ModelDeadlineExceeded, type ModelProvider, type ModelRequest, type ModelResponse } from './types.js';

const LABELS = ['гречка отварная', 'куриная грудка', 'салат из огурцов', 'борщ', 'омлет'] as const;

export type FakeOutcome = 'ok' | 'no_food' | 'provider_unavailable' | 'provider_timeout';

export interface FakeModelProviderOptions {
  /** Сколько «думает» фейк. По умолчанию ноль: тесты не ждут зря. */
  readonly latencyMs?: number;
  /** Переопределяет вычисленную уверенность — тесты границы 0,59/0,60 и эскалации. */
  confidenceOverride?: (request: ModelRequest) => number | undefined;
  /** Принудительный исход вместо обычного ответа (AC-scan-pipeline-16). */
  outcomeOverride?: (request: ModelRequest) => FakeOutcome | undefined;
  /** Управляемая задержка ОТВЕТА, мс — устаревшая аренда с реальным вызовом (AC-scan-pipeline-17). */
  delayMs?: (request: ModelRequest) => number;
}

/** Имя `foundation` сохранено: на него ссылается `provider-adapter.test.ts`. */
export type FakeProviderOptions = FakeModelProviderOptions;

class ProviderUnavailableError extends Error {
  constructor() {
    super('фейковый провайдер: недоступен (тестовый режим)');
    this.name = 'ProviderUnavailableError';
  }
}

function digits(hash: string, offset: number, length: number): number {
  return Number.parseInt(hash.slice(offset, offset + length), 16);
}

/**
 * Ожидание, прерываемое сигналом НЕМЕДЛЕННО, а не досиживающее свой таймер: смысл общего
 * сигнала в том, чтобы платная работа прекращалась в момент отмены.
 */
function sleepRespectingSignal(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new ModelCallAborted());
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new ModelCallAborted());
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export function createFakeModelProvider(options: FakeModelProviderOptions = {}): ModelProvider {
  const constantLatencyMs = options.latencyMs ?? 0;

  return {
    kind: 'fake',
    async recognize(request: ModelRequest): Promise<ModelResponse> {
      // Дедлайн проверяется ДО работы: истёкший бюджет — это отказ, а не «попробуем
      // быстренько». Ноль и отрицательное значение означают «уже поздно».
      // Отмена проверяется ПЕРВОЙ: у уже прерванной операции нет причины начинаться.
      if (request.signal.aborted) throw new ModelCallAborted();
      if (!Number.isFinite(request.deadlineMs) || request.deadlineMs <= 0) throw new ModelDeadlineExceeded(request.deadlineMs);

      // ДЕДЛАЙН — АБСОЛЮТНАЯ ТОЧКА НА МОНОТОННЫХ ЧАСАХ, снятая на входе, а не разность
      // двух ВХОДНЫХ чисел. `latencyMs > deadlineMs` бюджета не проверяет вовсе: это
      // сравнение того, что нам передали, с тем, что нам передали, и об ИСТЁКШЕМ времени
      // оно не говорит ничего. Таймер просыпается не в свой срок, а когда освободится цикл
      // событий, — при занятом на 80 мс цикле фейк отвечал УСПЕХОМ через 81 мс с бюджетом
      // 20 мс (слепое ревью, RV-foundation-02). Поздний успех оплачен и всё равно
      // выбрасывается, поэтому честный ответ здесь один — отказ.
      // `performance.now()` монотонен: перевод системных часов его не сдвигает, в отличие
      // от `Date.now()`.
      const expiresAt = performance.now() + request.deadlineMs;

      const latencyMs = options.delayMs?.(request) ?? constantLatencyMs;

      // ВТОРАЯ, НЕЗАВИСИМАЯ проверка — по ЗАДАННОЙ работе, а не по часам. Фейку велели
      // работать `latencyMs`, и если это больше бюджета, результат физически не успевает:
      // отказ известен ДО ожидания. Часы одни этого не ловят — ожидание урезается до
      // бюджета, а таймер с дробным бюджетом просыпается чуть РАНЬШЕ срока и проверка
      // `performance.now() >= expiresAt` проходит: при бюджете 5,9 мс и задержке 1000 мс
      // двадцать вызовов из двадцати возвращали успех (слепое ревью, шестой раунд,
      // RV-foundation-01). Две проверки отвечают на РАЗНЫЕ вопросы: «успеет ли работа»
      // и «цел ли бюджет сейчас», и ни одна не заменяет другую.
      //
      // ИСКЛЮЧЕНИЕ названо явно: исход `provider_timeout` (`scan-pipeline`, AC-16) ИМЕННО
      // и означает «провайдер думал дольше дедлайна», и его задержка задаётся ниже, уже
      // после этой проверки, — поэтому она здесь не участвует.
      if (latencyMs > request.deadlineMs) throw new ModelDeadlineExceeded(request.deadlineMs);

      await sleepRespectingSignal(latencyMs, request.signal);

      // Проверка ПОСЛЕ ожидания и ПЕРЕД возвратом — единственное место, где известно
      // ФАКТИЧЕСКИ истёкшее время. Стоит здесь, а не внутри ветки задержки: нулевая
      // задержка не означает, что бюджет цел, — вызывающий мог передать его уже
      // почти исчерпанным.
      if (performance.now() >= expiresAt) throw new ModelDeadlineExceeded(request.deadlineMs);

      const outcome = options.outcomeOverride?.(request) ?? 'ok';
      if (outcome === 'provider_unavailable') throw new ProviderUnavailableError();
      if (outcome === 'provider_timeout') {
        await sleepRespectingSignal(request.deadlineMs + 1000, request.signal);
        // Если сигнал не оборвал сон (например, тест не подключил реальный таймер) —
        // всё равно вернуть отказ, эмулирующий истечение дедлайна на стороне провайдера.
        throw new ModelCallAborted();
      }

      // Вход целиком, а не только идентификатор: один и тот же кадр обязан давать один и
      // тот же ответ, а разные кадры — разные. Модель входит в хеш: ответ Sonnet 5 и ответ
      // Haiku 4.5 на один кадр обязаны различаться, иначе тест эскалации ничего не видит.
      const hash = createHash('sha256')
        .update(`${request.scanId}|${request.imageKey}|${request.model}|${request.schema.name}`)
        .digest('hex');

      // «Еды не найдено» — тоже ОТВЕТ, а не короткий путь мимо проверки бюджета: он так же
      // оплачен и так же обязан быть отброшен, если пришёл поздно. Поэтому он не
      // возвращается здесь, а доходит до общей проверки перед `return` ниже.
      const noFood = outcome === 'no_food';

      const count = (digits(hash, 0, 2) % 3) + 1;
      const items = Array.from({ length: count }, (_, index) => {
        const seed = digits(hash, 4 + index * 6, 6);
        return {
          labelRu: LABELS[seed % LABELS.length] ?? 'блюдо',
          massG: 50 + (seed % 351),
          candidates: [] as readonly string[],
        };
      });

      const naturalConfidence = Math.round((digits(hash, 32, 4) / 0xffff) * 100) / 100;
      const confidence = options.confidenceOverride?.(request) ?? naturalConfidence;

      const response: ModelResponse = noFood
        ? { model: request.model, items: [], confidence: 0.9, modelEstimateKcal: 0 }
        : {
            // Эхо модели: ответ сам говорит, чей он, и это не восстанавливается по памяти.
            model: request.model,
            items,
            confidence,
            modelEstimateKcal: 100 + (digits(hash, 40, 4) % 900),
          };

      // ПОСЛЕДНЯЯ проверка — НЕПОСРЕДСТВЕННО перед возвратом, после того как результат уже
      // сформирован. Проверка выше (до хеша) закрывала бюджет, потраченный на ОЖИДАНИЕ, но
      // не на само формирование ответа: SHA-256 и сборка объекта тоже занимают время. При
      // бюджете 0,01 мс судья намерил 0,0028 мс на последней внутренней проверке и 0,517 мс
      // на возврате — 16 успехов из 20 приходили ПОСЛЕ дедлайна (слепое ревью, седьмой
      // раунд, RV-foundation-01). Порядок «сначала сформировать, потом проверить» выбран
      // намеренно: проверять ДО работы и возвращать ПОСЛЕ неё — это утверждение о прошлом.
      if (performance.now() >= expiresAt) throw new ModelDeadlineExceeded(request.deadlineMs);

      return response;
    },
  };
}
