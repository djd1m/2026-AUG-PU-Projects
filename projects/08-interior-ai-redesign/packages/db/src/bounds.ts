import type {PoolClient} from 'pg';
import {DomainError,safeInteger} from '@n8/domain/common';
/** Call after locking the owned Project; all immutable revision kinds share its100 cap. */
export async function assertRevisionCapacity(client:PoolClient,actorId:string,projectId:string):Promise<void>{
 const result=await client.query<{count:string}>(`SELECT (
  (SELECT count(*) FROM shell_revision WHERE project_id=p.id)+
  (SELECT count(*) FROM design_revision WHERE project_id=p.id)+
  (SELECT count(*) FROM budget_revision WHERE project_id=p.id))::text count
  FROM project p WHERE p.id=$1 AND p.account_id=$2`,[projectId,actorId]);
 if(!result.rows[0])throw new DomainError(404,'NOT_FOUND','Не найдено');
 if(safeInteger(result.rows[0].count)>=100)throw new DomainError(409,'REVISION_LIMIT','Достигнут лимит 100 версий проекта; история сохранена');
}
