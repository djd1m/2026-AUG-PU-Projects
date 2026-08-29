// FR-010 — смена пароля и завершение ВСЕХ сессий аккаунта.
//
// ─────────────────────────────────────────────────────────────────────────────
// ЭТОТ ФАЙЛ НЕ ЗНАЕТ ПРО HTTP — И ЭТО РЕАЛИЗАЦИЯ ТРЕБОВАНИЯ, А НЕ СТИЛЬ.
// NFR-010.7: `accountId` приходит ПАРАМЕТРОМ и берётся вызывающим из
// currentAccountId(). Реализация, читающая идентификатор из тела запроса,
// прошла бы все проверки изоляции — они смотрят, не задет ли ЧУЖОЙ аккаунт при
// работе со СВОИМ, и молчат, когда «своим» объявлен чужой. Здесь у функции
// физически нет доступа к запросу, поэтому такая ошибка невозможна по типу.
//
// ПОРЯДОК ШАГОВ — ЭТО ЗАЩИТА (.claude/rules/security-operation-order.md).
// Три ревизии валидации ушли на то, чтобы он стал таким. Что нельзя менять:
//
//   1. Лимитер ДО любого argon2 (AC-010.25). Ревизия 2 вынесла хеш нового пароля
//      за транзакцию ради удержания пула — и тем поставила его ДО лимитера,
//      который живёт здесь. Запрос, обречённый на 429, оплачивал полный хеш:
//      38 мс CPU и 19 МиБ, без потолка, из одной валидной cookie. Тот же CPU
//      считает argon2 входа, то есть вход деградировал бы вместе.
//   2. hashPassword(next) — ТОЛЬКО в шаге 4, после успешной проверки текущего
//      (AC-010.22). Путь злоупотребления до него не доходит и стоит ровно одного
//      argon2 — столько же, сколько попытка входа.
//   3. Ключ лимита — ПАРА (accountId, ip), не accountId. Ключ по одному аккаунту
//      дал бы вору с украденной cookie кнопку «запереть владельца»: пять неверных
//      попыток, и владелец на час не может сменить пароль. Других путей отзыва в
//      системе нет. Тот же класс и то же решение, что у входа (login.ts).
//   4. Отзыв — ВСЕХ сессий, включая текущую (AC-010.3). «Прочие» оставили бы вора
//      внутри: кража cookie не создаёт новой строки, вор сидит в ТОЙ ЖЕ сессии.
//   5. Отзыв ПЕРЕД выдачей (AC-010.4): наоборот новая сессия попала бы под
//      собственный отзыв.
// ─────────────────────────────────────────────────────────────────────────────

