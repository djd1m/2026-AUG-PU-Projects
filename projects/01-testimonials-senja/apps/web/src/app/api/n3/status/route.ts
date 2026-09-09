import { NextResponse } from 'next/server';
import { withService } from '@proofwall/db';
import { n3Authority, n3Failure } from '@/lib/n3-http';
import { n3Config } from '@/lib/n3-runtime';

export const dynamic = 'force-dynamic';
export async function GET(): Promise<NextResponse> {
  try {
    if (!n3Config()) return NextResponse.json({ enabled: false });
    const { accountId } = await n3Authority();
    const state = await withService(async client => {
      const context = (await client.query('select 1 from n3_signup_contexts where account_id=$1', [accountId])).rowCount;
      if (!context) return { enabled: false };
      const proof = (await client.query(`select p.verified_at,p.bound_at from n3_email_proofs p join accounts a on a.id=p.account_id
        where p.account_id=$1 and p.email=a.email`, [accountId])).rows[0];
      const email = (await client.query('select delivery_status from n3_email_tokens where account_id=$1 order by created_at desc limit 1', [accountId])).rows[0];
      const jobs = (await client.query(`select count(*)::int as pending, count(*) filter(where last_error is not null)::int as failed
        from n3_bridge_outbox where account_id=$1 and delivered_at is null`, [accountId])).rows[0];
      const purchases = (await client.query(`select i.id,i.project_id,i.state,i.completed_at,
        exists(select 1 from n3_refund_reviews r where r.intent_id=i.id and r.status='manual_review') as refund_review
        from n3_checkout_intents i where i.account_id=$1 order by i.created_at desc limit 20`, [accountId])).rows;
      return { enabled: true, verified: !!proof, bound: !!proof?.bound_at, email: email?.delivery_status ?? null, ...jobs, purchases };
    });
    return NextResponse.json(state, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return n3Failure(error); }
}
