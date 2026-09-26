// Оснастка ЧУЖОГО origin для виджета (embeddable-widget.md: «страница по HTTP на ДРУГОМ порту, вставляющая виджет
// по адресу, который ВЫДАЛА система, с ограничительным CSP и враждебным CSS»). Всё — на 127.0.0.1 ВНУТРИ
// контейнера Playwright, наружу ничего не публикуется.
//
//  - «наш» origin WIDGET: настоящий собранный бандл (apps/web/widget-bundle) и НАСТОЯЩИЕ обработчики
//    /w/v1/config, /w/v1/event, OPTIONS и маршрута бандла из apps/web/src/server — хранилище подменено словарём
//    (SQL проверяет tests/widget-config.integration.test.ts на настоящем Postgres). X-Forwarded-For дописывается
//    здесь так же, как его пишет дверь (proxy/Caddyfile: header_up X-Forwarded-For {client_ip}).
//  - /w/v1/ask — НАСТОЯЩИЙ обработчик createWidgetAskHandler (фича visitor-ask-and-limits) и НАСТОЯЩЕЕ ядро answerQuestion
//    с настоящим клиентом OpenRouter поверх подменного fetch (фейковая модель, fake-answer-gateway): порядок CheckOrigin →
//    токен → бейдж показан → отметка «проверено» → квота → эмбеддинг → порог → модель → проверка цитат. Подменены только
//    хранилища (сессии, квота — словари; SQL — tests/visitor-ask.integration.test.ts) и поиск (один фрагмент прайса).
//    askOverride — готовый AnswerResult вместо ядра: им проверяется рендер враждебного ответа (NFR-SEC-002).
//  - хозяйские страницы HOST (в списке бота) и STRANGER (не в списке): тег — ровно тот, что выдаёт кабинет
//    (installSnippet), CSP — ровно директивы экрана установки (cspDirectives) + 'self' для своего скрипта хозяина.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { cspDirectives, installSnippet } from '../../packages/rag/src/bot-settings';
import type { WidgetBotRow } from '../../packages/db/src/widget';
import { createWidgetConfigHandler, createWidgetEventHandler, createWidgetPreflightHandler } from '../../apps/web/src/server/widget-handler';
import { createWidgetBundleHandler, readWidgetBundle } from '../../apps/web/src/server/widget-bundle';
import { createWidgetAskHandler, type WidgetAskDependencies } from '../../apps/web/src/server/widget-ask-handler';
import { answerQuestion, type AnswerResult, type HistoryTurn } from '../../packages/rag/src/index';
import { answerHarness, fakeAnswerGateway, MODELS } from '../fixtures/fake-answer-gateway';

export const WIDGET_PORT = 18411;
export const WIDGET = `http://127.0.0.1:${WIDGET_PORT}`;
export const HOST = 'http://127.0.0.1:8099';
export const STRANGER = 'http://127.0.0.1:8098';
export const KEY_FREE = 'FreeBotKey0123456789ab';
export const KEY_PAID = 'PaidBotKey0123456789ab';
export const KEY_UNVERIFIED = 'NewBotKey0123456789abc';   // владелец ещё не отметил «Я проверил ответы бота» (A-N6-035)
export const PRICE = 'Доставка по Москве — от 350 ₽, самовывоз со склада бесплатно.';
export const ANSWER = 'Доставка по Москве — от 350 ₽.';
export const VISITOR_LIMIT = 3;   // предел ответов на сессию в оснастке (канон — 20; здесь меньше, чтобы упереться в браузере)
export const CONTACT = 'info@kolos.ru';

const BOT_IDS: Record<string, string> = { [KEY_FREE]: '11111111-1111-4111-8111-111111111111', [KEY_PAID]: '22222222-2222-4222-8222-222222222222',
  [KEY_UNVERIFIED]: '33333333-3333-4333-8333-333333333333' };
const bot = (key: string, plan: string, answersVerified = true): WidgetBotRow => ({ botId: BOT_IDS[key]!,
  status: 'active', companyName: 'Пекарня «Колос»', greeting: 'Здравствуйте! Спросите про доставку и цены.', contact: CONTACT, publicEnabled: false, plan,
  accountStatus: 'active', origins: [HOST], answersVerified });
