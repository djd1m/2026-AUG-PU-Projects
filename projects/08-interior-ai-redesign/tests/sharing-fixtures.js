// SQL doubles exercise software authorization only. PG suite proves SQL behavior.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { qualityFixture } from './quality-fixtures.js';
export async function sharingFixture(mode='controlnet') {
  const dir=await mkdtemp(join(tmpdir(),'n8-sharing-'));
  const f=await qualityFixture(dir,mode);
  const state={row:{...f.row,id:f.row.job_id,job_mode:mode,reviewed:mode==='controlnet',quality:mode==='controlnet'?'accepted':'unverified'},
    account:{billing_hold:false,badge_free_entitlement:false},shares:new Map(),actions:new Map(),events:new Map(),commands:[],sessions:new Map()};
  const result=rows=>({rows,rowCount:rows.length});
  const db={async connect(){return {...db,release(){}};},async query(sql,args=[]) {
    state.commands.push(sql);
    if(['BEGIN','COMMIT','ROLLBACK'].includes(sql)||sql.includes('SELECT id FROM job'))return result([]);
    if(sql.includes('SELECT token FROM share WHERE token=ANY'))return result([]);
    if(sql.includes('FROM session s'))return result(state.sessions.has(args[0])?[{id:state.sessions.get(args[0])}]:[]);
    if(sql.includes('FROM account')&&sql.includes('FOR UPDATE'))return result([{...state.account}]);
    if(sql.includes('SELECT e.*')) {
      const r={...state.row,...state.account};
      if(args[0]!==r.id)return result([]);
      if(sql.includes("AND j.mode='controlnet'")&&(r.mode!=='controlnet'||r.quality!=='accepted'||!r.reviewed||r.billing_hold))return result([]);
      return result([r]);
    }
    if(sql.includes('INSERT INTO event')) {state.events.set(args[4],args[2]);return result([]);}
    const actionKey=args.slice(0,3).join(':');
    if(sql.startsWith('SELECT * FROM share_action'))return result(state.actions.has(actionKey)?[{...state.actions.get(actionKey)}]:[]);
    if(sql.startsWith('INSERT INTO share_action')) {if(!state.actions.has(actionKey))state.actions.set(actionKey,{account_id:args[0],job_id:args[1],event_key:args[2],mode:args[3]});return result([]);}
    if(sql.startsWith('UPDATE share_action')) {const a=state.actions.get(actionKey);a[sql.includes('artifact_sha')?'artifact_sha':'outcome']=args[3];return result([]);}
    if(sql.startsWith('INSERT INTO share(')) {
      const [token,job_id,source_context,description,style,input_sha,output_sha,evidence_sha]=args;
      const s={token,job_id,source_context,description,style,input_sha,output_sha,evidence_sha,published:true,revoked_at:null,version:1,created_at:new Date()};
      state.shares.set(token,s);return result([{...s}]);
    }
    if(sql.startsWith('UPDATE share SET')) {
      for(const s of state.shares.values())if(s.job_id===args[0]&&s.published){s.published=false;s.revoked_at=new Date();s.version++;}
      return result([]);
    }
    if(sql.includes('SELECT s.token FROM share')) {
      let rows=[...state.shares.values()].filter(s=>s.published&&state.row.quality==='accepted'&&!state.row.deleted_at&&!state.account.billing_hold).reverse();
      if(args[0])rows=rows.slice(rows.findIndex(s=>s.token===args[0])+1);
      return result(rows.slice(0,args[1]).map(s=>({token:s.token})));
    }
    if(sql.includes('FROM share WHERE')) {
      let rows=[...state.shares.values()].filter(s=>sql.includes('WHERE job_id')?s.job_id===args[0]:s.token===args[0]);
      if(sql.includes('AND job_id'))rows=rows.filter(s=>s.job_id===args[1]);
      if(sql.includes('AND published'))rows=rows.filter(s=>s.published);
      return result(rows.map(s=>({...s})));
    }
    throw new Error('Unmocked SQL: '+sql);
  }};
  return {...f,dir,state,db,config:{storageDir:dir,runtime:'test',platformDailyLimit:200,accountDailyLimit:20,providerMode:'disabled',secret:'synthetic-http-secret',origin:'http://localhost',secureCookie:false},
    owner:f.row.account_id,id:f.row.job_id,cleanup:()=>rm(dir,{recursive:true,force:true})};
}
export const publication=(changes={})=>({publish:true,style:'warm',source_context:'Моя комната',description:'Полезное описание примера комнаты и выбранного оформления.',...changes});
