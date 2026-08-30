// FR-016 — политика связывания учётной записи с внешним провайдером.
//
// ─────────────────────────────────────────────────────────────────────────────
// ЭТОТ МОДУЛЬ НЕ ЗНАЕТ ПРО СЕТЬ. Он принимает уже полученные externalId и email и решает
// ровно один вопрос: в какую учётку впустить и создавать ли её.
//
// Разделение не косметическое. Оно даёт три вещи, которых иначе не было бы:
//   1. Сетевой вызов физически не может оказаться внутри транзакции — этот файл не
//      импортирует sso.ts, и вызвать fetch отсюда нечем. Свойство сигнатур, а не порядка
//      строк (.claude/rules/security-operation-order.md, «сетевой вызов вне транзакции»).
//   2. Главный критерий фичи — отказ связывать учётку с паролем — проверяется на живой БД
//      БЕЗ учётной записи у провайдера и без единого сетевого вызова.
//   3. Второй провайдер добавляется правкой sso.ts, политику не трогая.
//
// НЕСУЩЕЕ РЕШЕНИЕ: ключ — externalId, НЕ email. login.yandex.ru/info не отдаёт признака
// подтверждённости адреса вовсе, и приложение не может отличить подтверждённый адрес от
// вписанного руками. Захват при связывании по email работает В ОБЕ СТОРОНЫ, и второе
// направление (атакующий заранее регистрирует учётку на адрес жертвы со своим паролем)
// НЕ лечится подтверждением адреса у нас — только отказом от автосвязывания.
// Полный разбор — в packages/db/migrations/015_sso.sql.
// ─────────────────────────────────────────────────────────────────────────────

import type { PoolClient } from 'pg';
import { createSession } from './session';
import { listProjectsForAccount, type ProjectSummary } from './project';

export type SsoProvider = 'yandex';

/**
 * Результат разрешения учётки.
 *
 * Случая «впустить, потому что совпал адрес» в этом типе НЕТ — и это реализация защиты
 * ФОРМОЙ ТИПА, как `LoginResult` без причины отказа в FR-009: вызывающий код не может
 * выбрать вариант, которого не существует. Мутация «связывать по email» обязана поэтому
 * менять типы, а не одну строку условия, — её не внесут по невнимательности.
 */
export type SsoResolution =
  | { kind: 'linked'; accountId: string; token: string; projects: ProjectSummary[]; created: boolean }
  // Учётка с таким адресом есть, и у неё ЕСТЬ пароль. Не впускаем.
  | { kind: 'needs_password_login'; email: string };

/**
 * Разрешает вход через внешнего провайдера. Четыре случая — ровно те, что в
 * docs/features/fr-016-yandex-id/01_specification.md.
 *
 * Клиент передаётся снаружи: вызывающий уже в транзакции. Открывать здесь вторую значит
 * потерять атомарность «создать учётку + привязать + выдать сессию».
 */
