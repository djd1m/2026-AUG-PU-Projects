import { badge, date, empty, escape, metric, money } from '/shared/ui/ui.mjs';

const statusLabel = {
  draft: 'Черновик', approved: 'Утверждён', stale: 'Нужен пересчёт',
  partially_sent: 'Отправлен частично', sent: 'Отправлен вручную',
};
const reasonLabel = {
  held: 'Ещё действует hold-период', refunded_or_disputed: 'Возврат или спор',
  subscription_credit: 'Бонус на подписку', outside_period: 'Другой период',
  sent: 'Уже отмечено отправленным', allocated: 'В другом реестре',
  invalid_promo_or_link: 'Неверный промокод или ссылка', self_referral: 'Самореферал',
  attribution_expired: 'Окно атрибуции истекло', no_attribution: 'Нет атрибуции',
};
const percent = bps => {
  const whole = Math.floor(bps / 100), fraction = bps % 100;
  return `${whole}${fraction ? `,${String(fraction).padStart(2, '0').replace(/0$/, '')}` : ''}%`;
};
const registryBadge = value => `<span class="badge state-${escape(value)}">${escape(statusLabel[value] || value)}</span>`;

export const nav = active => [
  ['dashboard', 'Обзор', '⌁'], ['program', 'Правила', '◫'], ['registry', 'Реестр', '▤'],
  ['invite', 'Приглашение', '↗'], ['tariff', 'Тариф', '◇'],
].map(([id, label, icon]) => `<button data-view="${id}" data-testid="nav-${id}" class="${active === id ? 'active' : ''}" ${active === id ? 'aria-current="page"' : ''}><span aria-hidden="true">${icon}</span>${label}</button>`).join('');

export function dashboardView(data) {
  const { summary, policy, partners, payments, refunds, ledger, exceptions, fixtureEvents, labRefund } = data;
  const recent = [...payments].reverse().slice(0, 6);
  const labPaymentExists = payments.some(payment => payment.objectId === fixtureEvents.payment.objectId);
  return `<div class="hero merchant-hero">
    <div class="hero-copy"><span class="eyebrow">ПРОГРАММА РАБОТАЕТ</span><h2>Все начисления — в одном понятном круге</h2><p>Каждая сумма связана с конкретной оплатой, условиями программы и последующими исправлениями.</p><div class="hero-tags"><span>Версия правил ${escape(policy.version)}</span><span>Источник v${escape(data.sourceVersion)}</span><span>${date(data.clock)}</span></div></div>
    <div class="hero-art"><div class="orbit" aria-hidden="true"><span>к</span><i></i><b></b></div></div>
  </div>
  <div class="metrics" data-testid="dashboard-summary">${metric('Начислено', money(summary.accruedMinor), 'до вычета коррекций')}${metric('Доступно к реестру', money(summary.availableMinor), 'по данным сервера')}${metric('На проверке', money(summary.heldMinor), 'до конца hold-периода')}${metric('Отмечено отправленным', money(summary.sentMinor), 'синтетические факты')}</div>
  <div class="two-col overview-grid"><section class="panel"><div class="panel-header"><div><span class="section-kicker">РАЗБИВКА</span><h2>Партнёры</h2></div><button class="quiet" data-view="registry">Закрыть месяц →</button></div>
    <div class="partner-list">${partners.length ? partners.map(p => `<article><span class="avatar">${escape(p.name.slice(0, 1))}</span><div><strong>${escape(p.name)}</strong><small>${money(p.summary.availableMinor)} доступно · ${money(p.summary.heldMinor)} на проверке</small></div><b>${money(p.summary.accruedMinor)}</b></article>`).join('') : empty('Партнёры пока не появились.')}</div>
    <div class="breakdown"><span>Коррекции</span><strong data-testid="adjustment-total">${money(summary.adjustmentMinor)}</strong><small>Возвраты остаются отдельными неизменяемыми проводками.</small></div>
  </section><section class="panel"><div class="panel-header"><div><span class="section-kicker">СОБЫТИЯ</span><h2>Последние оплаты</h2></div><span class="count">${payments.length}</span></div>
    <div class="event-list" data-testid="payment-history">${recent.length ? recent.map(p => `<article><span class="event-icon ${p.rewardMinor ? '' : 'muted-icon'}">${p.rewardMinor ? '↗' : '–'}</span><div><strong>${escape(p.objectId)}</strong><small>${date(p.paidAt)} · правило v${escape(p.policyVersion)} · ${escape(p.attribution.channel)}</small></div><div><b>${money(p.rewardMinor)}</b><small>${date(p.availableAt)}</small></div></article>`).join('') : empty('Подтверждённых оплат пока нет.')}</div>
  </section></div>
  <section class="panel lab-panel"><div class="panel-header"><div><span class="section-kicker">ЛАБОРАТОРИЯ F1</span><h2>Проверить событие без реальных денег</h2></div><span class="fixture-pill">fixture · confirmed</span></div>
    <p>Добавьте подтверждённое продление, повторите его с тем же идентификатором или внесите частичный возврат. Повтор оплаты не восстановит отменённую комиссию.</p>
    <div class="lab-facts"><span><b>${escape(fixtureEvents.payment.objectId)}</b> ${money(fixtureEvents.payment.amountMinor)}</span><span><b>${escape(labRefund.objectId)}</b> ${money(labRefund.amountMinor)}</span><span><b>${ledger.length}</b> проводок · <b>${refunds.length}</b> возвратов</span></div>
    <div class="actions"><button class="primary" id="fixture-payment" data-testid="fixture-payment">Добавить оплату</button><button class="secondary" id="fixture-replay" data-testid="fixture-replay">Повторить оплату</button><button class="secondary danger-soft" id="fixture-refund" data-testid="fixture-refund" ${labPaymentExists ? '' : 'disabled title="Сначала добавьте оплату"'}>Зарегистрировать возврат</button></div>
    <details class="lab-controls"><summary>Изменить демо-время</summary><label class="field compact-field">Дней вперёд<input id="advance-days" data-testid="advance-days" type="number" min="0" max="365" value="1" inputmode="numeric"></label><button class="secondary" id="fixture-advance" data-testid="fixture-advance">Продвинуть часы</button></details>
  </section>
  ${exceptions.length ? `<section class="panel alert-panel" data-testid="exceptions"><div class="panel-header"><h2>Требуется сверка</h2><span class="count warning-count">${exceptions.length}</span></div>${exceptions.map(e => `<article class="exception"><strong>${escape(e.type)}</strong><span>${money(e.amountMinor)}</span><p>${escape(e.explanation)}</p></article>`).join('')}</section>` : ''}`;
}

