'use client';

// Экран «Кабинет» (продуктовое задание: кабинет партнёра-блогера и кабинет владельца).
// ОДИН адрес `/cabinet` для обоих: что показать — решает сервер по сессии. Партнёр видит
// свои начисления и воронку; владелец — сводку выручки, партнёров и форму выплаты. Кто не
// вошёл — видит кнопку входа; кто вошёл, но не партнёр, — объяснение, как им стать.
//
// Ни одной цифры этот экран не считает сам: суммы приходят в копейках из `api` и только
// форматируются (`cabinet-request.ts`). Кабинет владельца при `404` не упоминается вовсе —
// сервер намеренно не отличает «закрыто» от «нет такого маршрута», и клиент не должен
// подсказывать, что маршрут существует.

import { useCallback, useEffect, useState } from 'react';
import { AddPartner } from './add-partner';
import { PayoutDetailsForm } from './payout-details';
import {
  ADMIN_OVERVIEW_URL,
  buildInviteCreateUrl,
  fetchNotifications,
  markNotificationsRead,
  type NotificationItem,
  ADMIN_PAYOUTS_URL,
  AUTH_DEVICE_URL,
  EARNINGS_URL,
  buildDashboardUrl,
  formatMetric,
  formatRub,
  parseCabinetResponse,
  parsePayoutResponse,
  parseRubInput,
  type CabinetOutcome,
  type Dashboard,
  type DashboardWindow,
  type Earnings,
  type OwnerOverview,
  type PayoutOutcome,
} from './cabinet-request';

type Loading = { readonly kind: 'loading' };
type PartnerState = Loading | CabinetOutcome<Earnings>;
type DashboardState = Loading | CabinetOutcome<Dashboard>;
type OwnerState = Loading | CabinetOutcome<OwnerOverview>;

async function getWithSession(url: string): Promise<Response> {
  let response = await fetch(url, { credentials: 'same-origin' });
  if (response.status === 401) {
    // Сессии устройства ещё может не быть (прямой переход на /cabinet). Создать и повторить
    // РОВНО один раз — как `capture-upload.ts`. Анонимная сессия всё равно даст 401 на
    // маршрутах кабинета — но это уже «войдите», а не «сессии нет».
    await fetch(AUTH_DEVICE_URL, { method: 'POST', credentials: 'same-origin' });
    response = await fetch(url, { credentials: 'same-origin' });
  }
  return response;
}

const ENTRY_KIND_LABEL: Record<string, string> = {
  accrual: 'начисление',
  clawback: 'возврат',
  payout: 'выплата',
};

function dateLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function CabinetPage(): React.JSX.Element {
  const [partner, setPartner] = useState<PartnerState>({ kind: 'loading' });
  const [dashboard, setDashboard] = useState<DashboardState>({ kind: 'loading' });
  const [window_, setWindow] = useState<DashboardWindow>('week');
  const [owner, setOwner] = useState<OwnerState>({ kind: 'loading' });
  const [notifications, setNotifications] = useState<readonly NotificationItem[]>([]);

  const loadPartner = useCallback(async (): Promise<void> => {
    try {
      setPartner(await parseCabinetResponse<Earnings>(await getWithSession(EARNINGS_URL)));
    } catch {
      setPartner({ kind: 'error', message: 'Нет соединения — проверьте сеть и попробуйте ещё раз.' });
    }
  }, []);

  const loadDashboard = useCallback(async (w: DashboardWindow): Promise<void> => {
    setDashboard({ kind: 'loading' });
    try {
      setDashboard(await parseCabinetResponse<Dashboard>(await getWithSession(buildDashboardUrl(w))));
    } catch {
      setDashboard({ kind: 'error', message: 'Нет соединения.' });
    }
  }, []);

  const loadOwner = useCallback(async (): Promise<void> => {
    try {
      setOwner(await parseCabinetResponse<OwnerOverview>(await getWithSession(ADMIN_OVERVIEW_URL)));
    } catch {
      setOwner({ kind: 'error', message: 'Нет соединения.' });
    }
  }, []);

  useEffect(() => {
    // Последовательно, а не параллельно: три одновременных запроса без сессии получали три
    // `401` и создавали ТРИ сессии устройства наперегонки (видно в журнале api). Первый
    // запрос заводит сессию, остальные её переиспользуют.
    void (async () => {
      await loadPartner();
      await Promise.all([loadDashboard('week'), loadOwner()]);
      setNotifications(await fetchNotifications());
    })();
  }, [loadPartner, loadDashboard, loadOwner]);

  const onWindow = (w: DashboardWindow): void => {
    setWindow(w);
    void loadDashboard(w);
  };

  return (
    <main className="page">
      <h1>Кабинет</h1>

      {partner.kind === 'unauthenticated' ? (
        <section className="card">
          <p>Кабинет доступен после входа через Telegram — так мы понимаем, чей это кабинет.</p>
          <a className="btn btn--accent btn--wide" href="/settings">
            Войти через Telegram
          </a>
        </section>
      ) : null}

      {notifications.length > 0 ? (
        <section className="card cabinet__news">
          <h2>Новое</h2>
          <ul className="cabinet__entries">
            {notifications.map((item) => (
              <li key={item.id} className="cabinet__entry cabinet__entry--news">
                <span>{item.text}</span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="btn btn--ghost btn--tiny"
            onClick={() => {
              // Пометка прочитанными — по ЯВНОМУ действию, а не по факту открытия страницы:
              // человек мог открыть кабинет в фоне и не увидеть уведомления вовсе.
              void markNotificationsRead().then(() => setNotifications([]));
            }}
          >
            прочитано
          </button>
        </section>
      ) : null}

      {owner.kind === 'ok' ? <OwnerSection overview={owner.data} reload={loadOwner} /> : null}

      <PartnerSection partner={partner} dashboard={dashboard} window={window_} onWindow={onWindow} />

      <a href="/" className="btn btn--ghost btn--wide result__back">
        ← к съёмке
      </a>
    </main>
  );
}

function PartnerSection({
  partner,
  dashboard,
  window,
  onWindow,
}: {
  readonly partner: PartnerState;
  readonly dashboard: DashboardState;
  readonly window: DashboardWindow;
  readonly onWindow: (w: DashboardWindow) => void;
}): React.JSX.Element | null {
  if (partner.kind === 'loading') return <p className="muted">Загружаем кабинет…</p>;
  if (partner.kind === 'unauthenticated') return null;
  if (partner.kind === 'error') return <p className="result__notice result__status--error">{partner.message}</p>;
  if (partner.kind === 'closed') return <p className="muted">Кабинет партнёра недоступен.</p>;
  if (partner.kind === 'not_partner') {
    return (
      <section className="card">
        <h2>Кабинет партнёра</h2>
        <p>
          Вы вошли, но партнёрский код на вас пока не выписан. Партнёр получает <strong>50 %</strong> с каждой
          оплаченной подписки по своему коду — бессрочно. Чтобы получить код, напишите владельцу приложения.
        </p>
      </section>
    );
  }

  const e = partner.data;
  return (
    <section className="cabinet">
      <h2>Кабинет партнёра</h2>

      <div className="cabinet__grid">
        <div className="tile tile--kcal">
          <span className="tile__label">к выплате {dateLabel(e.next_payout_date)}</span>
          <span className="tile__value num">{formatRub(e.due_next_payout_minor)}</span>
        </div>
        <div className="tile">
          <span className="tile__label">баланс</span>
          <span className="tile__value num">{formatRub(e.balance_minor)}</span>
        </div>
        <div className="tile">
          <span className="tile__label">начислено всего</span>
          <span className="tile__value num">{formatRub(e.accrued_total_minor)}</span>
        </div>
        <div className="tile">
          <span className="tile__label">выплачено всего</span>
          <span className="tile__value num">{formatRub(e.paid_out_total_minor)}</span>
        </div>
      </div>
      <p className="muted">
        Ставка {e.commission_rate_bp / 100} % · выплаты 5-го числа · начисление доступно через 14 дней после оплаты
        {e.deferred_to_following_minor > 0 ? ` · ${formatRub(e.deferred_to_following_minor)} перейдёт на следующий период` : ''}
      </p>

      <PayoutDetailsForm />

      <h3>Воронка по коду</h3>
      <nav className="cabinet__windows" aria-label="период">
        {(['day', 'week', 'all'] as const).map((w) => (
          <button
            key={w}
            type="button"
            className={`btn btn--tiny ${w === window ? 'btn--primary' : 'btn--ghost'}`}
            onClick={() => onWindow(w)}
          >
            {w === 'day' ? 'день' : w === 'week' ? 'неделя' : 'всё время'}
          </button>
        ))}
      </nav>
      {dashboard.kind === 'ok' ? (
        dashboard.data.no_data ? (
          <p className="muted">По коду пока никто не пришёл.</p>
        ) : (
          <div className="cabinet__grid">
            <div className="tile"><span className="tile__label">переходы</span><span className="tile__value num">{dashboard.data.transitions}</span></div>
            <div className="tile"><span className="tile__label">установки</span><span className="tile__value num">{dashboard.data.installs}</span></div>
            <div className="tile"><span className="tile__label">активации</span><span className="tile__value num">{dashboard.data.activations}</span></div>
            <div className="tile"><span className="tile__label">поделились</span><span className="tile__value num">{dashboard.data.shares}</span></div>
            <div className="tile"><span className="tile__label">i (шеров на активацию)</span><span className="tile__value num">{formatMetric(dashboard.data.i, '')}</span></div>
            <div className="tile"><span className="tile__label">конверсия</span><span className="tile__value num">{formatMetric(dashboard.data.conv, '%')}</span></div>
          </div>
        )
      ) : dashboard.kind === 'loading' ? (
        <p className="muted">Считаем…</p>
      ) : (
        <p className="muted">Воронка недоступна.</p>
      )}

      <h3>Движения</h3>
      {/* Выгрузка — обычная ссылка, а не fetch: браузер сам сохранит файл с именем из
          Content-Disposition, и не нужно держать бинарь в памяти вкладки. */}
      <a className="btn btn--ghost btn--tiny" href="/api/v1/partner/earnings/export">
        выгрузить в CSV
      </a>
      {e.entries.length === 0 ? (
        <p className="muted">Начислений пока нет.</p>
      ) : (
        <ul className="cabinet__entries">
          {e.entries.map((entry, index) => (
            <li key={index} className="cabinet__entry">
              <span>{ENTRY_KIND_LABEL[entry.kind] ?? entry.kind}</span>
              <span className="muted">{dateLabel(entry.available_at)}</span>
              <span className="num">{formatRub(entry.amount_minor)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function OwnerSection({ overview, reload }: { readonly overview: OwnerOverview; readonly reload: () => Promise<void> }): React.JSX.Element {
  const [partnerId, setPartnerId] = useState<string>(overview.partners[0]?.partner_id ?? '');
  const [amount, setAmount] = useState<string>('');
  const [payoutKey, setPayoutKey] = useState<string>(() => crypto.randomUUID());
  const [result, setResult] = useState<PayoutOutcome | { readonly kind: 'invalid' } | null>(null);
  const [sending, setSending] = useState(false);

  const submit = async (): Promise<void> => {
    const minor = parseRubInput(amount);
    if (minor === null || partnerId === '') {
      setResult({ kind: 'invalid' });
      return;
    }
    setSending(true);
    try {
      const response = await fetch(ADMIN_PAYOUTS_URL, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partner_id: partnerId, amount_minor: minor, payout_key: payoutKey }),
      });
      const outcome = await parsePayoutResponse(response);
      setResult(outcome);
      if (outcome.kind === 'recorded') {
        // Новый ключ — только ПОСЛЕ успешной записи: повтор той же формы с тем же ключом
        // обязан быть дублем, а не второй выплатой.
        setPayoutKey(crypto.randomUUID());
        setAmount('');
        await reload();
      }
    } catch {
      setResult({ kind: 'rejected', message: 'Нет соединения.' });
    } finally {
      setSending(false);
    }
  };

  const subs = Object.entries(overview.subscriptions);
  return (
    <section className="cabinet cabinet--owner">
      <h2>Кабинет владельца</h2>
      <div className="cabinet__grid">
        <div className="tile tile--kcal"><span className="tile__label">выручка (нетто)</span><span className="tile__value num">{formatRub(overview.revenue_net_minor)}</span></div>
        <div className="tile"><span className="tile__label">выручка (брутто)</span><span className="tile__value num">{formatRub(overview.revenue_gross_minor)}</span></div>
        <div className="tile"><span className="tile__label">платежей</span><span className="tile__value num">{overview.payments_count}</span></div>
        <div className="tile"><span className="tile__label">на ручном разборе</span><span className="tile__value num">{overview.needs_review_count}</span></div>
      </div>
      <p className="muted">
        Подписки: {subs.length === 0 ? 'нет' : subs.map(([status, n]) => `${status} — ${n}`).join(' · ')}
      </p>

      <h3>Партнёры</h3>
      <AddPartner onCreated={reload} />
      <a className="btn btn--ghost btn--tiny" href="/api/v1/admin/export/commissions">
        выгрузить движения всех партнёров
      </a>{' '}
      <a className="btn btn--ghost btn--tiny" href="/api/v1/admin/export/payout-register">
        реестр к выплате
      </a>
      {overview.partners.length === 0 ? (
        <p className="muted">Партнёров ещё нет — заведите первого кнопкой выше.</p>
      ) : (
        <ul className="cabinet__entries">
          {overview.partners.map((p) => (
            <li key={p.partner_id} className="cabinet__entry">
              <span>
                {p.display_name}
                {p.needs_invite === true ? <InviteButton partnerId={p.partner_id} /> : null}
              </span>
              <span className="muted">доступно {formatRub(p.available_minor)}</span>
              <span className="num">{formatRub(p.balance_minor)}</span>
            </li>
          ))}
        </ul>
      )}

      <h3>Выплата партнёру</h3>
      <div className="cabinet__payout">
        <select className="stepper__input" value={partnerId} onChange={(ev) => setPartnerId(ev.target.value)} aria-label="партнёр">
          {overview.partners.map((p) => (
            <option key={p.partner_id} value={p.partner_id}>
              {p.display_name} — доступно {formatRub(p.available_minor)}
            </option>
          ))}
        </select>
        <input
          className="stepper__input"
          inputMode="decimal"
          placeholder="сумма, ₽"
          aria-label="сумма выплаты"
          value={amount}
          onChange={(ev) => setAmount(ev.target.value)}
        />
        <button type="button" className="btn btn--primary" disabled={sending || overview.partners.length === 0} onClick={() => void submit()}>
          {sending ? 'Записываем…' : 'Записать выплату'}
        </button>
      </div>
      {result?.kind === 'invalid' ? <p className="result__notice result__status--error">Сумма должна быть положительным числом в рублях.</p> : null}
      {result?.kind === 'recorded' ? <p className="result__notice">Выплата записана. Доступно к выплате теперь {formatRub(result.availableAfterMinor)}.</p> : null}
      {result?.kind === 'duplicate' ? <p className="result__notice">Эта выплата уже была записана — повтор не создал вторую.</p> : null}
      {result?.kind === 'rejected' ? <p className="result__notice result__status--error">{result.message}</p> : null}
    </section>
  );
}

/** Ссылка-приглашение для партнёра без аккаунта (OWN-012): одноразовая, 7 дней. */
function InviteButton({ partnerId }: { readonly partnerId: string }): React.JSX.Element {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const create = async (): Promise<void> => {
    const response = await fetch(buildInviteCreateUrl(partnerId), { method: 'POST', credentials: 'same-origin' }).catch(() => null);
    const body = response === null ? null : ((await response.json().catch(() => null)) as { data?: { url?: string }; error?: { message?: string } } | null);
    if (response?.status === 201 && body?.data?.url !== undefined) setUrl(body.data.url);
    else setError(body?.error?.message ?? 'Не удалось создать приглашение.');
  };
  if (url !== null) {
    return (
      <span className="cabinet__invite">
        <br />
        <input className="stepper__input" readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="ссылка-приглашение" />
      </span>
    );
  }
  return (
    <span className="cabinet__invite">
      {' '}
      <button type="button" className="btn btn--tiny btn--ghost" onClick={() => void create()}>
        пригласить
      </button>
      {error !== null ? <span className="limit__error"> {error}</span> : null}
    </span>
  );
}
