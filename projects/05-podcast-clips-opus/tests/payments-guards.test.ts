// Фича 30 payments — стражи по исходнику (слой 1): AC-16 заменяет страж ADR-005 «маршрутов оплаты нет».
// Каждый страж испытан мутацией: tests/run-payments-mutations.mjs (квитанция docs/features/payments/07_code_report.md).
import { describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { createGuestPageHandler } from '../apps/web/src/server/guest-page';

const SRC = ['apps', 'packages'];
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (/^(node_modules|dist|\.next|migrations)$/.test(name)) return [];
    return statSync(full).isDirectory() ? files(full) : /\.(ts|tsx|mjs|js)$/.test(name) ? [full] : [];
  });
}
function routes(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? routes(path.join(dir, entry.name))
    : /^(route|page)\.(ts|tsx|js|jsx)$/.test(entry.name) ? [path.join(dir, entry.name)] : []);
}
/** Каждый оператор `UPDATE account SET …`, чей список присваиваний (до WHERE) меняет колонку plan. */
export function planWriters(roots: readonly string[] = SRC): string[] {
  return roots.flatMap(files).flatMap((file) => {
    const code = readFileSync(file, 'utf8');
    return [...code.matchAll(/UPDATE\s+account\s+SET\s([\s\S]*?)\bWHERE\b/gi)]
      .filter((m) => /(^|[\s,])plan\s*=/.test(m[1]!)).map(() => file.split(path.sep).join('/'));
  }).sort();
}

describe('AC-16: ровно один вебхук, два маршрута оформления, три пути смены плана', () => {
  it('в дереве маршрутов оплаты ровно: вебхук ЮKassa, оформление, опрос, два экрана', () => {
    expect(routes('apps/web/src/app').filter(p => /yookassa|webhooks|payments|checkout|billing|upgrade/i.test(p)).map(p => p.split(path.sep).join('/')).sort()).toEqual([
      'apps/web/src/app/api/checkout/[intentId]/route.ts',
      'apps/web/src/app/api/checkout/route.ts',
      'apps/web/src/app/api/webhooks/yookassa/route.ts',
      'apps/web/src/app/upgrade/page.tsx',
      'apps/web/src/app/upgrade/return/page.tsx',
    ]);
    expect(readdirSync('apps/web/src/app/api/webhooks')).toEqual(['yookassa']);
    expect(readFileSync('apps/web/next.config.ts', 'utf8')).not.toMatch(/yookassa|webhooks|checkout|rewrites|redirects/i);
  });
  it('план аккаунта меняют ровно три оператора: оплата (grantPaidPlan), сторож (expirePaidPlans), оператор (setPlanByOperator)', () => {
    expect(planWriters()).toEqual(['packages/db/src/ops-set-plan.ts', 'packages/db/src/payments.ts', 'packages/db/src/payments.ts']);
    const payments = readFileSync('packages/db/src/payments.ts', 'utf8');
    expect(payments).toMatch(/async function grantPaidPlan[\s\S]*?UPDATE account SET plan = 'paid'/);
    expect(payments).toMatch(/export async function expirePaidPlans[\s\S]*?UPDATE account SET plan = 'free'/);
  });
  it('страж видит четвёртый путь, записанный иначе (присваивание не первым, без пробелов)', () => {
    const fake = "tx.query(`UPDATE account SET updated_at=now(),plan='paid' WHERE id=$1`)";
    expect([...fake.matchAll(/UPDATE\s+account\s+SET\s([\s\S]*?)\bWHERE\b/gi)].filter(m => /(^|[\s,])plan\s*=/.test(m[1]!))).toHaveLength(1);
    expect([..."UPDATE account SET plan_source='none' WHERE".matchAll(/UPDATE\s+account\s+SET\s([\s\S]*?)\bWHERE\b/gi)]
      .filter(m => /(^|[\s,])plan\s*=/.test(m[1]!))).toHaveLength(0);
  });
});

