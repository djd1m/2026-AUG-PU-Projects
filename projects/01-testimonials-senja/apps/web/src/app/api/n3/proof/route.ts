import { NextResponse } from 'next/server';
import { withService } from '@proofwall/db';
import { n3Authority, n3Body, n3Failure } from '@/lib/n3-http';
import { issueN3Proof, consumeN3Proof } from '@/lib/n3-proof';
import { mailConfigured, sendViaResend } from '@/lib/email';
import { baseUrl } from '@/lib/urls';
import { extractClientIP } from '@/lib/client-ip';
import { n3Config, N3Error } from '@/lib/n3-runtime';

export const dynamic = 'force-dynamic';
export async function POST(request: Request): Promise<NextResponse> {
  try {
    if (!n3Config()) throw new N3Error('N3_DISABLED', 404);
    const body = await n3Body(request), auth = await n3Authority();
    if (Object.keys(body).some(key => !['action', 'token'].includes(key))) throw new N3Error('N3_BODY', 400);
    if (body.action === 'verify') {
      if (typeof body.token !== 'string') throw new N3Error('N3_BODY', 400);
      const valid = await withService(client => consumeN3Proof(client, auth, body.token as string));
      return NextResponse.json(valid ? { verified: true, binding: 'pending' } : { error: 'Ссылка истекла, использована или относится к другой сессии.' },
        { status: valid ? 200 : 400 });
    }
    if (body.action !== 'send' || body.token !== undefined) throw new N3Error('N3_BODY', 400);
    if (!mailConfigured()) throw new N3Error('N3_MAIL_UNAVAILABLE');
    const issued = await withService(client => issueN3Proof(client, auth, extractClientIP(request)));
    if (issued.alreadyVerified) return NextResponse.json({ verified: true });
    const link = `${baseUrl()}/n3/verify#${issued.token}`;
    let sent = false;
    try {
      await sendViaResend({ to: issued.email, subject: 'Подтвердите почту Proofwall',
        text: `Подтвердите почту в той же сессии браузера: ${link}\nСсылка действует 24 часа.`,
        html: `<p>Подтвердите почту в той же сессии браузера. Ссылка действует 24 часа.</p><p><a href="${link}">Подтвердить почту</a></p>` });
      sent = true;
    } catch { /* An honest delivery status, never a fabricated successful send. */ }
    await withService(client => client.query('update n3_email_tokens set delivery_status=$2 where id=$1', [issued.id, sent ? 'sent' : 'failed']));
    return NextResponse.json(sent ? { sent: true } : { error: 'Письмо не доставлено. Повторите отправку через минуту.' }, { status: sent ? 200 : 503 });
  } catch (error) { return n3Failure(error); }
}
