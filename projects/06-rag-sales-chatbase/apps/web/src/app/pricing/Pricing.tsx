// Страница тарифов (FR-TARIFF-002, FR-LOOK-002/013). Числа — канон §7 «Планы» (цены — гипотеза A-N6-004).
// Происхождение: раскладка карточек и таблицы — примитивы globals.css N5 (.card/.switcher), своей логики нет.
// Кнопка платного плана ведёт на вход; экран интереса «Оплата скоро — сообщим» — фича tariffs-and-interest.
// Переключателя «месяц/год» из FR-LOOK-013 здесь НЕТ: годовых цен в каноне нет, выдумывать их нельзя.
import type { Theme } from '../../lib/theme';
import { SiteHeader } from '../SiteHeader';
export const PLANS = [
  { id: 'free', name: 'Бесплатный', price: '0 ₽', period: '', bots: '1', pages: '50', pdf: '3', month: '300', day: '50', badge: 'обязателен' },
  { id: 'nobadge', name: 'Без бейджа', price: '990 ₽', period: '/мес', bots: '1', pages: '300', pdf: '10', month: '3 000', day: '300', badge: 'нет' },
  { id: 'studio', name: 'Студия', price: '4 900 ₽', period: '/мес', bots: '10', pages: '300', pdf: '10', month: '3 000', day: '300', badge: 'у ботов клиентов на бесплатном плане' },
] as const;
export function Pricing({ theme }: { theme: Theme }) {
  return <><SiteHeader theme={theme} />
    <main className="center container stack">
      <header className="stack"><p className="eyebrow">Тарифы</p><h1>Один бот бесплатно. Подпись снимается платным планом</h1>
        <p className="intro">Цены предварительные: оплата откроется позже, пилотным клиентам план назначаем вручную.</p></header>
      <div className="plans">
        {PLANS.map(plan => <article key={plan.id} className={`card plan${plan.id === 'nobadge' ? ' featured' : ''}`} aria-labelledby={`plan-${plan.id}`}>
          {plan.id === 'nobadge' && <p className="plan-label">Чаще выбирают</p>}
          <h2 id={`plan-${plan.id}`}>{plan.name}</h2>
          <p className="price">{plan.price}<small>{plan.period}</small></p>
          {plan.id === 'nobadge' && <p className="badge-row"><span>«Работает на Суфлёре»</span><strong className="accent-text">— убрать</strong></p>}
          <ul>
            <li>Ботов: {plan.bots}</li>
            <li>Страниц на бота: {plan.pages}</li>
            <li>Ответов в месяц на бота: {plan.month}</li>
          </ul>
          <a className={`button${plan.id === 'nobadge' ? '' : ' secondary'}`} href={plan.id === 'free' ? '/#site-url' : `/login?plan=${plan.id}`}>
            {plan.id === 'free' ? 'Создать бота' : 'Оставить заявку'}</a>
        </article>)}
      </div>
      <section className="stack" aria-labelledby="compare-title"><h2 id="compare-title">Сравнение</h2>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Таблица сравнения планов">
          <table><thead><tr><th scope="col">Предел</th>{PLANS.map(p => <th key={p.id} scope="col">{p.name}</th>)}</tr></thead>
            <tbody>
              <tr><th scope="row">Ботов</th>{PLANS.map(p => <td key={p.id}>{p.bots}</td>)}</tr>
              <tr><th scope="row">Страниц на бота</th>{PLANS.map(p => <td key={p.id}>{p.pages}</td>)}</tr>
              <tr><th scope="row">PDF на бота</th>{PLANS.map(p => <td key={p.id}>{p.pdf}</td>)}</tr>
              <tr><th scope="row">Ответов в сутки на бота</th>{PLANS.map(p => <td key={p.id}>{p.day}</td>)}</tr>
              <tr><th scope="row">Ответов в месяц на бота</th>{PLANS.map(p => <td key={p.id}>{p.month}</td>)}</tr>
              <tr><th scope="row">Подпись «Работает на Суфлёре»</th>{PLANS.map(p => <td key={p.id}>{p.badge}</td>)}</tr>
            </tbody></table>
        </div>
      </section>
      <section className="faq" aria-labelledby="faq-title"><h2 id="faq-title">Вопросы</h2>
        <details open><summary>Что считается ответом?</summary><p>Каждый вопрос посетителя, на который бот ответил, — по вашим материалам или честным «не знаю» с вашим контактом. Вопросы, отклонённые из-за исчерпанного предела или с чужого сайта, не считаются. Вопросы в предпросмотре считаются отдельно и в предел плана не входят.</p></details>
        <details><summary>Что будет, когда ответы закончатся?</summary><p>Посетитель увидит ваш контакт вместо ответа, а вы — предупреждение в кабинете. Бот не отвечает «поменьше» молча.</p></details>
        <details><summary>Можно убрать подпись без оплаты?</summary><p>Нет: подпись на бесплатном плане — условие использования. Её показ решает сервер, а не настройка на сайте.</p></details>
      </section>
    </main></>;
}
