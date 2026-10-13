import {appendFileSync} from 'node:fs';import {createHash} from 'node:crypto';appendFileSync('/tmp/n7-f10-verify-a13/child-entry.jsonl',JSON.stringify({at:Date.now(),pid:process.pid})+'\n');
import { submitSmtp } from '/tmp/n7-f10-restart-fix-20261006-a12/projects/07-cold-email-warmup/dist/dispatch/smtp.js';
import { imapRead, imapSnapshot } from '/tmp/n7-f10-restart-fix-20261006-a12/projects/07-cold-email-warmup/dist/replies/imap.js';
// This process alone owns transport descriptors. It never spawns or transfers handles.
process.once('message', async (value) => {
    const r = value;
    const controller = new AbortController();
    process.once('SIGTERM', () => controller.abort());
    try {
        if (!r || !['smtp', 'snapshot', 'read'].includes(r.kind))
            throw new Error();
        const fixture = r.fixture ? { ca: r.fixture.ca, resolver: async () => [{ address: '8.8.8.8', family: 4 }], dial: (_address, port) => ({ address: r.fixture.address, port: port === 465 ? r.fixture.smtp465 : port === 587 ? r.fixture.smtp587 : r.fixture.imap993 }) } : undefined;
        const allowlist = new Map(r.allowlist), input = r.input;
        const result = r.kind === 'smtp' ? await submitSmtp(input, r.message, allowlist, controller.signal, fixture) : r.kind === 'snapshot' ? await imapSnapshot(input, allowlist, controller.signal, fixture) : await imapRead(input, allowlist, r.validity, r.cursor, r.horizon, controller.signal, fixture);
        process.send?.({ ok: true, result }, () => { process.disconnect(); });
    }
    catch (error) { const e=error;appendFileSync('/tmp/n7-f10-verify-a13/child-error-v2.jsonl',JSON.stringify({at:Date.now(),pid:process.pid,kind:r?.kind,errorClass:error?.constructor?.name,code:['protocol_invalid','cancelled','timeout','tls_failed'].includes(e?.code)?e.code:null,messageSHA:createHash('sha256').update(e?.message??'').digest('hex'),signalAborted:controller.signal.aborted,validity:r?.validity,cursor:r?.cursor,horizon:r?.horizon})+'\n');
        process.send?.({ ok: false }, () => { process.disconnect(); });
    }
});
