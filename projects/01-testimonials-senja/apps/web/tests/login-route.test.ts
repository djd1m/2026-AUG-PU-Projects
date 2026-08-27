// FR-009 — HTTP-слой входа.
//
// Существует потому, что ревью нашло дыру: восемнадцать тестов проверяли lib/login.ts и
// НИ ОДИН не вызывал сам маршрут. Одновременное внедрение четырёх дефектов — токен в теле
// ответа, httpOnly: false, предел тела 40 МБ, safeNext по startsWith('/') — прошло зелёным
// по всему пакету. Тесты ниже ловят каждый из четырёх.

import { afterAll, describe, expect, it } from 'vitest';

const DB_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!DB_URL) throw new Error('TEST_DATABASE_URL не задан');
process.env.DATABASE_URL = DB_URL;
process.env.SESSION_SECRET = 'test-secret-at-least-16-chars-long';
process.env.BASE_URL = 'https://proofwall.test';

const { withService, closePool } = await import('@proofwall/db');
const { registerAccountAndProject } = await import('../src/lib/register');
const { POST, MAX_LOGIN_BODY } = await import('../src/app/api/auth/login/route');
const { safeNextPath } = await import('../src/lib/next-path');

afterAll(async () => { await closePool(); });

const URL_ = 'https://proofwall.test/api/auth/login';
const PASSWORD = 'correct-horse-battery';
let seq = 0;

/** Регистрирует владельца НАСТОЯЩЕЙ транзакцией — маршрут открывает свою, поэтому откатить нельзя. */
async function makeOwner(): Promise<{ email: string; slug: string }> {
  seq += 1;
  const slug = `route-${seq}-${Date.now().toString(36)}`;
  const email = `${slug}@example.com`;
  const r = await withService((c) =>
    registerAccountAndProject(c, { email, password: PASSWORD, desired_slug: slug, project_name: 'Route' }),
  );
  if (!r.ok) throw new Error(`регистрация не удалась: ${JSON.stringify(r.body)}`);
  return { email, slug };
}

function post(body: unknown, ip = `5.5.${seq % 250}.${Math.floor(Math.random() * 250)}`): Promise<Response> {
  return POST(new Request(URL_, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  })) as unknown as Promise<Response>;
}

describe('токен уходит ТОЛЬКО в httpOnly-cookie', () => {
  it('тело ответа не содержит значения cookie', async () => {
    const { email } = await makeOwner();
    const res = await post({ email, password: PASSWORD });
    expect(res.status).toBe(200);

    const setCookie = res.headers.get('set-cookie') ?? '';
    const token = /pw_session=([^;]+)/.exec(setCookie)?.[1];
    expect(token, 'cookie сессии не выдана').toBeTruthy();

    // Не «нет поля token»: слабая форма проходит, если токен уехал в поле session, sid
    // или во вложенный объект. Ищем САМО ЗНАЧЕНИЕ во всём теле.
    const body = JSON.stringify(await res.json());
    expect(body, 'токен в теле ответа читает любой скрипт на странице').not.toContain(token!);
  });

  it('cookie помечена httpOnly и Secure-политикой', async () => {
    const { email } = await makeOwner();
    const res = await post({ email, password: PASSWORD });
    const setCookie = (res.headers.get('set-cookie') ?? '').toLowerCase();
    expect(setCookie, 'без httpOnly токен доступен document.cookie').toContain('httponly');
    expect(setCookie).toContain('samesite=lax');
    expect(setCookie).toContain('path=/');
  });

  it('успех возвращает проекты аккаунта', async () => {
    const { email, slug } = await makeOwner();
    const body = (await (await post({ email, password: PASSWORD })).json()) as {
      projects: { slug: string }[];
    };
    expect(body.projects.map((p) => p.slug)).toEqual([slug]);
  });
});

