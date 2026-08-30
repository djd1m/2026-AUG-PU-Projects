// FR-015 — восстановление пароля по email.
//
// Главные инварианты: ссылка НЕ выдаёт сессию; отправка письма ВНЕ транзакции; погашение
// токена атомарно. Первые два проверяются и поведением, и стражем по исходнику — они
// относятся ко ВСЕМ путям кода, включая те, которых сегодня нет.

import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const DB_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!DB_URL) throw new Error('TEST_DATABASE_URL не задан');
process.env.DATABASE_URL = DB_URL;
process.env.SESSION_SECRET = 'test-secret-at-least-16-chars-long';
process.env.BASE_URL = 'https://proofwall.test';

const { withService, closePool, rateLimit } = await import('@proofwall/db');
const { registerAccountAndProject } = await import('../src/lib/register');
const { attemptLogin, hashKey } = await import('../src/lib/login');
const { createSession, hashSessionToken } = await import('../src/lib/session');
const {
  issueResetToken, resetPassword, hashResetToken,
  RESET_PAIR_SCOPE, RESET_IP_SCOPE, RESET_PAIR_THRESHOLD, RESET_WINDOW, RESET_TTL_MS,
} = await import('../src/lib/password-reset');
const { resetEmail } = await import('../src/lib/email');
const { handleForgot } = await import('../src/app/api/auth/forgot/route');
const { POST: resetRoute } = await import('../src/app/api/auth/reset/route');

afterAll(async () => { await closePool(); });

const SRC = path.resolve(__dirname, '../src');
const strip = (c: string) => c.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const read = (rel: string) => strip(readFileSync(path.resolve(SRC, rel), 'utf8'));

const OLD = 'old-correct-horse-battery';
const NEW = 'new-correct-horse-battery';
const RUN = `${process.pid}-${Date.now().toString(36)}`;
let seq = 0;

/** Уникально МЕЖДУ прогонами: счётчик по адресу живёт час и между наборами не чистится. */
const ip = () => { seq += 1; return `resetkey-${RUN}-${seq}`; };

async function makeOwner() {
  seq += 1;
  const slug = `rst-${RUN}-${seq}`;
  const email = `${slug}@example.com`;
  const r = await withService((c) => registerAccountAndProject(c, {
    email, password: OLD, desired_slug: slug, project_name: 'Сброс',
  }));
  if (!r.ok) throw new Error(JSON.stringify(r.body));
  const { rows } = await withService((c) =>
    c.query<{ id: string }>('select id from accounts where email = $1', [email]));
  return { accountId: rows[0]!.id, email };
}

const issue = (email: string, addr = ip()) =>
  withService((c) => issueResetToken(c, email, addr));
const reset = (token: string, next = NEW) =>
  withService((c) => resetPassword(c, token, next));

const tokenRows = (accountId: string) => withService(async (c) => {
  const { rows } = await c.query<{ token_hash: string; used_at: Date | null; expires_at: Date }>(
    'select token_hash, used_at, expires_at from password_reset_tokens where account_id = $1 order by created_at',
    [accountId]);
  return rows;
});

// ─────────────────────────────────────────────────────────────────────────────
describe('AC-015.1 / AC-015.2 — полный путь и старый пароль', () => {
  it('forgot → reset → вход НОВЫМ паролем работает, старым нет', async () => {
    const o = await makeOwner();
    const r = await issue(o.email);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(await reset(r.token)).toBe(true);

    const good = await withService((c) => attemptLogin(c, o.email, NEW, ip()));
    expect(good.ok, 'новым паролем войти не удалось').toBe(true);
    const bad = await withService((c) => attemptLogin(c, o.email, OLD, ip()));
    expect(bad.ok, 'старый пароль всё ещё принимается').toBe(false);
  });
});

