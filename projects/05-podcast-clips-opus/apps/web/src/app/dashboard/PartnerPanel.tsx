'use client';
import { useEffect, useState } from 'react';
import { rpc } from '../../lib/rpc';
import type { PartnerService } from '../../server/partner';
type Dashboard = Awaited<ReturnType<PartnerService['dashboard']>>;
const labels = { visits: 'Переходы', registrations: 'Регистрации', uploaded: 'Загруженные записи', shared: 'Клипы, вышедшие наружу', guests: 'Приглашённые гости' };
const statuses = { pending: 'Ожидают первого выпуска', activated: 'Первый выпуск готов', rejected: 'Отклонены', partner_deleted: 'Партнёр удалён' };
const sources = { explicit: 'Явный код', guest_link: 'Гостевая ссылка', cookie: 'Переход по ссылке' };
export function PartnerSummary({ data }: { data: Dashboard }) {
  return <><dl className="partner-counters">{Object.entries(labels).map(([key, label]) =>
    <div key={key}><dt>{label}</dt><dd>{data.counters[key as keyof typeof labels]}</dd></div>)}</dl>
    {!data.codes.length && <p className="empty">У вас пока нет партнёрских кодов. Личный код появится при создании гостевого пакета.</p>}
    {data.codes.map(code => <article className="partner-code" key={code.id}><h3>{code.code}</h3>
      <p className={code.status === 'blocked' ? 'notice' : ''}>{code.status === 'blocked' ? 'Код заблокирован' : 'Код активен'}</p>
      {code.status === 'blocked' && <p>{code.blocked_reason === 'antifraud_ip_burst' ? 'Обнаружено много применений из одной сети. Прежние атрибуции сохранены для проверки.' : 'Код заблокирован вручную.'}</p>}
      {code.status === 'active' && code.unblocked_at && <p>Код разблокирован {new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow' }).format(new Date(code.unblocked_at))}: {code.unblock_reason}</p>}
      <ul>{data.statuses.filter(s => s.partner_code_id === code.id).map(s => <li key={`${s.source}-${s.status}`}>
        {sources[s.source]} · {statuses[s.status]}: {s.count}</li>)}</ul>
    </article>)}</>;
}
export function PartnerPanel() {
  const [data, setData] = useState<Dashboard | null>(null), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true; setError(''); setData(null);
    rpc<Dashboard>('partner.dashboard', {}).then(value => { if (active) setData(value); })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Не удалось загрузить кабинет'); });
    return () => { active = false; };
  }, [attempt]);
  return <section aria-labelledby="partner-title"><h2 id="partner-title">Кабинет партнёра</h2><p>Статистика за всё время. Отклонённые атрибуции не входят в воронку.</p>
    {error ? <div role="alert"><p>{error}</p><button onClick={() => setAttempt(n => n + 1)}>Повторить</button></div>
      : data ? <PartnerSummary data={data} /> : <p role="status">Загружаем статистику…</p>}</section>;
}
