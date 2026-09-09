
import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const DB_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!DB_URL) throw new Error('TEST_DATABASE_URL не задан');
process.env.DATABASE_URL = DB_URL;
process.env.SESSION_SECRET = 'test-secret-at-least-16-chars-long';
process.env.BASE_URL = 'https://proofwall.test';
process.env.YANDEX_CLIENT_ID = 'test-client-id';
process.env.YANDEX_CLIENT_SECRET = 'test-client-secret';

const { withService, closePool } = await import('@proofwall/db');
const { registerAccountAndProject } = await import('../src/lib/register');
const { attemptLogin } = await import('../src/lib/login');
const { resolveSsoAccount } = await import('../src/lib/sso-account');
const { changePassword } = await import('../src/lib/password-change');
const sso = await import('../src/lib/sso');
const { GET: callback, SSO_IP_THRESHOLD } = await import('../src/app/api/auth/yandex/callback/route');

afterAll(async () => { await closePool(); });

const SRC = path.resolve(__dirname, '../src');
const strip = (c: string) =>
  c.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/'[^']*'|"[^"]*"|`[^`]*`/g, "''");
const raw = (rel: string) => readFileSync(path.resolve(SRC, rel), 'utf8');
const read = (rel: string) => strip(raw(rel));

const PW = 'correct-horse-battery-staple';
const RUN = `${process.pid}-${Date.now().toString(36)}`;
let seq = 0;
const uniq = () => { seq += 1; return `${RUN}-${seq}`; };
let ipSeq = 0;
const ip = () => {
  ipSeq += 1;
  const a = 10;
  const b = (process.pid + ipSeq) % 250 + 1;
  const c = Math.floor(Date.now() / 1000) % 250 + 1;
  const d = ipSeq % 250 + 1;
  return `${a}.${b}.${c}.${d}`;
};

/** Учётка С ПАРОЛЕМ — через обычную регистрацию. */
async function makePasswordOwner() {
  const slug = `sso-${uniq()}`;
  const email = `${slug}@example.com`;
  const r = await withService((c) => registerAccountAndProject(c, {
    email, password: PW, desired_slug: slug, project_name: 'SSO',
  }));
  if (!r.ok) throw new Error(JSON.stringify(r.body));
  const { rows } = await withService((c) =>
    c.query<{ id: string }>('select id from accounts where email = $1', [email]));
  return { accountId: rows[0]!.id, email };
}

const resolve = (extId: string, email: string) =>
  withService((c) => resolveSsoAccount(c, 'yandex', extId, email));

const accountRow = (email: string) => withService(async (c) => {
  const { rows } = await c.query<{ id: string; password_hash: string | null }>(
    'select id, password_hash from accounts where email = $1', [email]);
  return rows;
});

const identityRows = (extId: string) => withService(async (c) => {
  const { rows } = await c.query<{ account_id: string }>(
    'select account_id from sso_identities where provider = $1 and external_id = $2',
    ['yandex', extId]);
  return rows;
});

