import type { Pool } from 'pg';
import { readdir,lstat } from 'node:fs/promises';
import { assetPath,removeAssetFile } from './assets.js';
/** Invoke from worker watchdog every minute. DB references are authoritative; grace protects in-flight writes. */
export async function cleanupAssets(pool:Pool,directory:string,now=new Date()):Promise<{pending:number;orphans:number}> {
 const stale=await pool.query<{id:string;original_key:string;normalized_key:string|null}>("DELETE FROM asset WHERE id IN (SELECT id FROM asset WHERE state='pending' AND created_at<$1 ORDER BY created_at LIMIT 1000) AND state='pending' RETURNING id,original_key,normalized_key",[new Date(now.getTime()-15*60000)]);let pending=0,orphans=0;
 for(const row of stale.rows){await removeAssetFile(directory,row.original_key);if(row.normalized_key)await removeAssetFile(directory,row.normalized_key);pending++;}
 const entries=await readdir(directory);for(const name of entries.slice(0,10000)){if(!/^[0-9a-f-]{36}$/i.test(name))continue;let info;try{info=await lstat(assetPath(directory,name));}catch{continue;}if(!info.isFile()||info.isSymbolicLink()||now.getTime()-info.mtimeMs<30*60000)continue;
 const ref=await pool.query('SELECT id FROM asset WHERE original_key=$1 OR normalized_key=$1 LIMIT 1',[name]);if(!ref.rowCount){await removeAssetFile(directory,name);orphans++;}}
 return {pending,orphans};
}
