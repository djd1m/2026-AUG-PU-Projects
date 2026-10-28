import type { Pool } from '@clipmaker/db';
import { moscowDay } from '@clipmaker/shared/upload';
import { referralCookie } from '../lib/partner-referral';
import type { AuthService } from './auth';
import { readSessionCookie } from './auth-handler';
import { clientIp, ipPrefix } from './ip';
import { UploadError } from './upload-contract';

interface PartnerLanding { id: string; code: string; account_id: string }
const missing = () => new UploadError('not_found', 'Ссылка не найдена', 404);
export class PartnerLandingService {
  constructor(private readonly pool: Pool, private readonly clock = () => new Date()) {}
  async find(code: string): Promise<PartnerLanding> {
    if (!/^[A-Za-z0-9_-]{6,12}$/.test(code)) throw missing();
    const row = (await this.pool.query<PartnerLanding>(`SELECT c.id,c.code,p.account_id FROM partner_code c
      JOIN partner p ON p.id=c.partner_id JOIN account a ON a.id=p.account_id
      WHERE c.code=$1 AND c.status='active' AND a.status='active'`, [code])).rows[0];
    if (!row) throw missing();
    return row;
  }
  async recordView(link: PartnerLanding, account: string | null, prefix: string): Promise<void> {
    if (account === link.account_id) return;
    // The partial unique index also covers concurrent requests, unlike NULL clip-link uniqueness.
    await this.pool.query(`INSERT INTO growth_event(type,partner_code_id,ip_prefix,day)
      SELECT 'link_view',c.id,$2::cidr,$3::date FROM partner_code c
      JOIN partner p ON p.id=c.partner_id JOIN account a ON a.id=p.account_id
      WHERE c.id=$1 AND c.status='active' AND a.status='active' ON CONFLICT DO NOTHING`,
    [link.id, prefix, moscowDay(this.clock())]);
  }
}
interface Dependencies {
  links: Pick<PartnerLandingService, 'find' | 'recordView'>;
  auth: Pick<AuthService, 'authenticate'>;
  trustedProxyHops: number;
  referralSecret: string;
  allowRead: (ip: string, account?: string) => Promise<boolean>;
  clock?: () => Date;
}
export function createPartnerLandingHandler(deps: Dependencies) {
  return async (request: Request, code: string): Promise<Response> => {
    const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };
    try {
      const ip = clientIp(request.headers, deps.trustedProxyHops);
      const token = readSessionCookie(request);
      const session = token ? await deps.auth.authenticate(token) : null;
      if (!await deps.allowRead(ip, session?.account_id)) return new Response('Слишком много запросов', { status: 429, headers });
      const link = await deps.links.find(code);
      await deps.links.recordView(link, session?.account_id ?? null, ipPrefix(ip));
      const cookie = referralCookie(request.headers.get('cookie') ?? '', link.code, 'cookie',
        session?.account_id === link.account_id, deps.referralSecret, (deps.clock?.() ?? new Date()).getTime());
      return new Response(null, { status: 302, headers: { ...headers, Location: '/', ...(cookie ? { 'Set-Cookie': cookie } : {}) } });
    } catch (error) {
      if (error instanceof UploadError && error.status === 404) return new Response('Ссылка не найдена', { status: 404, headers });
      return new Response('Не удалось открыть страницу', { status: 503, headers });
    }
  };
}
