// Страница тарифов (FR-TARIFF-002/003, FR-LOOK-002/013). Числа — из КОДА, а не из разметки (tariffs-and-interest, AC-13):
// боты, страницы и PDF — константы канона §7 (@n6/rag), цены — PLAN_PRICE_MINOR (копейки), ответы в сутки и месяц —
// потолки окружения QUOTA_BOT_DAY|MONTH_FREE|PAID, их передаёт страница (page.tsx) — компонент окружение не читает.
// Пометка «цена предварительная» стоит у КАЖДОЙ цены (перенос ревью design-shell MEDIUM, Pricing.tsx:16).
// Платный план ведёт на /upgrade?plan=… — там оплата ЮKassa или экран интереса, если оплата не настроена (A-N6-040).
// Переключателя «месяц/год» из FR-LOOK-013 НЕТ: годовых цен в каноне нет, выдумывать их нельзя.
import { BOTS_BY_PLAN, PAGES_BY_PLAN, PDFS_BY_PLAN, PLAN_PRICE_MINOR, formatRubles } from '@n6/rag';
import type { Theme } from '../../lib/theme';
import { SiteHeader } from '../SiteHeader';

export interface PlanAnswers { free: { day: number; month: number }; paid: { day: number; month: number } }
const count = (n: number) => n.toLocaleString('ru-RU');
export function plansFor(answers: PlanAnswers) {
  return [
    { id: 'free', name: 'Бесплатный', price: formatRubles(0), period: '', bots: BOTS_BY_PLAN.free, pages: PAGES_BY_PLAN.free, pdf: PDFS_BY_PLAN.free,
      day: answers.free.day, month: answers.free.month, badge: 'обязателен' },
    { id: 'nobadge', name: 'Без бейджа', price: formatRubles(PLAN_PRICE_MINOR.nobadge), period: '/мес', bots: BOTS_BY_PLAN.nobadge,
      pages: PAGES_BY_PLAN.nobadge, pdf: PDFS_BY_PLAN.nobadge, day: answers.paid.day, month: answers.paid.month, badge: 'нет' },
    { id: 'studio', name: 'Студия', price: formatRubles(PLAN_PRICE_MINOR.studio), period: '/мес', bots: BOTS_BY_PLAN.studio,
      pages: PAGES_BY_PLAN.studio, pdf: PDFS_BY_PLAN.studio, day: answers.paid.day, month: answers.paid.month, badge: 'у ботов клиентов на бесплатном плане' },
  ] as const;
}
export type PricingPlan = ReturnType<typeof plansFor>[number];

export function Pricing({ theme, answers }: { theme: Theme; answers: PlanAnswers }) {
  const plans = plansFor(answers);
  return <><SiteHeader theme={theme} />
    <main className="center container stack">
      <header className="stack"><p className="eyebrow">Тарифы</p><h1>Один бот бесплатно. Подпись снимается платным планом</h1>
        <p className="intro">Оплата — разовая на 30 дней, без автопродления: продлить — оплатить ещё раз.</p></header>
      <div className="plans">
        {plans.map(plan => <article key={plan.id} className={`card plan${plan.id === 'nobadge' ? ' featured' : ''}`} aria-labelledby={`plan-${plan.id}`}>
          {plan.id === 'nobadge' && <p className="plan-label">Чаще выбирают</p>}
          <h2 id={`plan-${plan.id}`}>{plan.name}</h2>
          <p className="price">{plan.price}<small>{plan.period}</small></p>
          {plan.id !== 'free' && <p className="price-note">Цена предварительная</p>}
          {plan.id === 'nobadge' && <p className="badge-row"><span>«Работает на Суфлёре»</span><strong className="accent-text">— убрать</strong></p>}
          <ul>
            <li>Ботов: {count(plan.bots)}</li>
            <li>Страниц на бота: {count(plan.pages)}</li>
            <li>Ответов в месяц на бота: {count(plan.month)}</li>
          </ul>
          <a className={`button${plan.id === 'nobadge' ? '' : ' secondary'}`} href={plan.id === 'free' ? '/#site-url' : `/upgrade?plan=${plan.id}`}>
            {plan.id === 'free' ? 'Создать бота' : plan.id === 'nobadge' ? 'Убрать бейдж' : 'Подключить студию'}</a>
        </article>)}
      </div>
      <section className="stack" aria-labelledby="compare-title"><h2 id="compare-title">Сравнение</h2>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Таблица сравнения планов">
          <table><thead><tr><th scope="col">Предел</th>{plans.map(p => <th key={p.id} scope="col">{p.name}</th>)}</tr></thead>
            <tbody>
              <tr><th scope="row">Цена в месяц</th>{plans.map(p => <td key={p.id}>{p.price}{p.id !== 'free' && ' (предварительно)'}</td>)}</tr>
              <tr><th scope="row">Ботов</th>{plans.map(p => <td key={p.id}>{count(p.bots)}</td>)}</tr>
              <tr><th scope="row">Страниц на бота</th>{plans.map(p => <td key={p.id}>{count(p.pages)}</td>)}</tr>
              <tr><th scope="row">PDF на бота</th>{plans.map(p => <td key={p.id}>{count(p.pdf)}</td>)}</tr>
              <tr><th scope="row">Ответов в сутки на бота</th>{plans.map(p => <td key={p.id}>{count(p.day)}</td>)}</tr>
              <tr><th scope="row">Ответов в месяц на бота</th>{plans.map(p => <td key={p.id}>{count(p.month)}</td>)}</tr>
              <tr><th scope="row">Подпись «Работает на Суфлёре»</th>{plans.map(p => <td key={p.id}>{p.badge}</td>)}</tr>
            </tbody></table>
        </div>
      </section>
      <section className="faq" aria-labelledby="faq-title"><h2 id="faq-title">Вопросы</h2>
        <details open><summary>Что считается ответом?</summary><p>Каждый вопрос посетителя, на который бот ответил, — по вашим материалам или честным «не знаю» с вашим контактом. Вопросы, отклонённые из-за исчерпанного предела или с чужого сайта, не считаются. Вопросы в предпросмотре считаются отдельно и в предел плана не входят.</p></details>
        <details><summary>Что будет, когда ответы закончатся?</summary><p>Посетитель увидит ваш контакт вместо ответа, а вы — предупреждение в кабинете. Бот не отвечает «поменьше» молча.</p></details>
        <details><summary>Можно убрать подпись без оплаты?</summary><p>Нет: подпись на бесплатном плане — условие использования. Её показ решает сервер, а не настройка на сайте.</p></details>
        <details><summary>Что будет через 30 дней?</summary><p>План вернётся на бесплатный, и подпись снова появится на сайте. Продлить можно заранее: новые 30 дней прибавятся к оставшимся.</p></details>
      </section>
    </main></>;
}
