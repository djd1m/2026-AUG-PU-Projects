// Test-only deterministic binding. Never loaded by production web.
import { createServer } from 'node:http';
import pg from 'pg';
import { seedAnswerFixture, request } from '../../../apps/web/tests/int/answer-fixture';

const owner = new pg.Pool({ connectionString: process.env.DATABASE_URL_OWNER });
const tenant = new pg.Pool({ connectionString: process.env.DATABASE_URL_TENANT });
const service = new pg.Pool({ connectionString: process.env.DATABASE_URL_SERVICE });
const fixtures = new Map<string, Awaited<ReturnType<typeof seedAnswerFixture>>>();
createServer(async (req, res) => {
  try {
    if (req.url === '/health') { res.end('ok'); return; }
    const chunks: Buffer[] = []; for await (const c of req) chunks.push(c);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    if (req.url === '/seed') {
      const accountId = (await owner.query('SELECT id FROM account WHERE email=$1', [body.email])).rows[0]?.id;
      if (!accountId) throw Error('Fixture account absent');
      const options = body.mode === 'unknown' ? { answer: { answer: 'ignored', cited_ids: [], unknown: true } }
        : body.mode === 'recover' ? { outcomes: ['unavailable' as const] } : {};
      const f = await seedAnswerFixture(owner, tenant, service, { accountId, delayMs: 250, ...options });
      await owner.query('UPDATE bot SET name=$2 WHERE id=$1', [f.botId, `Sandbox ${body.mode}`]);
      if (body.mode === 'pdf') {
        await owner.query("UPDATE source SET kind='pdf', url=NULL, file_name='delivery.pdf' WHERE id=$1", [f.sourceId]);
        await owner.query('UPDATE document SET locator_url=NULL, locator_page=2 WHERE id=$1', [f.documentId]);
      }
      fixtures.set(f.botId, f);
      res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ botId: f.botId })); return;
    }
    const f = fixtures.get(req.url?.slice(5) ?? '');
    if (!f) { res.statusCode = 404; res.end(); return; }
    const response = await f.handler(request(f.token, body), f.botId);
    res.statusCode = response.status;
    response.headers.forEach((v, k) => res.setHeader(k, v));
    res.end(await response.text());
  } catch (error) { console.error((error as Error).name, (error as Error).message); res.statusCode = 500; res.end('fixture failure'); }
}).listen(3001, '0.0.0.0', () => console.log('fixture ready'));
