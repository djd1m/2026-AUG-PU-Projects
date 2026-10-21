import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { readWeeklyMetrics } from '@n6b/db';
import { SESSION_COOKIE, sessionTokenOrNull } from '@/server/auth-handler';
import { metricSummary } from '@/server/metrics-verifier';
import { getRuntime } from '@/server/runtime';
import { MetricControls } from './metric-controls';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const metadata = { title: 'Метрика недели — RAG-бот для сайта', robots: { index: false, follow: false } };

export default async function MetricsPage() {
  const { auth, servicePool, config } = getRuntime();
  const token = sessionTokenOrNull((await cookies()).get(SESSION_COOKIE)?.value);
  const actor = token ? await auth.authenticate(token) : null;
  if (!actor) notFound();
  const data = await readWeeklyMetrics(servicePool, actor);
  if (!data) notFound();
  const summary = metricSummary(data.installs, data.totals, config.PUBLIC_BASE_URL);
  return <main className="cabinet">
    <h1>Метрика недели</h1>
    <p>Накопленные показатели кампании. Внешний виджет — пара «бот × внешний хост» с конфигом и вопросом.</p>
    <dl>
      <dt>Перепроверенные внешние виджеты (цель {summary.goal})</dt><dd>{summary.verified} / {summary.goal}</dd>
      <dt>Без перепроверки (конфиг + вопрос)</dt><dd>{summary.raw}</dd>
      <dt>Показы бейджа</dt><dd>{summary.impressions}</dd>
      <dt>Клики бейджа</dt><dd>{summary.clicks}</dd>
      <dt>Регистрации с ref</dt><dd>{summary.signups}</dd>
      <dt>Конверсия клика в регистрацию</dt>
      <dd>{summary.conversion === null ? 'нет данных' : `${summary.conversion.toFixed(2)}%`}</dd>
    </dl>
    {summary.sampleWarning && <p>{summary.sampleWarning}</p>}
    <p>Перепроверка ищет код виджета на сохранённой странице. Вопрос владельца неотличим от вопроса посетителя.</p>
    <MetricControls />
  </main>;
}