export const BOTS: Record<string, WidgetBotRow> = { [KEY_FREE]: bot(KEY_FREE, 'free'), [KEY_PAID]: bot(KEY_PAID, 'nobadge'), [KEY_UNVERIFIED]: bot(KEY_UNVERIFIED, 'free', false) };

export interface Logged { method: string; path: string; origin: string | null; status: number; acao: string[]; body?: string }
export interface Harness {
  log: Logged[]; events: Array<{ type: string; origin: string }>; askOverride: AnswerResult | null; bundleFile: string;
  modelCalls: () => number; resetQuota: () => void; close(): Promise<void>;
}

const HOSTILE_CSS = `html{font-size:40px!important}
*{box-sizing:content-box!important;font-size:30px!important;line-height:3!important;letter-spacing:4px!important;color:#c00!important}
div,span,section{position:relative;z-index:1}
img,svg{width:100%!important;height:auto!important}
button,input{background:#ff0!important;border:5px dashed #f0f!important;width:300px!important;height:90px!important;padding:20px!important}
a{color:#0f0!important;text-decoration:line-through!important}
[hidden]{display:block!important}
p{margin:60px!important}`;

// Скрипт хозяина ('self'): записывает нарушения CSP страницы в узел, который читает тест.
const HOST_JS = `document.addEventListener('securitypolicyviolation', function (e) {
  var out = document.getElementById('csp-log'); out.textContent += e.violatedDirective + ' ' + (e.blockedURI || 'inline') + '\\n';
});`;

function hostPage(origin: string, key: string, theme: string | null, bundleFile: string): { csp: string; html: string } {
  const snippet = installSnippet({ contact: CONTACT, publicKey: key, publicOrigin: WIDGET, bundleFile });
  if (snippet.kind !== 'ready') throw new Error(`кабинет не выдал код установки: ${snippet.kind}`);
  const tag = theme ? snippet.tag.replace(' async>', ` data-theme="${theme}" async>`) : snippet.tag;
  const csp = ["default-src 'none'", ...snippet.directives.map((d) => (d.startsWith('script-src') ? `${d} 'self'` : d)), "style-src 'self'"].join('; ');
  return { csp, html: `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Магазин клиента (${origin})</title><link rel="icon" href="data:,"><link rel="stylesheet" href="/hostile.css"><script src="/host.js"></script></head>
<body><h1 id="host-marker">Хлеб с доставкой</h1><p>Страница хозяина с враждебным CSS и строгим CSP.</p>
<button id="host-cta" type="button">Заказать</button><pre id="csp-log"></pre>
${tag}
</body></html>` };
}

async function toRequest(req: IncomingMessage): Promise<Request> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) if (typeof value === 'string') headers.set(name, value);
  headers.set('x-forwarded-for', '127.0.0.1');
  const method = req.method ?? 'GET';
  return new Request(`${WIDGET}${req.url ?? '/'}`, { method, headers, body: ['GET', 'HEAD', 'OPTIONS'].includes(method) ? undefined : Buffer.concat(chunks) });
}
async function send(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, name) => res.setHeader(name, value));
  res.end(Buffer.from(await response.arrayBuffer()));
}
function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', () => resolve()); });
}

