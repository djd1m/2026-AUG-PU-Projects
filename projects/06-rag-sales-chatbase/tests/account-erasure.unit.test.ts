// account-erasure без БД: порядок входа DELETE /api/account (лимит → Origin → сессия → тело → confirm → пароль → запрос),
// квитанция удаления (подпись, срок, подделка), вывод ops:erasure и СТРАЖИ ПО ИСХОДНИКУ (AC-14) — с самопроверкой, что
// каждый страж краснеет на испорченном исходнике (guard-must-be-able-to-fail).
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { createAccountDeleteHandler, createQuestionLogEraseHandler, type AccountDependencies } from '../apps/web/src/server/account-handler';
import { erasureCookie, readErasureReceipt, readReceiptCookie, signErasureReceipt } from '../apps/web/src/server/erasure-receipt';
import { erasureLines, owedLines } from '../packages/db/src/ops-erasure';
import { runIsolatedSteps } from '../apps/worker/src/watchdog-steps';

const ORIGIN = 'https://sufler.test.invalid';
const ACCOUNT = '11111111-1111-4111-8111-111111111111';
const SECRET = 'k'.repeat(64);

function deps(calls: string[], over: Partial<AccountDependencies> = {}): AccountDependencies {
  return {
    publicOrigin: ORIGIN,
    authenticate: async () => { calls.push('auth'); return { account_id: ACCOUNT }; },
    allowMutation: async () => { calls.push('limit'); return true; },
    checkPassword: async () => { calls.push('password'); return true; },
    requestErasure: async () => { calls.push('erase'); return { kind: 'accepted', eraseDeadline: '2026-09-30T00:00:00.000Z' }; },
    receiptCookie: (id) => erasureCookie(id, SECRET),
    eraseQuestionLog: async () => { calls.push('log'); return { erased: 3 }; },
    log: () => {}, ...over,
  };
}
const request = (headers: Record<string, string>, body: unknown, method = 'DELETE') => new Request(`${ORIGIN}/api/account`, { method,
  headers: { 'x-forwarded-for': '203.0.113.7', 'content-type': 'application/json', cookie: `__Host-n6_session=${'A'.repeat(43)}`, ...headers }, body: JSON.stringify(body) });

describe('DELETE /api/account — порядок входа (AC-1)', () => {
  it('чужой Origin — 403 ДО тела и пароля; лимит — 429 до всего', async () => {
    const calls: string[] = [];
    expect((await createAccountDeleteHandler(deps(calls))(request({ origin: 'https://evil.example' }, { confirm: true, password: 'x' }))).status).toBe(403);
    expect(calls).toEqual(['auth', 'limit']);
    const limited: string[] = [];
    const r = await createAccountDeleteHandler(deps(limited, { allowMutation: async () => { limited.push('limit'); return false; } }))(request({ origin: ORIGIN }, { confirm: true, password: 'x' }));
    expect([r.status, limited]).toEqual([429, ['auth', 'limit']]);
  });
  it('без сессии — 401; лишнее поле, confirm не true, пустой пароль — 400 и пароль НЕ сверяется', async () => {
    const calls: string[] = [];
    expect((await createAccountDeleteHandler(deps(calls, { authenticate: async () => null }))(request({ origin: ORIGIN }, { confirm: true, password: 'x' }))).status).toBe(401);
    for (const body of [{ confirm: true, password: 'x', bot_id: ACCOUNT }, { confirm: 'true', password: 'x' }, { password: 'x' }, { confirm: true }, { confirm: true, password: '' },
      { confirm: true, password: 'я'.repeat(40) }]) {
      const seen: string[] = [];
      const r = await createAccountDeleteHandler(deps(seen))(request({ origin: ORIGIN }, body));
      expect(r.status, JSON.stringify(body)).toBe(400);
      expect(seen).not.toContain('password');
      expect(seen).not.toContain('erase');
    }
  });
  it('неверный пароль — 401 под полем, запроса удаления нет; успех — 202, квитанция и снятая сессия; «уже идёт» — 409', async () => {
    const wrong: string[] = [];
    const bad = await createAccountDeleteHandler(deps(wrong, { checkPassword: async () => { wrong.push('password'); return false; } }))(request({ origin: ORIGIN }, { confirm: true, password: 'x' }));
    expect([bad.status, ((await bad.json()) as { error: { field: string } }).error.field]).toEqual([401, 'password']);
    expect(wrong).not.toContain('erase');
    const calls: string[] = [];
    const ok = await createAccountDeleteHandler(deps(calls))(request({ origin: ORIGIN }, { confirm: true, password: 'x' }));
    expect(ok.status).toBe(202);
    expect(calls).toEqual(['auth', 'limit', 'password', 'erase']);
    const cookies = ok.headers.getSetCookie();
    expect(cookies.some((c) => c.startsWith('__Host-n6_erasure=') && c.includes('HttpOnly') && c.includes('Secure'))).toBe(true);
    expect(cookies.some((c) => c.startsWith('__Host-n6_session=;') && c.includes('Max-Age=0'))).toBe(true);
    const again = await createAccountDeleteHandler(deps([], { requestErasure: async () => ({ kind: 'already' }) }))(request({ origin: ORIGIN }, { confirm: true, password: 'x' }));
    expect(again.status).toBe(409);
  });
  it('стирание журнала вопросов: не uuid — 404 без записи; без confirm — 400; чужой — 404; своё — 200', async () => {
    const calls: string[] = [];
    const h = createQuestionLogEraseHandler(deps(calls));
    expect((await h(request({ origin: ORIGIN }, { confirm: true }, 'POST'), 'not-a-uuid')).status).toBe(404);
    expect((await h(request({ origin: ORIGIN }, {}, 'POST'), ACCOUNT)).status).toBe(400);
    expect(calls).not.toContain('log');
    expect((await createQuestionLogEraseHandler(deps([], { eraseQuestionLog: async () => null }))(request({ origin: ORIGIN }, { confirm: true }, 'POST'), ACCOUNT)).status).toBe(404);
    expect((await h(request({ origin: ORIGIN }, { confirm: true }, 'POST'), ACCOUNT)).status).toBe(200);
  });
});

