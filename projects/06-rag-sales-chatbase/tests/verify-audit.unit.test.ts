// verify-audit (инцидент стенда 28.09, A-N6-077) без БД: маршрут отметки требует подтверждения снятия, запросы экрана
// разделены на «поставить» и «снять», разметка блока «Ответы на сайте» (две кнопки, подтверждение, строка «стоит с»,
// история), баннер после отметки не исчезает. SQL и журнал — tests/verify-audit.integration.test.ts; клики, двойное
// нажатие, Escape и фокус — tests/browser/verify-audit.test.ts.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createBotVerifyHandler, type CabinetDependencies } from '../apps/web/src/server/cabinet-handler';
import { requestUnverify, requestVerify } from '../apps/web/src/lib/verify-request';
import { UNSET_WARNING, VerifyBlock, verificationLine, type VerifyBlockProps } from '../apps/web/src/app/dashboard/bots/[botId]/VerifyBlock';
import { GateBanner, VERIFIED_DONE } from '../apps/web/src/app/dashboard/GateBanner';

const ORIGIN = 'https://sufler.test.invalid';
const BOT = '33333333-3333-4333-8333-333333333333';
const ACCOUNT = '11111111-1111-4111-8111-111111111111';
// Формат даты — ICU рантайма («28 сентября, 13:39» или «28 сентября в 13:39»): ожидание строится тем же форматом, что у экрана.
const when = (iso: string) => new Date(iso).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const T39 = '2026-09-28T10:39:00.000Z', T46 = '2026-09-28T10:46:00.000Z';

describe('POST /api/bots/{id}/verify — снятие только с подтверждением (AC-6)', () => {
  function run(body: unknown) {
    const seen: unknown[][] = [];
    const deps = {
      publicOrigin: ORIGIN, authenticate: async () => ({ account_id: ACCOUNT }), allowMutation: async () => true, log: () => {},
      setVerified: async (...args: unknown[]) => { seen.push(args); return { answers_verified: args[2] as boolean }; },
    } as unknown as CabinetDependencies;
    const request = new Request(`${ORIGIN}/api/bots/${BOT}/verify`, { method: 'POST', body: JSON.stringify(body),
      headers: { origin: ORIGIN, 'x-forwarded-for': '93.184.1.7', 'content-type': 'application/json', cookie: `__Host-n6_session=${'A'.repeat(43)}` } });
    return createBotVerifyHandler(deps)(request, BOT).then(async (r) => ({ status: r.status, body: await r.json() as { error?: { code: string } }, seen }));
  }
  it('{ verified: false } без confirm — 400 confirm_required, до записи (вкладка с прежним переключателем после выкладки)', async () => {
    for (const body of [{ verified: false }, { verified: false, confirm: false }]) {
      const r = await run(body);
      expect([r.status, r.body.error?.code, r.seen.length], JSON.stringify(body)).toEqual([400, 'confirm_required', 0]);
    }
  });
  it('confirm не boolean — 400 invalid до записи; confirm: true — снятие проходит; установке подтверждение не нужно', async () => {
    for (const body of [{ verified: false, confirm: 'true' }, { verified: false, confirm: 1 }, { verified: true, confirm: null }]) {
      const r = await run(body);
      expect([r.status, r.body.error?.code, r.seen.length], JSON.stringify(body)).toEqual([400, 'invalid', 0]);
    }
    expect((await run({ verified: false, confirm: true })).seen).toEqual([[BOT, ACCOUNT, false]]);
    expect((await run({ verified: true })).seen).toEqual([[BOT, ACCOUNT, true]]);
    expect((await run({ verified: true, confirm: true })).seen).toEqual([[BOT, ACCOUNT, true]]);
  });
});

