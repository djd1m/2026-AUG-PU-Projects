// из N5: projects/05-podcast-clips-opus/apps/web/src/server/rate-limit.ts — префикс ключа n6, IPv6 /48 через ip.ts
import { createHmac } from 'node:crypto';
import type Redis from 'ioredis';
import { ipPrefix } from './ip';

export const RATE_LIMIT_SCRIPT = `
local used = redis.call('INCR', KEYS[1])
if used == 1 then redis.call('PEXPIRE', KEYS[1], 60000) end
return used
`;
export async function allowMutation(redis: Redis, ip: string, secret: string, account?: string): Promise<boolean> {
  return allowRequest(redis, ip, secret, account, 'mutation', 30);
}
export async function allowRead(redis: Redis, ip: string, secret: string, account?: string): Promise<boolean> {
  return allowRequest(redis, ip, secret, account, 'read', 120);
}
async function allowRequest(redis: Redis, ip: string, secret: string, account: string | undefined, kind: string, limit: number): Promise<boolean> {
  if (redis.status === 'wait' || redis.status === 'end') await redis.connect();
  // В Redis только HMAC префикса IPv4 /24 или IPv6 /48 с TTL, полный IP не сохраняется даже на минуту.
  const identity = account ? `account:${account}` : `anonymous:${ipPrefix(ip)}`;
  const key = `n6:${kind}:rate:` + createHmac('sha256', secret).update(identity).digest('hex');
  return Number(await redis.eval(RATE_LIMIT_SCRIPT, 1, key)) <= limit;
}