export function programView(program) {
  const p = program.policy;
  return `<div class="two-col program-grid"><section class="panel"><span class="section-kicker">ТЕКУЩАЯ ВЕРСИЯ ${escape(program.version)}</span><h2>Правила программы</h2><p>Каждое сохранение создаёт новую версию. Уже созданные начисления сохраняют прежнее правило.</p>
    <form id="policy-form" data-testid="policy-form" novalidate>
      <label class="field">Тип вознаграждения<select name="kind" id="policy-kind" data-testid="policy-kind" required><option value="">Выберите тип</option><option value="cash" ${p.kind === 'cash' ? 'selected' : ''}>Денежная комиссия</option><option value="credit" ${p.kind === 'credit' ? 'selected' : ''}>Бонус на подписку</option></select></label>
      <div class="form-grid"><label class="field">Ставка, %<input name="rate" id="policy-rate" data-testid="policy-rate" type="text" inputmode="decimal" value="${escape(percent(p.bps).slice(0, -1))}" placeholder="Например, 20" required><small>От 0,01% до 100%</small></label><label class="field">Окно атрибуции, дней<input name="windowDays" id="policy-window" data-testid="policy-window" type="number" min="1" max="365" step="1" value="${escape(p.windowDays)}" required></label></div>
      <label class="field">Проверка возврата, дней<input name="holdDays" id="policy-hold" data-testid="policy-hold" type="number" min="0" max="90" step="1" value="${escape(p.holdDays)}" required></label>
      <label class="check-field"><input name="recurring" id="policy-recurring" data-testid="policy-recurring" type="checkbox" ${p.recurring ? 'checked' : ''}><span><b>Начислять за продления</b><small>Каждая новая подтверждённая оплата учитывается отдельно.</small></span></label>
      <div id="policy-errors" class="form-errors" data-testid="policy-errors" role="alert" hidden></div>
      <div class="actions"><button class="primary" type="submit" id="policy-save" data-testid="policy-save">Опубликовать новую версию</button></div>
    </form></section>
    <aside class="panel preview-panel"><span class="section-kicker">ПРЕВЬЮ ДЛЯ ПАРТНЁРА</span><div class="preview-brand"><span class="brand-mark">к</span><b>круг<span>.</span></b></div><h2>Рекомендуйте продукт, которому доверяете</h2><p>${escape(program.terms)}</p><dl class="terms-list"><div><dt>Ставка</dt><dd>${escape(percent(p.bps))}</dd></div><div><dt>Окно</dt><dd>${escape(p.windowDays)} дней</dd></div><div><dt>Проверка</dt><dd>${escape(p.holdDays)} дней</dd></div><div><dt>${p.kind === 'credit' ? 'Применение' : 'Выплата'}</dt><dd>${p.kind === 'credit' ? 'Бонус уменьшает следующий счёт подписки. Денежная выплата недоступна.' : escape(program.payoutSchedule)}</dd></div></dl><span class="pilot-label">Синтетический пилот · реальные ключи не подключены</span></aside></div>`;
}

