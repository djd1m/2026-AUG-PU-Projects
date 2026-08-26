// FR-001 — регистрация владельца + создание проекта. Источник: Pseudocode §9.
//
// Вся операция — ОДНА транзакция: аккаунт, проект, сессия и запись в audit_log либо
// появляются вместе, либо не появляются вовсе. Аккаунт без проекта оставил бы владельца
// на экране, которого в MVP нет (дашборд открывается по слагу проекта).
//
// Роль — app_service (BYPASSRLS): на момент регистрации проверенной сессии ещё не существует,
// значит app.current_account_id выставить не из чего. Предупреждение tenant.ts применимо
// буквально: изоляция здесь держится на том, что запросы ниже адресуют строки по id,
// полученным в этой же транзакции, и не принимают project_id/account_id от клиента.

import type { PoolClient } from 'pg';
import { hashPassword } from './password';
import {
  SLUG_PATTERN,
  ensureUniqueSlug,
  isValidSlug,
  normalizeSlug,
  normalizeSlugDeterministic,
} from './slug';
import { PASSWORD_MIN_LENGTH } from './password';
import { generateSessionToken, hashSessionToken, SESSION_TTL_MS } from './session';
import { isValidEmail, normalizeEmail } from './validation';
import { buildProjectUrls, type ProjectUrls } from './urls';

export interface RegisterInput {
  email: unknown;
  password: unknown;
  project_name?: unknown;
  desired_slug?: unknown;
}

export type RegisterResult =
  | { ok: true; status: 201; accountId: string; slug: string; token: string; urls: ProjectUrls }
  | { ok: false; status: 400; body: { errors: string[] } }
  | { ok: false; status: 409; body: { error: string; field?: string } };

async function slugTaken(client: PoolClient, slug: string): Promise<boolean> {
  const { rowCount } = await client.query('select 1 from projects where slug = $1', [slug]);
  return (rowCount ?? 0) > 0;
}

/** Pseudocode §9 registerAccountAndProject. Вызывается внутри withService-транзакции. */
export async function registerAccountAndProject(
  client: PoolClient,
  input: RegisterInput,
): Promise<RegisterResult> {
  const errors: string[] = [];

  if (!isValidEmail(input.email)) errors.push('email: некорректный формат');
  if (typeof input.password !== 'string' || input.password.length < PASSWORD_MIN_LENGTH) {
    errors.push(`password: минимум ${PASSWORD_MIN_LENGTH} символов`);
  }
  if (errors.length > 0) return { ok: false, status: 400, body: { errors } };

  const email = normalizeEmail(input.email as string);

  const existing = await client.query('select 1 from accounts where email = $1', [email]);
  if ((existing.rowCount ?? 0) > 0) {
    return { ok: false, status: 409, body: { error: 'аккаунт с таким email уже существует', field: 'email' } };
  }

  // Слаг подбираем ДО создания аккаунта: при занятом слаге транзакция откатится, но
  // лишний argon2-хеш (десятки миллисекунд CPU) считать незачем.
  let slug: string;
  const desired = input.desired_slug;
  if (typeof desired === 'string' && desired.trim().length > 0) {
    // Пользователь ЯВНО ввёл слаг — не подменяем его молча случайным вариантом (Pseudocode §9).
    // Отсюда normalizeSlugDeterministic, а не normalizeSlug: добор случайным суффиксом
    // протащил бы слишком короткий ввод ("ab" -> "ab-x7q") мимо проверки формата.
    slug = normalizeSlugDeterministic(desired);
    if (!isValidSlug(slug)) {
      return { ok: false, status: 400, body: { errors: [`slug: ожидается ${SLUG_PATTERN.source}`] } };
    }
    if (await slugTaken(client, slug)) {
      return { ok: false, status: 409, body: { error: 'slug уже занят', field: 'slug' } };
    }
  } else {
    // Слаг выведен из названия проекта — доподбор суффикса допустим, выбора пользователя нет.
    const source = typeof input.project_name === 'string' ? input.project_name : '';
    slug = await ensureUniqueSlug(normalizeSlug(source), (candidate) => slugTaken(client, candidate));
  }

  const passwordHash = await hashPassword(input.password as string);

  const account = await client.query<{ id: string }>(
    'insert into accounts (email, password_hash) values ($1, $2) returning id',
    [email, passwordHash],
  );
  const accountId = account.rows[0]!.id;

  const project = await client.query<{ id: string; slug: string }>(
    // tier='free' и noindex=true — явно, а не «по умолчанию из схемы»: FR-GROWTH-005 требует,
    // чтобы новый проект был закрыт от индексации до порога содержательности.
    `insert into projects (account_id, slug, tier, noindex)
     values ($1, $2, 'free', true) returning id, slug`,
    [accountId, slug],
  );
  const projectId = project.rows[0]!.id;

  const token = generateSessionToken();
  await client.query(
    'insert into sessions (account_id, token_hash, expires_at) values ($1, $2, $3)',
    [accountId, hashSessionToken(token), new Date(Date.now() + SESSION_TTL_MS)],
  );

  await client.query(
    `insert into audit_log (project_id, entity_type, entity_id, actor_id, action)
     values ($1, 'project', $2, $3, 'account_and_project_created')`,
    [projectId, projectId, accountId],
  );

  return { ok: true, status: 201, accountId, slug, token, urls: buildProjectUrls(slug) };
}
