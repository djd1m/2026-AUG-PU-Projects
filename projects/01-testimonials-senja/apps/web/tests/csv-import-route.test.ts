// FR-014 — HTTP-слой импорта.
//
// Существует по той же причине, что login-route.test.ts: инварианты, живущие ТОЛЬКО в
// маршруте, — источник владельца, ограничение частоты, коды ответов, предел тела —
// тестами библиотеки не покрываются.

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const DB_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!DB_URL) throw new Error('TEST_DATABASE_URL не задан');
process.env.DATABASE_URL = DB_URL;
process.env.SESSION_SECRET = 'test-secret-at-least-16-chars-long';
process.env.BASE_URL = 'https://proofwall.test';

const state = vi.hoisted(() => ({ token: undefined as string | undefined }));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'pw_session' && state.token ? { value: state.token } : undefined,
  }),
}));

const { withService, closePool } = await import('@proofwall/db');
const { registerAccountAndProject } = await import('../src/lib/register');
const { createSession } = await import('../src/lib/session');
const { IMPORT_RATE_THRESHOLD, MAX_IMPORT_BODY } = await import('../src/lib/csv-import');
const { POST } = await import('../src/app/api/import/route');

afterAll(async () => { await closePool(); });

const URL_ = 'https://proofwall.test/api/import';
const RUN = Date.now().toString(36);
let seq = 0;

const CSV = ['name,text', 'Анна Петрова,Отличный сервис и быстрая поддержка'].join('\n');

async function makeOwner(): Promise<{ accountId: string; slug: string }> {
  seq += 1;
  const slug = `impr-${RUN}-${seq}`;
  const r = await withService((c) => registerAccountAndProject(c, {
    email: `${slug}@example.com`, password: 'correct-horse-battery',
    desired_slug: slug, project_name: 'Импорт',
  }));
  if (!r.ok) throw new Error(JSON.stringify(r.body));
  const { rows } = await withService((c) => c.query<{ id: string }>(
    'select id from accounts where email = $1', [`${slug}@example.com`]));
  return { accountId: rows[0]!.id, slug };
}

async function login(accountId: string) {
  state.token = await withService((c) => createSession(c, accountId));
}

function post(body: unknown, raw?: string): Promise<Response> {
  return POST(new Request(URL_, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw ?? JSON.stringify(body),
  })) as unknown as Promise<Response>;
}

const MAPPING = { name: 0, text: 1 };

beforeEach(() => { state.token = undefined; });

describe('источник владельца', () => {
  it('без сессии → 401', async () => {
    expect((await post({ slug: 'x', csv: CSV, mode: 'preview', mapping: MAPPING })).status).toBe(401);
  });

  it('чужой slug → 404: проект ищется по slug И по владельцу из сессии', async () => {
    const victim = await makeOwner();
    const actor = await makeOwner();
    await login(actor.accountId);
    const res = await post({ slug: victim.slug, csv: CSV, mode: 'commit', mapping: MAPPING });
    expect(res.status).toBe(404);
  });
});

describe('AC-014.1 — предпросмотр не пишет НИ ПРИ КАКОМ значении mode', () => {
  it.each(['preview', 'PREVIEW', 'xxx', ''])('mode=%s не создаёт записей', async (mode) => {
    const o = await makeOwner();
    await login(o.accountId);
    const res = await post({ slug: o.slug, csv: CSV, mode, mapping: MAPPING });
    expect(res.status).toBe(200);
    const { rows } = await withService((c) => c.query<{ n: string }>(
      `select count(*)::text as n from testimonials t join projects p on p.id = t.project_id
        where p.slug = $1`, [o.slug]));
    // Всё, что не ровно 'commit', обязано быть предпросмотром: fail-closed по значению.
    expect(Number(rows[0]!.n), `mode=${mode} записал в БД`).toBe(0);
  });

  it('mode=commit пишет', async () => {
    const o = await makeOwner();
    await login(o.accountId);
    const res = await post({ slug: o.slug, csv: CSV, mode: 'commit', mapping: MAPPING });
    expect(res.status).toBe(200);
    expect((await res.json() as { inserted: number }).inserted).toBe(1);
  });
});

