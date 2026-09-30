import { randomBytes } from 'node:crypto';
import pg from 'pg';

export function env(): { ownerUrl: string; appPassword: string; appUrl: string } {
  const ownerUrl = process.env.TEST_DATABASE_URL_OWNER ?? '';
  const appPassword = process.env.TEST_APP_PASSWORD ?? '';
  if (!ownerUrl || !appPassword) {
    throw new Error('TEST_DATABASE_URL_OWNER и TEST_APP_PASSWORD не заданы: интеграционная проверка НЕ выполнена');
  }
  const url = new URL(ownerUrl);
  url.username = 'n6b_app';
  url.password = appPassword;
  return { ownerUrl, appPassword, appUrl: url.toString() };
}

export function ownerPool(): pg.Pool {
  return new pg.Pool({ connectionString: env().ownerUrl, max: 4 });
}

export function appPool(max = 10): pg.Pool {
  return new pg.Pool({ connectionString: env().appUrl, max, connectionTimeoutMillis: 5000 });
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
  return { accountId, botId, sourceId, documentId, chunkId: chunk.rows[0]!.id, jobId: job.rows[0]!.id };
}