export function registryView(artifact, dashboard, handoff = false) {
  if (!artifact) return `<section class="panel registry-empty" data-testid="registry-empty"><span class="empty-icon">▤</span><h2>Подготовьте реестр за август</h2><p>Сервер соберёт доступные денежные начисления и объяснит каждое исключение.</p><label class="field month-field">Расчётный период<input id="registry-period" data-testid="registry-period" type="month" value="2026-08" required></label><button class="primary" id="registry-prepare" data-testid="registry-prepare">Подготовить реестр</button></section>`;
  const transferByPartner = new Map((artifact.transfers || []).filter(t => t.revision === artifact.revision && t.hash === artifact.hash).map(t => [t.partnerId, t]));
  const stale = artifact.status === 'stale' || artifact.sourceVersion !== dashboard.sourceVersion;
  const visibleStatus = stale ? 'stale' : artifact.status;
  return `${handoff ? `<div class="handoff-note" data-testid="handoff-artifact">Продолжен тот же артефакт из задачи агента: <b>${escape(artifact.artifactId)}</b></div>` : ''}
  <section class="panel registry-head"><div><span class="section-kicker">РЕЕСТР ${escape(artifact.period)}</span><h2>К переводу ${money(artifact.amountMinor)}</h2><p>Ориентир: ${date(artifact.dueDate)} · строк: ${artifact.rows.length} · источник v${escape(artifact.sourceVersion)}</p></div><div class="registry-status">${registryBadge(visibleStatus)}<small>Версия ${escape(artifact.revision)}</small></div></section>
  ${stale ? `<div class="stale-banner" data-testid="registry-stale"><div><strong>Начисления изменились</strong><p>Эту версию больше нельзя утвердить или выгрузить. Пересчитайте тот же артефакт.</p></div><button class="primary" id="registry-recompute" data-testid="registry-recompute">Пересчитать</button></div>` : ''}
  <div class="two-col registry-grid"><section class="panel"><div class="panel-header"><div><span class="section-kicker">ТОЧНЫЙ СНИМОК</span><h2>Строки реестра</h2></div><span class="count">${artifact.rows.length}</span></div>
    <div class="table-wrap"><table data-testid="registry-rows"><thead><tr><th>Партнёр</th><th>Начислений</th><th>Сумма</th><th>Статус</th></tr></thead><tbody>${artifact.rows.length ? artifact.rows.map(r => { const t = transferByPartner.get(r.partnerId); return `<tr><td><strong>${escape(r.name)}</strong><small>${escape(r.partnerId)}</small></td><td>${r.obligationIds.length}</td><td>${money(r.amountMinor)}</td><td>${t ? badge('sent') : registryBadge(stale ? 'stale' : artifact.approval ? 'approved' : 'draft')}</td></tr>`; }).join('') : `<tr><td colspan="4">${empty('В этом снимке нет сумм к переводу.')}</td></tr>`}</tbody></table></div>
    <div class="artifact-meta"><span>ID <code data-testid="artifact-id">${escape(artifact.artifactId)}</code></span><span>hash <code data-testid="artifact-hash">${escape(artifact.hash)}</code></span></div>
    <div class="actions">${!stale && !artifact.approval && artifact.rows.length ? '<button class="primary" id="registry-approve" data-testid="registry-approve">Утвердить эту версию</button>' : ''}${!stale && artifact.approval ? '<button class="secondary" id="registry-export" data-testid="registry-export">Скачать точный CSV</button>' : ''}<button class="quiet" id="registry-refresh" data-testid="registry-refresh">Обновить</button></div>
    ${artifact.approval ? `<p class="approval-line">Утверждено ${date(artifact.approval.approvedAt)} · версия ${escape(artifact.approval.revision)}</p>` : ''}
  </section><section class="panel"><div class="panel-header"><div><span class="section-kicker">ИСКЛЮЧЕНИЯ</span><h2>Почему строки не вошли</h2></div><span class="count">${artifact.exclusions.length}</span></div>
    <div class="exclusion-list" data-testid="registry-exclusions">${artifact.exclusions.length ? artifact.exclusions.map(e => `<article><span>${escape(reasonLabel[e.reason] || e.reason)}</span><strong>${money(e.amountMinor)}</strong><small>${escape(e.paymentId)}</small></article>`).join('') : empty('Исключений нет.')}</div></section></div>
  ${artifact.approval && !stale && artifact.rows.some(r => !transferByPartner.has(r.partnerId)) ? sentForm(artifact, transferByPartner, dashboard.clock) : ''}
  ${artifact.transfers?.length ? `<section class="panel" data-testid="transfer-facts"><div class="panel-header"><div><span class="section-kicker">РУЧНЫЕ ФАКТЫ</span><h2>Отмечено оператором</h2></div><span class="count">${artifact.transfers.length}</span></div>${artifact.transfers.map(t => `<article class="transfer-row"><div><strong>${money(t.amountMinor)}</strong><small>${escape(t.evidence)}</small></div><div><span>${date(t.sentAt)}</span><small>Версия реестра: ${escape(t.revision)}</small><small>Оператор: ${escape(t.actorId === dashboard.actor.id ? dashboard.actor.name : t.actorId)}</small><small>Не подтверждает зачисление в банке</small></div></article>`).join('')}</section>` : ''}`;
}

