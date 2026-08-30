// FR-009 — вход в систему.
//
// Инварианты, каждый из которых при поломке стоит доступа или безопасности:
// одинаковый ответ и время для «нет учётки» и «неверный пароль»; лимит, который
// действительно записывается и не обходится параллельно; сессия, выдаваемая
// ЕДИНСТВЕННОЙ функцией; разбор тела вне транзакции.
//
// Часть проверок — по ИСХОДНИКУ, а не по поведению: свойства вроде «argon2 считается
// всегда» и «разбор тела не внутри транзакции» относятся ко всем путям кода, включая
// те, которых сегодня нет. Поведенческий тест подтвердил бы только пройденный путь.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import type { PoolClient } from 'pg';

const DB_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!DB_URL) throw new Error('TEST_DATABASE_URL не задан');
process.env.DATABASE_URL = DB_URL;
process.env.SESSION_SECRET = 'test-secret-at-least-16-chars-long';
process.env.BASE_URL = 'https://proofwall.test';

const { withService, closePool, rateLimit } = await import('@proofwall/db');
const { registerAccountAndProject } = await import('../src/lib/register');
const {
  attemptLogin, hashKey, normalizeEmail, warmUpDummyHash,
  PAIR_SCOPE, IP_SCOPE, PAIR_THRESHOLD, IP_THRESHOLD, WINDOW,
} = await import('../src/lib/login');
const { PASSWORD_MAX_LENGTH } = await import('../src/lib/password');

const SRC = path.resolve(__dirname, '../src');
const strip = (code: string) =>
  code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const read = (rel: string) => strip(readFileSync(path.resolve(SRC, rel), 'utf8'));

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

async function inRollback<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  return withService(async (client) => {
    const result = await fn(client);
    throw Object.assign(new Error('__rollback__'), { __result: result });
  }).catch((err: Error & { __result?: T }) => {
    if (err.message === '__rollback__') return err.__result as T;
    throw err;
  });
}

let seq = 0;
const PASSWORD = 'correct-horse-battery';
async function makeOwner(c: PoolClient): Promise<{ email: string; slug: string }> {
  seq += 1;
  const slug = `login-${seq}-${Date.now().toString(36)}`;
  const email = `${slug}@example.com`;
  const res = await registerAccountAndProject(c, {
    email, password: PASSWORD, desired_slug: slug, project_name: 'Login',
  });
  if (!res.ok) throw new Error(`регистрация не удалась: ${JSON.stringify(res.body)}`);
  return { email, slug };
}

beforeAll(async () => { await warmUpDummyHash(); });
afterAll(async () => { await closePool(); });