describe('AC-015.3 — ссылка НЕ выдаёт сессию', () => {
  it('ответ reset не несёт Set-Cookie и сессия не создана', async () => {
    const o = await makeOwner();
    const r = await issue(o.email);
    if (!r.ok) throw new Error('токен не выпущен');

    const before = await withService(async (c) => {
      const { rows } = await c.query<{ n: string }>('select count(*)::text as n from sessions where account_id = $1', [o.accountId]);
      return Number(rows[0]!.n);
    });

    const res = await resetRoute(new Request('https://proofwall.test/api/auth/reset', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: r.token, new_password: NEW }),
    }));
    expect(res.status).toBe(200);

    // Падает при R1: выдать сессию в ответе. Причина запрета не в удобстве — ссылка,
    // выдающая сессию, функционально есть вход через владение почтовым ящиком.
    expect(res.headers.get('set-cookie'), 'ссылка выдала сессию').toBeNull();
    const after = await withService(async (c) => {
      const { rows } = await c.query<{ n: string }>('select count(*)::text as n from sessions where account_id = $1', [o.accountId]);
      return Number(rows[0]!.n);
    });
    expect(after, 'сессия создана по ссылке').toBe(before);
  });

  it('СТРАЖ: createSession в модуле восстановления не вызывается', () => {
    const code = read('lib/password-reset.ts') + read('app/api/auth/reset/route.ts');
    expect(code, 'сессия выдаётся по ссылке из письма').not.toContain('createSession');
  });
});

describe('AC-015.4 — сброс отзывает ВСЕ сессии', () => {
  it('обе сессии аккаунта мертвы после сброса', async () => {
    const o = await makeOwner();
    const a = await withService((c) => createSession(c, o.accountId));
    const b = await withService((c) => createSession(c, o.accountId));
    const r = await issue(o.email);
    if (!r.ok) throw new Error('нет токена');
    await reset(r.token);

    const alive = await withService(async (c) => {
      const { rows } = await c.query<{ n: string }>(
        'select count(*)::text as n from sessions where account_id = $1 and revoked_at is null',
        [o.accountId]);
      return Number(rows[0]!.n);
    });
    // Падает при R2 — у донора этого шага нет вовсе, и вор, из-за которого владелец и
    // восстанавливает доступ, остался бы внутри.
    expect(alive, 'сессии пережили сброс').toBe(0);
    expect(await withService((c) => c.query(
      'select 1 from sessions where token_hash = $1 and revoked_at is null',
      [hashSessionToken(a)]))).toHaveProperty('rowCount', 0);
    expect(await withService((c) => c.query(
      'select 1 from sessions where token_hash = $1 and revoked_at is null',
      [hashSessionToken(b)]))).toHaveProperty('rowCount', 0);
  });
});

describe('AC-015.5 / AC-015.6 / AC-015.7 — токен одноразовый, срочный, вытесняемый', () => {
  it('повторное использование того же токена → отказ', async () => {
    const o = await makeOwner();
    const r = await issue(o.email);
    if (!r.ok) throw new Error('нет токена');
    expect(await reset(r.token)).toBe(true);
    // Падает при R3: не проставлять used_at.
    expect(await reset(r.token, 'another-correct-horse'), 'токен сработал дважды').toBe(false);
  });

  it('истёкший токен → отказ', async () => {
    const o = await makeOwner();
    const r = await issue(o.email);
    if (!r.ok) throw new Error('нет токена');
    await withService((c) => c.query(
      "update password_reset_tokens set expires_at = now() - interval '1 minute' where account_id = $1",
      [o.accountId]));
    // Падает при R4: убрать expires_at > now() из условия.
    expect(await reset(r.token), 'истёкший токен сработал').toBe(false);
  });

  it('выпуск нового токена гасит предыдущий', async () => {
    const o = await makeOwner();
    const first = await issue(o.email);
    const second = await issue(o.email);
    if (!first.ok || !second.ok) throw new Error('нет токенов');
    // Падает при R5: не гасить предыдущие — две живые ссылки на один аккаунт.
    expect(await reset(first.token), 'старая ссылка осталась рабочей').toBe(false);
    expect(await reset(second.token), 'новая ссылка не работает').toBe(true);
  });
});

