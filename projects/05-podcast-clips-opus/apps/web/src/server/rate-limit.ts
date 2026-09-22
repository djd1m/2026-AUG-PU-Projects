import { createHmac } from 'node:crypto';
import type Redis from 'ioredis';
import { ipPrefix } from './ip';

export const RATE_LIMIT_SCRIPT = `
local used = redis.call('INCR', KEYS[1])
if used == 1 then redis.call('PEXPIRE', KEYS[1], 60000) end
return used
`;
export async function allowMutation(redis: Redis, ip: string, secret: string, account?: string): Promise<boolean> {
  if (redis.status === 'wait' || redis.status === 'end') await redis.connect();
  // В Redis только HMAC префикса IPv4 /24 или IPv6 /64 с TTL, полный IP не сохраняется даже на минуту.
  const identity = account ? `account:${account}` : `anonymous:${ipPrefix(ip)}`;
  const key = 'n5:mutation:rate:' + createHmac('sha256', secret).update(identity).digest('hex');
  return Number(await redis.eval(RATE_LIMIT_SCRIPT, 1, key)) <= 30;
}
