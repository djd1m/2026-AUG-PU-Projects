// СТЫК guest → intake: ключ лимита — адрес ГОСТЯ, а не адрес контейнера guest.
//
// Зачем отдельный набор. Все прежние тесты лимита били в intake НАПРЯМУЮ и подавали адрес
// заголовком — то есть проверяли модуль, а не систему. В проде форма гостя уходит в intake
// внутренним fetch из guest, и адрес гостя в нём не передавался: intake брал адрес сокета,
// то есть контейнера guest. «10 с адреса на точку» на деле было «10 на точку от всех гостей»,
// а грубый барьер (200/час) — «200 в час на весь продукт». Модульные тесты были зелёными:
// дефект жил в стыке (deployment-seams.md). Здесь обе стороны подняты в одном процессе, и
// каждый запрос проходит путь гостя целиком: «прокси» → guest → intake → БД.
//
// Роль. Набор идёт под app_intake (строка ниже — по ней test-all.sh выбирает роль). Пул guest
// получает app_render, выведенную из TEST_ADMIN_URL: у каждой стороны СВОЯ роль, как в проде.
//
// «Прокси» в тесте — клиент с адреса 127.0.0.1, объявленного доверенным (TRUSTED_PROXY_HOST).
// Прокси ДОПИСЫВАЕТ адрес в конец X-Forwarded-For — это худший случай: Caddy 2.10 без
// trusted_proxies заголовок клиента ЗАМЕНЯЕТ, и там подделывать нечего вовсе. Сосед по сети,
// а не прокси, — клиент с 127.0.0.2 (весь 127/8 живёт на петле).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { request } from 'node:http';

process.env.DATABASE_URL_INTAKE = process.env.TEST_DATABASE_URL ?? '';
process.env.BASE_URL = 'https://reviewqr.test';
process.env.TRUSTED_PROXY_HOST = '127.0.0.1';
{
  const u = new URL(process.env.TEST_ADMIN_URL ?? 'postgres://x@localhost/x');
  u.username = 'app_render';
  u.password = '';
  process.env.DATABASE_URL_RENDER = u.toString();
}

const intakeDb = await import('../src/db.js');
const intake = await import('../src/server.js');
await new Promise<void>((r) => intake.server.listen(0, '127.0.0.1', () => r()));
const ia = intake.server.address();
process.env.INTAKE_URL = `http://127.0.0.1:${typeof ia === 'object' && ia ? ia.port : 0}`;

const guestDb = await import('../../../apps/guest/src/db.js');
const guest = await import('../../../apps/guest/src/server.js');
const pgAdmin = new (await import('pg')).default.Pool({ connectionString: process.env.TEST_ADMIN_URL ?? '' });

const ACC = '55555555-5555-5555-5555-555555555555';
const tag = `sg-${process.pid}`;
const slugs: string[] = [];
let gport = 0;

async function place(name: string): Promise<string> {
  const slug = `${tag}-${name}`;
  await pgAdmin.query('insert into places (account_id, slug, name) values ($1,$2,$3)', [ACC, slug, name]);
  slugs.push(slug);
  return slug;
}

beforeAll(async () => {
  await pgAdmin.query(`insert into accounts (id,name) values ($1,'SG') on conflict do nothing`, [ACC]);
  await new Promise<void>((r) => guest.server.listen(0, '0.0.0.0', () => r()));
  const a = guest.server.address();
  gport = typeof a === 'object' && a ? a.port : 0;
});

afterAll(async () => {
  for (const s of slugs) await pgAdmin.query('delete from places where slug=$1', [s]);
  await pgAdmin.end();
  guest.server.close(); intake.server.close();
  await guestDb.closePool(); await intakeDb.closePool();
});

/** Отправка формы гостя В GUEST, как её отправляет браузер через прокси. */
function send(slug: string, headers: Record<string, string>, localAddress = '127.0.0.1'): Promise<number> {
  const body = 'body=' + encodeURIComponent('Холодный кофе, ждали 20 минут');
  return new Promise((resolve, reject) => {
    const req = request({
      host: '127.0.0.1', port: gport, localAddress, method: 'POST', path: `/r/${slug}/private`,
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'content-length': Buffer.byteLength(body), ...headers },
    }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode ?? 0)); });
    req.on('error', reject);
    req.end(body);
  });
}
const viaProxy = (slug: string, guestIp: string) => send(slug, { 'x-forwarded-for': guestIp });
const count = (xs: number[], code: number) => xs.filter((x) => x === code).length;

describe('C-3b через стык: порог — по адресу ГОСТЯ, а не контейнера guest', () => {
  it('11-е обращение с одного адреса — 429, а гость с другого адреса проходит', async () => {
    const slug = await place('c3b');
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) codes.push(await viaProxy(slug, '198.51.100.11'));
    expect(codes.slice(0, 10), 'первые десять обязаны пройти').toEqual(Array(10).fill(200));
    expect(codes[10], '11-е с того же адреса').toBe(429);
    // Ровно здесь жил дефект: без проброса адреса «другой гость» — тот же ключ, и он наказан.
    expect(await viaProxy(slug, '198.51.100.12'), 'другой гость на ту же точку').toBe(200);
  }, 30_000);
});

