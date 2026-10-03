// Test-only deterministic server binding; not included in production image.
import { createServer } from 'node:http';
import pg from '/app/node_modules/pg/lib/index.js';
import { seedWidgetFixture } from '/app/apps/web/tests/int/widget-fixture.ts';
import { createWidgetHandler } from '/app/apps/web/src/server/widget-handler.ts';
import { constructGateway } from '/app/packages/rag/src/paid-call.ts';
import { LIMITS } from '/app/apps/web/tests/int/answer-fixture.ts';
const base = process.env.PUBLIC_BASE_URL!;
const host = 'https://widget-host.test';
const owner = new pg.Pool({ connectionString: process.env.DATABASE_URL_OWNER });
const tenant = new pg.Pool({ connectionString: process.env.DATABASE_URL_TENANT });
const service = new pg.Pool({ connectionString: process.env.DATABASE_URL_SERVICE });
const fixtures = new Map<string, any>();
createServer(async (req, res) => {
  try {
    const url = new URL(req.url!, host);
    if (url.pathname === '/favicon.ico') { res.statusCode=204;res.end();return; }
    if (url.pathname === '/health') { res.end('ok'); return; }
    if (url.pathname === '/api/widget/config') {
      await new Promise(r=>setTimeout(r,250));
      const headers=new Headers();for(const [k,v] of Object.entries(req.headers))if(v)headers.set(k,Array.isArray(v)?v.join(','):v);
      const response=await fetch('http://web:3000'+req.url,{method:req.method,headers});
      res.statusCode=response.status;response.headers.forEach((v,k)=>{if(!['content-encoding','content-length','transfer-encoding'].includes(k))res.setHeader(k,v);});res.end(Buffer.from(await response.arrayBuffer()));return;
    }
    if (url.pathname === '/host.css') {
      res.setHeader('Content-Type','text/css'); res.end('*{box-sizing:content-box;color:rgb(180,0,0);font-size:40px}button{background:orange;padding:60px}img{width:100%}body{margin:20px;background:#f1e9d8}#host-marker{font-size:22px}'); return;
    }
    if (url.pathname === '/') {
      const id = url.searchParams.get('bot') ?? '';
      if (!/^[A-Za-z0-9_-]{12}$/.test(id)) { res.statusCode=400;res.end();return; }
      res.setHeader('Content-Type','text/html; charset=utf-8');
      res.setHeader('Content-Security-Policy',`default-src 'none'; script-src ${base}; connect-src ${base}; style-src 'self'; img-src 'none'; base-uri 'none'; form-action 'none'`);
      res.end(`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/host.css"><title>Внешний сайт — проверка виджета</title><body><h1 id="host-marker">Страница владельца</h1><p>Независимый внешний origin и враждебные стили.</p><script src="${base}/w.js" data-bot="${id}" async></script></body></html>`); return;
    }
    const chunks: Buffer[]=[]; for await(const c of req) chunks.push(c); const body=Buffer.concat(chunks);
    if (url.pathname === '/seed') {
      const {mode}=JSON.parse(body.toString());
      const options=mode==='unknown'?{answer:{answer:'ignored',cited_ids:[],unknown:true}}:mode==='recover'?{outcomes:['unavailable']}:{};
      const f=await seedWidgetFixture(owner,tenant,service,{delayMs:250,...options});
      await owner.query('UPDATE bot SET allowed_origins=$2, name=$3 WHERE id=$1',[f.botId,[host],`Виджет ${mode}`]);
      if(mode==='paid') await owner.query("UPDATE account SET plan='start',badge_removal='active' WHERE id=$1",[f.accountId]);
      const gateway=constructGateway({pool:service,provider:f.provider,limits:LIMITS,visitorSecret:process.env.VISITOR_SECRET!,now:()=>f.now});
      f.ask=createWidgetHandler('ask',{...f.deps,publicBaseUrl:base,visitorSecret:process.env.VISITOR_SECRET!,gateway});
      f.requests=[]; fixtures.set(f.publicId,f); res.setHeader('Content-Type','application/json');res.end(JSON.stringify({publicId:f.publicId,botId:f.botId}));return;
    }
    if(url.pathname==='/stats') {
      const f=fixtures.get(url.searchParams.get('bot')!);if(!f){res.statusCode=404;res.end();return;}
      const events=(await owner.query('SELECT kind,count(*)::int AS n FROM badge_event WHERE bot_id=$1 GROUP BY kind',[f.botId])).rows;
      const installs=(await owner.query('SELECT origin_host,first_question_at FROM widget_install WHERE bot_id=$1',[f.botId])).rows;
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify({events,installs,providerCalls:f.provider.total,requests:f.requests}));return;
    }
    const f=fixtures.get(url.searchParams.get('bot')!);if(url.pathname!=='/api/widget/ask'||!f){res.statusCode=404;res.end();return;}
    const headers=new Headers();for(const [k,v] of Object.entries(req.headers))if(v)headers.set(k,Array.isArray(v)?v.join(','):v);
    const request=new Request(base+req.url,{method:req.method,headers,...(req.method==='POST'?{body}: {})});
    const response=await f.ask(request);f.requests.push({method:req.method,status:response.status,origin:headers.get('origin'),cookiePresent:headers.has('cookie'),acao:response.headers.get('access-control-allow-origin'),credentials:response.headers.get('access-control-allow-credentials')});res.statusCode=response.status;response.headers.forEach((v:string,k:string)=>res.setHeader(k,v));res.end(await response.text());
  }catch(error){console.error((error as Error).name,(error as Error).message);res.statusCode=500;res.end('test fixture failure');}
}).listen(3001,'0.0.0.0',()=>console.log('widget fixture ready'));
