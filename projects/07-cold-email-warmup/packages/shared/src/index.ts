import { z } from 'zod';

export const PLANS = ['free', 'base', 'pro'] as const;
export type Plan = (typeof PLANS)[number];

export interface PlanLimits {
  mailboxes: number | null;
  campaigns: number | null;
  dailyPerMailbox: number;
  priceRub: number;
  priceUsd: number;
}

export function planLimits(plan: Plan): PlanLimits {
  switch (plan) {
    case 'free':
      return { mailboxes: 1, campaigns: 1, dailyPerMailbox: 20, priceRub: 0, priceUsd: 0 };
    case 'base':
      return { mailboxes: 5, campaigns: 3, dailyPerMailbox: 100, priceRub: 1490, priceUsd: 19 };
    case 'pro':
      return { mailboxes: 300, campaigns: null, dailyPerMailbox: 300, priceRub: 4900, priceUsd: 59 };
  }
}

export const POOL_CRITICAL_MASS = 25;
export const SPAM_RATE_LIMIT = 0.003;
export const UNSUB_SLA_HOURS = 48;
export const ATTRIBUTION_DAYS = 90;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const emailSchema = z.string().trim().toLowerCase().regex(EMAIL_RE, ' неверный email');
export const passwordSchema = z.string().min(8, 'пароль от 8 символов');

export const registerIn = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const loginIn = registerIn;

export const domainIn = z.object({
  name: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^(?!-)[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63})+$/, 'неверный домен'),
});

export const smtpTlsPorts = [465, 587] as const;
export const imapPorts = [143, 993] as const;

export const mailboxIn = z.object({
  domain_id: z.string().uuid().nullable().optional(),
  address: emailSchema,
  smtp_host: z.string().min(3).max(253),
  smtp_port: z.coerce.number().refine(v => (smtpTlsPorts as readonly number[]).includes(v), 'SMTP порт 465 или 587'),
  imap_host: z.string().min(3).max(253),
  imap_port: z.coerce.number().refine(v => (imapPorts as readonly number[]).includes(v), 'IMAP порт 143 или 993'),
  login: z.string().min(3).max(320),
  password: z.string().min(4).max(256),
});

export const poolJoinIn = z.object({
  consent: z.literal(true, { errorMap: () => ({ message: 'участие в пуле — только с явным согласием' }) }),
  consent_version: z.string().min(8),
});

export const campaignStepIn = z.object({
  offset_days: z.number().int().min(0).max(30),
  template: z.string().min(1).max(8000),
});

export const campaignIn = z.object({
  name: z.string().trim().min(1).max(200),
  mailbox_ids: z.array(z.string().uuid()).min(1),
  recipients_csv: z.string().min(1).max(4_000_000),
  steps: z.array(campaignStepIn).min(1).max(10).refine(
    (arr) => arr.every((s, i) => i === 0 || s.offset_days >= arr[i - 1]!.offset_days),
    'offset_days шагов не должны уменьшаться',
  ),
});

export const launchIn = z.object({
  consent_text_version: z.string().min(10),
  ru_recipients_ack: z.boolean().optional(),
});

export const VARIABLE_RE = /\{\{([a-z_][a-z0-9_]*)\}\}/g;

export function extractVariables(template: string): string[] {
  const out = new Set<string>();
  for (const m of template.matchAll(VARIABLE_RE)) out.add(m[1]!);
  return [...out];
}

export function renderTemplate(template: string, fields: Record<string, string>): string {
  return template.replace(VARIABLE_RE, (whole, name: string) => {
    const v = fields[name];
    return typeof v === 'string' && v.length ? v : whole;
  });
}

export const ROLE_PATTERN =
  /^(abuse|postmaster|noc|security|webmaster|hostmaster|admin|root|support|help|info|legal|spam|bounce|newsletter)@[.a-z]/i;

export function roleName(address: string): boolean {
  return ROLE_PATTERN.test(address);
}

export function parseRecipientsCsv(csv: string): { address: string; fields: Record<string, string> }[] {
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const header = lines[0]!.split(',').map((h) => h.trim().toLowerCase());
  const idx = header.indexOf('email');
  if (idx >= 0) {
    const fieldNames = header.filter((h, i) => i !== idx && h.length > 0);
    return lines.slice(1).map((line) => {
      const cells = line.split(',').map((c) => c.trim());
      const fields: Record<string, string> = {};
      let f = 0;
      header.forEach((h, i) => {
        if (i !== idx && h.length > 0) {
          fields[h] = cells[i] ?? '';
          f++;
        }
      });
      return { address: (cells[idx] ?? '').toLowerCase(), fields };
    });
  }
  return lines.map((line) => ({ address: line.toLowerCase(), fields: {} }));
}

export function toBase64Url(b: Buffer | Uint8Array): string {
  return Buffer.from(b).toString('base64url');
}

export function fromBase64Url(s: string): Buffer {
  return Buffer.from(s, 'base64url');
}
