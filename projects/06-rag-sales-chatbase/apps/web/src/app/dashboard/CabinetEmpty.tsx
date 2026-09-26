// Пустой кабинет (каркас design-shell): состояние «ботов нет» — пустота показывается пустотой (CFG-I7), без «0 %».
// Создание бота вручную — форма под этим блоком (bot-cabinet, dashboard/page.tsx).
export function CabinetEmpty() {
  return <><div className="cabinet-head"><h1>Мои боты</h1></div>
    <section className="empty stack" aria-labelledby="empty-title">
      <h2 id="empty-title">Ботов пока нет</h2>
      <p>Вставьте адрес сайта — бот соберётся по его страницам, и вы проверите ответы до установки.</p>
      <p><a className="button" href="/#site-url">Создать бота по адресу сайта</a></p>
    </section></>;
}