describe('квитанция удаления (AC-13)', () => {
  it('подписанная читается; подделка, чужой секрет, истёкшая, мусор — null', () => {
    const now = Date.parse('2026-09-27T00:00:00Z');
    const good = signErasureReceipt(ACCOUNT, SECRET, now);
    expect(readErasureReceipt(good, SECRET, now)).toBe(ACCOUNT);
    const tampered = good.replace(/^1/, '2');
    for (const bad of [tampered, good.slice(0, -1) + (good.endsWith('0') ? '1' : '0'), 'garbage', '', undefined, null]) {
      expect(readErasureReceipt(bad, SECRET, now), String(bad)).toBeNull();
    }
    expect(readErasureReceipt(good, 'x'.repeat(64), now)).toBeNull();
    expect(readErasureReceipt(good, SECRET, now + 8 * 86_400_000)).toBeNull();
    expect(readReceiptCookie(`a=b; __Host-n6_erasure=${good}; c=d`)).toBe(good);
  });
});

describe('ops:erasure', () => {
  it('пусто — явное «нет», строки — срок, просрочка и ожидаемая выплата', () => {
    expect(erasureLines([])).toEqual(['Аккаунтов в удалении нет']);
    const [line] = erasureLines([{ account_id: ACCOUNT, email: 'a@b.ru', requested_at: '2026-09-27T00:00:00.000Z', deadline: '2026-09-30T00:00:00.000Z', overdue: true, waiting_payout_minor: 150_000 }]);
    expect(line).toContain('ПРОСРОЧЕНО');
    expect(line).toContain('ждёт выплату 1500,00 ₽');
  });
  it('owed — долг удалённому партнёру (A-N6-061): пусто — явное «нет», строка — почта для выплаты, долг и созревшее', () => {
    expect(owedLines([])).toEqual(['Долгов удалённым партнёрам нет']);
    const [line] = owedLines([{ account_id: ACCOUNT, payout_email: `deleted:${ACCOUNT}`, owed_minor: 250_000, available_minor: 200_000, erased_at: '2026-09-30T00:00:00.000Z' }]);
    expect(line).toContain(`deleted:${ACCOUNT}`);
    expect(line).toContain('долг 2500,00 ₽');
    expect(line).toContain('из них созрело 2000,00 ₽');
  });
});