describe('КОНКУРЕНТНО через стык (shared-resource-verification)', () => {
  it('C-1: 20 одновременных с ОДНОГО адреса при пределе 10 — прошло ровно 10', async () => {
    const slug = await place('c1');
    const codes = await Promise.all(Array.from({ length: 20 }, () => viaProxy(slug, '198.51.100.21')));
    expect(count(codes, 200), `коды: ${codes.join(',')}`).toBe(10);
    expect(count(codes, 429), `коды: ${codes.join(',')}`).toBe(10);
  }, 30_000);

  it('C-3: 20 одновременных с 20 РАЗНЫХ адресов за одним прокси — ни одного ложного отказа', async () => {
    const slug = await place('c3');
    const codes = await Promise.all(Array.from({ length: 20 }, (_, i) => viaProxy(slug, `203.0.113.${i + 1}`)));
    // Лок или ключ, общий для многих гостей, при насыщении бьёт по добросовестным (п.4).
    expect(count(codes, 200), `коды: ${codes.join(',')}`).toBe(20);
  }, 30_000);
});

describe('подмена X-Forwarded-For не меняет ключ лимита', () => {
  it('клиент вращает свой элемент XFF — прокси дописал настоящий адрес, ключ тот же', async () => {
    const slug = await place('xff');
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) {
      // Прокси ДОПИСЫВАЕТ: «что прислал клиент, <кого видел прокси>». Первый элемент — клиента.
      codes.push(await send(slug, {
        'x-forwarded-for': `6.6.6.${i + 1}, 192.0.2.77`,
        'x-guest-ip': `7.7.7.${i + 1}`,            // и этот заголовок guest обязан не пропускать
      }));
    }
    expect(codes.slice(0, 10)).toEqual(Array(10).fill(200));
    expect(codes[10], 'смена первого элемента XFF обнулила лимит').toBe(429);
  }, 30_000);

  it('сосед по сети (не прокси) с XFF: заголовок не читается, ключ — адрес соседа', async () => {
    const slug = await place('nbr');
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) codes.push(await send(slug, { 'x-forwarded-for': `9.9.9.${i + 1}` }, '127.0.0.2'));
    expect(codes.slice(0, 10)).toEqual(Array(10).fill(200));
    expect(codes[10], 'XFF от не-прокси принят за адрес гостя').toBe(429);
  }, 30_000);
});

describe('pickClientIp: чистая функция, по одному измерению', () => {
  it('разбор цепочки и границы доверия', async () => {
    const { pickClientIp } = await import('../../../apps/guest/src/client-ip.js');
    const P = new Set(['172.18.0.9']);
    expect(pickClientIp('172.18.0.9', '6.6.6.6, 192.0.2.1', P), 'последний элемент от прокси').toBe('192.0.2.1');
    expect(pickClientIp('::ffff:172.18.0.9', '192.0.2.1', P), 'IPv4-mapped пир').toBe('192.0.2.1');
    expect(pickClientIp('172.18.0.3', '192.0.2.1', P), 'не прокси — заголовок не читается').toBe('172.18.0.3');
    expect(pickClientIp('172.18.0.9', 'мусор', P), 'не адрес — строже: ключ прокси').toBe('172.18.0.9');
    expect(pickClientIp('172.18.0.9', '192.0.2.1, ', P), 'пустой хвост — не адрес').toBe('172.18.0.9');
    expect(pickClientIp('172.18.0.9', ['6.6.6.6', '192.0.2.1'], P), 'повторённый заголовок').toBe('192.0.2.1');
    expect(pickClientIp('172.18.0.9', '[2001:db8::1]', P)).toBe('2001:db8::1');
    expect(pickClientIp('172.18.0.9', '192.0.2.1', new Set()), 'прокси не резолвится — строже').toBe('172.18.0.9');
    expect(pickClientIp(undefined, '192.0.2.1', P)).toBe('unknown');
  });

  it('один адрес — один ключ: канонизация, и копии в guest и intake не разошлись', async () => {
    const g = (await import('../../../apps/guest/src/client-ip.js')).canonIp;
    const i = intake.canonIp;
    const table: Array<[string, string | undefined]> = [
      ['2001:0db8:0:0:0:0:0:1', '2001:db8::1'],
      ['2001:DB8::1', '2001:db8::1'],
      ['[2001:db8::1]', '2001:db8::1'],
      ['::ffff:192.0.2.1', '192.0.2.1'],
      ['::ffff:c000:201', '192.0.2.1'],
      [' 192.0.2.1 ', '192.0.2.1'],
      ['192.0.2.1', '192.0.2.1'],
      ['1.2.3', undefined], ['мусор', undefined], ['', undefined], ['fe80::1%eth0', undefined],
    ];
    for (const [input, want] of table) {
      expect(g(input), `guest: ${input}`).toBe(want);
      expect(i(input), `intake: ${input}`).toBe(want);
    }
  });
});

describe('доверие к прокси снимается при отказе DNS (строже, а не шире)', () => {
  it('резолв не удался — множество прокси ПУСТОЕ, а не прежнее', async () => {
    const { refresh, pickClientIp } = await import('../../../apps/guest/src/client-ip.js');
    expect([...(await refresh('127.0.0.1'))]).toEqual(['127.0.0.1']);
    const after = await refresh('no-such-proxy.invalid');
    expect(after.size, 'прежний адрес прокси остался доверенным после отказа DNS').toBe(0);
    expect(pickClientIp('127.0.0.1', '192.0.2.1', after)).toBe('127.0.0.1');
  });
});
