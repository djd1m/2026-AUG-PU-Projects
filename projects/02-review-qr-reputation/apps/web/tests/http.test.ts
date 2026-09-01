// HTTP-слой кабинета: полный круг, изоляция через HTTP, защита форм.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env.DATABASE_URL_OWNER = process.env.TEST_DATABASE_URL ?? '';
process.env.BASE_URL = 'http://cab.test';
process.env.GUEST_INTERNAL_URL = 'http://127.0.0.1:1';   // канал сброса кэша заглушен: его отказ не должен ломать кабинет

const { server } = await import('../src/server.js');
const { closePool } = await import('../src/db.js');
const pgAdmin = new (await import('pg')).default.Pool({ connectionString: process.env.TEST_ADMIN_URL ?? '' });

let base = '';
const ORIGIN = 'http://cab.test';
const uniq = (() => { let n = 0; return (p: string) => `${p}${process.pid}${++n}`; })();

beforeAll(async () => {
  await new Promise<void>((r) => server.listen(0, () => r()));
  const a = server.address();
  base = `http://127.0.0.1:${typeof a === 'object' && a ? a.port : 0}`;
});
afterAll(async () => { server.close(); await pgAdmin.end(); await closePool(); });

function form(data: Record<string, string>): string {
  return new URLSearchParams(data).toString();
}
async function post(path: string, data: Record<string, string>, cookie = '', origin = ORIGIN) {
  return fetch(base + path, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded',
      ...(origin ? { origin } : {}), ...(cookie ? { cookie } : {}) },
    body: form(data),
  });
}
function cookieOf(r: Response): string {
  return (r.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
}
async function registerOwner() {
  const email = `${uniq('u')}@t.ru`;
  const r = await post('/register', { email, password: 'пароль-восемь', account: 'T' });
  expect(r.status).toBe(303);
  return { email, cookie: cookieOf(r) };
}

describe('полный круг владельца через HTTP', () => {
  it('регистрация → кабинет → точка → ссылка → страница обращений', async () => {
    const o = await registerOwner();
    const slug = uniq('pl');
    expect((await post('/places', { slug, name: 'Моя точка' }, o.cookie)).status).toBe(303);

    const dash = await (await fetch(`${base}/dashboard`, { headers: { cookie: o.cookie } })).text();
    expect(dash).toContain('Моя точка');
    expect(dash).toContain(`/r/${slug}`);

    const placeId = dash.match(/\/places\/([0-9a-f-]{36})/)?.[1] ?? '';
    expect(placeId).toBeTruthy();
    const rl = await post(`/places/${placeId}/links`, { twogis: 'https://2gis.ru/firm/42' }, o.cookie);
    expect(rl.status).toBe(303);

    const fb = await (await fetch(`${base}/places/${placeId}`, { headers: { cookie: o.cookie } })).text();
    expect(fb).toContain('Пока пусто');
  });

  it('выход гасит сессию по-настоящему', async () => {
    const o = await registerOwner();
    await post('/logout', {}, o.cookie);
    const r = await fetch(`${base}/dashboard`, { headers: { cookie: o.cookie }, redirect: 'manual' });
    expect(r.status).toBe(303);   // на /login — сессия отозвана в БД, не только cookie стёрта
  });
});

describe('изоляция арендаторов — через HTTP', () => {
  it('владелец A не открывает страницу точки владельца B', async () => {
    const a = await registerOwner(); const b = await registerOwner();
    await post('/places', { slug: uniq('pb'), name: 'Точка B' }, b.cookie);
    const dashB = await (await fetch(`${base}/dashboard`, { headers: { cookie: b.cookie } })).text();
    const placeB = dashB.match(/\/places\/([0-9a-f-]{36})/)?.[1] ?? '';
    const r = await fetch(`${base}/places/${placeB}`, { headers: { cookie: a.cookie } });
    // Чужая и несуществующая неотличимы.
    expect(r.status).toBe(404);
  });
});

describe('защита форм: Origin, fail-closed', () => {
  it('POST с чужим Origin отклоняется', async () => {
    const o = await registerOwner();
    const r = await post('/places', { slug: uniq('x'), name: 'X' }, o.cookie, 'http://evil.test');
    expect(r.status).toBe(403);
  });

  it('POST БЕЗ Origin отклоняется — отсутствие не «старый клиент»', async () => {
    const o = await registerOwner();
    const r = await post('/places', { slug: uniq('x'), name: 'X' }, o.cookie, '');
    expect(r.status).toBe(403);
  });

  it('cookie сессии: HttpOnly и SameSite обязательны', async () => {
    const email = `${uniq('u')}@t.ru`;
    const r = await post('/register', { email, password: 'пароль-восемь', account: 'T' });
    const sc = r.headers.get('set-cookie') ?? '';
    expect(sc).toMatch(/HttpOnly/i);
    expect(sc).toMatch(/SameSite=Lax/i);
  });

  it('неверный пароль и чужая почта — один текст', async () => {
    const o = await registerOwner();
    const a = await (await post('/login', { email: o.email, password: 'не тот' })).text();
    const b = await (await post('/login', { email: `${uniq('no')}@t.ru`, password: 'любой' })).text();
    const msg = (h: string) => h.match(/class="err">([^<]*)/)?.[1];
    expect(msg(a)).toBe(msg(b));
  });
});

describe('QR и печатные макеты', () => {
  async function qrPageOf(): Promise<string> {
    const o = await registerOwner();
    const slug = uniq('qr');
    await post('/places', { slug, name: 'QR-точка' }, o.cookie);
    const dash = await (await fetch(`${base}/dashboard`, { headers: { cookie: o.cookie } })).text();
    const placeId = dash.match(/\/places\/([0-9a-f-]{36})\/qr/)?.[1] ?? '';
    return (await fetch(`${base}/places/${placeId}/qr`, { headers: { cookie: o.cookie } })).text();
  }

  it('QR ведёт на НАШ домен, а не на площадку (ADR-001)', async () => {
    const page = await qrPageOf();
    expect(page).toContain('<svg');                       // код сгенерирован
    expect(page).toMatch(/cab\.test\/r\//);               // наш адрес на макете
    // Прямые адреса площадок в макетах запрещены: смена карточки убила бы тираж.
    expect(page).not.toMatch(/yandex\.ru|2gis\.ru/);
  });

  it('запрещённые элементы отсутствуют: подсказки, вознаграждение', async () => {
    const page = await qrPageOf();
    // Единственные действующие нормы площадок: не подсказывать содержание отзыва
    // и не обещать вознаграждение. Стережём по тексту страницы.
    expect(page).not.toMatch(/напишите про|расскажите о (кухне|блюд|обслуж)|поставьте|5 звёзд|скидк[ау]|бонус|подар/i);
  });

  it('тейбл-тент — с предупреждением про Wi-Fi и общий планшет', async () => {
    const page = await qrPageOf();
    expect(page).toContain('Тейбл-тент — с оговоркой');
    expect(page).toMatch(/своим телефоном на своей сети/);
    expect(page).toMatch(/общий планшет/);
    // Предупреждение стоит ПЕРЕД макетом тента, а не после: читают до печати.
    expect(page.indexOf('с оговоркой')).toBeLessThan(page.indexOf('mk--tent'));
  });

  it('уносимые носители идут ПЕРВЫМИ — они безопасны по умолчанию', async () => {
    const page = await qrPageOf();
    expect(page.indexOf('Подвал счёта')).toBeLessThan(page.indexOf('Тейбл-тент'));
  });

  it('чужой QR не открывается', async () => {
    const a = await registerOwner(); const b = await registerOwner();
    await post('/places', { slug: uniq('qb'), name: 'B' }, b.cookie);
    const dashB = await (await fetch(`${base}/dashboard`, { headers: { cookie: b.cookie } })).text();
    const placeB = dashB.match(/\/places\/([0-9a-f-]{36})\/qr/)?.[1] ?? '';
    const r = await fetch(`${base}/places/${placeB}/qr`, { headers: { cookie: a.cookie } });
    expect(r.status).toBe(404);
  });
});
