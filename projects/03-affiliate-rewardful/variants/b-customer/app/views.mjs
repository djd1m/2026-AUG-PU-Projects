import { badge, date, empty, escape, metric, money } from '/shared/ui/ui.mjs';

const statusName = state => ({ pending:'Результат ещё не задан', unknown:'Нужна сверка', success:'Применено к счёту', failed:'Резерв освобождён' }[state] || state);
const stateBadge = state => badge(state === 'success' ? 'applied' : state);
const sourceName = reason => ({ confirmed_payment:'Подтверждённая оплата друга', refund:'Подтверждённый возврат' }[reason] || reason);

export const nav = (current, enrolled) => [
  ['product', '▣', 'Proofwall'],
  ...(enrolled ? [['overview', '○', 'Обзор'], ['credits', '◇', 'Мои бонусы'], ['share', '↗', 'Рекомендовать']] : []),
].map(([id, icon, label]) => `<button data-view="${id}" data-testid="nav-${id}" class="${current === id ? 'active' : ''}"><span>${icon}</span>${label}</button>`).join('');

export const titleFor = view => ({
  product: ['Ваш виджет Proofwall', 'Основной продукт остаётся доступен независимо от участия в программе.'],
  overview: ['Мария, бонусы уже здесь', 'Только ваши начисления и условия собственной подписки.'],
  credits: ['Польза вернулась к вам', 'Сервер показывает доступный бонус, резервы и итог вашего счёта.'],
  share: ['Рекомендуйте своим голосом', 'Личная ссылка и раскрытие бонуса — отправка всегда остаётся за вами.'],
}[view]);

function productCard(moment) {
  return `<section class="product-card" data-testid="product-preview">
    <div class="browser-bar"><i></i><i></i><i></i><span>proofwall.example/widget</span></div>
    <div class="proofwall-preview">
      <div class="preview-copy"><span class="section-kicker">PROOFWALL · СИНТЕТИЧЕСКИЙ ПРЕДПРОСМОТР</span><h2>Отзывы, которым верят</h2><p>Аккуратный виджет с историями клиентов готов для вашего сайта.</p><span class="product-status ${moment ? 'published' : ''}" data-testid="widget-status">${moment ? '✓ Виджет опубликован' : '○ Черновик готов'}</span></div>
      <div class="review-stack"><article><span>АК</span><div><b>Анна, студия «Смысл»</b><p>«Собрали отзывы и добавили их на лендинг за вечер»</p></div></article><article><span>ИЛ</span><div><b>Илья, продуктовая команда</b><p>«Теперь социальное доказательство видно сразу»</p></div></article></div>
    </div>
  </section>`;
}

function invitation(program) {
  return `<section class="invitation" data-testid="invite-offer">
    <div><span class="section-kicker">ПОСЛЕ ПОЛЕЗНОГО ДЕЙСТВИЯ</span><h2>Поделитесь Proofwall, если он вам помог</h2><p>Друг получит знакомство с продуктом, а вы — бонус на свою подписку только после подтверждённой оплаты и проверки возврата.</p>
      <dl class="terms-grid" data-testid="credit-policy"><div><dt>Условия</dt><dd>Версия ${escape(program.version)} · credit</dd></div><div><dt>Окно рекомендации</dt><dd>${escape(program.policy.windowDays)} дней</dd></div><div><dt>Проверка возврата</dt><dd>${escape(program.policy.holdDays)} дней</dd></div><div><dt>Формат</dt><dd>Бонус на подписку, не деньги</dd></div></dl>
    </div>
    <form id="enrollment-form" class="consent-card" data-testid="enrollment-form">
      <span class="brand-mini"><i>к</i> круг.</span><strong>Участие добровольное</strong><p>${escape(program.terms)}</p>
      <label class="consent"><input id="enrollment-consent" data-testid="enrollment-consent" type="checkbox"> <span>Я хочу участвовать и понимаю, что рекомендация содержит раскрытие бонуса.</span></label>
      <button class="primary" id="enrollment-submit" data-testid="enrollment-submit" type="submit">Получить личную ссылку</button>
      <button class="quiet" id="decline-invite" data-testid="decline-invite" type="button">Не сейчас, продолжить работу</button>
      <small>Открытие этого экрана и чтение условий не создают участие.</small>
    </form>
  </section>`;
}

export function productView({ program, moment, declined, embedded }) {
  const waiting = embedded && !moment ? `<section class="waiting-card" data-testid="value-moment-waiting"><span>○</span><div><strong>Ждём публикацию виджета в Proofwall</strong><p>Предложение появится только после подтверждённого события от родительского окна.</p></div></section>` : '';
  const action = !embedded && !moment ? `<button class="primary publish-button" id="publish-widget" data-testid="publish-widget">Опубликовать демо-виджет</button>` : '';
  const declinedView = moment && declined ? `<section class="declined-card" data-testid="invite-declined"><div><strong>Предложение отложено</strong><p>Виджет опубликован и продолжает работать. Участие не создано.</p></div><button class="secondary" id="restore-invite" data-testid="restore-invite">Вернуть предложение</button></section>` : '';
  return `${productCard(moment)}${action}${waiting}${declinedView}${moment && !declined && !program.enrollment ? invitation(program) : ''}${program.enrollment ? `<section class="enrolled-note" data-testid="enrollment-status"><span>✓</span><div><strong>Вы участвуете добровольно</strong><p>Согласие и версия условий сохранены на сервере. Личная ссылка доступна в разделе «Рекомендовать».</p></div></section>` : ''}`;
}

