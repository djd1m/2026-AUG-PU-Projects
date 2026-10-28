import type { Pool } from '@clipmaker/db';
import { SupportError } from './boundary';
export async function supportContext(pool:Pool,sessionHash:string|null,videoId?:string) {
  if(!videoId)return {context:{at:new Date().toISOString()}};
  if(!sessionHash)throw new SupportError('unauthorized',401,'Войдите в аккаунт');
  const row=(await pool.query<{videoId:string;status:string;failureCode:string|null;at:Date}>(`SELECT v.id AS "videoId",
    v.status,v.failure_reason AS "failureCode",v.updated_at AS at FROM account a JOIN session s ON s.account_id=a.id
    JOIN video v ON v.account_id=a.id WHERE s.cookie_token_hash=$1 AND a.status='active' AND s.revoked_at IS NULL
    AND s.expires_at>clock_timestamp() AND v.id=$2 AND v.deleted_at IS NULL`,[sessionHash,videoId])).rows[0];
  if(!row)throw new SupportError('not_found',404,'Не найдено');
  return {context:row};
}
