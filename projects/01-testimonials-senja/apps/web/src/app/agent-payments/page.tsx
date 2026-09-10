'use client';
import { useEffect, useState } from 'react';
type State = {
  csrf: string;
  emailVerified: boolean;
  projects: { slug: string; name: string }[];
  pairing?: { display_name: string; audience: string; expires_at: string };
  order?: { order_id: string; slug: string };
};
export default function AgentPayments() {
  const [state, setState] = useState<State>();
  const [message, setMessage] = useState('');
  const [slug, setSlug] = useState('');
  const [pairingId, setPairingId] = useState('');
  const [orderId, setOrderId] = useState('');
  const [proof, setProof] = useState('');
  const [grant, setGrant] = useState<{ token: string; grantId: string }>();
  const [mandateId, setMandateId] = useState('');
  const [consent, setConsent] = useState(false);
  const [saveMethod, setSaveMethod] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    setPairingId(query.get('pairingId') || '');
    setOrderId(query.get('orderId') || '');
    setProof(window.location.hash.slice(1));
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    fetch(`/api/agent-payments/human?${query}`, { cache: 'no-store' })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error?.message || 'Войдите в аккаунт.');
        setState(data);
        setSlug(data.order?.slug || data.projects[0]?.slug || '');
      })
      .catch((e) => setMessage(e.message));
  }, []);
  async function submit(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    setMessage('');
    try {
      const r = await fetch('/api/agent-payments/human', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-csrf-token': state?.csrf || '' },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error?.message || 'Не удалось выполнить запрос.');
      if (data.token) setGrant(data);
      if (data.mandateId) setMandateId(data.mandateId);
      if (data.verified)
        setState((previous) => (previous ? { ...previous, emailVerified: true } : previous));
      if (data.nextAction?.kind === 'open_url') window.location.assign(data.nextAction.url);
      setMessage(
        data.sent
          ? 'Письмо отправлено. Откройте его в этом браузере.'
          : data.verified === false
            ? 'Ссылка недействительна или уже использована.'
            : 'Сохранено.',
      );
      setConsent(false);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Сеть недоступна.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="stage">
      <section className="card">
        <h1>Покупки через агента</h1>
        <p>
          Обычная оплата доступна в <a href="/dashboard">дашборде</a>. Агент получит доступ только к
          выбранному проекту.
        </p>
        {!state && (
          <p>
            <a href="/login">Войти в аккаунт</a>
          </p>
        )}
        {state && (
          <>
            {!state.emailVerified && (
              <section>
                <h2>Подтвердите почту</h2>
                <button className="btn" disabled={busy} onClick={() => submit('email_send')}>
                  Отправить письмо
                </button>
                {proof && (
                  <button
                    className="btn"
                    disabled={busy}
                    onClick={() => submit('email_verify', { token: proof })}
                  >
                    Подтвердить почту
                  </button>
                )}
              </section>
            )}
            <label>
              Проект{' '}
              <select
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                disabled={Boolean(orderId)}
              >
                {state.projects.map((p) => (
                  <option key={p.slug} value={p.slug}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            {state.pairing && (
              <section>
                <h2>Подключить агента</h2>
                <p>Имя: {state.pairing.display_name}</p>
                <p>
                  Назначение: {state.pairing.audience}. Доступ действует 24 часа и позволяет
                  просматривать предложения и заказы. Само подключение не разрешает автоматические
                  списания.
                </p>
              </section>
            )}
            {orderId && state.order && (
              <section>
                <h2>Подтвердить покупку</h2>
                <p>
                  990 ₽ за 30 дней платного тарифа. Результат оплаты подтвердит платёжный провайдер.
                </p>
                <label>
                  <input
                    type="checkbox"
                    checked={saveMethod}
                    onChange={(e) => setSaveMethod(e.target.checked)}
                  />{' '}
                  Сохранить способ оплаты у провайдера для будущих покупок
                </label>
              </section>
            )}
            <label>
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />{' '}
              Я прочитал условия выбранного действия и явно подтверждаю его
            </label>
            {state.pairing && (
              <button
                className="btn btn--primary"
                disabled={busy || !consent || !state.emailVerified || !slug}
                onClick={() => submit('pairing_approve', { slug, pairingId, consent })}
              >
                Разрешить подключение
              </button>
            )}
            {orderId && state.order && (
              <button
                className="btn btn--primary"
                disabled={busy || !consent || !state.emailVerified}
                onClick={() => submit('order_approve', { slug, orderId, saveMethod, consent })}
              >
                Перейти к оплате 990 ₽
              </button>
            )}
            {grant && (
              <section>
                <h2>Одноразовый показ ключа</h2>
                <p>
                  Скопируйте ключ в настройки своего агента. После закрытия страницы повторный показ
                  недоступен.
                </p>
                <textarea readOnly value={grant.token} aria-label="Bearer ключ агента" />
                <p>Идентификатор доступа: {grant.grantId}</p>
              </section>
            )}
            <section>
              <h2>Автоматическое продление</h2>
              <p>
                Отдельное поручение действует 90 дней. Только этот проект, 990 ₽ за 30 дней, RUB,
                продление в последние 3 дня действующего тарифа. Не более 990 ₽ за календарный месяц
                по Москве, суммарно для всех агентов. Нужен сохранённый способ оплаты. Изменение
                цены или условий требует нового подтверждения.
              </p>
              <button
                className="btn"
                disabled={busy || !consent || !state.emailVerified || !slug}
                onClick={() => submit('mandate_create', { slug, consent })}
              >
                Разрешить ограниченное продление
              </button>
              <label>
                Идентификатор поручения{' '}
                <input value={mandateId} onChange={(e) => setMandateId(e.target.value)} />
              </label>
              <button
                className="btn"
                disabled={busy || !mandateId}
                onClick={() => submit('mandate_revoke', { slug, mandateId })}
              >
                Отозвать поручение
              </button>
            </section>
            <section>
              <h2>Отозвать доступ агента</h2>
              <label>
                Идентификатор доступа{' '}
                <input
                  value={grant?.grantId || ''}
                  onChange={(e) => setGrant({ token: grant?.token || '', grantId: e.target.value })}
                />
              </label>
              <button
                className="btn"
                disabled={busy || !grant?.grantId}
                onClick={() => submit('grant_revoke', { slug, grantId: grant?.grantId })}
              >
                Отозвать доступ
              </button>
            </section>
          </>
        )}
        <p role="status">{message}</p>
      </section>
    </main>
  );
}