describe('порядок операций вебхука (security-operation-order) — по исходнику', () => {
  const handler = readFileSync('apps/web/src/server/billing-handler.ts', 'utf8');
  const hook = handler.slice(handler.indexOf('export function createPaymentWebhookHandler'));
  it('режим → сырые байты → адрес источника → сеть ЮKassa → перезапрос → запись', () => {
    const order = ['if (!provider) return notFound()', 'readRawBody(request, MAX_NOTIFICATION_BYTES)', 'clientIp(request.headers, deps.trustedProxyHops)',
      'verifyYooKassaOrigin(sourceIp)', 'provider.verifyNotification(', 'deps.recordRefund(', 'deps.applyPayment('].map(s => hook.indexOf(s));
    expect(order.every(i => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
  it('в маршрутах оплаты нет транзакций: сеть ЮKassa никогда не держит соединение пула', () => {
    expect(handler).not.toMatch(/transaction\(|BEGIN|pool\.connect/);
  });
  it('внутри транзакции оплаты: ключ повторности ПЕРВЫМ, затем блокировка платежа; сетевых вызовов нет', () => {
    const db = readFileSync('packages/db/src/payments.ts', 'utf8');
    for (const fn of ['export function applyVerifiedPayment', 'export function recordVerifiedRefund']) {
      const body = db.slice(db.indexOf(fn), db.indexOf('\n}\n', db.indexOf(fn)));
      expect(body.indexOf('claimEvent(')).toBeGreaterThan(0);
      expect(body.indexOf('claimEvent(')).toBeLessThan(body.indexOf('lockPayment('));
      expect(body).not.toMatch(/fetch\(|getPayment|verifyNotification/);
    }
    expect(db).toMatch(/GREATEST\(COALESCE\(plan_paid_until, now\(\)\), now\(\)\) \+ make_interval\(days => \$2\)/);
  });
  it('списание минут читает план БЕЗ блокировки строки аккаунта (ревью, круг 1, находка 2: probe держит video, удаление — account → video)', () => {
    const quota = readFileSync('packages/db/src/quota.ts', 'utf8');
    const read = quota.slice(quota.indexOf("scope === 'user_minutes' && (await tx.query"), quota.indexOf('const args = [scope'));
    expect(read).toContain('effectivePlanSql');
    expect(read).not.toMatch(/FOR\s+(SHARE|UPDATE|NO\s+KEY|KEY)/i);
  });
  it('недоступность ЮKassa — исключение, а не возвращаемое значение (урок N1)', () => {
    const code = readFileSync('apps/web/src/server/payments/yookassa.ts', 'utf8');
    expect(code).toMatch(/if \(!response\.ok\) throw new PaymentProviderUnavailable/);
    expect(code).not.toMatch(/return\s+\{[^}]*unavailable/i);
  });
});

describe('конфигурация стенда (AC-14)', () => {
  const compose = readFileSync('docker-compose.yml', 'utf8');
  it('compose подставляет off ТОЛЬКО для незаданной переменной — явно пустая доходит до preflight', () => {
    expect(compose).toContain('N5_PAYMENTS_MODE: ${N5_PAYMENTS_MODE-off}');
    expect(compose).not.toMatch(/N5_PAYMENTS_MODE:-/);
  });
  it('ключи магазина — только у web; потолок минут paid — обязательный ${…:?} для всех, кто списывает минуты', () => {
    expect(compose.match(/^\s+YOOKASSA_SECRET_KEY:/gm)).toHaveLength(1);
    const web = compose.slice(compose.indexOf('  web:'), compose.indexOf('  worker-stt:'));
    expect(web).toContain('YOOKASSA_SECRET_KEY: ${YOOKASSA_SECRET_KEY-}');
    expect(compose).toMatch(/N5_LIMIT_PAID_USER_MINUTES: \$\{N5_LIMIT_PAID_USER_MINUTES:\?/);
  });
});

describe('гостевая страница при включённой оплате', () => {
  it('ссылка на /upgrade без скрипта интереса; при off — прежний блок интереса', async () => {
    const pack = { id: 'p', code: 'c'.repeat(32), account_id: 'owner', guest_name: 'Анна', partner_code: null, expires_at: new Date('2026-10-10T00:00:00Z'),
      clips: [{ clip_id: 'c1', title: 'Клип', available: true }] };
    const page = async (paymentsOn?: boolean) => (await createGuestPageHandler({ referralSecret: 's', trustedProxyHops: 1, paymentsOn,
      auth: { authenticate: vi.fn().mockResolvedValue(null) }, allowRead: vi.fn().mockResolvedValue(true),
      guests: { find: vi.fn().mockResolvedValue(pack), recordOpen: vi.fn() } as never })(new Request('https://x.test/g/c', { headers: { 'x-forwarded-for': '192.0.2.1, 127.0.0.1' } }), pack.code)).text();
    const on = await page(true), off = await page();
    expect(on).toContain('href="/upgrade?from=guest_page"'); expect(on).not.toContain('pro-interest');
    expect(on).toContain("getElementById('download-all')");
    // Ревью, круг 1, находка 1: массовое скачивание берёт только ссылки клипов, а не ссылку тарифа с тем же классом.
    expect(on).toContain("querySelectorAll('.clips a[download]')");
    expect(on).not.toContain("querySelectorAll('a.download')");
    expect(on.match(/<a class="download" href="\/upgrade/g)).toHaveLength(1);
    expect(off).toContain('id="pro-interest"'); expect(off).not.toContain('/upgrade');
  });
});
