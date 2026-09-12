// RunErasureJob (FR-consent-and-telegram-auth-10/11, NFR-consent-and-telegram-auth-2).
//
// Почасовой планировщик — как `PurgeExpiredPhotos` (`scan-pipeline`, ещё не реализована), но
// раз в час: дедлайн 72 ч допускает часовое разрешение без риска просрочки. КАЖДЫЙ аккаунт —
// своя единица работы: сбой при удалении объекта фото одного владельца не блокирует остальных
// аккаунтов батча (04_refinement.md, Edge Cases Matrix).
//
// Правка по review-report.md:
//   RV-consent-and-telegram-auth-01 (blocker) — `diary_entry` и `share_card` ссылаются на
//   `recognition` через `ON DELETE RESTRICT` (миграция 001). Прежний порядок удалял
//   `recognition` МЕЖДУ `diary_entry` и `share_card` — аккаунт хотя бы с одной ещё не удалённой
//   карточкой получал ошибку внешнего ключа на КАЖДОМ прогоне и оставался `erasing` навсегда.
//   Порядок теперь: `diary_entry`, ЗАТЕМ `share_card` (обе ссылки на `recognition` сняты),
//   ЗАТЕМ `recognition`.
//
//   RV-consent-and-telegram-auth-02 (blocker) — `NOOP_PHOTO_STORE` в проде недопустим: строки
//   удалялись и `account.status = 'erased'` фиксировался в ОДНОЙ транзакции с пометкой фото
//   `purged`, ДО того как объект физически удалён из бакета; сбой `purgeObject` был
//   невосстановим штатным повтором, потому что следующий батч аккаунт `erased` больше не
//   выбирает. Теперь: (1) строки БД удаляются одной транзакцией (не трогая `photo`/`account`/
//   `device_session`); (2) фотографии purge'атся ПО ОДНОЙ, вне транзакции, и `file_state`
//   переводится в `purged` СРАЗУ после подтверждённого `purgeObject` — если удаление конкретного
//   объекта не удалось, эта строка `photo` остаётся `present` и будет выбрана СЛЕДУЮЩИМ
//   прогоном (переспрос идёт заново по `file_state = 'present'`, а не по заранее собранному
//   списку); (3) `account.status = 'erased'` и обнуление `device_session.account_id`
//   фиксируются ТОЛЬКО когда для аккаунта не осталось ни одной `present`-фотографии — коммит
//   `erased` строго ПОСЛЕ подтверждённого удаления объектов, не раньше.

import { withTransaction, type DbPool } from '@n4/db';
import type { Logger } from '@n4/shared';

export interface PhotoStorePort {
  /** Отсутствие объекта — тоже успех (как `PurgeExpiredPhotos`): цель — отсутствие файла. */
  purgeObject(objectKey: string): Promise<void>;
}

/**
 * Заглушка ТОЛЬКО для тестов, которым настоящий бакет не нужен (например, юнит-проверки самого
 * `runErasureJob`, не завязанные на RV-02). В РАБОЧЕМ процессе используется `MinioPhotoStore`
 * (`../storage/photo-store-minio.ts`) — см. `bootstrap.ts`.
 */
export const NOOP_PHOTO_STORE: PhotoStorePort = {
  async purgeObject(): Promise<void> {
    // Намеренно пусто — только для тестов, не для прода (RV-02).
  },
};

const BATCH_SIZE = 50;

export interface RunErasureJobOptions {
  readonly pool: DbPool;
  readonly photoStore: PhotoStorePort;
  readonly logger: Logger;
  readonly now?: () => Date;
}

export interface ErasureJobResult {
  readonly erased: number;
  readonly skippedActiveScan: number;
  /** Строки БД удалены и часть/все фотографии purge'ены, но НЕ ВСЕ — account остаётся `erasing`. */
  readonly incomplete: number;
}

interface PhotoRow {
  readonly id: string;
  readonly object_key: string;
}