function sentForm(artifact, transfers, clock) {
  const rows = artifact.rows.filter(r => !transfers.has(r.partnerId));
  return `<section class="panel manual-panel"><div><span class="section-kicker">ПОСЛЕ ПЕРЕВОДА ВНЕ КРУГА</span><h2>Отметить ручную отправку</h2><p>CSV сам по себе не означает отправку. Сохраните отдельный синтетический факт с доказательством и датой оператора.</p></div><form id="sent-form" data-testid="sent-form">
    <label class="field">Партнёр<select id="sent-partner" data-testid="sent-partner" required><option value="">Выберите строку</option>${rows.map(r => `<option value="${escape(r.partnerId)}">${escape(r.name)} · ${money(r.amountMinor)}</option>`).join('')}</select></label>
    <label class="field">Доказательство оператора<input id="sent-evidence" data-testid="sent-evidence" maxlength="500" placeholder="Например, номер платёжного поручения" required></label>
    <label class="field">Дата отправки<input id="sent-date" data-testid="sent-date" type="date" max="${escape(clock.slice(0, 10))}" required><small>Демо-часы: ${date(clock)}</small></label>
    <button class="primary" id="registry-sent" data-testid="registry-sent" type="submit">Сохранить факт</button></form></section>`;
}

export function inviteView(program) {
  const url = new URL(program.enrollmentUrl, location.origin).href;
  return `<div class="hero invite-hero"><div class="hero-copy"><span class="section-kicker">ПРИГЛАШЕНИЕ В ПРОГРАММУ</span><h2>Первые партнёры начинаются с ясных условий</h2><p>Это предпросмотр ссылки вступления в текущем демосеансе. Публикация ваших условий для другого браузера пока не подключена. Личная ссылка рекомендации появится у партнёра после согласия.</p><div class="link-box"><input id="enrollment-link" data-testid="enrollment-link" value="${escape(url)}" readonly aria-label="Ссылка для вступления в программу"><button class="primary" id="copy-enrollment" data-testid="copy-enrollment">Скопировать</button></div></div><div class="hero-art invite-art"><div class="invite-card"><span class="preview-brand"><span class="brand-mark">к</span><b>круг<span>.</span></b></span><small>ДЕЙСТВУЮЩИЕ УСЛОВИЯ · V${escape(program.version)}</small><strong>${escape(percent(program.policy.bps))}</strong><p>${escape(program.terms)}</p><span class="pilot-label">Брендированный синтетический пилот</span></div></div></div>
  <section class="panel"><div class="panel-header"><div><span class="section-kicker">ПЕРЕД ОТПРАВКОЙ</span><h2>Что увидит партнёр</h2></div></div><div class="invite-steps"><article><span>1</span><div><strong>Условия до согласия</strong><p>Ставка, hold-период и порядок ручной выплаты доступны заранее.</p></div></article><article><span>2</span><div><strong>Добровольное вступление</strong><p>Круг не включает пользователя автоматически.</p></div></article><article><span>3</span><div><strong>Личная ссылка после вступления</strong><p>Она отличается от этой ссылки владельца.</p></div></article></div></section>`;
}