describe('AC-014.16 [ревью B-1] — импорт ограничен по частоте', () => {
  it(`после ${IMPORT_RATE_THRESHOLD} импортов подряд приходит 429`, async () => {
    const o = await makeOwner();
    await login(o.accountId);
    let sawTooMany = false;
    for (let i = 0; i < IMPORT_RATE_THRESHOLD + 2; i += 1) {
      const res = await post({ slug: o.slug, csv: CSV, mode: 'preview', mapping: MAPPING });
      if (res.status === 429) { sawTooMany = true; break; }
    }
    // Маршрут пишет в БД и жжёт процессор — он ничем не невиннее публичной формы отзыва,
    // которая ограничена 5/час. Прежде закрытой была одна дверь из двух, и та, что дешевле.
    expect(sawTooMany, 'импорт не ограничен ничем').toBe(true);
  });

  it('лимит стоит ДО разбора: отказ приходит быстро даже на огромном теле', async () => {
    const o = await makeOwner();
    await login(o.accountId);
    for (let i = 0; i < IMPORT_RATE_THRESHOLD + 1; i += 1) {
      await post({ slug: o.slug, csv: CSV, mode: 'preview', mapping: MAPPING });
    }
    // В JSON перевод строки кодируется двумя байтами, поэтому миллион их вылезает за
    // MAX_IMPORT_BODY и даёт 413 раньше лимита. Берём тело, которое ПОМЕЩАЕТСЯ в предел и
    // при этом дорого в разборе: 400 000 записей — это ~800 КБ после кодирования.
    const huge = 'name,text' + '\n'.repeat(400_000);
    const started = Date.now();
    const res = await post({ slug: o.slug, csv: huge, mode: 'preview', mapping: MAPPING });
    const elapsed = Date.now() - started;
    expect(res.status).toBe(429);
    // Лимит ПОСЛЕ разбора ограничивал бы число ответов, а не цену: тот же порядок операций,
    // что в security-operation-order.md, только дорогая операция здесь — процессор.
    expect(elapsed, `отказ занял ${elapsed} мс — лимит стоит после разбора`).toBeLessThan(150);
  });
});

describe('AC-014.18 [валидация B-2] — тело НЕ читается до аутентификации', () => {
  it('огромное тело без сессии даёт 401, а не 413', async () => {
    // Предел тела здесь 2 МиБ — в 512 раз больше общего. Читать столько от кого угодно,
    // чтобы затем ответить 401, значит отдать неаутентифицированному клиенту право занять
    // ~3× тела в памяти на запрос. Порядок обратим без потерь: currentAccountId читает
    // cookie и телу не нужен.
    const huge = JSON.stringify({ slug: 'x', mode: 'preview', mapping: MAPPING,
      csv: 'x'.repeat(MAX_IMPORT_BODY) });
    // Падает при: вернуть readBodyAtMost перед currentAccountId — тогда придёт 413.
    expect((await post(undefined, huge)).status,
      'тело прочитано до проверки сессии').toBe(401);
  });

  it('страж по исходнику: currentAccountId вызывается ДО readBodyAtMost', () => {
    const code = readFileSync(
      new URL('../src/app/api/import/route.ts', import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const auth = code.indexOf('await currentAccountId()');
    const body = code.indexOf('await readBodyAtMost(');
    expect(auth).toBeGreaterThan(-1);
    expect(body).toBeGreaterThan(-1);
    expect(auth, 'тело читается раньше проверки сессии').toBeLessThan(body);
  });
});

describe('AC-014.8 — предел тела', () => {
  it('тело больше предела → 413', async () => {
    const o = await makeOwner();
    await login(o.accountId);
    const huge = JSON.stringify({ slug: o.slug, mode: 'preview', mapping: MAPPING,
      csv: 'x'.repeat(MAX_IMPORT_BODY) });
    expect((await post(undefined, huge)).status).toBe(413);
  });
});
