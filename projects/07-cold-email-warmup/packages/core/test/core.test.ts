import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseRecipientsCsv, extractVariables, renderTemplate, roleName } from '@grelka/shared';
import { dueAtFor, roleReason, screenAddresses } from '../src/stoplist.ts';
import { captureAttribution, CommissionLedger } from '../src/partner.ts';
import { computeScore, unsubscribeDueAt } from '../src/health.ts';
import { classifyInbound, applyInboundEffect, complaintRate, shouldAutoPause } from '../src/inbound.ts';
import { dispatchSend, unsubscribeHeaders, MailTransport, warmupBody } from '../src/dispatch.ts';
import { rampPlan as ramp, selectPairs } from '../src/warmup.ts';

class FakeStoplist {
  blocked = new Set<string>();
  async findBlockers(addresses: string[]) {
    return new Set(addresses.filter((a) => this.blocked.has(a)));
  }
  async insert(e: { address: string }) {
    this.blocked.add(e.address);
  }
}

describe('импорт и стоп-лист (FR-SEC-001, US-006)', () => {
  it('роли отсекаются, дубли клеятся, стоп-лист блокирует', async () => {
    const sl = new FakeStoplist();
    await sl.insert({ address: 'blocked@example.com' });
    const rep = await screenAddresses(
      [
        { address: 'abuse@ex.com', fields: {} },
        { address: 'Ivan@Ex.com', fields: {} },
        { address: 'ivan@ex.com', fields: {} },
        { address: 'blocked@example.com', fields: {} },
        { address: 'не-адрес', fields: {} },
      ],
      sl,
    );
    assert.deepEqual(rep.accepted.map((a) => a.address), ['ivan@ex.com']);
    const reasons = Object.fromEntries(rep.rejected.map((r) => [r.address, r.reason]));
    assert.equal(reasons['abuse@ex.com'], 'role_filter');
    assert.equal(reasons['blocked@example.com'], 'stop_list');
    assert.equal(reasons['не-адрес'], 'invalid');
    const dupes = rep.rejected.filter((r) => r.reason === 'duplicate');
    assert.equal(dupes.length, 1);
  });

  it('SLA отписки — не позже 48 ч', () => {
    const now = Date.parse('2026-10-07T12:00:00Z');
    const d = dueAtFor(now);
    assert.equal(d.getTime() - now, 48 * 3600_000);
  });

  it('roleReason распознаёт только роли', () => {
    assert.equal(roleName('postmaster@site.ru'), true);
    assert.equal(roleName('ivan@site.ru'), false);
  });
});

describe('CSV и шаблоны (FR-CAMP-001, US-007)', () => {
  it('CSV с заголовком и без', () => {
    const withHeader = parseRecipientsCsv('email,first_name\na@x.com,Иван\nb@x.com,Пётр');
    assert.deepEqual(withHeader[0]!.fields, { first_name: 'Иван' });
    const bare = parseRecipientsCsv('a@x.com\nb@x.com');
    assert.equal(bare.length, 2);
  });

  it('переменные и рендер', () => {
    assert.deepEqual(extractVariables('Здравствуйте, {{first_name}}!'), ['first_name']);
    assert.equal(renderTemplate('Привет, {{name}}', { name: 'Иван' }), 'Привет, Иван');
    assert.equal(renderTemplate('Привет, {{name}}', {}), 'Привет, {{name}}');
  });
});

describe('warmup: ramp и пары (FR-POOL-002/003)', () => {
  it('ramp день 1 = 2 (без джиттера), растёт, потолок соблюдает, объём рандомизируется', () => {
    assert.equal(ramp(1, 100, 0), 2);
    assert.ok(ramp(3, 100, 0) >= 6 && ramp(3, 100, 0) <= 7);
    assert.ok(ramp(1, 100) >= 2 && ramp(1, 100) <= 3);
    assert.equal(ramp(30, 20), 20);
    assert.equal(ramp(30, 0), 0);
  });

  it('пары: межаккаунтный приоритет, домены не совпадают', () => {
    const members = [
      { id: 'm1', userId: 'u1', domainId: 'd1', quotaLeft: 3 },
      { id: 'm2', userId: 'u1', domainId: 'd2', quotaLeft: 3 },
      { id: 'm3', userId: 'u2', domainId: 'd3', quotaLeft: 3 },
      { id: 'm4', userId: 'u3', domainId: 'd1', quotaLeft: 3 },
    ];
    const pairs = selectPairs(members);
    assert.equal(pairs.length, 2);
    for (const p of pairs) {
      assert.notEqual(p.sender.id, p.recipient.id);
      assert.notEqual(p.sender.domainId, p.recipient.domainId);
    }
  });
});