export function enrollmentPreview(program) {
  return `<div class="hero invite-hero" data-testid="enrollment-preview"><div class="hero-copy"><span class="section-kicker">ПРИГЛАШЕНИЕ В ПРОГРАММУ</span><h2>Рекомендуйте продукт на понятных условиях</h2><p>${escape(program.terms)}</p><dl class="terms-list"><div><dt>Ставка</dt><dd>${escape(percent(program.policy.bps))}</dd></div><div><dt>Окно атрибуции</dt><dd>${escape(program.policy.windowDays)} дней</dd></div><div><dt>Проверка возврата</dt><dd>${escape(program.policy.holdDays)} дней</dd></div><div><dt>Порядок выплаты</dt><dd>${escape(program.payoutSchedule)}</dd></div></dl></div><div class="hero-art invite-art"><div class="invite-card"><span class="preview-brand"><span class="brand-mark">к</span><b>круг<span>.</span></b></span><small>УСЛОВИЯ · ВЕРСИЯ ${escape(program.version)}</small><strong>${escape(percent(program.policy.bps))}</strong><p>Это предпросмотр синтетического пилота. Открытие ссылки не включает вас в программу.</p><span class="pilot-label">Реальные выплаты не подключены</span></div></div></div><section class="panel consent-preview"><h2>Участие требует отдельного согласия</h2><p>В F1 этот предпросмотр показывает условия текущего демосеанса. В другом браузере создаётся отдельная программа с начальными условиями. Вступление и личная referral-ссылка доступны в отдельном кабинете партнёра после явного подтверждения.</p><a class="secondary" href="/" data-testid="enrollment-back">Вернуться в кабинет владельца</a></section>`;
}

export function tariffView(tariff) {
  return `<div class="two-col tariff-grid"><section class="panel tariff-card"><span class="pilot-label">ТАРИФНАЯ ГИПОТЕЗА · НЕ ОФЕРТА</span><h2>Круг / Пилот</h2><p class="tariff-lead">Проверьте операционный процесс на синтетических данных.</p><div class="tariff-price">Цена не утверждена</div><ul><li>До 100 партнёров — рабочее допущение</li><li>Учёт оплат, возвратов и версий</li><li>Реестр ручных выплат</li><li>Брендированный кабинет программы</li></ul><button class="primary" id="tariff-interest" data-testid="tariff-interest">Отметить интерес · без оплаты</button><small class="tariff-foot">Платёжная форма и списание недоступны в F1.</small></section>
  <section class="panel"><span class="section-kicker">ЧЕСТНЫЙ СТАТУС</span><h2>Что уже можно проверить</h2><div class="status-list"><div class="status-item"><span class="status-dot">✓</span><div><strong>Сохранение на сервере</strong><small>Политики, события и реестры переживают обновление страницы.</small></div></div><div class="status-item"><span class="status-dot">✓</span><div><strong>Ручной процесс выплат</strong><small>Выгрузка и отметка отправки разделены.</small></div></div><div class="status-item pending-dot"><span class="status-dot">…</span><div><strong>Production-платежи</strong><small>${tariff.realBillingAvailable ? 'Доступны' : 'Не подключены. Реальные деньги не принимаются и не отправляются.'}</small></div></div></div></section></div>`;
}

export const titleFor = view => ({ dashboard: ['Добрый день', 'Проверяйте начисления, исправления и готовность месяца.'], program: ['Настройте программу', 'Опубликуйте явные условия для будущих начислений.'], registry: ['Закройте август', 'Один артефакт, точная версия и отдельный ручной факт отправки.'], invite: ['Пригласите партнёров', 'Поделитесь условиями участия, когда будете готовы.'], tariff: ['Пилот для владельца', 'Тарифная гипотеза без платёжной формы и списаний.'] }[view]);
