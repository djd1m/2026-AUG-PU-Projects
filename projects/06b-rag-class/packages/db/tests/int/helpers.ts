import { randomBytes } from 'node:crypto';
import pg from 'pg';

export interface TestEnv {
  ownerUrl: string;
  tenantPassword: string;
  servicePassword: string;
  tenantUrl: string;
  serviceUrl: string;
}

export function env(): TestEnv {
  const ownerUrl = process.env.TEST_DATABASE_URL_OWNER ?? '';
  const tenantPassword = process.env.TEST_TENANT_PASSWORD ?? '';
  const servicePassword = process.env.TEST_SERVICE_PASSWORD ?? '';
  if (!ownerUrl || !tenantPassword || !servicePassword) {
    throw new Error('TEST_DATABASE_URL_OWNER, TEST_TENANT_PASSWORD и TEST_SERVICE_PASSWORD не заданы: '
      + 'интеграционная проверка НЕ выполнена (запуск — compose.test.yml, DEVELOPMENT_GUIDE.md §5)');
  }
  const as = (user: string, password: string) => {
    const url = new URL(ownerUrl);
    url.username = user;
    url.password = password;
    return url.toString();
  };
  return { ownerUrl, tenantPassword, servicePassword,
    tenantUrl: as('n6b_app_tenant', tenantPassword), serviceUrl: as('n6b_app_service', servicePassword) };
}

export function ownerPool(): pg.Pool {
  return new pg.Pool({ connectionString: env().ownerUrl, max: 4 });
}

/** Пул кабинета: пользователь n6b_app_tenant, член только n6b_tenant (как DATABASE_URL_TENANT в проде). */
export function tenantPool(max = 10): pg.Pool {
  return new pg.Pool({ connectionString: env().tenantUrl, max, connectionTimeoutMillis: 5000 });
}

/** Служебный пул: пользователь n6b_app_service, член только n6b_service (как DATABASE_URL_SERVICE). */
export function servicePool(max = 10): pg.Pool {
  return new pg.Pool({ connectionString: env().serviceUrl, max, connectionTimeoutMillis: 5000 });
}

export function uniq(prefix: string): string {
  return `${prefix}-${randomBytes(4).toString('hex')}`;
}

/** Вектор длины 1536 для вставки фрагмента (содержимое не важно для RLS). */
export function vector(seed = 1): string {
  return `[${Array.from({ length: 1536 }, (_, i) => ((i * seed) % 7) / 7 + 0.01).join(',')}]`;
}

export interface Tenant {
  accountId: string;
  botId: string;
  sourceId: string;
  documentId: string;
  chunkId: string;
  jobId: string;
}

/** Арендатор с полной цепочкой строк — вставка владельцем БД (в обход RLS, как фикстура). */
export async function seedTenant(owner: pg.Pool, opts: { kind?: 'owner' | 'studio'; parent?: string;
  studioAccess?: boolean; email?: string | null } = {}): Promise<Tenant> {
  const email = opts.email === undefined ? `${uniq('t')}@example.test` : opts.email;
  const acc = await owner.query<{ id: string }>(
    `INSERT INTO account (email, password_hash, kind, parent_account_id, studio_access)
     VALUES ($1, 'x', $2, $3, $4) RETURNING id`,
    [email, opts.kind ?? 'owner', opts.parent ?? null, opts.studioAccess ?? false]);
  const accountId = acc.rows[0]!.id;
  const bot = await owner.query<{ id: string }>(
    `INSERT INTO bot (account_id, public_id, name) VALUES ($1, $2, 'bot') RETURNING id`,
    [accountId, randomBytes(9).toString('base64url')]);
  const botId = bot.rows[0]!.id;
  const src = await owner.query<{ id: string }>(
    `INSERT INTO source (bot_id, account_id, kind, url) VALUES ($1, $2, 'site', 'https://example.test') RETURNING id`,
    [botId, accountId]);
  const sourceId = src.rows[0]!.id;
  const doc = await owner.query<{ id: string }>(
    `INSERT INTO document (source_id, account_id, locator_url, title, text, content_sha256)
     VALUES ($1, $2, 'https://example.test/a', 'A', 'text', 'h') RETURNING id`, [sourceId, accountId]);
  const documentId = doc.rows[0]!.id;
  const chunk = await owner.query<{ id: string }>(
    `INSERT INTO chunk (document_id, bot_id, account_id, ord, text, text_sha256, tokens, embedding)
     VALUES ($1, $2, $3, 0, 'text', 'h', 1, $4) RETURNING id`, [documentId, botId, accountId, vector()]);
  const job = await owner.query<{ id: string }>(
    `INSERT INTO index_job (source_id, account_id) VALUES ($1, $2) RETURNING id`, [sourceId, accountId]);
  // Строка в КАЖДОЙ таблице кабинета: страж rls-catalog.test.ts требует, чтобы A видел свои строки (иначе проверка
  // изоляции на пустой таблице зеленела бы сама собой).
  await owner.query(`INSERT INTO source_file (source_id, account_id, bytes, sha256) VALUES ($1, $2, '\\x00', 'h')`,
    [sourceId, accountId]);
  await owner.query(`INSERT INTO question_log (bot_id, account_id, channel, question, outcome)
     VALUES ($1, $2, 'sandbox', 'вопрос посетителя', 'answered')`, [botId, accountId]);
  await owner.query(`INSERT INTO growth_event (account_id, kind) VALUES ($1, 'first_cited_answer')`, [accountId]);
  await owner.query(`INSERT INTO handover_token (account_id, token_hash, expires_at)
     VALUES ($1, $2, now() + interval '1 day')`, [accountId, randomBytes(16).toString('hex')]);
  return { accountId, botId, sourceId, documentId, chunkId: chunk.rows[0]!.id, jobId: job.rows[0]!.id };
}
