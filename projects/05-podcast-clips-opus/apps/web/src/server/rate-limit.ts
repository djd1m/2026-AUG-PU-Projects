import { createHmac } from 'node:crypto';
import type Redis from 'ioredis';

export const RATE_LIMIT_SCRIPT = `
local used = redis.call('INCR', KEYS[1])
if used == 1 then redis.call('PEXPIRE', KEYS[1], 60000) end
return used
`;
export async function allowMutation(redis: Redis, ip: string, secret: string): Promise<boolean> {
  if (redis.status === 'wait' || redis.status === 'end') await redis.connect();
  // В Redis только HMAC адреса с TTL, полный IP не сохраняется даже на минуту.
  const key = 'n5:auth:rate:' + createHmac('sha256', secret).update(ip).digest('hex');
  return Number(await redis.eval(RATE_LIMIT_SCRIPT, 1, key)) <= 30;
}
