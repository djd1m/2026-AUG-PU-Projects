// EnforceConsentBeforeDiaryWrite (FR-consent-and-telegram-auth-7, AC-consent-and-telegram-auth-11).
//
// ЕДИНСТВЕННАЯ граница, через которую ОБЯЗАН пройти ЛЮБОЙ код перед записью `diary_entry` ИЛИ
// `share_card` (03_architecture.md, «Границы, которые фича обязана сохранить») — `scan-pipeline`
// ИМПОРТИРУЕТ эту функцию и не реализует свою проверку согласия: два места проверки одного
// факта разошлись бы молча (`deployment-seams.md`).
//
// Исключения для анонимного владельца НЕТ (DEC-A-019): владелец разрешается в `account`, если
// сессия связана, ИНАЧЕ в саму `device_session` — та же таблица, что читает и пишет
// `GrantOrDeclineConsent`. Недоступность строки владельца (сбой чтения) трактуется КАК
// отсутствие согласия (`fail-closed-defaults.md`): нет отдельной ветки «проверить не смогли —
// пропустим».
//
// Правка RV-consent-and-telegram-auth-02 (третий обзор): вызов с `owner.table === 'device_session'`
// раньше доверял ПЕРЕДАННОЙ таблице буквально — читал `device_session.consent_at` и никогда не
// заглядывал в `device_session.account_id`. После цепочки «анонимный grant → вход → withdraw»
// сессия УЖЕ связана с аккаунтом, `account.consent_at` обнулён отзывом, а историческое
// `device_session.consent_at` (перенос при входе НЕ обнуляет поля сессии — `auth-telegram.ts`,
// DEC-A-019) остаётся заполненным. Прямой вызов защищённого репозитория с ЭТОЙ сессией проходил,
// хотя аккаунт уже отозвал согласие. Теперь: если сессия СВЯЗАНА, актуальное согласие определяет
// СВЯЗАННЫЙ АККАУНТ, а не историческое поле сессии; если не связана — прежнее поведение.

import type { DbClient, DbPool } from '@n4/db';

export type ConsentOwnerTable = 'account' | 'device_session';

export interface ConsentOwnerRef {
  readonly table: ConsentOwnerTable;
  readonly id: string;
}

export type ConsentEnforcement =
  | { readonly outcome: 'granted' }
  | { readonly outcome: 'refused'; readonly reason: 'consent_required' };

const REFUSED: ConsentEnforcement = { outcome: 'refused', reason: 'consent_required' };
const GRANTED: ConsentEnforcement = { outcome: 'granted' };

/**
 * `FOR UPDATE` (RV-08 второго обзора): вызывающий (`createDiaryEntryGuarded`,
 * `createShareCardGuarded`) обязан открыть транзакцию и передать сюда её `client` — тогда эта
 * блокировка строки СЕРИАЛИЗУЕТ проверку с конкурентным `withdraw_consent`/`account-delete.ts`
 * (тот тоже блокирует ту же строку `account` `FOR UPDATE`): либо отзыв целиком опережает
 * проверку (тогда она честно видит `NULL`), либо проверка целиком опережает отзыв (тогда отзыв
 * ждёт коммита записи) — гонки «проверил → отозвали → записал» не остаётся.
 *
 * Порядок блокировок для `device_session`-ветки — СНАЧАЛА `device_session`, ЗАТЕМ (если
 * связана) `account`; `auth-telegram.ts` блокирует в обратном порядке (`account`, затем
 * `UPDATE device_session`). Это ОБРАТНЫЙ порядок относительно друг друга — при одновременной
 * конкуренции ЗА ОБЕ строки PostgreSQL обнаружит взаимную блокировку и абортит ОДНУ из двух
 * транзакций ошибкой `deadlock_detected` (`shared-resource-verification.md`); эта функция ловит
 * ЛЮБУЮ ошибку чтения и возвращает `refused` (см. `catch` ниже) — авария из-за взаимной
 * блокировки вырождается в отказ записи, а не в падение процесса: направление ошибки безопасно
 * (`fail-closed-defaults.md`), хотя и может редко отклонить легитимную запись под конкуренцией
 * ровно с логином. Именованное отклонение от идеала «полностью бездедлоковый порядок», а не
 * скрытая деталь — стоимость реордеринга (переписывать локи `auth-telegram.ts` под ЕЩЁ не
 * реализованный вызывающий код `scan-pipeline`) не оправдана в рамках этой правки.
 */
async function enforceForAccount(executor: DbPool | DbClient, accountId: string): Promise<ConsentEnforcement> {
  const result = await executor.query<{ consent_at: Date | null; status: string }>(
    'SELECT consent_at, status FROM account WHERE id = $1 FOR UPDATE',
    [accountId],
  );
  const row = result.rows[0];
  if (row === undefined || row.consent_at === null) {
    // Решением DEC-A-016 это ОДИНАКОВО покрывает «согласия никогда не было» И «согласие
    // отозвано» (`withdraw_consent` обнуляет `consent_at`) — второго признака нет.
    return REFUSED;
  }
  // RV-consent-and-telegram-auth-05 (третий обзор): аккаунт `erasing`/`erased` НЕ принимает
  // новую запись, даже если `consent_at` формально заполнено (withdraw его не трогает —
  // `erase_all` отзывает только карточки и переводит статус). Без этой проверки уже связанная
  // сессия могла создать НОВУЮ `diary_entry`/`share_card` МЕЖДУ шагом 1 `RunErasureJob`
  // (`DELETE FROM diary_entry/share_card/recognition WHERE … = accountId`) и шагом 3 (коммит
  // `erased`) — задача не перепроверяет эти таблицы перед коммитом, и такая запись осталась бы
  // у аккаунта, который больше не выбирается ни одним прогоном (тот же класс дефекта, что и
  // вход в erasing-аккаунт, RV-05 — только со стороны записи, а не входа). «Уже оплаченные»
  // задания (`recognition`, поставленные в очередь ДО запроса удаления) этой проверкой НЕ
  // задеты: их завершение — обновление СТРОКИ `recognition`, отдельный путь, не проходящий
  // через эту границу; `RunErasureJob` откладывает их отдельно (`skippedActiveScan`).
  if (row.status !== 'active') return REFUSED;
  return GRANTED;
}

export async function enforceConsentBeforeDiaryWrite(
  executor: DbPool | DbClient,
  owner: ConsentOwnerRef,
): Promise<ConsentEnforcement> {
  try {
    if (owner.table === 'account') {
      return await enforceForAccount(executor, owner.id);
    }

    // owner.table === 'device_session'.
    const sessionResult = await executor.query<{ account_id: string | null; consent_at: Date | null }>(
      'SELECT account_id, consent_at FROM device_session WHERE id = $1 FOR UPDATE',
      [owner.id],
    );
    const session = sessionResult.rows[0];
    if (session === undefined) return REFUSED;

    if (session.account_id !== null) {
      // RV-02: сессия УЖЕ связана — актуальное согласие определяет аккаунт, историческое поле
      // сессии больше не читается для решения (оно остаётся как исторический факт на строке).
      return await enforceForAccount(executor, session.account_id);
    }

    if (session.consent_at === null) return REFUSED;
    return GRANTED;
  } catch {
    return REFUSED;
  }
}
