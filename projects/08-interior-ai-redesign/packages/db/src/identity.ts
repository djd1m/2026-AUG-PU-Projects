import type { Pool, PoolClient } from 'pg';
import { DomainError, safeInteger } from '@n8/domain/common';
import { projectCreateSchema, projectPatchSchema, type AuthStore, type AccountCredentials, type SessionInput,
  assertProjectCapacity, assertProjectPage, type ProjectStore, type ProjectDto, type ProjectPage, type ProjectCreate, type ProjectPatch } from '@n8/domain/identity';
import { withTransaction, lockOwnedProject, validId, SPEND_LOCK_KEY, type ProjectRow } from './common';
export class PgAuthStore implements AuthStore {
  constructor(private readonly pool: Pool) {}
  async findAccount(email: string): Promise<AccountCredentials | null> {
    const result = await this.pool.query<{ id: string; password_hash: string; status: 'active' | 'disabled' }>(
      'SELECT id,password_hash,status FROM account WHERE email_canonical=$1', [email]);
    const row = result.rows[0]; return row ? { id: row.id, passwordHash: row.password_hash, status: row.status } : null;
  }
  async register(email: string, passwordHash: string, session: SessionInput): Promise<void> {
    await withTransaction(this.pool, async client => {
      const result = await client.query<{ id: string }>('INSERT INTO account(email_canonical,password_hash) VALUES($1,$2) ON CONFLICT(email_canonical) DO NOTHING RETURNING id', [email, passwordHash]);
      if (result.rows[0]) await client.query('INSERT INTO session(account_id,token_hash,expires_at) VALUES($1,$2,$3)', [result.rows[0].id, session.tokenHash, session.expiresAt]);
    });
  }
  async createSession(account: AccountCredentials, session: SessionInput): Promise<boolean> {
    const result = await this.pool.query(`WITH active AS (
      SELECT id FROM account WHERE id=$1 AND password_hash=$2 AND status='active' FOR SHARE
    ) INSERT INTO session(account_id,token_hash,expires_at) SELECT id,$3,$4 FROM active RETURNING id`,
    [account.id, account.passwordHash, session.tokenHash, session.expiresAt]);
    return result.rowCount === 1;
  }
  async revoke(tokenHash: string): Promise<void> { await this.pool.query('UPDATE session SET revoked_at=now() WHERE token_hash=$1 AND revoked_at IS NULL', [tokenHash]); }
  async findSession(tokenHash: string, now: Date) {
    const result = await this.pool.query<{ account_id: string }>(`SELECT s.account_id FROM session s JOIN account a ON a.id=s.account_id
      WHERE s.token_hash=$1 AND s.expires_at>$2 AND s.revoked_at IS NULL AND a.status='active'`, [tokenHash, now]);
    return result.rows[0] ? { accountId: result.rows[0].account_id } : null;
  }
}
export function projectDto(row: ProjectRow): ProjectDto {
  return { id: row.id, name: row.name, region: row.region, store: row.store, state: row.state, version: safeInteger(row.version),
    currentShellId: row.current_shell_id, currentDesignId: row.current_design_id, currentBudgetId: row.current_budget_id,
    sceneCatalog: row.scene_catalog, createdAt: row.created_at.toISOString() };
}
const PROJECT_COLUMNS = `id,account_id,name,region,store,state,version,current_shell_id,current_design_id,current_budget_id,scene_catalog,created_at,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_created_at`;
interface Cursor { createdAt: string; id: string }
function validCursorTime(value:unknown):value is string {
 if(typeof value!=='string')return false;
 const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?Z$/.exec(value);
 if(!match||!Number.isFinite(Date.parse(value)))return false;
 const [year,month,day,hour,minute,second]=match.slice(1,7).map(Number);
 const date=new Date(Date.UTC(year!,month!-1,day!));
 return year!>=1000&&date.getUTCFullYear()===year&&date.getUTCMonth()===month!-1&&date.getUTCDate()===day&&hour!<=23&&minute!<=59&&second!<=59;
}
function decodeCursor(input?: string): Cursor | null {
  if (!input) return null;
  try {
    if (input.length > 300 || !/^[A-Za-z0-9_-]+$/.test(input)) throw new Error();
    const value = JSON.parse(Buffer.from(input, 'base64url').toString('utf8')) as Cursor;
    validId(value.id);
    if (!validCursorTime(value.createdAt)) throw new Error();
    return value;
  } catch { throw new DomainError(400, 'INVALID_CURSOR', 'Неверный курсор'); }
}
export class PgProjects implements ProjectStore {
  constructor(private readonly pool: Pool) {}
  async create(actorId: string, raw: ProjectCreate): Promise<ProjectDto> {
    const parsed = projectCreateSchema.safeParse(raw);
    if (!parsed.success) throw new DomainError(422, 'INVALID_PROJECT', 'Укажите название и регион');
    return withTransaction(this.pool, async client => {
      const actor = await client.query("SELECT id FROM account WHERE id=$1 AND status='active' FOR UPDATE", [actorId]);
      if (!actor.rowCount) throw new DomainError(401, 'UNAUTHENTICATED', 'Войдите в аккаунт');
      const count = await client.query<{ count: string }>('SELECT count(*) FROM project WHERE account_id=$1', [actorId]);
      assertProjectCapacity(safeInteger(count.rows[0].count));
      const result = await client.query<ProjectRow>(`INSERT INTO project(account_id,name,region) VALUES($1,$2,$3) RETURNING ${PROJECT_COLUMNS}`,
        [actorId, parsed.data.name, parsed.data.region]);
      return projectDto(result.rows[0]);
    });
  }
  async get(actorId: string, projectId: string): Promise<ProjectDto> {
    validId(projectId);
    const result = await this.pool.query<ProjectRow>(`SELECT ${PROJECT_COLUMNS} FROM project WHERE id=$1 AND account_id=$2`, [projectId, actorId]);
    if (!result.rows[0]) throw new DomainError(404, 'NOT_FOUND', 'Не найдено');
    return projectDto(result.rows[0]);
  }
  async list(actorId: string, limit = 50, cursor?: string): Promise<ProjectPage> {
    assertProjectPage(limit);
    const after = decodeCursor(cursor);
    const result = await this.pool.query<ProjectRow>(`SELECT ${PROJECT_COLUMNS} FROM project WHERE account_id=$1
      AND ($2::timestamptz IS NULL OR (created_at,id)<($2::timestamptz,$3::uuid)) ORDER BY created_at DESC,id DESC LIMIT $4`,
    [actorId, after?.createdAt ?? null, after?.id ?? null, limit + 1]);
    const rows = result.rows.slice(0, limit); const last = rows.at(-1);
    return { items: rows.map(projectDto), nextCursor: result.rows.length > limit && last
      ? Buffer.from(JSON.stringify({ createdAt: last.cursor_created_at ?? last.created_at.toISOString(), id: last.id })).toString('base64url') : null };
  }
  async update(actorId: string, projectId: string, expectedVersion: number, raw: ProjectPatch): Promise<ProjectDto> {
    const parsed = projectPatchSchema.safeParse(raw);
    if (!parsed.success) throw new DomainError(422, 'INVALID_PROJECT', 'Некорректное изменение проекта');
    const patch = parsed.data;
    return withTransaction(this.pool, async client => {
      if (patch.archive) await client.query('SELECT pg_advisory_xact_lock($1)', [SPEND_LOCK_KEY]);
      const actor = await client.query("SELECT id FROM account WHERE id=$1 AND status='active' FOR UPDATE", [actorId]);
      if (!actor.rowCount) throw new DomainError(401, 'UNAUTHENTICATED', 'Войдите в аккаунт');
      const row = await lockOwnedProject(client, actorId, projectId, expectedVersion);
      if (patch.archive) await this.cancelBeforeDispatch(client, actorId, projectId);
      const result = await client.query<ProjectRow>(`UPDATE project SET name=$3,region=$4,store=$5,state=$6,version=version+1
        WHERE id=$1 AND account_id=$2 AND version=$7 RETURNING ${PROJECT_COLUMNS}`,
      [projectId, actorId, patch.name ?? row.name, patch.region ?? row.region, patch.store === undefined ? row.store : patch.store,
        patch.archive ? 'archived' : row.state, expectedVersion]);
      if (!result.rows[0]) throw new DomainError(409, 'VERSION_CONFLICT', 'Проект изменился');
      return projectDto(result.rows[0]);
    });
  }
  private async cancelBeforeDispatch(client: PoolClient, actorId: string, projectId: string): Promise<void> {
    await client.query(`UPDATE share_link SET revoked_at=COALESCE(revoked_at,now()) WHERE project_id=$1
      AND EXISTS(SELECT 1 FROM project WHERE id=$1 AND account_id=$2)`, [projectId, actorId]);
    // Spend mutex serializes this with dispatch/settlement; only undispatched jobs release holds.
    const totals = await client.query<{ admission_day: string; reserved: string; credits: string }>(`SELECT admission_day::text,
      sum(reserved_micro_usd)::text reserved,count(*) FILTER(WHERE credit_state='held')::text credits FROM job
      WHERE project_id=$1 AND account_id=$2 AND state IN ('queued','running') AND request_dispatched_at IS NULL GROUP BY admission_day`, [projectId, actorId]);
    for (const total of totals.rows) {
      const reserved = safeInteger(total.reserved); const credits = safeInteger(total.credits);
      if (reserved > 0) {
        const released = await client.query(`UPDATE spend_budget SET reserved_micro_usd=reserved_micro_usd-$3
          WHERE day=$1 AND ((scope='account' AND account_id=$2) OR (scope='global' AND account_id IS NULL)) AND reserved_micro_usd >= $3 RETURNING id`,
        [total.admission_day, actorId, reserved]);
        if (released.rowCount !== 2) throw new DomainError(503, 'LEDGER_INCONSISTENT', 'Операция временно недоступна');
      }
      if (credits > 0) {
        const result = await client.query('UPDATE account SET credits_held=credits_held-$2,credits_available=credits_available+$2 WHERE id=$1 AND credits_held >= $2', [actorId, credits]);
        if (result.rowCount !== 1) throw new DomainError(503, 'LEDGER_INCONSISTENT', 'Операция временно недоступна');
      }
    }
    await client.query(`UPDATE job SET state='failed',error_code='PROJECT_ARCHIVED',finished_at=now(),lease_fence=lease_fence+1,
      credit_state=CASE WHEN credit_state='held' THEN 'released' ELSE credit_state END
      WHERE project_id=$1 AND account_id=$2 AND state IN ('queued','running') AND request_dispatched_at IS NULL`, [projectId, actorId]);
  }
}
export class PgRateGate {
  constructor(private readonly pool: Pool) {}
  async hit(subjectHash: string, kind: 'auth' | 'mutation' | 'share', limit: number, now = new Date()): Promise<{ allowed: boolean; retryAfter: number }> {
    const start = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
    const result = await this.pool.query<{ count: number }>(`INSERT INTO rate_bucket(subject_hash,kind,window_start,count) VALUES($1,$2,$3,1)
      ON CONFLICT(subject_hash,kind,window_start) DO UPDATE SET count=LEAST(rate_bucket.count+1,1000000000) RETURNING count`, [subjectHash, kind, start]);
    return { allowed: result.rows[0].count <= limit, retryAfter: Math.max(1, Math.ceil((start.getTime() + 60_000 - now.getTime()) / 1000)) };
  }
}
