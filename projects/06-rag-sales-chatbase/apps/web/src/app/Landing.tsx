// из N5: projects/05-podcast-clips-opus/apps/web/src/app/Landing.tsx (коммит 90fe80a) — адаптировано: разметка лендинга
// отдельно от page.tsx (там только чтение темы), тот же компонент рендерит браузерный набор прибора (R9 на настоящей
// разметке). Порядок секций FR-LOOK-012; ОДНО поле (адрес сайта) и ОДИН основной призыв над сгибом (FR-LOOK-001, 007).
// Форма — только разметка: маршрут /preview и его логика — фича preview-flow (FR-PREVIEW-001).
import type { Theme } from '../lib/theme';
import { SiteHeader } from './SiteHeader';
export function Landing({ theme }: { theme: Theme }) {
  return <><SiteHeader theme={theme} />
    <main className="landing">
      <section className="hero center" aria-labelledby="hero-title">
        <p className="eyebrow">Бот для сайта на ваших материалах</p>
        <h1 id="hero-title">Отвечает клиентам ночью — и показывает, откуда взял ответ</h1>
        <p className="intro">Вставьте адрес сайта. Мы прочитаем страницы, соберём бота и покажем его в работе — до регистрации.</p>
        <form className="url-form" action="/preview" method="get">
          <label htmlFor="site-url">Адрес вашего сайта</label>
          <div className="url-row">
            <input id="site-url" name="url" type="text" inputMode="url" autoComplete="url" spellCheck={false} required
              placeholder="например, stomatologia-ulybka.ru" />
            <button type="submit">Создать бота</button>
          </div>
          <p className="muted">Бесплатно. Регистрация — только чтобы сохранить бота.</p>
        </form>
      </section>
      <section className="section center" aria-labelledby="how-title">
        <h2 id="how-title">Как это работает</h2>
        <ol className="steps">
          <li><div><h3>Адрес сайта</h3><p>Вставляете адрес — мы читаем открытые страницы, соблюдая robots.txt.</p></div></li>
          <li><div><h3>Материалы</h3><p>Добавляете PDF: прайс, условия, памятки для клиентов.</p></div></li>
          <li><div><h3>Проверка</h3><p>Задаёте вопросы в предпросмотре и видите, из какого места взят каждый ответ.</p></div></li>
          <li><div><h3>Установка</h3><p>Вставляете одну строку кода на сайт — бот отвечает посетителям.</p></div></li>
        </ol>
      </section>
      <section className="section center" aria-labelledby="example-title">
        <h2 id="example-title">Ответ всегда с источником</h2>
        <div className="card answer-card stack" role="group" aria-label="Пример диалога с ботом">
          <p className="question">Сколько стоит чистка зубов?</p>
          <p className="answer">Профессиональная гигиена — 4 500 ₽, приём длится около часа.</p>
          <p className="source-plate"><span>Источник:</span><strong>Цены на услуги</strong><span aria-hidden="true">↗</span></p>
          <p className="muted">Пример условный. Если ответа в материалах нет, бот говорит «не знаю» и даёт ваш контакт.</p>
        </div>
      </section>
      <section className="section center" aria-labelledby="who-title">
        <h2 id="who-title">Для кого</h2>
        <ul className="plain-list">
          <li>Клиники, салоны, автосервисы — вопросы о ценах, записи и адресе приходят в любое время.</li>
          <li>Интернет-магазины — доставка, возврат, гарантия.</li>
          <li>Студии, которые делают сайты клиентам, — бот как часть сдачи проекта.</li>
        </ul>
      </section>
      <section className="section center" aria-labelledby="trust-title">
        <h2 id="trust-title">Чему можно доверять</h2>
        <ul className="plain-list">
          <li>Бот отвечает только по вашим материалам. Нет подходящего фрагмента — «не знаю» и ваш контакт, а не выдумка.</li>
          <li>Материалы и фрагменты хранятся в нашей базе; текст вопроса для ответа передаётся языковой модели — условия обработки по 152-ФЗ обсуждаем с каждым пилотным клиентом.</li>
          <li>Удаление аккаунта стирает ваши материалы и вопросы посетителей в течение 72 часов.</li>
        </ul>
      </section>
      <section className="section center" aria-labelledby="plans-title">
        <h2 id="plans-title">Тарифы</h2>
        <p>Бесплатный план — с подписью «Работает на Суфлёре» в окне чата. Снять подпись можно на плане «Без бейджа».</p>
        <a className="button secondary" href="/pricing">Сравнить планы</a>
      </section>
      <section className="section center faq" aria-labelledby="faq-title">
        <h2 id="faq-title">Вопросы</h2>
        <details><summary>Нужно ли регистрироваться, чтобы попробовать?</summary><p>Нет. Бот собирается и отвечает до регистрации; аккаунт нужен, чтобы сохранить его и получить код установки.</p></details>
        <details><summary>Какие сайты подходят?</summary><p>Открытые страницы без входа по паролю. Страницы, закрытые в robots.txt, мы не читаем.</p></details>
        <details><summary>Что будет, если бот не знает ответа?</summary><p>Он честно говорит «не знаю» и показывает ваш телефон, почту или ссылку.</p></details>
      </section>
    </main></>;
}
