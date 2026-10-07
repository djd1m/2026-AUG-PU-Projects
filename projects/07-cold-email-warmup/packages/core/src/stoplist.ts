import { roleName } from '@grelka/shared';

export interface StoplistEntry {
  address: string;
  source: 'rfc8058' | 'link_unsub' | 'reply_stop' | 'role_filter' | 'manual';
  dueAt: Date;
}

export interface StoplistRepo {
  findBlockers(addresses: string[]): Promise<Set<string>>;
  insert(entry: Omit<StoplistEntry, 'id'>): Promise<void>;
}

export function roleReason(a: string): string | null {
  if (!roleName(a)) return null;
  return 'role_filter';
}

export function dueAtFor(nowMs: number, slaHours = 48): Date {
  return new Date(nowMs + slaHours * 3600_000);
}

export interface BlockReport {
  accepted: { address: string; reason: null }[];
  rejected: { address: string; reason: 'stop_list' | 'role_filter' | 'duplicate' | 'invalid' }[];
}

export async function screenAddresses(
  candidates: { address: string; fields: Record<string, string> }[],
  stoplist: StoplistRepo,
): Promise<BlockReport> {
  const seen = new Set<string>();
  const accepted: BlockReport['accepted'] = [];
  const rejected: BlockReport['rejected'] = [];
  const emailOk = (a: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(a);
  for (const c of candidates) {
    const a = c.address.trim().toLowerCase();
    if (!emailOk(a)) {
      rejected.push({ address: a, reason: 'invalid' });
      continue;
    }
    if (roleReason(a)) {
      rejected.push({ address: a, reason: 'role_filter' });
      continue;
    }
    if (seen.has(a)) {
      rejected.push({ address: a, reason: 'duplicate' });
      continue;
    }
    seen.add(a);
    accepted.push({ address: a, reason: null });
  }
  const still = await stoplist.findBlockers(accepted.map((x) => x.address));
  const finalAccepted: BlockReport['accepted'] = [];
  for (const x of accepted) {
    if (still.has(x.address)) rejected.push({ address: x.address, reason: 'stop_list' });
    else finalAccepted.push(x);
  }
  return { accepted: finalAccepted, rejected };
}
