import { randomIntInclusive } from '@grelka/secrets';

export function rampPlan(dayIndex: number, cap: number, jitterMax = 1): number {
  if (dayIndex < 1 || cap < 1) return 0;
  const base = 2 + 2 * (dayIndex - 1);
  const jitter = jitterMax > 0 ? randomIntInclusive(0, jitterMax) : 0;
  return Math.min(base + jitter, cap);
}

export interface WarmCandidate {
  id: string;
  userId: string;
  domainId: string | null;
  quotaLeft: number;
}

export function selectPairs(members: WarmCandidate[], maxPairs = 50): { sender: WarmCandidate; recipient: WarmCandidate }[] {
  const pairs: { sender: WarmCandidate; recipient: WarmCandidate }[] = [];
  const used = new Set<string>();
  const byDomain = new Map<string, WarmCandidate[]>();
  for (const m of members) {
    if (m.quotaLeft > 0 && m.domainId) {
      const d = byDomain.get(m.domainId) ?? [];
      d.push(m);
      byDomain.set(m.domainId, d);
    }
  }
  const sameDomainSet = (domainId: string, exclude: WarmCandidate) =>
    (byDomain.get(domainId) ?? []).filter((m) => m.id !== exclude.id).map((m) => m.id);
  const byCrossUser = new Map<string, number>();
  for (const m of members) if (m.quotaLeft > 0) byCrossUser.set(m.userId, (byCrossUser.get(m.userId) ?? 0) + 1);
  const order = [...byCrossUser.keys()].sort();
  for (const senderUser of order) {
    const sender = members.find((m) => m.userId === senderUser && !used.has(m.id) && m.quotaLeft > 0);
    if (!sender) continue;
    const forbiddenIds = sender.domainId ? sameDomainSet(sender.domainId, sender) : [];
    let recipient = members.find(
      (m) => m.id !== sender.id && !used.has(m.id) && m.quotaLeft > 0 && m.userId !== senderUser && !forbiddenIds.includes(m.id),
    );
    if (!recipient) {
      recipient = members.find(
        (m) => m.id !== sender.id && !used.has(m.id) && m.quotaLeft > 0 && !forbiddenIds.includes(m.id),
      );
    }
    if (!recipient) continue;
    used.add(sender.id);
    used.add(recipient.id);
    pairs.push({ sender, recipient });
    if (pairs.length >= maxPairs) break;
  }
  return pairs;
}