describe('health (FR-HEALTH-001/002, FR-POOL-005)', () => {
  it('score из событий + честная метка при малой сети', () => {
    const small = computeScore({ spf: 'ok', dkim: 'ok', dmarc: 'warn', sent: 100, bounced: 2, complained: 0 }, 10);
    assert.equal(small.warmupActive, false);
    assert.match(small.label, /сеть разогревается: 10/);
    const big = computeScore({ spf: 'ok', dkim: 'ok', dmarc: 'ok', sent: 1000, bounced: 5, complained: 1 }, 25);
    assert.equal(big.warmupActive, true);
    assert.ok(big.spamRate < 0.003);
    assert.ok(big.score > 70 && big.score <= 100);
  });
});

describe('атрибуция партнёров (FR-PARTNER-001/002, US-010)', () => {
  const base = (nowMs = 0) => ({ entries: [] as any[], audit: [] as string[] });
  const codes = new Set(['GRE3K', 'AGR5']);
  void base;

  it('ручной невалидный код: НЕ сохраняется и НЕ фолбэкится на cookie', () => {
    const store: any = base();
    const out = captureAttribution(
      store,
      { newUserEmail: 'a@x.com', manualCode: 'NOPE1', cookieCode: 'GRE3K', existingCodes: codes },
      1,
    );
    assert.equal(out.saved, false);
    assert.equal(store.entries.length, 0);
    assert.match(store.audit.join(' '), /invalid_manual_code/);
  });

  it('ручной валидный код сохраняется с via=manual', () => {
    const store: any = base();
    const out = captureAttribution(store, { newUserEmail: 'a@x.com', manualCode: 'GRE3K', existingCodes: codes }, 1);
    assert.equal(out.saved, true);
    assert.equal(out.record!.capturedVia, 'manual');
  });

  it('cookie-путь при отсутствии ручного кода', () => {
    const store: any = base();
    const out = captureAttribution(store, { newUserEmail: 'b@x.com', cookieCode: 'GRE3K', existingCodes: codes }, 1);
    assert.equal(out.saved, true);
    assert.equal(out.record!.capturedVia, 'cookie');
  });

  it('self-referral отсекается', () => {
    const store: any = base();
    const out = captureAttribution(
      store,
      { newUserEmail: 'owner@x.com', manualCode: 'GRE3K', existingCodes: codes, selfOwnedCodes: new Set(['GRE3K']) },
      1,
    );
    assert.equal(out.saved, false);
    assert.equal(out.reason, 'self_referral');
  });

  it('комиссия только от фактической оплаты + дедуп платежа', () => {
    const store: any = base();
    captureAttribution(store, { newUserEmail: 'a@x.com', manualCode: 'GRE3K', existingCodes: codes }, 1);
    const ledger = new CommissionLedger();
    const e1 = ledger.onPaidPayment(store, { externalId: 'PAY1', amount: 1490, currency: 'RUB', payerEmail: 'a@x.com', pct: 15 }, 2);
    assert.ok(e1);
    const e2 = ledger.onPaidPayment(store, { externalId: 'PAY1', amount: 1490, currency: 'RUB', payerEmail: 'a@x.com', pct: 15 }, 3);
    assert.equal(e2, null);
    assert.equal(ledger.events.length, 1);
  });
});

