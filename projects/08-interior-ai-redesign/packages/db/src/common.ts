import type { Pool, PoolClient } from 'pg';
import { DomainError, uuid, safeInteger } from '@n8/domain/common';
export const SPEND_LOCK_KEY = 80913001;
export interface ProjectRow {
  id: string; account_id: string; name: string; region: string; store: string | null; state: 'active' | 'archived'; version: number;
  current_shell_id: string | null; current_design_id: string | null; current_budget_id: string | null; scene_catalog: unknown[]; created_at: Date; cursor_created_at?: string;
}
export async function withTransaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try { await client.query('BEGIN'); const value = await work(client); await client.query('COMMIT'); return value; }
  catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
export function validId(id: string): void {
  if (!uuid.safeParse(id).success) throw new DomainError(404, 'NOT_FOUND', 'Не найдено');
}
export async function lockOwnedProject(client: PoolClient, actorId: string, projectId: string, expectedVersion?: number): Promise<ProjectRow> {
  validId(projectId);
  const result = await client.query<ProjectRow>('SELECT * FROM project WHERE id=$1 AND account_id=$2 FOR UPDATE', [projectId, actorId]);
  const row = result.rows[0];
  if (!row) throw new DomainError(404, 'NOT_FOUND', 'Не найдено');
  if (row.state !== 'active') throw new DomainError(409, 'PROJECT_ARCHIVED', 'Проект в архиве');
  if (expectedVersion !== undefined && safeInteger(row.version) !== expectedVersion) throw new DomainError(409, 'VERSION_CONFLICT', 'Проект изменился; обновите страницу');
  return row;
}
export async function bumpProject(client: PoolClient, actorId: string, projectId: string): Promise<number> {
  const result = await client.query<{ version: number }>("UPDATE project SET version=version+1 WHERE id=$1 AND account_id=$2 AND state='active' RETURNING version", [projectId, actorId]);
  if (!result.rows[0]) throw new DomainError(404, 'NOT_FOUND', 'Не найдено');
  return safeInteger(result.rows[0].version);
}
