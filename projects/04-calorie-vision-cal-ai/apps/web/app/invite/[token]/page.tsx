'use client';

// Приглашение партнёра (OWN-012): блогер открывает ссылку от владельца, видит, кем его
// приглашают, регистрируется (или входит) — и его аккаунт привязывается к партнёру.
// Токен — в пути; клиент показывает только предпросмотр, привязку выполняет сервер по
// вошедшему аккаунту.

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { buildInvitePreviewUrl, enroll, fetchMe, type Me } from '../../auth/auth-request';
import { EmailAuth } from '../../settings/email-auth';

type Preview = { readonly kind: 'loading' } | { readonly kind: 'gone' } | { readonly kind: 'ok'; readonly partnerName: string };

export default function InvitePage(): React.JSX.Element {
  const params = useParams<{ token: string }>();
  const token = typeof params?.token === 'string' ? params.token : '';
  const [preview, setPreview] = useState<Preview>({ kind: 'loading' });
  const [me, setMe] = useState<Me | null>(null);
  const [result, setResult] = useState<{ readonly kind: 'ok' } | { readonly kind: 'error'; readonly text: string } | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    void (async () => {
      const r = await fetch(buildInvitePreviewUrl(token), { credentials: 'same-origin' }).catch(() => null);
      const body = r === null ? null : ((await r.json().catch(() => null)) as { data?: { partner_display_name?: string } } | null);
      if (r?.status === 200 && body?.data?.partner_display_name !== undefined) setPreview({ kind: 'ok', partnerName: body.data.partner_display_name });
      else setPreview({ kind: 'gone' });
      setMe(await fetchMe());
    })();
  }, [token]);

  const accept = async (): Promise<void> => {
    setPending(true);
    const outcome = await enroll(token);
    setPending(false);
    if (outcome.kind === 'ok') setResult({ kind: 'ok' });
    else setResult({ kind: 'error', text: outcome.message });
  };

  return (
    <main className="page">
      <h1>Приглашение партнёра</h1>
      {preview.kind === 'loading' ? <p className="muted">Проверяем приглашение…</p> : null}
      {preview.kind === 'gone' ? (
        <section className="card">
          <p>Приглашение не найдено, просрочено или уже использовано. Попросите у владельца новую ссылку.</p>
          <a className="btn btn--ghost btn--wide" href="/">← к съёмке</a>
        </section>
      ) : null}
      {preview.kind === 'ok' ? (
        <>
          <section className="card">
            <p>
              Вас приглашают стать партнёром «Тарелки» как <strong>{preview.partnerName}</strong>. Партнёр получает{' '}
              <strong>50 %</strong> с каждой оплаченной подписки по своему коду — бессрочно; выплаты 5-го числа.
            </p>
          </section>
          {result?.kind === 'ok' ? (
            <section className="card">
              <p>Готово — вы партнёр. Начисления и воронка по вашему коду — в кабинете.</p>
              <a className="btn btn--primary btn--wide" href="/cabinet">Открыть кабинет</a>
            </section>
          ) : me?.authenticated ? (
            <section className="card">
              <p>Вы вошли как <strong>{me.email ?? 'аккаунт Telegram'}</strong>. Принять приглашение этим аккаунтом?</p>
              <button type="button" className="btn btn--primary btn--wide" disabled={pending} onClick={() => void accept()}>
                {pending ? '…' : 'Принять приглашение'}
              </button>
              {result?.kind === 'error' ? <p className="limit__error" role="alert">{result.text}</p> : null}
            </section>
          ) : (
            <>
              <p className="muted">Чтобы принять приглашение, создайте аккаунт или войдите:</p>
              <EmailAuth onChange={setMe} />
            </>
          )}
        </>
      ) : null}
    </main>
  );
}
