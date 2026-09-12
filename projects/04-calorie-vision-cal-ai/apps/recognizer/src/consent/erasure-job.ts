// RunErasureJob (FR-consent-and-telegram-auth-10/11, NFR-consent-and-telegram-auth-2).
//
// Почасовой планировщик — как `PurgeExpiredPhotos` (`scan-pipeline`, ещё не реализована), но
// раз в час: дедлайн 72 ч допускает часовое разрешение без риска просрочки. КАЖДЫЙ аккаунт —
// СВОЯ транзакция: сбой при удалении объекта фото одного владельца не блокирует остальных
// аккаунтов батча (04_refinement.md, Edge Cases Matrix).
//
// Сетевой вызов (удаление объекта из бакета) — ВНЕ транзакции (`security-operation-order.md`):
// строки удаляются и `file_state` переводится в `purged` ОДНОЙ транзакцией, ключи собираются
// через `RETURNING`, и только ПОСЛЕ коммита вызывается `photoStore.purgeObject` — соединение
// пула не удерживается на время сетевого вызова к MinIO.
//
// `PhotoStorePort` — ПОРТ (тот же паттерн, что `MatchIngredientPort`/`NullMatchIngredientPort`,
// DEC-A-014): архитектура фичи (`03_architecture.md`, «Зависимости npm») сознательно не вводит
// новой npm-зависимости, а реального S3-клиента в кодовой базе ещё нет (`scan-pipeline` его не
// поставляет). Продакшн-реализация подключается позже, когда появится клиент бакета; здесь —
// порт и заглушка с проверкой вызовов для тестов (см. `05_completion.md`, раздел «Отклонения»).

import { withTransaction, type DbPool } from '@n4/db';
import type { Logger } from '@n4/shared';

export interface PhotoStorePort {
  /** Отсутствие объекта — тоже успех (как `PurgeExpiredPhotos`): цель — отсутствие файла. */
  purgeObject(objectKey: string): Promise<void>;
}

/** Заглушка по умолчанию: пока нет реального S3-клиента, объекты бакета не трогаются. */
export const NOOP_PHOTO_STORE: PhotoStorePort = {
  async purgeObject(): Promise<void> {
    // Намеренно пусто — см. комментарий в шапке файла.
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

  for (const row of batch.rows) {
    const accountId = row.id;
    try {
      // Попытка уже оплачена (счёт по попыткам, FR-consent-and-telegram-auth-11): аккаунт с
      // активным сканом ПРОПУСКАЕТСЯ в этом прогоне, не является ошибкой, не блокирует батч.
      const active = await pool.query<{ id: string }>(`SELECT id FROM recognition WHERE account_id = $1 AND status = 'queued'`, [
        accountId,
      ]);
      if ((active.rowCount ?? 0) > 0) {
        skippedActiveScan += 1;
        continue;
      }

      const purgedKeys = await withTransaction(pool, async (client) => {
        const diary = await client.query(`DELETE FROM diary_entry WHERE owner_key = $1`, [accountId]);
        const recognitions = await client.query(`DELETE FROM recognition WHERE account_id = $1`, [accountId]);
        const cards = await client.query(`DELETE FROM share_card WHERE owner_key = $1`, [accountId]);
        // `attribution` и `growth_event` НЕ трогаются (DEC-A-016/10): они привязаны к
        // `device_session_id`, не хранят данных о питании и остаются измеримыми.
        const purged = await client.query<{ object_key: string }>(
          `UPDATE photo SET file_state = 'purged'
           WHERE file_state = 'present'
             AND device_session_id IN (SELECT id FROM device_session WHERE account_id = $1)
           RETURNING object_key`,
          [accountId],
        );
        await client.query(`UPDATE device_session SET account_id = NULL WHERE account_id = $1`, [accountId]);
        await client.query(`UPDATE account SET status = 'erased' WHERE id = $1`, [accountId]);
        return {
          keys: purged.rows.map((r) => r.object_key),
          deletedDiaryEntries: diary.rowCount ?? 0,
          deletedRecognitions: recognitions.rowCount ?? 0,
          deletedCards: cards.rowCount ?? 0,
        };
      });

      // Сетевой вызов ВНЕ транзакции, ПОСЛЕ коммита.
      for (const objectKey of purgedKeys.keys) {
        await photoStore.purgeObject(objectKey);
      }

      // Аудит БЕЗ персональных данных: числа и идентификатор, не содержимое записей.
      logger.info('account_erased', {
        account_id: accountId,
        deleted_diary_entries: purgedKeys.deletedDiaryEntries,
        deleted_recognitions: purgedKeys.deletedRecognitions,
        deleted_cards: purgedKeys.deletedCards,
        completed_at: now().toISOString(),
      });
      erased += 1;
    } catch (error) {
      // Сбой на ОДНОМ аккаунте не должен блокировать остальные — своя транзакция на аккаунт.
      logger.error('erasure_job_account_failed', { account_id: accountId, message: (error as Error).message });
    }
  }

  return { erased, skippedActiveScan };
}