import type { PoolClient } from 'pg';
import { rateLimit } from '@proofwall/db';
import { hashPassword, verifyPassword, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from './password';
// hashKey — ЕДИНСТВЕННЫМ объявлением на проект (AC-010.24). Своя копия разошлась бы
// с оригиналом тихо. Пороги и окно, наоборот, СВОИ: общие связали бы две фичи, и
// правка PAIR_THRESHOLD у входа молча изменила бы лимит смены пароля.
import { hashKey } from './login';
import { createSession } from './session';

/** Тугой счётчик. Ключ — ПАРА (аккаунт, IP): см. пункт 3 в шапке. */
export const PWCHANGE_PAIR_SCOPE = 'pwchange_pair';
export const PWCHANGE_PAIR_THRESHOLD = 5;
/** Грубый счётчик — ограничивает машину, а не учётку. 30, а не 5: за NAT живые люди. */
export const PWCHANGE_IP_SCOPE = 'pwchange_ip';
export const PWCHANGE_IP_THRESHOLD = 30;
export const PWCHANGE_WINDOW = { seconds: 3600 } as const;
/** Пространство имён advisory-локов ЭТОЙ фичи. У входа 90_009; важна несовпадаемость:
 *  одноаргументная форма дала бы 32 бита и сталкивалась бы с локами входа в той же БД,
 *  отчего активный перебор на входе давал бы ложные отказы на смене пароля. */
export const PWCHANGE_LOCK_NAMESPACE = 90_010;
/** ВТОРОГО лока по accountId здесь НЕТ, и это осознанное решение, а не упущение.
 *
 *  Он был добавлен против гонки (ревью, проход 1, B-1) и создал дефект ХУЖЕ той гонки
 *  (проход 2, B-1'): TRY-лок по одному аккаунту — это лотерея, а не очередь. Вор с
 *  украденной cookie в ОДИН поток (`while true; do curl …`) выигрывал её почти всегда, и
 *  владелец получал 409 «смена уже выполняется» на каждую попытку — текст, который в этой
 *  ситуации лжёт. Замерено: успехов владельца 0/15 при потоке вора в два потока, 5/5 без
 *  него. Владелец не мог сменить пароль, то есть не мог выгнать вора: маршрута выхода в
 *  проекте нет, восстановления пароля нет, списка сессий нет.
 *
 *  Гонку закрывает `for update` ниже, и закрывает лучше: под READ COMMITTED он ЖДЁТ
 *  держателя строки, а после его COMMIT перечитывает актуальную версию. Проигравший читает
 *  уже НОВЫЙ хеш, его проверка старого пароля честно не проходит, и он получает
 *  unauthorized — что вернее, чем busy: его «текущий пароль» действительно перестал быть
 *  текущим. Ожидание ограничено lock_timeout, то есть очередь имеет верхнюю границу.
 *
 *  Это ПЯТОЕ подряд повторение одного класса в проекте: правку проверяли на её сценарии и
 *  не проверяли на разделяемом ресурсе, который она создала
 *  (.claude/rules/shared-resource-verification.md, вопросы 3 и 4). */
/** Успешные смены тоже стоят двух argon2 и до сих пор не считались ничем: прогон ревью —
 *  20 успешных смен подряд за 1131 мс. Ключ по ОДНОМУ accountId, не по паре: смена адреса
 *  иначе даёт свежий бюджет. Порог с большим запасом над живым сценарием, и он не запирает
 *  доступ — только дальнейшие смены в пределах часа. */
export const PWCHANGE_SUCCESS_SCOPE = 'pwchange_success';
export const PWCHANGE_SUCCESS_THRESHOLD = 10;

export type ChangeResult =
  | { ok: true; token: string }
  // Причина в отказе ЕСТЬ, в отличие от входа: перечислять нечего — аккаунт уже
  // известен из проверенной сессии. Но 'unauthorized' один на «нет аккаунта» и
  // «пароль не тот» (NFR-010.4), а 'busy' отделён от 'too_many' намеренно:
  // конкурентная смена — не перебор, и ответ «слишком много попыток» вводил бы
  // владельца в заблуждение (AC-010.19).
  | { ok: false; reason: 'unauthorized' | 'too_many' | 'busy' };

/** Границы нового пароля. Проверяется ВЫЗЫВАЮЩИМ, до открытия транзакции: мусор не
 *  должен ни занимать соединение пула, ни доходить до argon2. */
export function validNewPassword(value: unknown): value is string {
  return typeof value === 'string'
    && value.length >= PASSWORD_MIN_LENGTH
    && value.length <= PASSWORD_MAX_LENGTH;
}

export async function changePassword(
  client: PoolClient,
  input: { accountId: string; ip: string; current: string; next: string },
): Promise<ChangeResult> {
  const { accountId, ip, current, next } = input;

  const keyPair = hashKey(PWCHANGE_PAIR_SCOPE, accountId, ip);
  const keyIp = hashKey(PWCHANGE_IP_SCOPE, ip);

  // Пояс: ожидание лока ограничено. Механизм — try ниже, это страховка.
  await client.query("set local lock_timeout = '250ms'");
  // Верхняя граница удержания соединения. lock_timeout ограничивает ожидание блокировки,
  // но не длительность самой работы: под насыщенным CPU пакет argon2 растёт нелинейно, и
  // единственной границей оставалось бы время хеширования. 10 с — с большим запасом над
  // худшим замеренным пакетом (780 мс на 30 одновременных) и намного ниже вредного.
  await client.query("set local statement_timeout = '10s'");

  // ── ШАГ 1: лок. Проверка и запись счётчика иначе не атомарны: под READ COMMITTED
  // сто параллельных запросов увидят count = 0 и пройдут все.
  // Двухаргументная форма — 64 бита пространства (NFR-010.9).
  const lock = await client.query<{ locked: boolean }>(
    'select pg_try_advisory_xact_lock($1, hashtext($2)) as locked',
    [PWCHANGE_LOCK_NAMESPACE, keyPair],
  );
  // НЕ too_many: неудача захвата означает конкурентную смену пароля, а не перебор.
  if (!lock.rows[0]?.locked) return { ok: false, reason: 'busy' };


  // ── ШАГ 2: оба лимита. До этой черты argon2 не считался НИ РАЗУ (AC-010.25).
  if (await rateLimit.exceeded(PWCHANGE_IP_SCOPE, keyIp, PWCHANGE_WINDOW, PWCHANGE_IP_THRESHOLD, client)) {
    return { ok: false, reason: 'too_many' };
  }
  if (await rateLimit.exceeded(PWCHANGE_PAIR_SCOPE, keyPair, PWCHANGE_WINDOW, PWCHANGE_PAIR_THRESHOLD, client)) {
    return { ok: false, reason: 'too_many' };
  }
  // Успешные смены тоже стоят двух argon2 каждая (H-1). Прежний комментарий утверждал, что
  // путь успеха «самоограничивается, потому что после успеха сессия сменилась» — неверно
  // дважды: рабочая cookie выдаётся в том же ответе, а новый пароль вызывающему известен,
  // он его сам и выбрал. Цикл B→C→B→C не требует ничего, кроме одной валидной учётки.
  const keyAccount = hashKey(PWCHANGE_SUCCESS_SCOPE, accountId);
  if (await rateLimit.exceeded(
    PWCHANGE_SUCCESS_SCOPE, keyAccount, PWCHANGE_WINDOW, PWCHANGE_SUCCESS_THRESHOLD, client)) {
    return { ok: false, reason: 'too_many' };
  }

  // ── ШАГ 3: текущий пароль.
  // ФИЛЬТР ПО ВЛАДЕЛЬЦУ ОБЯЗАТЕЛЕН, и у accounts он называется id, а не account_id
  // (003_core.sql:9). RLS к accounts НЕ применяется (007_rls.sql:31), хотя update
  // этой роли выдан: забыть фильтр — значит сменить пароль ЧУЖОМУ аккаунту.
  // FOR UPDATE — пояс к advisory-локу выше. Голый SELECT под READ COMMITTED строку НЕ
  // блокирует, и прежний комментарий, утверждавший, что «внутри транзакции TOCTOU
  // невозможен», был просто неверен. Благодаря локу ожидания здесь не возникает, но
  // строка защищена и от путей, которые лока не берут.
  const found = await client.query<{ password_hash: string }>(
    'select password_hash from accounts where id = $1 for update',
    [accountId],
  );
  const account = found.rows[0] ?? null;
  if (!account) return { ok: false, reason: 'unauthorized' };

  // Единственный argon2, который считает НЕудачная попытка. Наружу не вынесен, потому что
  // ему нужен хеш из БД; от гонки защищает лок по аккаунту и FOR UPDATE выше, а НЕ сам
  // факт нахождения внутри транзакции — READ COMMITTED этого не даёт.
  // Слишком длинный текущий пароль до argon2 не доходит и трактуется как неверный.
  const candidate = current.length > PASSWORD_MAX_LENGTH ? '' : current;
  if (!(await verifyPassword(account.password_hash, candidate))) {
    // ДВЕ строки на одну попытку — по одной на ключ. AC-010.15 считает их ПО SCOPE,
    // а не суммарно: суммарный счёт «ровно +1» был бы красным здесь и зелёным на
    // мутации «убрать запись только по IP», то есть грубый лимит удалялся бы
    // незаметно всему набору тестов.
    await rateLimit.record(PWCHANGE_PAIR_SCOPE, keyPair, client);
    await rateLimit.record(PWCHANGE_IP_SCOPE, keyIp, client);
    return { ok: false, reason: 'unauthorized' };
  }

  // ── ШАГ 4: пароль и сессии — ОДНОЙ транзакцией (NFR-010.1).
  // ЗДЕСЬ и только здесь считается argon2 нового пароля: мы уже знаем, что текущий
  // верен, лимит не исчерпан и лок наш. Цена — ещё ~38 мс удержания соединения на
  // пути УСПЕХА; принято, потому что смена пароля редка, аутентифицирована и
  // самоограничивается (после успеха сессия сменилась).
  const nextHash = await hashPassword(next);

  await client.query('update accounts set password_hash = $1 where id = $2', [nextHash, accountId]);

  // ВСЕ сессии, включая текущую (пункт 4 в шапке).
  await client.query(
    'update sessions set revoked_at = now() where account_id = $1 and revoked_at is null',
    [accountId],
  );

  // И сразу новая — иначе владелец окажется без сессии (NFR-010.6).
  // Порядок «отзыв → выдача» несущий (пункт 5).
  // Запись ПОСЛЕ успеха и до COMMIT: неудачи считаются отдельными ключами (шаг 3), успехи
  // своим. Смешивать нельзя — успех, попавший в счётчик неудач, запер бы активного владельца
  // (тот же класс, что FR-009 закрыл записью только неудач).
  await rateLimit.record(PWCHANGE_SUCCESS_SCOPE, keyAccount, client);

  const token = await createSession(client, accountId);
  return { ok: true, token };
}