describe('входящие (FR-CAMP-005, FR-SEC-002, US-008/011/012)', () => {
  it('RFC 8058 POST → unsub', () => {
    const c = classifyInbound({ listUnsubscribePost: 'List-Unsubscribe=One-Click', from: 'to@y.ru' }, 1);
    assert.equal(c.kind, 'unsub');
  });

  it('feedback → complaint; письмо во дворец → bounce; обычное → reply', () => {
    assert.equal(classifyInbound({ feedbackType: 'abuse', from: 'to@y.ru' }, 1).kind, 'complaint');
    assert.equal(classifyInbound({ autoSubmitted: 'auto-replied', from: 'to@y.ru' }, 1).kind, 'bounce');
    assert.equal(classifyInbound({ from: 'to@y.ru', subject: 're: hi' }, 1).kind, 'reply');
  });

  it('эффекты: отписка — стоп-лист + заморозка; reply — тоже останавливает шаги', async () => {
    const calls = { stop: [] as string[], frozen: [] as string[] };
    const stores = {
      async stoplistEnqueue(a: string) { calls.stop.push(a); },
      async freezeRecipient(a: string) { calls.frozen.push(a); },
      async isCampaignRecipient(a: string) { return a === 'to@y.ru'; },
    };
    const e1 = await applyInboundEffect(classifyInbound({ listUnsubscribePost: 'List-Unsubscribe=One-Click', from: 'to@y.ru' }, 1), stores as any, 2);
    assert.equal(e1.stoplistQueued, true);
    assert.equal(e1.recipientFrozen, true);
    const e2 = await applyInboundEffect(classifyInbound({ from: 'to@y.ru' }, 1), stores as any, 2);
    assert.equal(e2.recipientFrozen, true);
    assert.equal(e2.stoplistQueued, false);
    assert.deepEqual(calls.frozen, ['to@y.ru', 'to@y.ru']);
  });

  it('жалоба: rate и автопаузная граница', () => {
    assert.equal(shouldAutoPause(complaintRate(5, 1000)), true);
    assert.equal(shouldAutoPause(complaintRate(2, 1000)), false);
  });
});

describe('dispatch: идемпотентность и квоты (FR-CAMP-005, FR-WARMUP-002)', () => {
  interface FakeTransport extends MailTransport {
    sent: number[];
  }
  const fixtures = () => {
    const transport: FakeTransport = { sent: [], async send(a) { this.sent.push(1); return { status: 'sent' as const }; } };
    const locked = new Set<string>();
    const locks = {
      async acquire(k: string) { if (locked.has(k)) return false; locked.add(k); return true; },
      async release(k: string) { locked.delete(k); },
    };
    const logs = {
      keys: new Set<string>(),
      rows: [] as any[],
      async hasKey(k: string) { return this.keys.has(k); },
      async insert(r: any) { this.rows.push(r); this.keys.add(r.idempotencyKey); },
    };
    let quota = 2;
    const quotaStore = {
      async remaining() { return quota; },
      async decrement() { quota -= 1; },
    };
    return { transport, locks, logs, quotaStore, getQuota: () => quota };
  };

  it('повтор job не дублирует письмо', async () => {
    const f = fixtures();
    const attempt = { idempotencyKey: 'K1', mailboxId: 'M1', to: 'a@y.ru', bodyHtml: '', bodyText: '', subject: 's', isWarmup: true };
    const r1 = await dispatchSend(attempt, { transport: f.transport, logs: f.logs as any, locks: f.locks, quota: f.quotaStore as any, campaignId: null, slotAt: '2026-10-07' });
    const r2 = await dispatchSend(attempt, { transport: f.transport, logs: f.logs as any, locks: f.locks, quota: f.quotaStore as any, campaignId: null, slotAt: '2026-10-07' });
    assert.equal(r1.status, 'sent');
    assert.equal(r2.status, 'suppressed');
    assert.equal(f.transport.sent.length, 1);
    assert.equal(f.logs.rows.length, 1);
  });

  it('исчерпание квоты → failed без записи sent', async () => {
    const f = fixtures();
    const attempt = { idempotencyKey: 'K2', mailboxId: 'M1', to: 'a@y.ru', bodyHtml: '', bodyText: '', subject: 's', isWarmup: false };
    (f.quotaStore as any).remaining = async () => 0;
    const r = await dispatchSend(attempt, { transport: f.transport, logs: f.logs as any, locks: f.locks, quota: f.quotaStore as any, campaignId: 'C1', slotAt: '2026-10-07' });
    assert.equal(r.status, 'failed');
    assert.equal(r.errorCode, 'QUOTA_EXHAUSTED');
    assert.equal(f.transport.sent.length, 0);
  });

  it('исчерпание квоты не тратит письмо; заголовки отписки правильные', () => {
    const h = unsubscribeHeaders('https://q.app', 'TOK');
    assert.equal(h['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
    assert.equal(h['List-Unsubscribe'], '<https://q.app/u/unsubscribe?t=TOK>');
    const body = warmupBody('тест');
    assert.match(body.subject, /^\[прогрев v1\]/);
    assert.match(body.bodyText, /прогрев-письмо из общей сети/);
    const due = unsubscribeDueAt(Date.parse('2026-10-07T00:00:00Z'));
    assert.equal(due.getTime() - Date.parse('2026-10-07T00:00:00Z'), 48 * 3600_000);
  });
});
