import {randomBytes} from 'node:crypto';
import {writeFile,readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
try {await readFile(`${root}.env`);process.stdout.write('.env already exists; preserved\n');}
catch(error){if(error.code!=='ENOENT')throw error;
 const secret=()=>randomBytes(32).toString('base64url');
 const values={N8_HTTP_PORT:'3088',N8_PUBLIC_ORIGIN:'http://127.0.0.1:3088',N8_DB_ADMIN_PASSWORD:secret(),N8_APP_PASSWORD:secret(),N8_MIGRATOR_PASSWORD:secret(),N8_SESSION_SECRET:secret(),DATABASE_URL:'postgresql://n8_app:REPLACE@db:5432/n8',N8_ASSET_DIR:`${root}.runtime/assets`,N8_AI_MODE:'manual',N8_PAYMENTS_MODE:'off'};
 values.DATABASE_URL=`postgresql://n8_app:${values.N8_APP_PASSWORD}@db:5432/n8`;
 await writeFile(`${root}.env`,Object.entries(values).map(([k,v])=>`${k}=${v}`).join('\n')+'\n',{mode:0o600,flag:'wx'});
 process.stdout.write('Private local configuration created (0600); AI manual, payments off\n');}
await mkdir(`${root}.runtime/assets`,{recursive:true,mode:0o700});
