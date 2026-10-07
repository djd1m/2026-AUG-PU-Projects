import { planLimits, Plan, parseRecipientsCsv } from '@grelka/shared';
import { screenAddresses, StoplistRepo, BlockReport } from './stoplist.ts';
import { extractVariables } from '@grelka/shared';

export interface Db {
  rows<T>(sql: string, args: unknown[]): Promise<T[]>;
  one<T>(sql: string, args: unknown[]): Promise<T | null>;
  exec(sql: string, args: unknown[]): Promise<void>;
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
}

export interface AuditSink {
  write(action: string, subject: string, consentVersion?: string | null): void;
}

export async function importRecipients(
  csv: string,
  campaignId: string,
  stoplist: StoplistRepo,
  db: Db,
  audit: AuditSink,
): Promise<BlockReport & { imported: number }> {
  const parsed = parseRecipientsCsv(csv);
  const report = await screenAddresses(parsed, stoplist);
  for (const r of report.accepted) {
    await db.exec('INSERT INTO recipients (id, campaign_id, address) VALUES (gen_random_uuid(), $1, $2)', [
      campaignId,
      r.address,
    ]);
  }
  audit.write('import_recipients', `campaign=${campaignId} accepted=${report.accepted.length} rejected=${report.rejected.length}`);
  return { ...report, imported: report.accepted.length };
}

export function validateChain(
  steps: { offset_days: number; template: string }[],
  headerFields: string[],
): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!steps.length) return { ok: false, errors: ['цепочка пуста'] };
  for (let i = 0; i < steps.length; i++) {
    if (i > 0 && steps[i]!.offset_days < steps[i - 1]!.offset_days) errors.push(`шаг ${i + 1}: offset_days убывает`);
    for (const v of extractVariables(steps[i]!.template)) {
      if (!headerFields.includes(v)) errors.push(`шаг ${i + 1}: поле ${v} отсутствует в CSV`);
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true };
}

export interface SlotJob {
  campaignId: string;
  recipient: string;
  stepOrder: number;
  slotDate: string;
  mailboxId: string;
  idempotencyKey: string;
}

export function scheduleDailySlots(
  campaignId: string,
  recipients: string[],
  mailboxIds: { id: string; quotaLeft: number }[],
  plan: Plan,
  offsetDays: number[],
  slotDate: string,
): SlotJob[] {
  const limits = planLimits(plan);
  const rot = mailboxIds.map((m) => ({ id: m.id, left: Math.min(m.quotaLeft, limits.dailyPerMailbox) }));
  const jobs: SlotJob[] = [];
  let rotIdx = 0;
  for (let stepIdx = 0; stepIdx < offsetDays.length; stepIdx++) {
    for (const recipient of recipients) {
      const effDate = new Date(Date.parse(`${slotDate}T00:00:00Z`) + offsetDays[stepIdx]! * 86400_000)
        .toISOString()
        .slice(0, 10);
      let pickedIdx = -1;
      for (let attempt = 0; attempt < rot.length; attempt++) {
        const probe = rot[rotIdx % rot.length]!;
        rotIdx++;
        if (probe.left > 0) {
          pickedIdx = rot.findIndex((m) => m.id === probe.id);
          break;
        }
      }
      if (pickedIdx < 0) continue;
      const m = rot[pickedIdx]!;
      m.left -= 1;
      jobs.push({
        campaignId,
        recipient,
        stepOrder: stepIdx + 1,
        slotDate: effDate,
        mailboxId: m.id,
        idempotencyKey: `${campaignId}:${recipient}:${stepIdx + 1}:${effDate}`,
      });
    }
  }
  return jobs;
}

export interface LaunchDeps {
  dkimOk: () => Promise<boolean>;
  verifiedMailboxCount: () => Promise<number>;
  recipientCount: () => Promise<number>;
  consentTextVersion: string;
  ruRecipientsPresent: () => Promise<boolean>;
  ruAck: boolean;
}

export async function preflightLaunch(campaignId: string, d: LaunchDeps): Promise<{ ok: boolean; reasons: string[] }> {
  const reasons: string[] = [];
  if (!(await d.dkimOk())) reasons.push('DKIM не в порядке');
  if ((await d.verifiedMailboxCount()) < 1) reasons.push('нет verified ящика');
  if ((await d.recipientCount()) < 1) reasons.push('список получателей пуст');
  if (d.consentTextVersion.length < 10) reasons.push('нет записи явного согласия');
  if ((await d.ruRecipientsPresent()) && !d.ruAck) reasons.push('RU-адресаты: требуется отдельное подтверждение правила ст. 18 38-ФЗ');
  return { ok: reasons.length === 0, reasons };
}

export interface LaunchConsentRecord {
  campaignId: string;
  userId: string;
  consentVersion: string;
  consentText: string;
  at: number;
}

export function buildLaunchConsent(
  campaignId: string,
  userId: string,
  consentVersion: string,
  atMs: number,
): LaunchConsentRecord {
  return {
    campaignId,
    userId,
    consentVersion,
    consentText: 'Запуск кампании выполняется от имени ваших ящиков SMTP/IMAP',
    at: atMs,
  };
}