function balanceCards(credit) {
  return `<div class="metrics credit-metrics" data-testid="credit-balance">
    ${metric('На проверке', money(credit.heldMinor), 'Станет доступно после hold')}
    ${metric('Доступно', money(credit.availableMinor), 'Можно зарезервировать для счёта')}
    ${metric('В резерве', money(credit.reservedMinor), 'Pending и unknown не расходуются повторно')}
    ${metric('Применено', money(credit.appliedMinor), 'Подтверждено биллингом')}
  </div>`;
}

function ledgerView(credit) {
  if (!credit.ledger.length) return `<div data-testid="credit-empty">${empty('Подтверждённых начислений пока нет. Клик или регистрация сами по себе бонус не создают.')}</div>`;
  return `<div class="ledger-list" data-testid="credit-ledger">${credit.ledger.map(entry => `<article>
    <span class="ledger-icon">${entry.amountMinor < 0 ? '↘' : '↗'}</span><div><strong>${escape(sourceName(entry.reason))}</strong><small>Источник ${escape(entry.paymentId)} · правило V${escape(entry.policyVersion)}</small><small>Проверка до ${date(entry.availableAt)} · запись не переписывается</small></div><b>${money(entry.amountMinor)}</b>
  </article>`).join('')}</div>`;
}

function reservationList(credit, actors) {
  if (!credit.reservations.length) return `<div data-testid="reservation-empty">${empty('Резервов ещё нет. Доступный бонус можно применить к счёту ниже.')}</div>`;
  return `<div class="reservation-list" data-testid="reservation-list">${credit.reservations.map(item => {
    const transitions = item.transitions.length ? item.transitions.map(step => {
      const operator = actors.find(actor => actor.id === step.operatorId);
      return `<li>${date(step.at)} · ${escape(statusName(step.state))}<small>Сохранённый оператор: ${escape(operator?.name || step.operatorId)}</small></li>`;
    }).join('') : '<li>Резерв создан клиентом<small>Результат fixture-биллинга ещё не сохранён</small></li>';
    return `<article data-testid="reservation-${escape(item.state)}"><div class="reservation-head"><div><strong>${money(item.amountMinor)}</strong><small>Операция ${escape(item.id)}</small></div><div>${stateBadge(item.state)}<small>Текущее состояние: ${escape(item.state)}</small></div></div><ol>${transitions}</ol></article>`;
  }).join('')}</div>`;
}

export function overviewView(credit) {
  return `<div class="customer-hero hero"><div class="hero-copy"><span class="section-kicker">ВАША РЕКОМЕНДАЦИЯ · СИНТЕТИЧЕСКИЙ ПИЛОТ</span><h2>Друг оплатил Proofwall — бонус появился в истории</h2><p>Сервер связал подтверждённую fixture-оплату другого клиента с вашим промокодом. Сначала бонус проходит проверку возврата, затем становится доступен для собственной подписки.</p><div class="actions"><button class="primary" data-view="credits" data-testid="overview-to-credits">Посмотреть баланс</button><button class="secondary" data-view="share" data-testid="overview-to-share">Моя ссылка</button></div></div><div class="hero-art"><div class="bonus-orbit"><span>+${money(credit.ledger.find(entry => entry.amountMinor > 0)?.amountMinor)}</span><small>не денежная выплата</small></div></div></div>
  ${balanceCards(credit)}
  <div class="two-col"><section class="panel"><span class="section-kicker">ПРОВЕРЯЕМЫЙ ИСТОЧНИК</span><h2>История начислений</h2>${ledgerView(credit)}</section><section class="panel rules-panel"><span class="section-kicker">КОГДА БОНУСА НЕТ</span><h2>Оплата — обязательное условие</h2><ul><li><b>Переход или регистрация</b><span>Источник можно сохранить, доступный бонус не появляется.</span></li><li><b>Самореферал</b><span>Сервер отклоняет начисление.</span></li><li><b>Непроверенная оплата</b><span>Остаётся неподтверждённой, без доступного бонуса.</span></li></ul></section></div>`;
}

