import Link from 'next/link';

export default function Home() {
  return (
    <div className="shell">
      <header className="site-header">
        <span className="brand">Proofwall<span className="dot">.</span></span>
        <nav className="top-nav" aria-label="Основная навигация">
          <Link href="/join">Принять приглашение</Link>
          <Link className="button button-small" href="/login">Войти</Link>
        </nav>
      </header>
      <main>
        <p className="eyebrow">Рекомендации, которые приносят доход</p>
        <h1>Делитесь полезным.<br />Получайте вознаграждение.</h1>
        <p className="intro">Рекомендуйте Proofwall — сервис для сбора и публикации отзывов. Вознаграждение начисляется за оплаченные покупки приглашённых клиентов.</p>
        <section aria-labelledby="launch-title" className="notice">
          <span className="marker" aria-hidden="true" />
          <div><h2 id="launch-title">Готовимся к открытию</h2><p>Присоединиться к программе можно будет по приглашению.</p></div>
        </section>
        <p className="schedule">Выплаты — вручную, 5-го числа за предыдущий месяц.</p>
      </main>
      <footer className="site-footer">Партнёрская программа Proofwall · N3a</footer>
    </div>
  );
}
