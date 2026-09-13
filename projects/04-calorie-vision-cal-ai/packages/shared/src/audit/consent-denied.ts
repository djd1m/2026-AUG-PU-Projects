// GuardExternalTransferWithoutConsent (FR-consent-and-telegram-auth-12,
// AC-consent-and-telegram-auth-18).
//
// Для ЛЮБОЙ попытки внутреннего кода передать записи дневника владельца во внешний канал
// (публикация, экспорт, будущий дайджест) — вызывающий код называет намерение явно, эта
// функция не угадывает его по контексту. Недоступность источника истины о согласии
// трактуется ТАК ЖЕ, как его отсутствие (`fail-closed-defaults.md`): недоступность строки —
// отказ, а не пропуск проверки.
//
// Аудит несёт ТОЛЬКО факт попытки — без содержимого записей дневника (Security Architecture).

export interface ConsentAuditEntry {
  readonly owner: string;
  readonly attemptedChannel: string;
  readonly reason: 'no_consent';
  readonly at: Date;
}

export interface ConsentAuditSink {
  record(entry: ConsentAuditEntry): void;
}

/** Источник истины о согласии владельца. Реализация — на вызывающей стороне (account/db). */
export interface ConsentCheckable {
  hasActiveConsent(ownerId: string): Promise<boolean>;
}

export type ExternalTransferDecision =
  | { readonly outcome: 'granted' }
  | { readonly outcome: 'refused'; readonly reason: 'no_consent' };

export interface GuardExternalTransferInput {
  readonly ownerId: string;
  readonly attemptedChannel: string;
  readonly now?: () => Date;
}

export async function guardExternalTransferWithoutConsent(
  source: ConsentCheckable,
  audit: ConsentAuditSink,
  input: GuardExternalTransferInput,
): Promise<ExternalTransferDecision> {
  let hasConsent: boolean;
  try {
    hasConsent = await source.hasActiveConsent(input.ownerId);
  } catch {
    // Недоступность строки владельца (ошибка чтения) — ОТКАЗ, а не «проверить не смогли, пропустим».
    hasConsent = false;
  }

  if (!hasConsent) {
    audit.record({
      owner: input.ownerId,
      attemptedChannel: input.attemptedChannel,
      reason: 'no_consent',
      at: (input.now ?? (() => new Date()))(),
    });
    return { outcome: 'refused', reason: 'no_consent' };
  }

  return { outcome: 'granted' };
}