// ─────────────────────────────────────────────────────────────────────────────
describe('вход выдаёт сессию и список проектов', () => {
  it('верная пара -> ok, токен и проекты', async () => {
    await inRollback(async (c) => {
      const { email, slug } = await makeOwner(c);
      const r = await attemptLogin(c, email, PASSWORD, '1.2.3.4');
      expect(r.ok, 'вход не удался при верном пароле').toBe(true);
      if (!r.ok) return;
      expect(r.token.length).toBeGreaterThan(20);
      expect(r.projects.map((p) => p.slug)).toEqual([slug]);
      expect(r.projects[0]!.urls.dashboard).toBe(`https://proofwall.test/dashboard/${slug}`);
    });
  });

  it('email нечувствителен к регистру и пробелам', async () => {
    await inRollback(async (c) => {
      const { email } = await makeOwner(c);
      const r = await attemptLogin(c, normalizeEmail(`  ${email.toUpperCase()}  `), PASSWORD, '1.2.3.4');
      expect(r.ok, 'регистрация нормализует email — вход обязан так же').toBe(true);
    });
  });

  it('несколько проектов: порядок ДЕТЕРМИНИРОВАН по created_at', async () => {
    await inRollback(async (c) => {
      const { email, slug } = await makeOwner(c);
      const { rows } = await c.query<{ account_id: string }>(
        'select account_id from projects where slug = $1', [slug],
      );
      const second = `${slug}-second`;
      await c.query(
        `insert into projects (account_id, slug, tier, noindex, created_at)
         values ($1, $2, 'free', true, now() + interval '1 minute')`,
        [rows[0]!.account_id, second],
      );
      const r = await attemptLogin(c, email, PASSWORD, '1.2.3.4');
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.projects.map((p) => p.slug), 'первым обязан идти более ранний').toEqual([slug, second]);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('отказ неразличим — иначе учётки перечисляются', () => {
  it('нет учётки / неверный пароль / пустой пароль дают ОДИН И ТОТ ЖЕ результат', async () => {
    await inRollback(async (c) => {
      const { email } = await makeOwner(c);
      const results = [
        await attemptLogin(c, 'no-such-user@example.com', PASSWORD, '9.9.9.1'),
        await attemptLogin(c, email, 'wrong-password-here', '9.9.9.2'),
        await attemptLogin(c, email, '', '9.9.9.3'),
      ];
      for (const r of results) expect(r).toEqual({ ok: false, tooMany: false });
      // Форма типа не даёт различить причины даже намеренно: поля reason не существует.
      expect(Object.keys(results[0]!).sort()).toEqual(['ok', 'tooMany']);
    });
  });

  it('пароль длиннее предела — тот же отказ, а не отдельный код', async () => {
    await inRollback(async (c) => {
      const { email } = await makeOwner(c);
      const r = await attemptLogin(c, email, 'x'.repeat(PASSWORD_MAX_LENGTH + 1), '9.9.9.4');
      expect(r).toEqual({ ok: false, tooMany: false });
    });
  });

  it('слишком длинный пароль ДОХОДИТ до argon2, а не отсекается раньше', async () => {
    // Ревью M-2: критерий был, проверки не было. Граница длины не отменяет вызов —
    // она подставляет пустую строку. Пропуск argon2 сделал бы этот ответ заметно
    // быстрее и дал бы оракул «такой пароль слишком длинный», то есть подсказку.
    await inRollback(async (c) => {
      const { email } = await makeOwner(c);
      const measure = async (pass: string) => {
        const t: number[] = [];
        for (let i = 0; i < 5; i += 1) {
          const t0 = performance.now();
          await attemptLogin(c, email, pass, `4.4.${i}.${Math.floor(Math.random() * 250)}`);
          t.push(performance.now() - t0);
        }
        return t.sort((a, b) => a - b)[2]!;
      };
      const long = await measure('x'.repeat(PASSWORD_MAX_LENGTH + 1));
      const wrong = await measure('wrong-password-here');
      const ratio = Math.max(long, wrong) / Math.max(1, Math.min(long, wrong));
      expect(ratio, `длинный пароль отвечает в ${ratio.toFixed(1)}x иначе — argon2 пропущен?`)
        .toBeLessThan(4);
    });
  });

  it('время ответа для НЕСУЩЕСТВУЮЩЕЙ учётки сопоставимо с неверным паролем', async () => {
    await inRollback(async (c) => {
      const { email } = await makeOwner(c);
      // ЭТО ДЫМОВАЯ ПРОВЕРКА, а не несущая. Несущая — страж по исходнику ниже
      // («в login.ts нет return до verifyPassword»): он детерминирован, а измерение
      // времени на общей машине зависит от соседей по CPU. Порог и число замеров
      // подобраны так, чтобы тест ловил ПОРЯДКОВУЮ разницу (ранний возврат делает
      // ответ в десятки раз быстрее) и не мигал от обычного шума планировщика.
      const SAMPLES = 7;
      const measure = async (mail: string, pass: string) => {
        const times: number[] = [];
        for (let i = 0; i < SAMPLES; i += 1) {
          const t0 = performance.now();
          await attemptLogin(c, mail, pass, `8.8.${i}.${Math.floor(Math.random() * 250)}`);
          times.push(performance.now() - t0);
        }
        times.sort((a, b) => a - b);
        return times[Math.floor(SAMPLES / 2)]!; // медиана
      };
      // Чередуем, чтобы прогрев и дрейф нагрузки задевали обе выборки одинаково.
      const absent = await measure('nobody@example.com', PASSWORD);
      const wrong = await measure(email, 'wrong-password-here');
      const absent2 = await measure('nobody-2@example.com', PASSWORD);
      const a = Math.min(absent, absent2);
      const ratio = Math.max(a, wrong) / Math.max(1, Math.min(a, wrong));
      expect(ratio, `медианы разошлись в ${ratio.toFixed(1)}x — ранний возврат вернулся?`)
        .toBeLessThan(4);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('лимит: записывается, срабатывает и не запирает лишних', () => {
  const ip = '7.7.7.7';

  it('неудача увеличивает ОБА счётчика ровно на 1', async () => {
    await inRollback(async (c) => {
      const { email } = await makeOwner(c);
      // Ключи считаются ПРОИЗВОДСТВЕННОЙ функцией: своя копия формулы разъехалась бы молча.
      const keyPair = hashKey(PAIR_SCOPE, email, ip);
      const keyIp = hashKey(IP_SCOPE, ip);
      const before = [
        await rateLimit.count(PAIR_SCOPE, keyPair, WINDOW, c),
        await rateLimit.count(IP_SCOPE, keyIp, WINDOW, c),
      ];
      await attemptLogin(c, email, 'wrong-password-here', ip);
      expect([
        await rateLimit.count(PAIR_SCOPE, keyPair, WINDOW, c),
        await rateLimit.count(IP_SCOPE, keyIp, WINDOW, c),
      ], 'без записи лимит не срабатывает никогда, а критерий «429» зеленеет на засеянной таблице')
        .toEqual([before[0]! + 1, before[1]! + 1]);
    });
  });

  it('УСПЕШНЫЙ вход не увеличивает ни один счётчик', async () => {
    await inRollback(async (c) => {
      const { email } = await makeOwner(c);
      const keyPair = hashKey(PAIR_SCOPE, email, ip);
      const keyIp = hashKey(IP_SCOPE, ip);
      const before = [
        await rateLimit.count(PAIR_SCOPE, keyPair, WINDOW, c),
        await rateLimit.count(IP_SCOPE, keyIp, WINDOW, c),
      ];
      expect((await attemptLogin(c, email, PASSWORD, ip)).ok).toBe(true);
      expect([
        await rateLimit.count(PAIR_SCOPE, keyPair, WINDOW, c),
        await rateLimit.count(IP_SCOPE, keyIp, WINDOW, c),
      ], 'запись при успехе заперла бы активного владельца им самим').toEqual(before);
    });
  });

  it(`${PAIR_THRESHOLD + 1}-я подряд неудача по паре даёт tooMany`, async () => {
    await inRollback(async (c) => {
      const { email } = await makeOwner(c);
      for (let i = 0; i < PAIR_THRESHOLD; i += 1) {
        expect(await attemptLogin(c, email, 'wrong-password-here', ip))
          .toEqual({ ok: false, tooMany: false });
      }
      expect(await attemptLogin(c, email, 'wrong-password-here', ip))
        .toEqual({ ok: false, tooMany: true });
    });
  });

  it('исчерпанная пара НЕ запирает того же владельца с ДРУГОГО адреса', async () => {
    await inRollback(async (c) => {
      const { email } = await makeOwner(c);
      for (let i = 0; i <= PAIR_THRESHOLD; i += 1) {
        await attemptLogin(c, email, 'wrong-password-here', ip);
      }
      // Это и есть отличие ключа-пары от ключа-email: счётчик по одному email был бы
      // примитивом «выключить чужую учётку» ценой пяти запросов.
      expect(await attemptLogin(c, email, PASSWORD, '7.7.7.8'),
        'счётчик ключуется парой email+IP — с другого адреса владелец обязан войти').toMatchObject({ ok: true });
    });
  });

  it('исчерпанная пара не мешает ДРУГОМУ владельцу с того же адреса', async () => {
    await inRollback(async (c) => {
      const a = await makeOwner(c);
      const b = await makeOwner(c);
      for (let i = 0; i <= PAIR_THRESHOLD; i += 1) {
        await attemptLogin(c, a.email, 'wrong-password-here', ip);
      }
      expect(await attemptLogin(c, b.email, PASSWORD, ip)).toMatchObject({ ok: true });
    });
  });

  it(`лимит по IP (${IP_THRESHOLD}) срабатывает поверх разных учёток`, async () => {
    await inRollback(async (c) => {
      const own = '6.6.6.6';
      const keyIp = hashKey(IP_SCOPE, own);
      // Засеиваем ровно порог — проверяем СРАБАТЫВАНИЕ, а не запись (она проверена выше).
      for (let i = 0; i < IP_THRESHOLD; i += 1) await rateLimit.record(IP_SCOPE, keyIp, c);
      const { email } = await makeOwner(c);
      expect(await attemptLogin(c, email, PASSWORD, own)).toEqual({ ok: false, tooMany: true });
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Свойства КОДА, а не одного прогона. Слой 1 по лестнице стоимости обнаружения.
describe('стражи по исходнику', () => {
  it('в login.ts НЕТ return до вызова verifyPassword — иначе оракул по времени', () => {
    const code = read('lib/login.ts');
    const body = code.slice(code.indexOf('export async function attemptLogin'));
    const verifyAt = body.indexOf('verifyPassword(');
    expect(verifyAt, 'verifyPassword не вызывается вовсе').toBeGreaterThan(-1);
    // Возвраты ДО argon2 допустимы только на лимитных ветках — они не зависят от того,
    // существует ли учётка, и потому оракула не создают.
    const before = body.slice(0, verifyAt);
    // \s* , а не \s+ : `return{ok:false}` без пробела прежний регэксп НЕ ВИДЕЛ,
    // и ранний возврат в такой записи проходил мимо стража (ревью M-1).
    const returns = before.match(/\breturn\b\s*[^;]+/g) ?? [];
    for (const r of returns) {
      expect(r, `возврат до argon2, не связанный с лимитом: ${r}`).toMatch(/tooMany:\s*true/);
    }
  });

  it('insert into sessions встречается РОВНО в одном файле', () => {
    const offenders = sourceFiles(SRC).filter((f) =>
      /insert\s+into\s+sessions/i.test(strip(readFileSync(f, 'utf8'))),
    );
    expect(offenders.map((f) => path.relative(SRC, f)),
      'вторая точка выдачи сессии = второй класс сессий, который разъедется молча')
      .toEqual([path.join('lib', 'session.ts')]);
  });

  it('разбор тела НЕ внутри транзакции — иначе исчерпание пула', () => {
    const route = read('app/api/auth/login/route.ts');
    const withServiceAt = route.indexOf('withService(');
    expect(withServiceAt).toBeGreaterThan(-1);
    const inside = route.slice(withServiceAt);
    for (const needle of ['JSON.parse', 'readBodyAtMost', 'request.json', 'request.body']) {
      expect(inside, `${needle} внутри withService удерживает соединение пула`).not.toContain(needle);
    }
    expect(read('lib/login.ts')).not.toContain('request');
  });

  it('блокировка только TRY — ждущая копит ожидающих, каждый держит соединение', () => {
    const code = read('lib/login.ts');
    expect(code).toContain('pg_try_advisory_xact_lock');
    expect(code, 'ждущий pg_advisory_xact_lock воспроизводит исчерпание пула')
      .not.toMatch(/[^_]pg_advisory_xact_lock/);
  });

  it('предел тела применён на ВСЕХ маршрутах, принимающих JSON-тело', () => {
    // L-2 ревью: у входа предел был, у регистрации нет — закрытой оставалась одна
    // дверь из двух. Реализация одна (lib/request-body.ts), копий быть не должно.
    //
    // FR-010 добавил третий маршрут. Он АУТЕНТИФИЦИРОВАН, и соблазн его сюда не
    // вносить реален — но сессия могла быть украдена, а список, не пополняемый вместе
    // с маршрутами, воспроизводит ровно ту находку L-2, ради которой страж и написан.
    for (const rel of [
      'app/api/auth/login/route.ts',
      'app/api/auth/register/route.ts',
      'app/api/auth/password/route.ts',
      'app/api/partner/session/route.ts',
    ]) {
      expect(read(rel), `${rel} не ограничивает размер тела`).toContain('readBodyAtMost');
    }
    const impls = sourceFiles(SRC).filter((f) =>
      /export\s+async\s+function\s+readBodyAtMost/.test(strip(readFileSync(f, 'utf8'))),
    );
    expect(impls.map((f) => path.relative(SRC, f)))
      .toEqual([path.join('lib', 'request-body.ts')]);
  });

  it('размер тела считается по байтам, а не по Content-Length', () => {
    const route = read('lib/request-body.ts');
    // РЕГИСТРОНЕЗАВИСИМО: toContain регистрозависим, и 'Content-Length' с заглавных
    // проходил бы мимо — fetch регистр заголовков игнорирует (ревью B-2).
    expect(route.toLowerCase(), 'Content-Length присылает клиент, а при chunked его нет вовсе')
      .not.toContain('content-length');
    // Наличия строки byteLength мало: ветка при ней может быть мёртвой. Настоящее
    // доказательство — поведенческий тест с потоковым телом в tests/login-route.test.ts.
    expect(route).toMatch(/total\s*\+=\s*value\.byteLength/);
    expect(route).toMatch(/if\s*\(\s*total\s*>\s*max\s*\)/);
  });

  it('normalizeEmail ОБЪЯВЛЕН ровно в одном файле', () => {
    // Два независимых экземпляра — не дублирование, а мина: регистрация нормализует email
    // одним способом, вход другим, и в день расхождения владелец не войдёт НИКОГДА.
    const offenders = sourceFiles(SRC).filter((f) =>
      /export\s+function\s+normalizeEmail\b/.test(strip(readFileSync(f, 'utf8'))),
    );
    expect(offenders.map((f) => path.relative(SRC, f)))
      .toEqual([path.join('lib', 'validation.ts')]);
  });

  it('конфиг пула не читает числа через голый Number(process.env)', () => {
    // Number('') === 0: пустое значение давало max: 0 (pg возвращается к 10) и
    // connectionTimeoutMillis: 0 (ожидание снова бесконечное) — обе меры D-010
    // отключались молча, ровно тем способом, от которого защищают.
    const db = strip(readFileSync(
      path.resolve(__dirname, '../../../packages/db/src/index.ts'), 'utf8'));
    expect(db).not.toMatch(/Number\(\s*process\.env\.PGPOOL/);
    expect(db).toContain('positiveIntFromEnv');
  });

  it('warmUpDummyHash вызывается в проде, а не только в тестах', () => {
    const route = read('app/api/auth/login/route.ts');
    expect(route, 'экспорт без вызова — ложное обещание: выглядит мерой, мерой не является')
      .toContain('warmUpDummyHash()');
  });

  it('со scope входа сравнивается ТОЛЬКО lib/login.ts', () => {
    // Объявлен в 04_refinement.md и не был написан — ревью нашло его отсутствие (M-6).
    // Смысл: значения scope задают, КУДА пишется счётчик. Сравнение с ними в другом
    // файле означает вторую точку принятия того же решения, и она разъедется молча.
    const offenders = sourceFiles(SRC).filter((f) => {
      if (f.endsWith(path.join('lib', 'login.ts'))) return false;
      const code = strip(readFileSync(f, 'utf8'));
      return /['"]login_(?:pair|ip)['"]/.test(code);
    });
    expect(offenders.map((f) => path.relative(SRC, f))).toEqual([]);
  });

  it('верхняя граница пароля применяется и на РЕГИСТРАЦИИ, не только на входе', () => {
    expect(read('lib/register.ts'), 'закрыть вход и оставить регистрацию — одна дверь из двух')
      .toContain('PASSWORD_MAX_LENGTH');
  });
});