export function creditsView(credit, actors) {
  const canReserve = credit.availableMinor > 0 && credit.invoice.remainingMinor > credit.reservedMinor;
  return `${balanceCards(credit)}<div class="two-col credit-grid"><section class="panel invoice-card" data-testid="invoice-card"><span class="section-kicker">СЛЕДУЮЩАЯ ПОДПИСКА PROOFWALL</span><h2>Счёт и бонус — данные сервера</h2><dl><div><dt>Исходный счёт</dt><dd data-testid="invoice-original">${money(credit.invoice.amountMinor)}</dd></div><div><dt>Активный резерв</dt><dd data-testid="invoice-reserved">${money(credit.invoice.reservedMinor)}</dd></div><div class="total"><dt>Осталось по счёту</dt><dd data-testid="invoice-remaining">${money(credit.invoice.remainingMinor)}</dd></div></dl><p>${escape(credit.explanation)}</p><button class="primary" id="reserve-credit" data-testid="reserve-credit" ${canReserve ? '' : 'disabled'}>${canReserve ? `Применить доступные ${money(credit.availableMinor)}` : 'Нет доступного бонуса'}</button><small class="button-note">Кнопка создаёт резерв. Она не списывает деньги и не подменяет результат биллинга.</small>${credit.adjustmentMinor < 0 ? `<div class="negative-note" data-testid="credit-adjustment">Корректировка ${money(credit.adjustmentMinor)} требует сверки. Ранее применённый бонус не переписан.</div>` : ''}</section>
  <section class="panel"><span class="section-kicker">ОПЕРАЦИИ С БОНУСОМ</span><h2>Резерв и сохранённые исходы</h2>${reservationList(credit, actors)}</section></div>
  <section class="panel operator-lab" data-testid="operator-lab"><div class="operator-copy"><span class="section-kicker">ОТДЕЛЬНАЯ ЛАБОРАТОРИЯ ОПЕРАТОРА</span><h2>Fixture-результат биллинга</h2><p>Эти команды выполняются в явном контексте merchant. Клиент не получает это полномочие. Pending и unknown сохраняют резерв; unknown не разрешается автоматически.</p></div>${operatorControls(credit, actors)}</section>
  <section class="access-note" data-testid="read-only-parity"><strong>Личный агент с read-only доступом</strong><p>Может прочитать этот же собственный баланс через общее ядро. Вступление и резервирование не входят в такой grant и будут отклонены сервером до изменения данных.</p></section>`;
}

function operatorControls(credit, actors) {
  const active = credit.reservations.filter(item => ['pending', 'unknown'].includes(item.state));
  const merchant = actors.find(actor => actor.role === 'merchant');
  const resolution = active.length ? `<label class="field">Операция<select id="billing-reservation" data-testid="billing-reservation">${active.map(item => `<option value="${escape(item.id)}">${money(item.amountMinor)} · ${escape(item.state)}</option>`).join('')}</select></label><div class="actions"><button class="primary" id="billing-success" data-testid="billing-success">Успех</button><button class="secondary" id="billing-failed" data-testid="billing-failed">Подтверждённый отказ</button><button class="secondary unknown-button" id="billing-unknown" data-testid="billing-unknown">Результат неизвестен</button></div>` : `<div class="operator-empty" data-testid="operator-empty"><strong>Нет резерва для решения</strong><small>Исторические операции остаются в списке без изменений.</small></div>`;
  return `<div class="operator-controls"><small>Контекст: ${escape(merchant?.name || 'fixture merchant')}</small><div class="fixture-actions"><strong>Проверить правила события</strong><button class="secondary" id="lab-payment" data-testid="lab-payment">Подтверждённая оплата друга → hold</button><button class="secondary" id="lab-self-referral" data-testid="lab-self-referral">Самореферал → без бонуса</button><small>Обе кнопки отправляют строгий fixture event через merchant-контекст. Переход и регистрация не считаются оплатой.</small></div>${resolution}</div>`;
}

export function shareView(share) {
  if (!share) return `<section class="panel" data-testid="share-empty">${empty('Личная ссылка появится только после добровольного участия.')}</section>`;
  return `<div class="share-hero hero" data-testid="share-kit"><div class="hero-copy"><span class="section-kicker">ВАШ ЛИЧНЫЙ SHARE KIT</span><h2>Добавьте к готовому тексту свой голос</h2><p>Ничего не отправляется автоматически. Скопируйте материалы и выберите получателя сами.</p><label class="field">Личная ссылка<input id="share-url" data-testid="share-url" value="${escape(share.referralUrl)}" readonly></label><label class="field">Промокод<input id="share-promo" data-testid="share-promo" value="${escape(share.promoCode)}" readonly></label><div class="actions"><button class="primary" id="copy-share" data-testid="copy-share">Скопировать комплект</button><button class="secondary" id="copy-url" data-testid="copy-url">Только ссылку</button></div></div><div class="hero-art"><div class="message-preview"><span class="brand-mini"><i>к</i> круг.</span><p>${escape(share.text)}</p><blockquote>${escape(share.disclosure)}</blockquote><small>Раскрытие бонуса включено в комплект</small></div></div></div>
  <section class="panel disclosure-panel"><span class="section-kicker">ПРОЗРАЧНАЯ РЕКОМЕНДАЦИЯ</span><h2>Что будет скопировано</h2><p data-testid="share-text">${escape(share.text)}</p><div class="disclosure" data-testid="share-disclosure">${escape(share.disclosure)}</div><p class="hint">Персональная ссылка ведёт в синтетическую программу. Реальная отправка и внешние интеграции в F1 не подключены.</p></section>`;
}