// ── Стражи по исходнику (AC-14) ──
const ROOTS = ['apps/web/src', 'apps/worker/src', 'packages/db/src', 'packages/rag/src', 'packages/queue/src'];
function sources(): { file: string; code: string }[] {
  const out: { file: string; code: string }[] = [];
  const walk = (dir: string) => { for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full); else if (/\.(ts|tsx)$/.test(name)) out.push({ file: full, code: readFileSync(full, 'utf8') });
  } };
  for (const root of ROOTS) walk(root);
  return out;
}
// Путь к статусам erasing / deleted аккаунта: файлы, где встречается UPDATE account … status = 'erasing'|'deleted'.
export function accountStatusWriters(files: { file: string; code: string }[]): string[] {
  return files.filter(({ code }) => /UPDATE account SET[^`;]*?\bstatus\s*=\s*'(erasing|deleted)'/.test(code)).map((f) => f.file);
}
// В теле requestErasure — переход в erasing И боты deleted И ОДНА транзакция вокруг них.
export function requestErasureAtomic(code: string): boolean {
  const start = code.indexOf('export function requestErasure');
  if (start < 0) return false;
  const body = code.slice(start, code.indexOf('\n}\n', start));
  return /return transaction\(pool/.test(body) && /UPDATE bot SET status = 'deleted'/.test(body) && /status = 'erasing'/.test(body)
    && (body.match(/transaction\(/g) ?? []).length === 1;
}
// Проход сторожа воркера (повторное ревью, находка 4): стирание аккаунтов — ОТДЕЛЬНЫЙ шаг runIsolatedSteps, а не звено
// общей цепочки await после уборки тома: сбой sweepUploads не должен обрывать erasureTick.
export function erasureStepIsolated(code: string): boolean {
  const call = code.indexOf('runIsolatedSteps([');
  if (call < 0) return false;
  const steps = code.slice(call, code.indexOf(']))', call));
  return /run:\s*\(\)\s*=>\s*sweepUploads\(/.test(steps) && /run:\s*\(\)\s*=>\s*erasureTick\(/.test(steps) && !/await\s+(sweepUploads|erasureTick)\(/.test(code);
}
describe('проход сторожа воркера (повторное ревью, находка 4)', () => {
  it('сбой шага не обрывает следующие: уборка тома упала — стирание всё равно выполнено, сбой назван', async () => {
    const ran: string[] = [], lines: string[] = [];
    const result = await runIsolatedSteps([
      { name: 'a', run: async () => { ran.push('a'); } },
      { name: 'уборка тома uploads', run: async () => { throw Object.assign(new Error('EACCES: permission denied, unlink'), { code: 'EACCES' }); } },
      { name: 'стирание аккаунтов', run: async () => { ran.push('erase'); } },
    ], (line) => lines.push(line));
    expect(ran).toEqual(['a', 'erase']);
    expect(result.failed).toEqual(['уборка тома uploads']);
    expect(lines.join('\n')).toContain('уборка тома uploads');
  });
  it('страж: в воркере стирание — отдельный шаг; умеет падать на прежней цепочке await', () => {
    const worker = readFileSync('apps/worker/src/index.ts', 'utf8');
    expect(erasureStepIsolated(worker)).toBe(true);
    const chained = "startWatchdog(async () => {\n    await watchdogTick(pool, queue.enqueue);\n    await sweepUploads(pool, config.uploadDir);\n    await erasureTick(pool, config.uploadDir);\n  });";
    expect(erasureStepIsolated(chained)).toBe(false);
  });
});

describe('стражи по исходнику (AC-14)', () => {
  const erasure = readFileSync('packages/db/src/erasure.ts', 'utf8');
  it('единственный путь к erasing/deleted — packages/db/src/erasure.ts', () => {
    expect(accountStatusWriters(sources())).toEqual([path.join('packages/db/src', 'erasure.ts')]);
  });
  it('requestErasure: erasing и боты deleted в ОДНОЙ транзакции', () => { expect(requestErasureAtomic(erasure)).toBe(true); });
  it('стражи умеют падать: второй путь к deleted и перенос ботов из транзакции — красные', () => {
    const extra = { file: 'apps/web/src/server/evil.ts', code: "await pool.query(`UPDATE account SET status = 'deleted' WHERE id = $1`, [id]);" };
    expect(accountStatusWriters([...sources(), extra])).toHaveLength(2);
    expect(requestErasureAtomic(erasure.replace("await tx.query(`UPDATE bot SET status = 'deleted', public_enabled = false WHERE account_id = $1 AND status <> 'deleted'`, [accountId]);", ''))).toBe(false);
    expect(requestErasureAtomic(erasure.replace('return transaction(pool, async (tx) => {\n    const account = (await tx.query<{ status: string }>(\'SELECT status FROM account WHERE id = $1 FOR NO KEY UPDATE\'',
      "await transaction(pool, async () => null); return transaction(pool, async (tx) => {\n    const account = (await tx.query<{ status: string }>('SELECT status FROM account WHERE id = $1 FOR NO KEY UPDATE'"))).toBe(false);
  });
});

// Седьмое ревью (27.09), находка 2: свободный текст оператора о стираемом/стёртом аккаунте не появляется никогда — страж
// базы (два триггера BEFORE INSERT) и одна строка обезличивания у триггеров и прохода стирания.
describe('страж по исходнику: причина оператора о стёртом аккаунте', () => {
  const migration = readFileSync('packages/db/migrations/010_account_erasure.sql', 'utf8');
  const erasure = readFileSync('packages/db/src/erasure.ts', 'utf8');
  it('оба журнала (partner_audit, operator_action) — под триггером BEFORE INSERT, строка — ERASED_REASON', () => {
    const marker = /export const ERASED_REASON = '([^']+)'/.exec(erasure)?.[1];
    expect(marker).toBeTruthy();
    for (const table of ['partner_audit', 'operator_action']) {
      expect(migration, table).toMatch(new RegExp(`CREATE TRIGGER \\w+ BEFORE INSERT ON ${table}\\s+FOR EACH ROW EXECUTE FUNCTION erased_reason_${table}\\(\\);`));
      const body = new RegExp(`CREATE FUNCTION erased_reason_${table}\\(\\)[\\s\\S]*?END \\$\\$;`).exec(migration)?.[0] ?? '';
      expect(body, table).toContain(`NEW.reason := '${marker}'`);
      expect(body, table).toContain("status IN ('erasing', 'deleted')");
    }
    expect(erasure).toContain("UPDATE operator_action SET reason = '${ERASED_REASON}' WHERE account_id = $1");
  });
});
