// FR-009 — вход в систему.
//
// До этой фичи входа НЕ СУЩЕСТВОВАЛО: verifyPassword была написана, покрыта тестами и не
// вызывалась ниоткуда, а доступ давала только cookie, выданная при регистрации, — 30 дней
// абсолютных, после чего владелец терял кабинет безвозвратно.
//
// ─────────────────────────────────────────────────────────────────────────────
// ПОРЯДОК ШАГОВ ЗДЕСЬ — ЭТО И ЕСТЬ ЗАЩИТА (.claude/rules/security-operation-order.md).
// Четыре ревизии валидации ушли на то, чтобы он стал таким; каждая правка вносила дефект
// того же класса, что чинила, пока проверка не начала включать РАЗДЕЛЯЕМЫЙ ресурс
// (.claude/rules/shared-resource-verification.md). Что именно нельзя менять:
//
//   1. Разбор тела — СНАРУЖИ транзакции (NFR-009.9). Внутри он удерживал бы соединение
//      пула, пока клиент дописывает запрос: десять медленных POST на неаутентифицированный
//      маршрут вычерпывают пул и кладут дашборд, витрину, виджет и приём отзывов.
//   2. Лок — ОДИН, по паре email+IP, и TRY, а не ждущий (NFR-009.8). Ждущий копит
//      ожидающих, каждый из которых держит соединение. Лок по IP наказывал бы всех за
//      одним NAT, а не атакующего.
//   3. argon2 считается ВСЕГДА, даже когда аккаунта нет (NFR-009.2). Ранний возврат
//      делает ответ заметно быстрее и превращает вход в оракул существования учётки.
//   4. Записывается ТОЛЬКО неудача (NFR-009.4). Запись при успехе заперла бы активного
//      владельца им самим.
// ─────────────────────────────────────────────────────────────────────────────

import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { rateLimit } from '@proofwall/db';
import { hashPassword, PASSWORD_MAX_LENGTH, verifyPassword } from './password';
// Нормализация email — ЕДИНСТВЕННЫМ объявлением из validation.ts, тем же, что у регистрации.
// Свой экземпляр здесь был бы не дублированием, а миной: разойдутся — и владелец не войдёт
// в существующий аккаунт никогда. Страж в tests/login.test.ts это и стережёт.
export { normalizeEmailFromInput as normalizeEmail } from './validation';
import { createSession } from './session';
import { listProjectsForAccount, type ProjectSummary } from './project';

/** Тугой счётчик — контроль перебора пароля. Ключ ПАРА, не email: счётчик по одному email
 *  был бы примитивом «выключить чужую учётку» пятью запросами, а восстановления пароля нет. */
export const PAIR_SCOPE = 'login_pair';
export const PAIR_THRESHOLD = 5;
/** Грубый счётчик — ограничивает машину, а не учётку. 30, а не 5: за NAT сидят живые люди. */
export const IP_SCOPE = 'login_ip';
export const IP_THRESHOLD = 30;
export const WINDOW = { seconds: 3600 } as const;
/** Пространство имён advisory-локов входа. Произвольная константа, важна лишь уникальность. */
export const LOCK_NAMESPACE = 90_009;

/** Хеш ключа. Сырой IP в долгоживущий журнал не пишется. Разделитель обязателен: без него
 *  ip="1.2"+email="3.4" и ip="1.2.3"+email=".4" дали бы один ключ. */
export function hashKey(...parts: string[]): string {
  return createHash('sha256').update(parts.join('|')).digest('hex');
}

export type LoginResult =
  | { ok: true; accountId: string; token: string; projects: ProjectSummary[] }
  // Отказ НЕ несёт причины — это реализация NFR-009.1 формой типа: вызывающий код
  // физически не может отдать наружу разные ответы, потому что различить их нечем.
  | { ok: false; tooMany: boolean };

/**
 * Заглушечный хеш для случая «аккаунта нет». Считается ОДИН раз при первом обращении тем же
 * hashPassword — параметры совпадают с боевыми ПО ПОСТРОЕНИЮ, а не по дисциплине сопровождения.
 * Замороженная константа отстала бы молча при обновлении @node-rs/argon2, verify по ней
 * отработал бы быстрее, и таймингов оракул вернулся бы.
 */