describe('запросы экрана: «поставить» и «снять» — разные функции (AC-1)', () => {
  const sender = (calls: unknown[]) => (async (...args: unknown[]) => { calls.push(args); return { status: 200, body: { data: { answers_verified: args[2] && (args[2] as { verified: boolean }).verified } } }; }) as never;
  it('requestVerify шлёт { verified: true }, requestUnverify — { verified: false, confirm: true }', async () => {
    const calls: unknown[] = [];
    expect(await requestVerify(BOT, true, sender(calls))).toEqual({ ok: true, verified: true });
    expect(await requestUnverify(BOT, sender(calls))).toEqual({ ok: true, verified: false });
    expect(calls).toEqual([[`/api/bots/${BOT}/verify`, 'POST', { verified: true }], [`/api/bots/${BOT}/verify`, 'POST', { verified: false, confirm: true }]]);
  });
  it('страж по исходнику: экраны не шлют «обратное текущему», снятие зовёт только кнопка «Снять» подтверждения', () => {
    const screen = readFileSync('apps/web/src/app/dashboard/bots/[botId]/BotScreen.tsx', 'utf8');
    const install = readFileSync('apps/web/src/app/dashboard/bots/[botId]/install/InstallScreen.tsx', 'utf8');
    const block = readFileSync('apps/web/src/app/dashboard/bots/[botId]/VerifyBlock.tsx', 'utf8');
    for (const [name, code] of [['BotScreen', screen], ['InstallScreen', install]] as const) {
      expect(code, name).not.toMatch(/requestVerify\([^)]*!/);
      expect(code, name).not.toMatch(/toggleVerified/);
    }
    expect(install).not.toMatch(/requestUnverify/);
    expect(screen.match(/requestUnverify\(/g)).toHaveLength(1);
    // onUnset в блоке — ровно один раз и только внутри role="alertdialog".
    expect(block.match(/p\.onUnset/g)).toHaveLength(1);
    const dialog = block.slice(block.indexOf('role="alertdialog"'), block.indexOf('</div>}'));
    expect(dialog).toContain('p.onUnset');
  });
});

describe('разметка блока «Ответы на сайте» (AC-2, AC-5, AC-9)', () => {
  const props = (over: Partial<VerifyBlockProps>): VerifyBlockProps => ({ verified: false, busy: false, error: '', verifiedAt: null, events: [], onSet: () => {}, onUnset: () => {}, ...over });
  const html = (over: Partial<VerifyBlockProps>) => renderToStaticMarkup(createElement(VerifyBlock, props(over)));
  it('без отметки — главная кнопка «Я проверил ответы бота»; снимать нечего', () => {
    const out = html({});
    expect(out).toContain('>Я проверил ответы бота</button>');
    expect(out).not.toContain('Снять отметку');
  });
  it('с отметкой — второстепенная «Снять отметку» с aria-expanded=false; подтверждение не раскрыто до нажатия', () => {
    const out = html({ verified: true, verifiedAt: T39 });
    expect(out).toMatch(/<button[^>]*class="button secondary"[^>]*aria-expanded="false"[^>]*aria-controls="verify-unset"[^>]*>Снять отметку<\/button>/);
    expect(out).not.toContain('alertdialog');
    expect(out).not.toContain(UNSET_WARNING);
    expect(out).toContain(`Отметка стоит с ${when(T39)}.`);
    expect(when(T39)).toMatch(/^28 сентября.*13:39$/);
  });
  it('строка состояния и история: кто и когда; нет данных — без выдуманной даты', () => {
    const events = [{ kind: 'unset_owner' as const, at: T46 }, { kind: 'set' as const, at: T39 }];
    expect(verificationLine(false, null, events)).toBe(`Снята ${when(T46)} владельцем.`);
    expect(verificationLine(false, null, [{ kind: 'unset_new_material', at: T46 }])).toBe(`Снята ${when(T46)} из-за новых материалов.`);
    expect(verificationLine(false, null, [])).toBeNull();
    expect(verificationLine(true, null, events)).toBeNull();
    const out = html({ events });
    expect(out).toContain('<summary>История отметки</summary>');
    expect(out).toContain('— снята владельцем');
    expect(out).toContain('— поставлена владельцем');
    expect(html({})).not.toContain('История отметки');
  });
});

describe('баннер ворот после отметки из него (AC-11)', () => {
  const banner = (over: Partial<Parameters<typeof GateBanner>[0]>) => renderToStaticMarkup(createElement(GateBanner, { verified: false, ready: true, resetAt: null,
    stubVisitors: 0, chatHref: '#chat-title', busy: false, error: '', onVerify: () => {}, ...over }));
  it('только что отмечено — строка на месте баннера без кнопок; отмечено раньше — баннера нет', () => {
    const done = banner({ verified: true, justVerified: true });
    expect(done).toContain(VERIFIED_DONE);
    expect(done).not.toContain('<button');
    expect(banner({ verified: true })).toBe('');
  });
});
