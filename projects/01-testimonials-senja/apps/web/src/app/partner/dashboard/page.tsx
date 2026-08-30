// FR-011.4 — кабинет партнёра.
//
// ОДНА транзакция на весь показ, и та же функция аутентификации, что у входной двери.
// Прежняя схема открывала здесь ДВЕ транзакции и шла мимо счётчика вовсе: `curl -b
// 'pw_partner=…' --parallel` по дашборду обходил лимит целиком и стоил вдвое дороже
// ограничиваемого POST. Дверей две — охрана обязана быть одна.

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { withService } from '@proofwall/db';
import { PARTNER_COOKIE, resolvePartner } from '@/lib/partner-auth';
import { getPartnerCohortDashboardById } from '@/lib/partner';
import type { CohortDashboard } from '@/lib/partner';

export const dynamic = 'force-dynamic';

/** Тот же разбор, что у маршрутов: последний элемент X-Forwarded-For от прокси. */
async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get('x-forwarded-for');
  if (forwarded) {
    const parts = forwarded.split(',').map((p) => p.trim()).filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) return last;
  }
  return h.get('x-real-ip')?.trim() || 'unknown';
}

export default async function PartnerDashboardPage() {
  const store = await cookies();
  const token = store.get(PARTNER_COOKIE)?.value;
  if (!token) redirect('/partner');

  const ip = await clientIp();

  // Одно соединение на весь показ. Партнёр определяется ТОЛЬКО токеном: ни адреса, ни
  // параметра, ни заголовка. Статус кода проверяется здесь же, на КАЖДОМ показе, поэтому
  // отзыв и ротация действуют немедленно, а не до истечения cookie.
  const data = await withService(async (client): Promise<CohortDashboard | null> => {
    const auth = await resolvePartner(client, token, ip);
    if (!auth.ok) return null;
    return getPartnerCohortDashboardById(client, auth.partnerCodeId);
  });

  if (!data) redirect('/partner');

  const rate = data.cohort.conversion_rate;

  return (
    <main className="stage">
      <div className="card">
        <h1>{data.partner_name}</h1>
        <p className="small muted" style={{ marginTop: 6 }}>
          Ваша когорта и начисления. Статус кода: {data.code_status === 'active' ? 'активен' : 'отозван'}.
        </p>

        <div className="between" style={{ marginTop: 24 }}>
          <Stat label="Регистраций" value={String(data.cohort.signups)} />
          <Stat label="Оплатили" value={String(data.cohort.conversions)} />
          {/* null — это «данных нет», а не «ноль процентов». Прогресс-индикатор, рисующий
              0/0 как валидное состояние, выдаёт отсутствие данных за измеренный ноль. */}
          <Stat
            label="Конверсия"
            value={rate === null ? '—' : `${Math.round(rate * 100)}%`}
          />
          <Stat label="Начислено" value={`${data.cohort.total_commission} ₽`} />
        </div>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="linkRow__meta">
      <strong style={{ fontSize: 28 }}>{value}</strong>
      <span className="small muted">{label}</span>
    </div>
  );
}
