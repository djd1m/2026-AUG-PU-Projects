// Состояние удаления по квитанции (фича account-erasure, AC-13). Донор — N5 projects/05-podcast-clips-opus/apps/web/src/app/
// dashboard/AccountDeletion.tsx (ErasureStatus) — АДАПТИРОВАНО: без таймера на клиенте (страница серверная, состояние
// читается при каждом открытии), три РАЗЛИЧИМЫХ состояния (long-running-job): удаляется (со сроком и просрочкой) /
// удалено / квитанции нет — вход. Поддельная, чужая, истёкшая квитанция = «квитанции нет»: ничего не раскрывается.
export type ErasureState = { status: 'erasing' | 'deleted'; deadline: string; overdue: boolean } | null;

const moscow = (iso: string) => new Date(iso).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

export function ErasureStatus({ state }: { state: ErasureState }) {
  if (!state) return <section className="card stack" aria-labelledby="erased-title">
    <h1 id="erased-title">Состояние удаления недоступно</h1>
    <p>На этом устройстве нет квитанции об удалении аккаунта или её срок истёк.</p>
    <p><a className="button" href="/login">Войти</a></p>
  </section>;
  if (state.status === 'deleted') return <section className="card stack" aria-labelledby="erased-title">
    <h1 id="erased-title">Аккаунт удалён</h1>
    <p role="status" className="notice">Данные аккаунта, боты, источники и журналы вопросов стёрты.</p>
    <p className="muted">Записи об оплатах и выплатах хранятся 5 лет без вашей почты — этого требует закон о бухгалтерском учёте.</p>
    <p><a className="button secondary" href="/">На главную</a></p>
  </section>;
  return <section className="card stack" aria-labelledby="erased-title">
    <h1 id="erased-title">Аккаунт удаляется</h1>
    <p role="status" className="notice">Вход закрыт, виджеты ваших ботов уже не отвечают. Сотрём данные не позже {moscow(state.deadline)} (МСК).</p>
    {state.overdue && <p role="alert" className="notice danger-notice">Удаление задерживается: срок прошёл, мы продолжаем попытки и уже получили сигнал.</p>}
    <p className="muted">Отменить удаление нельзя. Обновите страницу позже, чтобы увидеть, что удаление завершено.</p>
  </section>;
}