let dummyPromise: Promise<string> | null = null;
export function dummyHash(): Promise<string> {
  dummyPromise ??= hashPassword(createHash('sha256').update(String(Math.random())).digest('hex'));
  return dummyPromise;
}

/** Прогревает заглушечный хеш, чтобы первый настоящий запрос не платил за него. */
export async function warmUpDummyHash(): Promise<void> {
  await dummyHash();
}

export async function attemptLogin(
  client: PoolClient,
  email: string,
  password: string,
  ip: string,
): Promise<LoginResult> {
  const keyPair = hashKey(PAIR_SCOPE, email, ip);
  const keyIp = hashKey(IP_SCOPE, ip);

  // Пояс: ожидание лока ограничено. Механизм — try ниже, это страховка на случай,
  // если лок всё же где-то удержится.
  await client.query("set local lock_timeout = '250ms'");

  // ШАГ 1. Атомарность проверки и записи. Без неё exceeded(COUNT) и record(INSERT) —
  // две операции без блокировки: под READ COMMITTED сто параллельных запросов все видят
  // count = 0, все проходят и все считают argon2. Лимит обходился бы `curl --parallel`.
  //
  // TRY, а не ждущий: неудача захвата означает «по этому ключу прямо сейчас идёт другая
  // попытка», то есть параллельный перебор — законный повод ответить 429 сразу, не
  // вставая в очередь и не удерживая соединение.
  // hashtext даёт 32 бита (ревью L-4). Коллизия означает, что две несвязанные попытки
  // сериализуются друг с другом: лишняя конкуренция и редкий ложный 429. Обхода лимита
  // она НЕ даёт — COUNT ниже фильтрует по полному ключу, а не по его хешу.
  // Двухаргументная форма расширяет пространство до 64 бит и делает коллизию
  // пренебрежимой; первый аргумент — постоянная «пространства имён» этой фичи,
  // чтобы не столкнуться с чужими локами в той же БД.
  const lock = await client.query<{ locked: boolean }>(
    'select pg_try_advisory_xact_lock($1, hashtext($2)) as locked',
    [LOCK_NAMESPACE, keyPair],
  );
  if (!lock.rows[0]?.locked) return { ok: false, tooMany: true };

  // ШАГ 2. Оба лимита.
  if (await rateLimit.exceeded(IP_SCOPE, keyIp, WINDOW, IP_THRESHOLD, client)) {
    return { ok: false, tooMany: true };
  }
  if (await rateLimit.exceeded(PAIR_SCOPE, keyPair, WINDOW, PAIR_THRESHOLD, client)) {
    return { ok: false, tooMany: true };
  }

  // ШАГ 3. Поиск аккаунта.
  const found = await client.query<{ id: string; password_hash: string }>(
    'select id, password_hash from accounts where email = $1',
    [email],
  );
  const account = found.rows[0] ?? null;

  // ШАГ 4. argon2 считается ВСЕГДА — см. пункт 3 в шапке.
  // Слишком длинный пароль до argon2 не доходит (NFR-009.10) и трактуется как неверный:
  // отдельный код ответа отличал бы «длинный» от «неверный» и был бы утечкой.
  const candidate = password.length > PASSWORD_MAX_LENGTH ? '' : password;
  const storedHash = account?.password_hash ?? (await dummyHash());
  const ok = await verifyPassword(storedHash, candidate);

  if (!account || !ok) {
    await rateLimit.record(IP_SCOPE, keyIp, client);
    await rateLimit.record(PAIR_SCOPE, keyPair, client);
    return { ok: false, tooMany: false };
  }

  // ШАГ 5. Успех НЕ пишет в счётчики — см. пункт 4 в шапке.
  const token = await createSession(client, account.id);
  const projects = await listProjectsForAccount(client, account.id);
  return { ok: true, accountId: account.id, token, projects };
}