export async function resolveSsoAccount(
  client: PoolClient,
  provider: SsoProvider,
  externalId: string,
  email: string,
): Promise<SsoResolution> {
  // ── СЛУЧАЙ 1: идентификатор уже привязан. Самый частый путь — повторный вход.
  //
  // Обратите внимание: email в запросе НЕ участвует. Человек, сменивший адрес в яндексовом
  // профиле, попадает в ТУ ЖЕ учётку — именно потому, что ключ не адрес.
  const existing = await client.query<{ account_id: string }>(
    'select account_id from sso_identities where provider = $1 and external_id = $2',
    [provider, externalId],
  );
  const linkedAccountId = existing.rows[0]?.account_id;
  if (linkedAccountId) {
    return {
      kind: 'linked',
      accountId: linkedAccountId,
      token: await createSession(client, linkedAccountId),
      projects: await listProjectsForAccount(client, linkedAccountId),
      created: false,
    };
  }

  // ── Идентификатор новый. Дальше решает НАЛИЧИЕ ПАРОЛЯ у учётки с таким адресом.
  const byEmail = await client.query<{ id: string; has_password: boolean }>(
    'select id, (password_hash is not null) as has_password from accounts where email = $1',
    [email],
  );
  const account = byEmail.rows[0] ?? null;

  // ── СЛУЧАЙ 4 (проверяется РАНЬШЕ остальных — самый опасный, пусть будет самым заметным):
  // адрес занят учёткой, у которой ЕСТЬ пароль. НЕ ВПУСКАЕМ.
  //
  // Здесь и только здесь живёт защита от захвата в обе стороны. Заменить этот возврат на
  // связывание — значит внести мутацию S1, и она обязана валить AC-016.4.
  if (account && account.has_password) {
    return { kind: 'needs_password_login', email };
  }

  // ── СЛУЧАЙ 3: адрес есть, но у учётки пароля НЕТ.
  //
  // Такая учётка могла появиться только через SSO же. Пароля у неё нет, значит войти в неё
  // паролем нельзя, значит подделать владение ею через нашу форму регистрации невозможно —
  // привязка безопасна. Практический смысл: человек отвязал провайдера и заходит снова.
  // ── СЛУЧАЙ 2: адреса нет вовсе. Создаём учётку БЕЗ ПАРОЛЯ.
  //
  // password_hash остаётся NULL. Вход паролем в неё невозможен: login.ts коалесцирует NULL
  // в заглушечный хеш, verifyPassword не сходится, а время ответа неотличимо от «аккаунта
  // нет» — то есть оракула существования учётки не появляется (AC-016.6).
  //
  // ВТОРАЯ ГОНКА, отдельная от гонки за привязку. Голый `insert into accounts` падал с
  // 23505 на accounts_email_key, когда два первых входа приходили одновременно: один
  // человек получал ошибку на ровном месте. Поймано тем, что тест запустили ОТДЕЛЬНО от
  // набора — в наборе пул прогрет, потоки расходятся во времени, и дефект прятался.
  //
  // Починка НЕ сводится к «перечитать победителя». Победителем гонки может оказаться не
  // второй SSO-коллбэк, а ОБЫЧНАЯ РЕГИСТРАЦИЯ, создавшая учётку С ПАРОЛЕМ — и слепое
  // перечитывание отдало бы её через SSO, то есть вернуло бы ровно тот захват, ради
  // запрета которого написана вся фича. Поэтому проверка наличия пароля повторяется.
  let accountId: string;
  if (account) {
    accountId = account.id;
  } else {
    const created = await client.query<{ id: string }>(
      'insert into accounts (email) values ($1) on conflict (email) do nothing returning id',
      [email],
    );
    if (created.rows[0]) {
      accountId = created.rows[0].id;
    } else {
      const again = await client.query<{ id: string; has_password: boolean }>(
        'select id, (password_hash is not null) as has_password from accounts where email = $1',
        [email],
      );
      const winner = again.rows[0];
      // Ноль строк здесь невозможен: конфликт означает существующую строку. Явный отказ
      // вместо `!` — молчаливое продолжение выдало бы сессию неизвестно куда.
      if (!winner) throw new Error('sso: учётка не создана и не найдена — состояние противоречиво');
      // ПОВТОРНАЯ проверка. Не косметика: см. абзац выше.
      if (winner.has_password) return { kind: 'needs_password_login', email };
      accountId = winner.id;
    }
  }

  // ── ПРИВЯЗКА. `on conflict do nothing` — не украшение.
  //
  // Два одновременных коллбэка с одним кодом реальны: браузер повторяет запрос при разрыве,
  // человек жмёт «назад». Проверка-перед-вставкой под READ COMMITTED здесь не работает —
  // оба видят «нет» и создают ДВЕ привязки (а по пути и две учётки). Проигравший гонку
  // получает ноль строк и перечитывает победителя ниже, попадая в ТУ ЖЕ учётку.
  const inserted = await client.query<{ account_id: string }>(
    `insert into sso_identities (account_id, provider, external_id)
     values ($1, $2, $3)
     on conflict (provider, external_id) do nothing
     returning account_id`,
    [accountId, provider, externalId],
  );

  // Ноль строк = гонку проиграли. Победитель уже закоммитил свою привязку — читаем её и
  // впускаем в учётку победителя, а не в свою. Иначе человек получил бы сессию в учётке,
  // на которую нет привязки, и следующий вход увёл бы его в другую.
  const finalAccountId = inserted.rows[0]?.account_id ?? (
    await client.query<{ account_id: string }>(
      'select account_id from sso_identities where provider = $1 and external_id = $2',
      [provider, externalId],
    )
  ).rows[0]?.account_id;

  if (!finalAccountId) {
    // Сюда попасть нечем: либо вставка прошла, либо конфликт, а конфликт означает
    // существующую строку. Явный отказ вместо `!` — на случай, если завтра появится
    // третий путь: молчаливое продолжение выдало бы сессию неизвестно в какой учётке.
    throw new Error('sso: привязка не создана и не найдена — состояние противоречиво');
  }

  return {
    kind: 'linked',
    accountId: finalAccountId,
    token: await createSession(client, finalAccountId),
    projects: await listProjectsForAccount(client, finalAccountId),
    created: finalAccountId === accountId && !account,
  };
}