describe('AC-016.8 — состояние попытки (state)', () => {
  it('подписанное состояние разбирается обратно', () => {
    const packed = sso.packState({ state: 'abc', verifier: 'v', expiresAt: Date.now() + 60_000 });
    expect(sso.unpackState(packed)).toMatchObject({ state: 'abc', verifier: 'v' });
  });

  it('подделанная подпись отвергается', () => {
    const packed = sso.packState({ state: 'abc', verifier: 'v', expiresAt: Date.now() + 60_000 });
    const [payload] = packed.split('.');
    expect(sso.unpackState(`${payload}.deadbeef`)).toBeNull();
  });

  it('подменённое тело при валидной форме отвергается', () => {
    const evil = Buffer.from(JSON.stringify({
      state: 'evil', verifier: 'v', expiresAt: Date.now() + 60_000,
    })).toString('base64url');
    const packed = sso.packState({ state: 'abc', verifier: 'v', expiresAt: Date.now() + 60_000 });
    const mac = packed.split('.')[1];
    expect(sso.unpackState(`${evil}.${mac}`)).toBeNull();
  });

  it('истёкшее отвергается', () => {
    const packed = sso.packState({ state: 'abc', verifier: 'v', expiresAt: Date.now() - 1 });
    expect(sso.unpackState(packed)).toBeNull();
  });

  it('мусор любой формы отвергается, а не роняет', () => {
    for (const bad of [undefined, '', '.', 'no-dot', 'a.b', '....', 'x'.repeat(5000)]) {
      expect(sso.unpackState(bad as string | undefined), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe('AC-016.8 — PKCE', () => {
  it('challenge — это base64url(sha256(verifier)), а не сам verifier', () => {
    const v = sso.generateVerifier();
    const c = sso.challengeFor(v);
    expect(c).not.toBe(v);
    expect(c).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(sso.challengeFor(v)).toBe(c);
  });

  it('адрес согласия несёт challenge и S256, но НЕ несёт verifier', () => {
    const v = sso.generateVerifier();
    const url = sso.authorizeUrl('st', v);
    expect(url).toContain('code_challenge_method=S256');
    expect(url).toContain(encodeURIComponent(sso.challengeFor(v)));
    expect(url).not.toContain(v);
    expect(url).not.toContain('client_secret');
  });
});

describe('AC-016.14 — провайдер недоступен', () => {
  const withFetch = async (impl: typeof fetch, fn: () => Promise<unknown>) => {
    const original = globalThis.fetch;
    globalThis.fetch = impl;
    try { return await fn(); } finally { globalThis.fetch = original; }
  };

  it('сетевая ошибка → SsoUnavailableError, а не сырой сбой', async () => {
    await withFetch(
      (() => Promise.reject(new Error('ECONNREFUSED'))) as unknown as typeof fetch,
      async () => {
        await expect(sso.exchangeCode('code', 'v')).rejects.toBeInstanceOf(sso.SsoUnavailableError);
      },
    );
  });

  it('5xx от провайдера → SsoUnavailableError', async () => {
    await withFetch(
      (() => Promise.resolve(new Response('', { status: 502 }))) as unknown as typeof fetch,
      async () => {
        await expect(sso.exchangeCode('code', 'v')).rejects.toBeInstanceOf(sso.SsoUnavailableError);
      },
    );
  });

  it('ответ без access_token → отказ, а не undefined дальше по коду', async () => {
    await withFetch(
      (() => Promise.resolve(Response.json({ token_type: 'bearer' }))) as unknown as typeof fetch,
      async () => {
        await expect(sso.exchangeCode('code', 'v')).rejects.toBeInstanceOf(sso.SsoUnavailableError);
      },
    );
  });

  it('профиль без id → отказ: ключа учётной записи нет, впускать некуда', async () => {
    await withFetch(
      (() => Promise.resolve(Response.json({ default_email: 'a@b.c' }))) as unknown as typeof fetch,
      async () => {
        await expect(sso.fetchProfile('tok')).rejects.toBeInstanceOf(sso.SsoUnavailableError);
      },
    );
  });

  it('профиль без email → отказ с указанием на права login:email', async () => {
    await withFetch(
      (() => Promise.resolve(Response.json({ id: '42' }))) as unknown as typeof fetch,
      async () => {
        await expect(sso.fetchProfile('tok')).rejects.toThrow(/login:email/);
      },
    );
  });

  it('успешный профиль отдаёт СЫРОЙ адрес — нормализует вызывающий', async () => {
    await withFetch(
      (() => Promise.resolve(Response.json({ id: '42', default_email: '  MiXeD@Example.COM ' }))) as unknown as typeof fetch,
      async () => {
        const p = await sso.fetchProfile('tok');
        expect(p.externalId).toBe('42');
        expect(p.email).toBe('  MiXeD@Example.COM ');
      },
    );
  });
});

describe('AC-016.15 — секретов нет', () => {
  it('authorizeUrl отказывается строить адрес без client_id', () => {
    const saved = process.env.YANDEX_CLIENT_ID;
    delete process.env.YANDEX_CLIENT_ID;
    try {
      expect(() => sso.authorizeUrl('s', 'v')).toThrow(sso.SsoNotConfiguredError);
      expect(sso.ssoConfigured()).toBe(false);
    } finally {
      process.env.YANDEX_CLIENT_ID = saved;
    }
  });

  it('пустая строка — тоже «не задан», а не валидное значение', () => {
    const saved = process.env.YANDEX_CLIENT_SECRET;
    process.env.YANDEX_CLIENT_SECRET = '   ';
    try {
      expect(sso.ssoConfigured()).toBe(false);
    } finally {
      process.env.YANDEX_CLIENT_SECRET = saved;
    }
  });
});

describe('AC-016.11 — сеть СНАРУЖИ транзакции', () => {
  it('политика связывания не импортирует сетевой слой', () => {
    expect(raw('lib/sso-account.ts')).not.toMatch(/from ['"]\.\/sso['"]/);
    expect(read('lib/sso-account.ts')).not.toMatch(/\bfetch\s*\(/);
  });

  it('сетевой слой не импортирует ни withService, ни политику', () => {
    expect(read('lib/sso.ts')).not.toMatch(/withService|withAccount/);
    const imports = raw('lib/sso.ts').split('\n').filter((l) => /^\s*import /.test(l)).join('\n');
    expect(imports).not.toMatch(/sso-account/);
  });

  it('в коллбэке withService открывается ПОСЛЕ обмена кода', () => {
    const code = read('app/api/auth/yandex/callback/route.ts');
    const exchange = code.indexOf('exchangeCode(');
    const tx = code.lastIndexOf('withService(');
    expect(exchange).toBeGreaterThan(-1);
    expect(tx).toBeGreaterThan(exchange);
  });
});

describe('AC-016.12 — таймаут на КАЖДОМ внешнем вызове', () => {
  it('число fetch равно числу signal во всём apps/web', () => {
    const files = ['lib/sso.ts', 'lib/email.ts', 'lib/payment.ts'];
    for (const f of files) {
      const code = read(f);
      const fetches = (code.match(/\bfetch\s*\(/g) ?? []).length;
      const signals = (code.match(/signal:/g) ?? []).length;
      expect(signals, `${f}: fetch=${fetches} signal=${signals}`).toBeGreaterThanOrEqual(fetches);
    }
  });

  it('sso.ts использует AbortSignal.timeout, а не голый fetch', () => {
    const code = read('lib/sso.ts');
    expect(code).toMatch(/AbortSignal\.timeout\(SSO_TIMEOUT_MS\)/);
  });
});

describe('AC-016.13 — единственная точка выдачи сессии', () => {
  it('insert into sessions не появился в модулях SSO', () => {
    for (const f of ['lib/sso.ts', 'lib/sso-account.ts',
                     'app/api/auth/yandex/callback/route.ts',
                     'app/api/auth/yandex/start/route.ts']) {
      expect(raw(f), f).not.toMatch(/insert\s+into\s+sessions/i);
    }
  });
});

describe('AC-016.17 — секреты и коды не утекают в журнал', () => {
  it('ни console, ни логгер не вызываются с code, token или secret', () => {
    for (const f of ['lib/sso.ts', 'lib/sso-account.ts',
                     'app/api/auth/yandex/callback/route.ts']) {
      const code = read(f);
      expect(code, f).not.toMatch(/console\.(log|info|warn|error)/);
      expect(code, f).not.toMatch(/JSON\.stringify\((data|profile|saved)\)/);
    }
  });

  it('client_secret не попадает в адрес страницы согласия', () => {
    expect(sso.authorizeUrl('s', sso.generateVerifier())).not.toContain('secret');
  });
});

describe('AC-016.18 — нормализация адреса ЕДИНСТВЕННАЯ', () => {
  it('sso.ts не объявляет своей нормализации', () => {
    const code = read('lib/sso.ts');
    expect(code).not.toMatch(/toLowerCase\(\)/);
  });

  it('коллбэк нормализует канонической функцией из login.ts', () => {
    const code = read('app/api/auth/yandex/callback/route.ts');
    expect(code).toMatch(/normalizeEmail\(profile\.email\)/);
    expect(raw('app/api/auth/yandex/callback/route.ts')).toMatch(/from '@\/lib\/login'/);
  });
});

describe('AC-016.9 — state гасится ДО сетевых вызовов', () => {
  it('clearState объявлен раньше обмена кода', () => {
    const code = read('app/api/auth/yandex/callback/route.ts');
    expect(code.indexOf('clearState')).toBeLessThan(code.indexOf('exchangeCode('));
  });

  it('ПОСЛЕ чтения cookie ни один возврат не обходит clearState', () => {
    const code = read('app/api/auth/yandex/callback/route.ts');
    const from = code.indexOf('const saved =');
    expect(from).toBeGreaterThan(-1);
    const tail = code.slice(from);

    expect(tail).not.toMatch(/return\s+back\(/);
    expect(tail).toMatch(/return clearState\(response\)/);
  });
});

describe('AC-016.16 — лимит на коллбэке ДО сети', () => {
  it('rateLimit.exceeded вызывается раньше exchangeCode', () => {
    const code = read('app/api/auth/yandex/callback/route.ts');
    expect(code.indexOf('rateLimit.exceeded')).toBeLessThan(code.indexOf('exchangeCode('));
  });
});


const callbackReq = (params: Record<string, string>, cookie?: string, addr = ip()) =>
  new Request(`https://proofwall.test/api/auth/yandex/callback?${new URLSearchParams(params)}`, {
    headers: {
      ...(cookie ? { cookie: `${sso.SSO_STATE_COOKIE}=${cookie}` } : {}),
      'x-forwarded-for': addr,
    },
  });

const reason = (r: Response) =>
  new URL(r.headers.get('location') ?? 'https://x/').searchParams.get('sso');

describe('AC-016.8 — сверка state НА МАРШРУТЕ', () => {
  it('валидная cookie, но ЧУЖОЙ state в адресе → отказ, сети не было', async () => {
    const packed = sso.packState({
      state: 'ours', verifier: sso.generateVerifier(), expiresAt: Date.now() + 60_000,
    });
    let called = 0;
    const original = globalThis.fetch;
    globalThis.fetch = (async () => { called += 1; return Response.json({ access_token: 't' }); }) as unknown as typeof fetch;
    try {
      const r = await callback(callbackReq({ code: 'c', state: 'theirs' }, packed));
      expect(reason(r)).toBe('invalid_state');
      expect(called, 'провайдер был вызван при несовпадении state').toBe(0);
    } finally { globalThis.fetch = original; }
  });

  it('cookie нет вовсе → отказ', async () => {
    const r = await callback(callbackReq({ code: 'c', state: 's' }));
    expect(reason(r)).toBe('invalid_state');
  });

  it('cookie истёкшая → отказ', async () => {
    const packed = sso.packState({ state: 's', verifier: 'v', expiresAt: Date.now() - 1 });
    const r = await callback(callbackReq({ code: 'c', state: 's' }, packed));
    expect(reason(r)).toBe('invalid_state');
  });

  it('отказ гасит cookie состояния', async () => {
    const r = await callback(callbackReq({ code: 'c', state: 's' }));
    const setCookie = r.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain(sso.SSO_STATE_COOKIE);
    expect(setCookie).toMatch(/Max-Age=0/i);
  });
});

describe('AC-016.16 — лимит на коллбэке ДЕЙСТВУЕТ, а не просто написан', () => {
  it(`попытка №${SSO_IP_THRESHOLD + 1} с одного адреса получает too_many`, async () => {
    const addr = ip();
    let last: Response | null = null;
    for (let i = 0; i <= SSO_IP_THRESHOLD; i += 1) {
      last = await callback(callbackReq({ code: 'c', state: 's' }, undefined, addr));
    }
    expect(reason(last!)).toBe('too_many');
  }, 20_000);

  it('другой адрес не наказан за соседа', async () => {
    const r = await callback(callbackReq({ code: 'c', state: 's' }, undefined, ip()));
    expect(reason(r)).toBe('invalid_state');
  });
});


describe('AC-016.19 — успешный вход ведёт на СУЩЕСТВУЮЩУЮ страницу', () => {
  const pages = () => {
    const { readdirSync, statSync } = require('node:fs') as typeof import('node:fs');
    const walk = (dir: string, base = ''): string[] =>
      readdirSync(dir).flatMap((e) => {
        const full = path.join(dir, e);
        if (statSync(full).isDirectory()) return walk(full, `${base}/${e}`);
        return e === 'page.tsx' ? [base || '/'] : [];
      });
    return walk(path.resolve(SRC, 'app'));
  };

  it('КАЖДЫЙ адрес перехода после входа существует как страница', () => {
    const code = raw('app/api/auth/yandex/callback/route.ts');
    const targets = [...code.matchAll(/`\$\{baseUrl\(\)\}([^`]*)`/g)].map((m) => m[1] || '/');
    expect(targets.length, 'адресов перехода не найдено — проверять нечего').toBeGreaterThan(0);

    const routes = pages();
    const matches = (target: string): boolean => {
      const t = target.replace(/\?.*$/, '').split('/').filter(Boolean);
      return routes.some((r) => {
        const seg = r.split('/').filter(Boolean);
        if (seg.length !== t.length) return false;
        return seg.every((x, i) => x === t[i] || (/^\[.+\]$/.test(x) && /\$\{.+\}/.test(t[i]!)));
      });
    };

    for (const target of targets) {
      expect(matches(target), `после входа уводит на ${target}, а такой страницы нет`).toBe(true);
    }
  });

  it('владелец с проектом уходит на его кабинет, без проектов — на главную', () => {
    const code = raw('app/api/auth/yandex/callback/route.ts');
    expect(code).toMatch(/resolution\.projects\[0\]/);
    expect(code).toMatch(/dashboard\/\$\{first\.slug\}/);
    expect(code).toMatch(/: `\$\{baseUrl\(\)\}\/`/);
  });
});


describe('AC-016.20 — гонка SSO против ОБЫЧНОЙ РЕГИСТРАЦИИ на тот же адрес', () => {
  it('ни при каком исходе SSO не впускает в учётку с паролем', async () => {
    for (let round = 0; round < 10; round += 1) {
      const slug = `race2-${uniq()}`;
      const email = `${slug}@example.com`;
      const extId = `race2-${uniq()}`;

      const [reg, sso2] = await Promise.allSettled([
        withService((c) => registerAccountAndProject(c, {
          email, password: PW, desired_slug: slug, project_name: 'Гонка',
        })),
        resolve(extId, email),
      ]);

      expect(await accountRow(email), `раунд ${round}`).toHaveLength(1);
      const row = (await accountRow(email))[0]!;

      if (sso2.status === 'fulfilled' && sso2.value.kind === 'linked') {
        expect(row.password_hash, `раунд ${round}: SSO впустил в учётку С ПАРОЛЕМ`).toBeNull();
      }
      if (row.password_hash !== null) {
        expect(
          sso2.status === 'fulfilled' && sso2.value.kind === 'needs_password_login',
          `раунд ${round}: у учётки пароль, а SSO не отказал`,
        ).toBe(true);
      }
      void reg;
    }
  }, 30_000);

  it('страж: повторная проверка пароля после проигранной гонки не удалена', () => {
    const code = read('lib/sso-account.ts');
    // Both collision branches must require the exact provider identity, including
    // passwordless accounts. Counting password checks missed that ownership rule.
    expect(code).toMatch(/if \(account\) \{[\s\S]*if \(!same\.rows\[0\]\) return/);
    expect(code).toMatch(/if \(!same\.rows\[0\] \|\| same\.rows\[0\]\.account_id !== winner\.id\) return/);
    expect(code).toMatch(/if \(winner\.has_password\) return/);
  });
});


describe('AC-016.21 — тексты отказов не зовут на несуществующие страницы', () => {
  const pages = () => {
    const { readdirSync, statSync } = require('node:fs') as typeof import('node:fs');
    const walk = (dir: string, base = ''): string[] =>
      readdirSync(dir).flatMap((e) => {
        const full = path.join(dir, e);
        if (statSync(full).isDirectory()) return walk(full, `${base}/${e}`);
        return e === 'page.tsx' ? [base || '/'] : [];
      });
    return walk(path.resolve(SRC, 'app'));
  };

  it('ни один текст не отсылает в «настройки», пока их нет', () => {
    const code = raw('app/login/page.tsx');
    const messages = code.slice(code.indexOf('SSO_MESSAGES'), code.indexOf('export default'));
    const hasSettingsPage = pages().some((r) => /settings|настрой/i.test(r));
    if (!hasSettingsPage) {
      const values = messages.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
      expect(values, 'текст зовёт в настройки, которых не существует')
        .not.toMatch(/в настройках|в настройки/);
    }
  });
});