export async function runErasureJob(options: RunErasureJobOptions): Promise<ErasureJobResult> {
  const { pool, photoStore, logger } = options;
  const now = options.now ?? (() => new Date());

  const batch = await pool.query<{ id: string }>(
    `SELECT id FROM account WHERE status = 'erasing' ORDER BY deletion_requested_at LIMIT $1`,
    [BATCH_SIZE],
  );

  let erased = 0;
  let skippedActiveScan = 0;
  let incomplete = 0;

  for (const row of batch.rows) {
    const accountId = row.id;
    try {
      // Попытка уже оплачена (счёт по попыткам, FR-consent-and-telegram-auth-11): аккаунт с
      // активным сканом ПРОПУСКАЕТСЯ в этом прогоне, не является ошибкой, не блокирует батч.
      // RV-06: после входа через Telegram анонимные `recognition` переносятся на аккаунт
      // (`account_id` заполняется в `TelegramLogin`), поэтому этот предикат теперь видит и их.
      const active = await pool.query<{ id: string }>(`SELECT id FROM recognition WHERE account_id = $1 AND status = 'queued'`, [
        accountId,
      ]);
      if ((active.rowCount ?? 0) > 0) {
        skippedActiveScan += 1;
        continue;
      }

      // Шаг 1 — удаление строк, идемпотентно (повторный прогон находит уже пустые таблицы,
      // 0 затронутых строк — не ошибка). Порядок: diary_entry, share_card, recognition (RV-01).
      await withTransaction(pool, async (client) => {
        await client.query(`DELETE FROM diary_entry WHERE owner_key = $1`, [accountId]);
        await client.query(`DELETE FROM share_card WHERE owner_key = $1`, [accountId]);
        await client.query(`DELETE FROM recognition WHERE account_id = $1`, [accountId]);
      });

      // Шаг 2 — фотографии, ПО ОДНОЙ, вне транзакции (сетевой вызов не держит соединение пула).
      // Переспрашивается ЗАНОВО на каждом прогоне: уже помеченные `purged` не попадут в выборку,
      // что и делает шаг РЕЗЮМИРУЕМЫМ после частичного сбоя (RV-02).
      const pending = await pool.query<PhotoRow>(
        `SELECT p.id, p.object_key FROM photo p
         JOIN device_session ds ON ds.id = p.device_session_id
         WHERE ds.account_id = $1 AND p.file_state = 'present'`,
        [accountId],
      );

      let allPurged = true;
      for (const photo of pending.rows) {
        try {
          await photoStore.purgeObject(photo.object_key);
          await pool.query(`UPDATE photo SET file_state = 'purged' WHERE id = $1`, [photo.id]);
        } catch (error) {
          allPurged = false;
          logger.error('photo_purge_failed', {
            account_id: accountId,
            object_key: photo.object_key,
            message: (error as Error).message,
          });
          // Продолжаем с ОСТАЛЬНЫМИ фотографиями этого аккаунта — один упавший объект не
          // должен помешать удалить остальные; аккаунт всё равно останется `erasing`.
        }
      }

      if (!allPurged) {
        // Коммит `erased` ЗАПРЕЩЁН, пока остаётся хоть одна `present`-фотография (RV-02):
        // следующий часовой прогон повторит попытку ИМЕННО для оставшихся объектов.
        incomplete += 1;
        logger.warn('erasure_job_account_incomplete', { account_id: accountId, reason: 'photo_purge_pending' });
        continue;
      }

      // Шаг 3 — ТОЛЬКО теперь, когда фотографий `present` для аккаунта не осталось: обнулить
      // сессии и зафиксировать `erased`.
      await withTransaction(pool, async (client) => {
        await client.query(`UPDATE device_session SET account_id = NULL WHERE account_id = $1`, [accountId]);
        await client.query(`UPDATE account SET status = 'erased' WHERE id = $1`, [accountId]);
      });

      // Аудит БЕЗ персональных данных: числа и идентификатор, не содержимое записей.
      logger.info('account_erased', {
        account_id: accountId,
        purged_photos: pending.rows.length,
        completed_at: now().toISOString(),
      });
      erased += 1;
    } catch (error) {
      // Сбой на ОДНОМ аккаунте не должен блокировать остальные.
      logger.error('erasure_job_account_failed', { account_id: accountId, message: (error as Error).message });
    }
  }

  return { erased, skippedActiveScan, incomplete };
}
