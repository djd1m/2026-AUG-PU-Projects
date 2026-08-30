// FR-015 — восстановление пароля по email.
//
// ─────────────────────────────────────────────────────────────────────────────
// БЛИЖАЙШИЙ ОБРАЗЕЦ — password-change.ts, где «проверить текущий пароль» заменено на
// «погасить токен из письма». Порядок операций тот же и по тем же причинам.
//
// ЧЕГО ЗДЕСЬ НЕТ И БЫТЬ НЕ ДОЛЖНО:
//
//   1. ОТПРАВКИ ПИСЬМА. Функции этого модуля не принимают отправителя вовсе, поэтому вызвать
//      сеть изнутри транзакции физически нельзя. Это свойство сигнатур, а не порядка строк:
//      флаг «не отправлять внутри» однажды передали бы неверно. Время ответа провайдера нам
//      не принадлежит, а соединение пула общее с входом, дашбордом, витриной и виджетом.
//
//   2. ВЫДАЧИ СЕССИИ. createSession отсюда не вызывается ни при каких условиях. Причина не в
//      удобстве: п.10 ст.8 149-ФЗ предписывает закрытый перечень способов авторизации, и
//      владения почтовым ящиком в нём нет. Ссылка, выдающая сессию, функционально есть вход
//      через владение ящиком. Отправка же ссылки на УЖЕ указанный адрес нормой не
//      регулируется: почта здесь транспорт, а не поставщик авторизации.
//
//   3. БЛОКИРОВКИ СТРОКИ accounts. FOR UPDATE конфликтует с FOR KEY SHARE, который берёт
//      insert into sessions по внешнему ключу, и блокировал бы ВХОД в аккаунт (найдено
//      ревью FR-010, H-1). Гонки здесь нет и без него: токен погашен атомарно выше.
// ─────────────────────────────────────────────────────────────────────────────

import { createHash, randomBytes } from 'node:crypto';
import type { PoolClient } from 'pg';
import { rateLimit } from '@proofwall/db';
import { hashKey } from './login';
import { hashPassword } from './password';

export const RESET_TOKEN_BYTES = 32;
/** Час. Дольше — шире окно для того, кто получил доступ к почте; короче — человек не успеет,
 *  если письмо задержалось у провайдера. */
export const RESET_TTL_MS = 60 * 60 * 1000;

/** Ключ ПАРА (email, ip), как у входа. Ключ по одному email дал бы примитив «завалить чужой
 *  ящик письмами» и «сжечь чужой лимит» пятью запросами, а восстановления у восстановления
 *  уже не бывает. */
export const RESET_PAIR_SCOPE = 'reset_pair';
export const RESET_PAIR_THRESHOLD = 5;
export const RESET_IP_SCOPE = 'reset_ip';
export const RESET_IP_THRESHOLD = 30;
export const RESET_WINDOW = { seconds: 3600 } as const;

/** Свой хеш токена, а не hashSessionToken: та подмешивает SESSION_SECRET, и переиспользование
 *  связало бы два пространства секретов — ротация SESSION_SECRET обнулила бы все выданные
 *  ссылки восстановления заодно с сессиями, и причина была бы неочевидна. */
export function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export type IssueResult =
  // Токен возвращается ТОЛЬКО когда письмо действительно надо отправить.
  | { ok: true; token: string }
  // Случая «аккаунта нет» в типе НЕТ намеренно: он неотличим от прочих отказов, и вызывающий
  // физически не может ответить по-разному. NFR-015.3 закрыт формой типа, а не дисциплиной.
  | { ok: false; tooMany: boolean };

/**
 * Транзакция 1 — короткая: лимит, поиск аккаунта, выпуск токена. Сети здесь нет.
 */
