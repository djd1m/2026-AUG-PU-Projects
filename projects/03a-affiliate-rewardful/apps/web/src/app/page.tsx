export default function Home() {
  return (
    <div className="shell">
      <header><span className="brand">Proofwall<span className="dot">.</span></span><span>Партнёрская программа</span></header>
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
      <footer>Партнёрская программа Proofwall · N3a</footer>
    </div>
  );
}
