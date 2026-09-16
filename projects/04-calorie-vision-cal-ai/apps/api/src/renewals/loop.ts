// Цикл продлений внутри процесса `api`.
//
// ПОЧЕМУ В `api`, А НЕ В `recognizer`, как говорил план (`03_architecture.md`): продление
// зовёт платёжного провайдера, а ключи провайдера принадлежат ТОЛЬКО `api`
// (`secrets-management.md`: сервис, которому нечем позвать наружу, не позовёт). Отдать
// продления распознавателю значило бы выдать ему платёжные секреты ради одной функции —
// то есть разменять проверяемый инвариант на удобство размещения. План исправлен.
//
// Цикл — не «долгая задача в памяти»: состояние живёт в строке `subscription`, а цикл лишь
// подталкивает. Перезапуск процесса не теряет ничего.

import { randomUUID } from 'node:crypto';
import { initiateRenewal, leaseDueSubscription, type RenewalDeps } from './renew.js';

export interface RenewalLoop {
  stop(): void;
}

export interface RenewalLoopOptions {
  readonly intervalMs: number;
  /** Сколько подписок обрабатывать за один проход. Ограничение существует, чтобы всплеск
   * просроченных подписок не превратился в бесконечный проход, удерживающий процесс. */
  readonly batchSize: number;
}

/** Один проход: берёт до `batchSize` подписок и инициирует по ним автоплатёж. */
export async function runRenewalPass(deps: RenewalDeps, options: RenewalLoopOptions): Promise<number> {
  let handled = 0;
  for (let i = 0; i < options.batchSize; i += 1) {
    const leased = await leaseDueSubscription(deps, randomUUID());
    if (leased === undefined) break;
    const outcome = await initiateRenewal(deps, leased);
    handled += 1;
    // Недоступность провайдера прекращает ПРОХОД целиком: продолжать по одной подписке
    // значило бы двадцать раз постучаться в лежащий сервис и двадцать раз подождать таймаут.
    if (outcome.kind === 'provider_unavailable') break;
  }
  return handled;
}

export function startRenewalLoop(deps: RenewalDeps, options: RenewalLoopOptions): RenewalLoop {
  let stopped = false;
  let running = false;

  const tick = async (): Promise<void> => {
    // Проходы не накладываются: медленный провайдер иначе порождал бы параллельные проходы,
    // каждый со своими арендами и своими соединениями пула.
    if (stopped || running) return;
    running = true;
    try {
      const handled = await runRenewalPass(deps, options);
      if (handled > 0) deps.logger.info('renewal_pass', { handled });
    } catch (error) {
      // Цикл обязан пережить любую ошибку прохода: упавший таймер — это подписки, которые
      // молча перестали продлеваться, и узнаётся это по жалобе, а не по журналу.
      deps.logger.error('renewal_pass_failed', { message: (error as Error).message });
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => void tick(), options.intervalMs);
  // Таймер не держит процесс: остановка сервера не ждёт следующего прохода.
  timer.unref();

  return {
    stop(): void {
      stopped = true;
      clearInterval(timer);
    },
  };
}