describe('AC-015.8 — токен привязан к своему аккаунту', () => {
  it('токен одного аккаунта не меняет пароль другого', async () => {
    const a = await makeOwner();
    const b = await makeOwner();
    const r = await issue(a.email);
    if (!r.ok) throw new Error('нет токена');
    await reset(r.token);

    const bLogin = await withService((c) => attemptLogin(c, b.email, OLD, ip()));
    expect(bLogin.ok, 'пароль чужого аккаунта изменён').toBe(true);
  });
});

describe('AC-015.9 — в БД лежит ХЕШ, а не токен', () => {
  it('исходное значение не встречается в строке', async () => {
    const o = await makeOwner();
    const r = await issue(o.email);
    if (!r.ok) throw new Error('нет токена');
    const rows = await tokenRows(o.accountId);
    // Падает при R6: сохранить токен как есть.
    expect(rows[0]!.token_hash).not.toBe(r.token);
    expect(rows[0]!.token_hash).toBe(hashResetToken(r.token));
    expect(rows[0]!.token_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('AC-015.10 / AC-015.16 — ответ один, письмо по делу', () => {
  const URL_ = 'https://proofwall.test/api/auth/forgot';
  const post = (email: string, sender: (m: { to: string }) => Promise<void>) =>
    handleForgot(new Request(URL_, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': `14.0.${seq % 250}.${(seq += 1) % 250}` },
      body: JSON.stringify({ email }),
    }), sender);

  it('несуществующий адрес: 200, тот же текст, писем НОЛЬ', async () => {
    const o = await makeOwner();
    const sent: { to: string }[] = [];
    const okRes = await post(o.email, async (m) => { sent.push(m); });
    const noRes = await post(`нет-такого-${RUN}@example.com`, async (m) => { sent.push(m); });

    expect(okRes.status).toBe(200);
    expect(noRes.status).toBe(200);
    // Падает при R7: вернуть 404 на несуществующий адрес.
    expect(JSON.stringify(await noRes.json()), 'тела ответов различаются')
      .toBe(JSON.stringify(await okRes.json()));
    expect(sent.length, 'письмо ушло на несуществующий адрес').toBe(1);
    expect(sent[0]!.to).toBe(o.email);
  });

  it('отказ провайдера НЕ меняет ответ и НЕ отменяет токен', async () => {
    const o = await makeOwner();
    const res = await post(o.email, async () => { throw new Error('провайдер недоступен'); });
    expect(res.status, 'отказ почты изменил ответ').toBe(200);
    // Падает при R9: пробрасывать ошибку наружу.
    const rows = await tokenRows(o.accountId);
    expect(rows.length, 'токен откатился при отказе почты').toBe(1);
    expect(rows[0]!.used_at, 'токен погашен при отказе почты').toBeNull();
  });
});

describe('AC-015.11 / AC-015.12 / AC-015.13 — лимит парным ключом', () => {
  it('одна попытка = +1 по паре и +1 по IP', async () => {
    const o = await makeOwner();
    const addr = ip();
    const kp = hashKey(RESET_PAIR_SCOPE, o.email, addr);
    const ki = hashKey(RESET_IP_SCOPE, addr);
    const cnt = (scope: string, key: string) => withService((c) => rateLimit.count(scope, key, RESET_WINDOW, c));

    const b = { p: await cnt(RESET_PAIR_SCOPE, kp), i: await cnt(RESET_IP_SCOPE, ki) };
    await issue(o.email, addr);
    // Падает при R12: убрать одну из двух записей.
    expect(await cnt(RESET_PAIR_SCOPE, kp) - b.p, 'счётчик пары не пишется').toBe(1);
    expect(await cnt(RESET_IP_SCOPE, ki) - b.i, 'счётчик IP не пишется').toBe(1);
  });

  it(`${RESET_PAIR_THRESHOLD} попыток подряд → следующая tooMany`, async () => {
    const o = await makeOwner();
    const addr = ip();
    for (let i = 0; i < RESET_PAIR_THRESHOLD; i += 1) await issue(o.email, addr);
    const r = await issue(o.email, addr);
    expect(r).toEqual({ ok: false, tooMany: true });
  });

  it('исчерпанная пара не мешает тому же владельцу с другого адреса', async () => {
    const o = await makeOwner();
    const busy = ip();
    for (let i = 0; i < RESET_PAIR_THRESHOLD; i += 1) await issue(o.email, busy);
    expect((await issue(o.email, busy)).ok).toBe(false);
    // Падает при R13: ключ по одному email — вор завалил бы владельцу восстановление.
    expect((await issue(o.email, ip())).ok, 'владелец заперт с другого адреса').toBe(true);
  });
});

describe('AC-015.21 [валидация B-1] — лимит НЕ обходится параллельными запросами', () => {
  it(`N одновременных попыток с одной пары: успешных не больше порога ${RESET_PAIR_THRESHOLD}`, async () => {
    // Последовательный тест этого не ловит. Под READ COMMITTED без лока сто параллельных
    // запросов видят count = 0, проходят все и отправляют письма все — а защищаемый ресурс
    // здесь ЧУЖОЙ ПОЧТОВЫЙ ЯЩИК. Проект уже чинил это во входе (login.ts:89-106).
    const o = await makeOwner();
    const addr = ip();
    const N = 12;
    const results = await Promise.all(
      Array.from({ length: N }, () => issue(o.email, addr)),
    );
    const passed = results.filter((r) => r.ok).length;
    // Падает при: убрать pg_try_advisory_xact_lock.
    expect(passed, `прошло ${passed} при пороге ${RESET_PAIR_THRESHOLD} — лимит обойдён`)
      .toBeLessThanOrEqual(RESET_PAIR_THRESHOLD);
  });
});

describe('AC-015.22 [валидация B-2] — у аккаунта не бывает двух живых ссылок', () => {
  it('параллельный выпуск с РАЗНЫХ адресов оставляет ровно один живой токен', async () => {
    // Связка «UPDATE … SET used_at → INSERT» под READ COMMITTED это НЕ обеспечивает:
    // UPDATE не видит ещё не закоммиченную вставку соседа. Закрывает ограничение БД.
    const o = await makeOwner();
    await Promise.all([issue(o.email, ip()), issue(o.email, ip()), issue(o.email, ip())]);

    const alive = await withService(async (c) => {
      const { rows } = await c.query<{ n: string }>(
        'select count(*)::text as n from password_reset_tokens where account_id = $1 and used_at is null',
        [o.accountId]);
      return Number(rows[0]!.n);
    });
    // Падает при: сделать индекс неуникальным.
    expect(alive, `живых токенов ${alive} — две двери там, где должна быть одна`).toBe(1);
  });
});

describe('AC-015.23 — лок TRY и с пространством имён, как у входа', () => {
  it('страж по исходнику', () => {
    const code = read('lib/password-reset.ts');
    expect(code).toContain('pg_try_advisory_xact_lock($1, hashtext($2))');
    expect(code).toContain('RESET_LOCK_NAMESPACE');
    // Ждущий лок копит ожидающих, каждый из которых держит соединение общего пула.
    expect(code, 'ждущий pg_advisory_xact_lock воспроизводит исчерпание пула')
      .not.toMatch(/[^_]pg_advisory_xact_lock/);
    expect(code).toContain('lock_timeout');
  });
});

describe('AC-015.15 — отправка письма ВНЕ транзакции', () => {
  it('СТРАЖ: модуль восстановления не принимает отправителя вовсе', () => {
    const code = read('lib/password-reset.ts');
    // Свойство сигнатур, а не порядка строк: вызвать сеть изнутри транзакции физически
    // нельзя, если функция отправителя не получает.
    for (const forbidden of ['EmailSender', 'sendViaResend', 'fetch(', 'resetEmail']) {
      expect(code, `${forbidden} в логике = сеть может оказаться внутри транзакции`)
        .not.toContain(forbidden);
    }
  });

  it('СТРАЖ: в маршруте отправка стоит ПОСЛЕ withService', () => {
    const code = read('app/api/auth/forgot/route.ts');
    const tx = code.indexOf('await withService(');
    const send = code.indexOf('await sendEmail(');
    expect(tx).toBeGreaterThan(-1);
    expect(send).toBeGreaterThan(-1);
    // Падает при R8: занести отправку внутрь транзакции.
    expect(tx, 'письмо отправляется внутри транзакции — соединение пула ждёт чужой сервис')
      .toBeLessThan(send);
  });
});

describe('AC-015.17 / AC-015.19 / AC-015.20 — ключ, ссылка, журнал', () => {
  it('ключ провайдера без права на дефолт в проде', () => {
    const code = read('lib/email.ts');
    // Падает при R10: дефолт '' вместо броска.
    expect(code).toContain("process.env.NODE_ENV === 'production'");
    expect(code).toMatch(/throw new Error\(/);
  });

  it('ссылка строится через urls.ts, а не собирается строкой', () => {
    const route = read('app/api/auth/forgot/route.ts');
    expect(route).toContain('passwordResetUrl(');
    // Падает при R15: собрать адрес литералом в обход baseUrl() без права на дефолт.
    expect(route, 'адрес собран строкой — ссылка в письме может уйти на localhost')
      .not.toMatch(/https?:\/\/\$\{/);
  });

  it('токен не попадает в журнал', () => {
    // Смотрим на ПЕРЕМЕННЫЕ, а не на текст: первая редакция этого стража ловила собственное
    // имя события 'reset_email_failed' — подстрока «email» внутри кавычек. Страж, красный на
    // верном коде, учит его переписывать, а не чинить.
    const route = read('app/api/auth/forgot/route.ts');
    const withoutStrings = route.replace(/'[^']*'/g, "''").replace(/`[^`]*`/g, '``');
    const blocks = withoutStrings.split('console.').slice(1);
    for (const block of blocks) {
      const call = block.slice(0, block.indexOf(');') + 1);
      expect(call, `токен или адрес уходят в журнал: console.${call.trim()}`)
        .not.toMatch(/\b(token|email|issued)\b/);
    }
  });

  it('таймаут внешнего вызова задан', () => {
    const code = read('lib/email.ts');
    // Время ответа провайдера нам не принадлежит, а поток в Node один. Без таймаута верхней
    // границы ожидания не существует вовсе.
    expect(code, 'нет таймаута на вызов почтового провайдера').toContain('AbortSignal.timeout');
  });
});

describe('AC-015.18 — валидация нового пароля ТА ЖЕ', () => {
  it('модуль восстановления не содержит своих проверок длины', () => {
    const code = read('lib/password-reset.ts');
    for (const own of ['PASSWORD_MIN_LENGTH', 'PASSWORD_MAX_LENGTH', '.length < 8', '.length > 200']) {
      expect(code, `в восстановлении своя проверка ${own}`).not.toContain(own);
    }
  });

  it('маршрут зовёт общую validNewPassword', () => {
    expect(read('app/api/auth/reset/route.ts')).toContain('validNewPassword(');
  });
});

describe('письмо', () => {
  it('содержит ссылку и не содержит пользовательского текста', () => {
    const m = resetEmail('a@example.com', 'https://proofwall.test/reset?token=XYZ');
    expect(m.text).toContain('https://proofwall.test/reset?token=XYZ');
    expect(m.html).toContain('https://proofwall.test/reset?token=XYZ');
    expect(m.to).toBe('a@example.com');
  });
});
