// Заглушка-репозиторий карточки (03_architecture.md; FR-consent-and-telegram-auth-7, канон
// маршрут 5 `POST /api/v1/share-cards`, отказ `403 consent_required`). `scan-pipeline`
// подключится к этой функции, а не реализует свою проверку согласия — та же граница, что и
// у дневника (`enforce-before-diary-write.ts`).
//
// Правка по review-report.md RV-consent-and-telegram-auth-08 — та же, что в
// `diary-entry-repository.ts`: `ownerKey` больше не принимается отдельно (всегда `owner.id`),
// проверка согласия и `INSERT` — в одной транзакции с блокировкой строки владельца.

import { withTransaction, type DbPool } from '@n4/db';
import { enforceConsentBeforeDiaryWrite, type ConsentOwnerRef } from '../consent/enforce-before-diary-write.js';

export type CreateShareCardResult =
  | { readonly outcome: 'created'; readonly id: string }
  | { readonly outcome: 'refused'; readonly reason: 'consent_required' };

export interface CreateShareCardInput {
  readonly owner: ConsentOwnerRef;
  readonly recognitionId: string;
  readonly objectKey: string;
}

const INSERT_SHARE_CARD_SQL = `
  INSERT INTO share_card (owner_key, recognition_id, object_key)
  VALUES ($1, $2, $3)
  RETURNING id
`;

export async function createShareCardGuarded(pool: DbPool, input: CreateShareCardInput): Promise<CreateShareCardResult> {
  return withTransaction(pool, async (client) => {
    const enforcement = await enforceConsentBeforeDiaryWrite(client, input.owner);
    if (enforcement.outcome === 'refused') return { outcome: 'refused', reason: 'consent_required' };

    const result = await client.query<{ id: string }>(INSERT_SHARE_CARD_SQL, [input.owner.id, input.recognitionId, input.objectKey]);
    const row = result.rows[0];
    if (row === undefined) throw new Error('карточка не создана');
    return { outcome: 'created', id: row.id };
  });
}