describe('отказы неразличимы и не роняют маршрут', () => {
  it('неверный пароль и несуществующий email дают ОДИН И ТОТ ЖЕ ответ', async () => {
    const { email } = await makeOwner();
    const a = await post({ email, password: 'wrong-password-here' });
    const b = await post({ email: 'nobody-at-all@example.com', password: PASSWORD });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(await a.json()).toEqual(await b.json());
  });

  it.each([
    ['нестроковый пароль', { email: 'x@example.com', password: 12345 }],
    ['пароль-объект', { email: 'x@example.com', password: { a: 1 } }],
    ['нестроковый email', { email: ['a@b.c'], password: PASSWORD }],
    ['пустое тело-объект', {}],
  ])('%s -> 401 без исключения', async (_name, payload) => {
    const res = await post(payload);
    expect(res.status).toBe(401);
  });

  it('не JSON -> 400, а не 401: это ошибка формата, различимость тут безопасна', async () => {
    const res = (await POST(new Request(URL_, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '5.6.7.8' },
      body: 'не json',
    })) as unknown as Response);
    expect(res.status).toBe(400);
  });
});

describe('предел размера тела — по БАЙТАМ, а не по Content-Length', () => {
  // ЧИСЛО ПРИБИТО НЕЗАВИСИМО, и это не дублирование, а несущее условие.
  //
  // Тонкость, стоившая одного пропущенного дефекта: для функции-ПРОИЗВОДНОЙ (hashKey)
  // тест обязан вызывать производственную реализацию — своя копия формулы разъедется
  // молча. Для ПОРОГА ровно наоборот: если тест берёт константу из кода, то подмена
  // 4096 на 40_000_000 двигает цель вместе с проверкой, и «тело больше предела -> 413»
  // остаётся зелёным при отсутствии предела. Проверено внедрением: так и было.
  const EXPECTED_LIMIT = 4096;

  it('предел равен 4096 байт — константа не может уехать незаметно', () => {
    expect(MAX_LOGIN_BODY, 'предел, следующий за тестом, не является пределом')
      .toBe(EXPECTED_LIMIT);
  });

  it(`тело больше ${EXPECTED_LIMIT} байт -> 413`, async () => {
    const res = await post({ email: 'a@example.com', password: 'x'.repeat(EXPECTED_LIMIT) });
    expect(res.status).toBe(413);
  });

  it('тело чуть меньше предела проходит к аутентификации', async () => {
    // Не 413 — значит предел не сработал раньше времени. 401, потому что учётки нет.
    const res = await post({ email: 'a@example.com', password: 'x'.repeat(EXPECTED_LIMIT - 200) });
    expect(res.status).toBe(401);
  });

  it('ПОТОКОВОЕ тело БЕЗ Content-Length сверх предела -> 413', async () => {
    // Тот самый случай, ради которого предел считается по байтам: у chunked-запроса
    // заголовка Content-Length нет вовсе, и проверка по нему пропустила бы что угодно.
    const TOTAL = 256 * 1024; // фиксированный объём, НЕ производный от константы кода
    const chunk = new TextEncoder().encode('x'.repeat(1024));
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent >= TOTAL) { controller.close(); return; }
        sent += chunk.byteLength;
        controller.enqueue(chunk);
      },
    });
    const request = new Request(URL_, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '5.9.9.9' },
      body: stream,
      // @ts-expect-error duplex обязателен для потокового тела и отсутствует в типах DOM
      duplex: 'half',
    });
    expect(request.headers.get('content-length'), 'у потокового тела заголовка быть не должно').toBeNull();
    const res = (await POST(request) as unknown as Response);
    expect(res.status, 'предел обходится сменой кодирования тела').toBe(413);
    expect(sent, 'поток обязан обрываться на пределе, а не дочитываться целиком')
      .toBeLessThan(TOTAL);
  });
});

describe('?next= — только относительный путь', () => {
  it.each([
    ['/dashboard/acme', '/dashboard/acme'],
    ['/', '/'],
    ['/a/b_c-d', '/a/b_c-d'],
  ])('%s принимается', (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it.each([
    '//evil.example/x',          // протокол-относительный: тоже начинается со слеша
    'https://evil.example',
    'javascript:alert(1)',
    '/x?y=1',
    '/x#frag',
    'dashboard/acme',
    '',
    '\\\\evil.example',
  ])('%j отвергается', (bad) => {
    expect(safeNextPath(bad), 'открытый редирект на чужой домен').toBeNull();
  });

  it.each([null, undefined, 42, {}, ['/ok']])('нестроковое %j отвергается', (bad) => {
    expect(safeNextPath(bad)).toBeNull();
  });
});