export async function startHarness(): Promise<Harness> {
  const bundle = await readWidgetBundle();
  if (!bundle) throw new Error('НЕ ВЫПОЛНЕНО: бандл не собран (node apps/widget/scripts/build.mjs)');
  const log: Logged[] = [];
  const events: Harness['events'] = [];
  // Фейковая модель: цитирует F1, если прайс в контексте; эмбеддинги — детерминированные. Живой OpenRouter не вызывается.
  const model = answerHarness(fakeAnswerGateway((call) => ({ status: 'answered', text: ANSWER,
    citations: [call.messages[1]!.content.includes('<материал id="F1"') ? 'F1' : 'F9'] })));
  const shown = new Set<string>();                      // сессии с записанным показом бейджа
  const histories = new Map<string, HistoryTurn[]>();   // серверная история (≤ 2 хода)
  const used = new Map<string, number>();               // квота visitor_answers оснастки
  const harness: Harness = { log, events, askOverride: null, bundleFile: bundle.file, close: async () => {},
    modelCalls: () => model.gateway.chats.length, resetQuota: () => used.clear() };
  const deps: WidgetAskDependencies = {
    publicOrigin: WIDGET, secret: 'harness-secret-0123456789abcdef0123456789abcdef', allowMutation: async () => true, log: () => {},
    loadBot: async (key) => BOTS[key] ?? null,
    originAllowedAnywhere: async (origin) => Object.values(BOTS).some((b) => b.origins.includes(origin)),
    recordInstall: async () => 'recorded',
    recordBadgeEvent: async (input) => { events.push({ type: input.type, origin: input.origin }); if (input.type === 'badge_impression') shown.add(input.visitorSession); return 'recorded'; },
    openSession: async ({ id }) => ({ history: histories.get(id) ?? [], badgeShown: shown.has(id) }),
    appendTurn: async (id, turn) => { histories.set(id, [...(histories.get(id) ?? []), turn].slice(-2)); },
    recordFirstAnswer: async () => true, logRefusedOrigin: async () => {},
    answer: async ({ bot: found, visitorSession, request }) => harness.askOverride ?? answerQuestion({
      client: model.client, models: MODELS, spend: model.spend,
      chargeQuota: async () => {
        const n = used.get(visitorSession) ?? 0;
        if (n >= VISITOR_LIMIT) return { granted: false, scope: 'visitor_answers' };
        used.set(visitorSession, n + 1);
        return { granted: true };
      },
      search: async (botId) => [{ chunkId: '44444444-4444-4444-8444-444444444444', botId, pageId: '55555555-5555-4555-8555-555555555555',
        sourceId: '66666666-6666-4666-8666-666666666666', urlOrPage: 'https://kolos.example/ceny', pageTitle: 'Цены', contextPath: 'Цены', text: PRICE, similarity: 0.83 }],
      logQuestion: async () => {},
    }, { id: found.row.botId, status: found.row.status, companyName: found.row.companyName, contact: found.contact }, 'widget', request),
  };
  const config = createWidgetConfigHandler(deps), event = createWidgetEventHandler(deps), preflight = createWidgetPreflightHandler(deps);
  const ask = createWidgetAskHandler(deps);
  const bundleHandler = createWidgetBundleHandler(async () => bundle);
  const widget = createServer((req, res) => {
    void (async () => {
      const request = await toRequest(req);
      const path = new URL(request.url).pathname;
      let response: Response;
      if (request.method === 'OPTIONS') response = await preflight(request);
      else if (path === '/w/v1/config') response = await config(request);
      else if (path === '/w/v1/event') response = await event(request);
      else if (path === '/w/v1/ask') response = await ask(request);
      else if (path.startsWith('/w/')) response = await bundleHandler(request, path.slice(3));
      else response = new Response('Not found', { status: 404 });
      const body = path === '/w/v1/ask' && request.method === 'POST' ? await response.clone().text() : undefined;
      log.push({ method: request.method, path, origin: request.headers.get('origin'), status: response.status,
        acao: response.headers.get('access-control-allow-origin')?.split(', ') ?? [], ...(body === undefined ? {} : { body }) });
      await send(res, response);
    })().catch(() => { res.statusCode = 500; res.end(); });
  });
  const hostServer = (origin: string) => createServer((req, res) => {
    const url = new URL(req.url ?? '/', origin);
    if (url.pathname === '/hostile.css') { res.setHeader('content-type', 'text/css'); res.end(HOSTILE_CSS); return; }
    if (url.pathname === '/host.js') { res.setHeader('content-type', 'text/javascript'); res.end(HOST_JS); return; }
    if (url.pathname !== '/host.html') { res.statusCode = 404; res.end(); return; }
    const page = hostPage(origin, url.searchParams.get('bot') ?? KEY_FREE, url.searchParams.get('theme'), bundle.file);
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.setHeader('content-security-policy', page.csp);
    res.end(page.html);
  });
  const servers = [widget, hostServer(HOST), hostServer(STRANGER)];
  await listen(servers[0]!, WIDGET_PORT);
  await listen(servers[1]!, 8099);
  await listen(servers[2]!, 8098);
  harness.close = async () => { await Promise.all(servers.map((s) => new Promise<void>((resolve) => { s.close(() => resolve()); s.closeAllConnections(); }))); };
  return harness;
}

export const publishedDirectives = () => cspDirectives(WIDGET);
