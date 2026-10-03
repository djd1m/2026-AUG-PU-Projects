import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { cabinetPage,cabinetCss } from './web/cabinet.js';
import { PLANS } from './billing/plans.js';
import { POOL_DISCLOSURE } from './consent/store.js';
import type { Pool } from 'pg';
import type { Config } from './config.js';
import { HttpError } from './errors.js';
import { ready } from './db.js';
import { isValidPassword } from './auth/password.js';
import { AuthService } from './auth/service.js';
import { readToken, sessionCookie, tokenDigest } from './auth/session.js';
import { PgAuthStore } from './auth/store.js';
import { MailboxStore } from './mailboxes/store.js';
import { CampaignStore } from './campaigns/store.js';
import { PoolStore } from './pool/store.js';
import { SubmissionStore } from './dispatch/submission.js';
import { DispatchStore } from './dispatch/store.js';
import { ConsentStore } from './consent/store.js';
import type { Resolver } from './mailboxes/network.js';
import type { TestAdapter } from './mailboxes/provider.js';
import { authPage, authScript } from './web/page.js';
import { SuppressionStore,authenticateOperator } from './suppression/store.js';
import { confirmationPage,unsubscribeForm } from './suppression/http.js';
import { ReplyStore } from './replies/store.js';
import { BillingService } from './billing/service.js';
import { LocalProvider } from './billing/provider.js';
import { PartnerStore } from './growth/partner.js';
import { referralToken,referralCookie } from './growth/attribution.js';
import { EvidenceStore } from './evidence/store.js';
import { ReportStore } from './growth/reports.js';
import { pageInput } from './evidence/input.js';
const ASSETS=new Set(['app.js','client.js','dom.js','models.js','mailboxes.js','campaigns.js','evidence.js','billing.js']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (req.headers['content-type']?.split(';')[0]?.trim() !== 'application/json') throw new HttpError(400, 'invalid_input');
  const declared = Number(req.headers['content-length'] ?? '0');
  if (!Number.isFinite(declared) || declared > 65536) throw new HttpError(413, 'request_too_large');
  let length = 0; const chunks: Buffer[] = [];
  for await (const chunk of req) {
    length += Buffer.byteLength(chunk);
    if (length > 65536) throw new HttpError(413, 'request_too_large');
    chunks.push(Buffer.from(chunk));
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, unknown>;
  } catch { throw new HttpError(400, 'invalid_input'); }
}
function json(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8'}); res.end(JSON.stringify(data));
}
export async function application(config: Config, pool: Pool, fixtures?:{resolver?:Resolver; adapter?:TestAdapter}) {
  const store = new PgAuthStore(pool); const auth = new AuthService(store, config.sessionKey);
  await auth.initialize();
  const mailboxes=new MailboxStore(pool,config.credentialKeyring,config.providerAllowlist,fixtures?.resolver,fixtures?.adapter);
  const consents=new ConsentStore(pool,config.credentialKeyring);
  const campaigns=new CampaignStore(pool,config.credentialKeyring,config.recipientHashKey);
  const cohort=new PoolStore(pool);const dispatch=new DispatchStore(pool);const submissions=new SubmissionStore(pool,config);
  const suppression=new SuppressionStore(pool,config.recipientHashKey);const replies=new ReplyStore(pool,config.credentialKeyring);
  const billing=new BillingService(pool,config.sessionKey,config.billingMode??'disabled');const billingProvider=new LocalProvider(pool,config.billingMode??'disabled');const partners=new PartnerStore(pool);
  const evidence=new EvidenceStore(pool),reports=new ReportStore(pool);
  const server = createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    void (async () => {
      const path = (req.url ?? '').split('?')[0]!; const unsafe = !['GET','HEAD','OPTIONS'].includes(req.method ?? '');
      const publicStop=path.startsWith('/unsubscribe/') && ['GET','POST'].includes(req.method??'');
      const operatorBilling=['/api/operator/billing/simulate','/api/operator/billing/reconcile'].includes(path) && req.method==='POST';
      const operatorStop=(path==='/api/complaints' && req.method==='POST') || operatorBilling;
      if(publicStop || operatorStop) {
        res.setHeader('Referrer-Policy','no-referrer');
        await suppression.charge(req.socket.remoteAddress??'unknown');
      }
      if(operatorStop) {
        authenticateOperator(req.headers.authorization,config.operatorTokenDigest);
        if(req.headers.cookie!==undefined) throw new HttpError(401,'unauthorized');
      }
      const noOriginCapability=req.method==='POST' && publicStop && req.headers.origin===undefined;
      const noOriginOperator=operatorStop && req.headers.origin===undefined && req.headers.cookie===undefined;
      if (unsafe && !noOriginCapability && !noOriginOperator && req.headers.origin !== config.origin) throw new HttpError(403, 'origin_denied');
      if(publicStop) {
        const token=path.slice('/unsubscribe/'.length);
        if(req.method==='GET') {
          await suppression.confirm(token);res.setHeader('Referrer-Policy','same-origin');res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(confirmationPage);return;
        }
        await unsubscribeForm(req);return json(res,200,{data:await suppression.unsubscribe(token),meta:{}});
      }
      if(operatorBilling) {
        const input=await body(req);
        const id=path.endsWith('/simulate')?input.paymentId:input.intentId;
        if(typeof id!=='string' || !UUID.test(id)) throw new HttpError(400,'invalid_input');
        if(path.endsWith('/reconcile')) {if(Object.keys(input).length!==1) throw new HttpError(400,'invalid_input');return json(res,200,{data:await billing.reconcile(id),meta:{label:'TEST'}});}
        const {paymentId:ignored,...mutation}=input;void ignored;
        const payment=await billingProvider.simulate(id,mutation);return json(res,200,{data:{id:payment.id,status:payment.status,version:payment.version,label:'TEST'},meta:{}});
      }
      if(operatorStop) {
        return json(res,200,{data:await suppression.complaint(await body(req)),meta:{}});
      }
      if (req.method === 'GET' && (path === '/healthz' || path === '/readyz')) {
        const isReady = await ready(pool); return json(res, isReady ? 200 : 503, {data:{ready:isReady},meta:{}});
      }
      if(req.method==='GET' && path.startsWith('/reports/')) {res.setHeader('Referrer-Policy','no-referrer');const html=await reports.view(path.slice(9));res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html);return;}
      if(req.method==='GET' && path.startsWith('/r/')) {const code=path.slice(3);await suppression.charge(req.socket.remoteAddress??'unknown');await partners.landing(code);res.setHeader('Set-Cookie',referralCookie(referralToken(code,config.sessionKey),config.secureCookie));res.writeHead(303,{Location:'/'});res.end();return;}
      if(req.method==='GET' && path.startsWith('/assets/')) {
        const asset=path.slice(8);
        if(asset==='cabinet.css') {res.writeHead(200,{'Content-Type':'text/css; charset=utf-8'});res.end(cabinetCss);return;}
        if(!ASSETS.has(asset))throw new HttpError(404,'not_found');
        const source=await readFile(new URL((import.meta.url.endsWith('.ts')?'../dist/web/':'./web/')+asset,import.meta.url),'utf8');
        res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8'});res.end(source);return;
      }
      if(req.method==='GET' && path==='/app') {
        const token=readToken(req.headers.cookie);
        if(!token || !await auth.authenticate(token)) {res.writeHead(303,{Location:'/signin'});res.end();return;}
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(cabinetPage);return;
      }
      if (req.method === 'GET' && (path === '/' || path === '/signin' || path === '/auth.js')) {
        res.writeHead(200, {'Content-Type':path !== '/auth.js' ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8'});
        res.end(path !== '/auth.js' ? authPage : authScript); return;
      }
      if (req.method === 'POST' && ['/api/auth/register','/api/auth/login'].includes(path)) {
        const input = await body(req);
        if (typeof input.email !== 'string' || input.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim()) || !isValidPassword(input.password)) throw new HttpError(400, 'invalid_input');
        const email = input.email.trim().toLowerCase();
        const kind = path.endsWith('/register') ? 'register' : 'login';
        // Direct socket is the only trusted IP; forwarded headers never authorize a key.
        await store.charge(kind, email, req.socket.remoteAddress ?? 'unknown');
        const token = await auth[kind](email, input.password);
        res.setHeader('Set-Cookie', sessionCookie(token, config.secureCookie));
        return json(res, kind === 'register' ? 201 : 200, {data:{authenticated:true},meta:{}});
      }
      if (path.startsWith('/api/')) {
        const token = readToken(req.headers.cookie);
        const identity = token ? await auth.authenticate(token) : null;
        if (!identity) throw new HttpError(401, 'unauthorized');
        // Session UUID is an opaque lifecycle marker, never an authentication capability.
        const session=(await pool.query('SELECT id FROM session WHERE token_hash=$1',[tokenDigest(token!,config.sessionKey)])).rows[0];
        res.setHeader('X-N7-Session',session.id);
        if(path==='/api/app' && req.method==='GET') {
          const intents=(await pool.query('SELECT id,state,created_at FROM billing_intent WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 50',[identity.tenant_id])).rows;
          return json(res,200,{data:{identity,modes:{dispatch:config.dispatchMode,poll:config.pollMode??'disabled',billing:config.billingMode??'disabled'},
            poolDisclosure:POOL_DISCLOSURE,plans:PLANS,intents,referralCookiePresent:!!req.headers.cookie?.split(';').some(c=>c.trim().startsWith('n7_referral=')),
            providers:[...config.providerAllowlist].map(([host,limit])=>({host,limit}))},meta:{}});
        }

        if (path === '/api/auth/me' && req.method === 'GET') return json(res, 200, {data:identity,meta:{}});
        if (path === '/api/auth/logout' && req.method === 'POST') {
          await body(req); await auth.logout(token!);
          res.setHeader('Set-Cookie', sessionCookie('', config.secureCookie, true));
          return json(res, 200, {data:{loggedOut:true},meta:{}});
        }
        if(path==='/api/evidence' && req.method==='POST') return json(res,201,{data:await evidence.create(identity.tenant_id,await body(req)),meta:{}});
        if(path==='/api/evidence' && req.method==='GET') {const p=pageInput(req.url!);return json(res,200,{data:await evidence.list(identity.tenant_id,p.limit,p.offset),meta:{}});}
        if(path==='/api/evidence/compare' && req.method==='POST') {const input=await body(req);if(Object.keys(input).length!==2 || typeof input.baselineId!=='string' || typeof input.latestId!=='string') throw new HttpError(400,'invalid_input');return json(res,200,{data:await evidence.pair(identity.tenant_id,input.baselineId,input.latestId),meta:{}});}
        if(path==='/api/reports' && req.method==='POST') return json(res,201,{data:await reports.share(identity.tenant_id,await body(req)),meta:{}});
        if(path==='/api/reports' && req.method==='GET') {const p=pageInput(req.url!);return json(res,200,{data:await reports.list(identity.tenant_id,p.limit,p.offset),meta:{}});}
        if(path==='/api/growth/events' && req.method==='GET') {const p=pageInput(req.url!);return json(res,200,{data:await reports.events(identity.tenant_id,p.limit,p.offset),meta:{}});}
        const reportMatch=/^\/api\/reports\/([^/]+)\/(revoke|events)$/.exec(path);
        if(reportMatch && req.method==='POST') {const input=await body(req);if(reportMatch[2]==='revoke') {if(Object.keys(input).length) throw new HttpError(400,'invalid_input');return json(res,200,{data:await reports.revoke(identity.tenant_id,reportMatch[1]!),meta:{}});}return json(res,200,{data:await reports.event(identity.tenant_id,reportMatch[1]!,input),meta:{}});}
        if(path==='/api/billing/status' && req.method==='GET') return json(res,200,{data:await billing.ownerStatus(identity.tenant_id),meta:{}});
        if(path==='/api/billing/checkout' && req.method==='POST') {await suppression.charge(req.socket.remoteAddress??'unknown');return json(res,201,{data:await billing.checkout(identity.tenant_id,await body(req),req.headers.cookie),meta:{label:'TEST'}});}
        const intentMatch=/^\/api\/billing\/intents\/([^/]+)$/.exec(path);
        if(intentMatch && req.method==='GET') {if(!UUID.test(intentMatch[1]!)) throw new HttpError(404,'not_found');return json(res,200,{data:await billing.status(identity.tenant_id,intentMatch[1]!),meta:{}});}
        if(path==='/api/partner') {
          if(req.method==='POST') {if(Object.keys(await body(req)).length) throw new HttpError(400,'invalid_input');return json(res,201,{data:await partners.create(identity.tenant_id),meta:{}});}
          if(req.method==='GET') return json(res,200,{data:{...await partners.status(identity.tenant_id),events:await reports.aggregate(identity.tenant_id)},meta:{}});
          if(req.method==='PATCH') return json(res,200,{data:await partners.setActive(identity.tenant_id,await body(req)),meta:{}});
        }
        const partnerMatch=/^\/api\/partner\/([A-Za-z0-9_-]+)$/.exec(path);
        if(partnerMatch && req.method==='GET') return json(res,200,{data:{...await partners.status(identity.tenant_id,partnerMatch[1]!),events:await reports.aggregate(identity.tenant_id)},meta:{}});
        if(path==='/api/mailboxes') {
          if(req.method==='GET') return json(res,200,{data:await mailboxes.list(identity.tenant_id),meta:{}});
          if(req.method==='POST') return json(res,201,{data:await mailboxes.save(identity.tenant_id,await body(req)),meta:{}});
        }
        const pollMatch=/^\/api\/mailboxes\/([^/]+)\/reply-status$/.exec(path);
        if(pollMatch && req.method==='GET') {
          if(!UUID.test(pollMatch[1]!)) throw new HttpError(400,'invalid_input');
          await mailboxes.read(identity.tenant_id,pollMatch[1]!);
          const poll=(await pool.query('SELECT scan_complete,completed_at FROM mailbox_poll WHERE mailbox_id=$1',[pollMatch[1]])).rows[0];
          return json(res,200,{data:{mode:config.pollMode??'disabled',scan:await replies.status(identity.tenant_id,pollMatch[1]!),lastComplete:poll?.completed_at??null,scanComplete:poll?.scan_complete??false,realVerification:'unknown'},meta:{}});
        }
        const mailboxMatch=/^\/api\/mailboxes\/([^/]+)(?:\/(consents|verify-test))?$/.exec(path);
        if(mailboxMatch) {
          const id=mailboxMatch[1]!; if(!UUID.test(id)) throw new HttpError(400,'invalid_input');
          if(mailboxMatch[2]==='consents') {
            if(req.method==='GET') return json(res,200,{data:await consents.list(identity,id),meta:{}});
            if(req.method==='POST') return json(res,200,{data:await consents.act(identity,id,await body(req)),meta:{}});
          } else if(mailboxMatch[2]==='verify-test' && req.method==='POST') {
            await body(req); return json(res,200,{data:await mailboxes.verify(identity.tenant_id,id),meta:{verificationMode:'local_test'}});
          } else if(!mailboxMatch[2]) {
            if(req.method==='GET') return json(res,200,{data:await mailboxes.read(identity.tenant_id,id),meta:{}});
            if(req.method==='PUT') return json(res,200,{data:await mailboxes.save(identity.tenant_id,await body(req),id),meta:{}});
            if(req.method==='PATCH') return json(res,200,{data:await mailboxes.change(identity.tenant_id,id,await body(req)),meta:{}});
          }
          throw new HttpError(405,'method_not_allowed');
        }
        if(path==='/api/dispatch/messages' && req.method==='GET') {
          if(config.dispatchMode!=='local_test') throw new HttpError(503,'service_unavailable');
          return json(res,200,{data:await submissions.messages(identity.tenant_id),meta:{mode:'local_test'}});
        }
        const jobMatch=/^\/api\/dispatch\/jobs\/([^/]+)$/.exec(path);
        if(jobMatch && req.method==='GET') {
          if(config.dispatchMode!=='local_test') throw new HttpError(503,'service_unavailable');
          if(!UUID.test(jobMatch[1]!)) throw new HttpError(400,'invalid_input');
          return json(res,200,{data:await submissions.inspect(identity.tenant_id,jobMatch[1]!),meta:{}});
        }
        if(path==='/api/pool' && req.method==='GET') return json(res,200,{data:await cohort.aggregate(),meta:{}});
        if(path==='/api/campaigns') {
          if(req.method==='GET') return json(res,200,{data:await campaigns.list(identity.tenant_id),meta:{}});
          if(req.method==='POST') return json(res,201,{data:await consents.campaign(identity,await body(req)),meta:{}});
        }
        const campaignMatch=/^\/api\/campaigns\/([^/]+)(?:\/(preview|start|pause))?$/.exec(path);
        if(campaignMatch) {
          const id=campaignMatch[1]!;if(!UUID.test(id)) throw new HttpError(400,'invalid_input');
          if(!campaignMatch[2] && req.method==='GET') return json(res,200,{data:await campaigns.read(identity.tenant_id,id),meta:{}});
          if(!campaignMatch[2] && req.method==='PUT') return json(res,200,{data:await consents.campaign(identity,await body(req),id),meta:{}});
          if(campaignMatch[2]==='preview' && req.method==='GET') return json(res,200,{data:await campaigns.preview(identity.tenant_id,id),meta:{}});
          if(campaignMatch[2]==='start' && req.method==='POST') return json(res,200,{data:await campaigns.start(identity,id,await body(req)),meta:{}});
          if(campaignMatch[2]==='pause' && req.method==='POST') {await body(req);return json(res,200,{data:await campaigns.pause(identity.tenant_id,id),meta:{}});}
        }
      }
      throw new HttpError(404, 'not_found');
    })().catch((error: unknown) => {
      // Never echo native/provider/SQL messages or supplied request data.
      const safe = error instanceof HttpError ? error : new HttpError(503, 'service_unavailable');
      if (safe.retryAfter !== undefined) res.setHeader('Retry-After', String(safe.retryAfter));
      json(res, safe.status, {error:{code:safe.code,message:safe.code}});
    });
  });
  server.requestTimeout = 10000; server.headersTimeout = 10000; server.timeout = 10000; server.maxHeadersCount = 64;
  return { server, auth, store, mailboxes, consents, campaigns, cohort, dispatch, submissions, suppression, replies, billing, billingProvider, partners, evidence, reports };
}