export async function issueResetToken(
  client: PoolClient,
  email: string,
  ip: string,
): Promise<IssueResult> {
  const keyPair = hashKey(RESET_PAIR_SCOPE, email, ip);
  const keyIp = hashKey(RESET_IP_SCOPE, ip);

  if (await rateLimit.exceeded(RESET_IP_SCOPE, keyIp, RESET_WINDOW, RESET_IP_THRESHOLD, client)) {
    return { ok: false, tooMany: true };
  }
  if (await rateLimit.exceeded(RESET_PAIR_SCOPE, keyPair, RESET_WINDOW, RESET_PAIR_THRESHOLD, client)) {
    return { ok: false, tooMany: true };
  }

  // Записывается КАЖДАЯ попытка, а не только промах — в отличие от входа (NFR-009.4). Здесь
  // считается стоимость ОТПРАВКИ ПИСЬМА, и удачная попытка стоит столько же, сколько
  // неудачная. Отличие осознанное и записано в принимаемые риски.
  await rateLimit.record(RESET_PAIR_SCOPE, keyPair, client);
  await rateLimit.record(RESET_IP_SCOPE, keyIp, client);

  const found = await client.query<{ id: string }>(
    'select id from accounts where email = $1',
    [email],
  );
  const account = found.rows[0];
  // Аккаунта нет — тот же отказ, что при любой другой причине. Письма не будет.
  if (!account) return { ok: false, tooMany: false };

  const token = randomBytes(RESET_TOKEN_BYTES).toString('base64url');

  // Предыдущие гасятся ДО выпуска нового: две живые ссылки на один аккаунт — это две двери
  // там, где должна быть одна.
  await client.query(
    'update password_reset_tokens set used_at = now() where account_id = $1 and used_at is null',
    [account.id],
  );

  await client.query(
    `insert into password_reset_tokens (account_id, token_hash, expires_at)
     values ($1, $2, now() + ($3 || ' milliseconds')::interval)`,
    [account.id, hashResetToken(token), String(RESET_TTL_MS)],
  );

  return { ok: true, token };
}

/**
 * Транзакция 2 — сброс. Возвращает true, если пароль сменён.
 *
 * Один ответ на «неизвестный токен», «уже использован» и «истёк»: различать их значило бы
 * подсказывать перебирающему, какая из ссылок когда-то существовала.
 */
export async function resetPassword(
  client: PoolClient,
  token: string,
  nextPassword: string,
): Promise<boolean> {
  // Хеш считается В КОДЕ. Сырой токен в SQL не уезжает вовсе: он попал бы в
  // pg_stat_statements, в log_statement при отладке и в текст ошибки при сбое.
  const tokenHash = hashResetToken(token);

  // ОДНИМ запросом: находим годный токен И гасим его. Проверка-перед-обновлением оставила бы
  // окно, в котором две параллельные попытки погасили бы один токен дважды и сменили пароль
  // дважды — второй затёр бы первый. Предикат `used_at is null` в WHERE делает это
  // сравнением-и-заменой; проверено прогоном: первый UPDATE возвращает строку, второй ноль.
  const claimed = await client.query<{ account_id: string }>(
    `update password_reset_tokens set used_at = now()
      where token_hash = $1 and used_at is null and expires_at > now()
      returning account_id`,
    [tokenHash],
  );
  const accountId = claimed.rows[0]?.account_id;
  if (!accountId) return false;

  // argon2 считается ЗДЕСЬ, после того как токен признан годным: перебор ссылок до него не
  // доходит и хеша не оплачивает. Тот же порядок, что в password-change.ts.
  const nextHash = await hashPassword(nextPassword);

  await client.query('update accounts set password_hash = $1 where id = $2', [nextHash, accountId]);

  // ВСЕ сессии. У донора этого шага НЕТ (auth.ts:576-582 обновляет только хеш) — то есть вор,
  // из-за которого владелец и восстанавливает доступ, остался бы внутри.
  await client.query(
    'update sessions set revoked_at = now() where account_id = $1 and revoked_at is null',
    [accountId],
  );

  return true;
}
