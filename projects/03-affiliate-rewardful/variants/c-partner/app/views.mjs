import { badge, date, empty, escape, money } from '/shared/ui/ui.mjs';

const percent = bps => {
  const whole = Math.floor(bps / 100), fraction = bps % 100;
  return `${whole}${fraction ? `,${String(fraction).padStart(2, '0').replace(/0$/, '')}` : ''}%`;
};
const rewardKind = kind => kind === 'cash' ? 'Денежная комиссия' : 'Бонус на подписку';
const channelName = channel => ({ promo:'Промокод', link:'Личная ссылка', none:'Без атрибуции' }[channel] || channel);
const reasonName = reason => ({ confirmed_payment:'Подтверждённая оплата', refund:'Подтверждённый возврат' }[reason] || reason);
const summaryMetric = (testId, label, value, detail) => `<article class="metric-card" data-testid="${testId}"><span>${escape(label)}</span><strong>${escape(value)}</strong><small>${escape(detail)}</small></article>`;

export const nav = (active, enrolled) => [
  ['overview', 'Обзор', '○'], ['terms', 'Условия', '◫'], ['history', 'Доход и выплаты', '▤'],
  ['share', enrolled ? 'Мои материалы' : 'Личная ссылка', '↗'],
].map(([id, label, icon]) => `<button data-view="${id}" data-testid="nav-${id}" class="${active === id ? 'active' : ''}" ${active === id ? 'aria-current="page"' : ''}><span aria-hidden="true">${icon}</span>${label}</button>`).join('');

export const titleFor = view => ({
  overview: ['Ваш партнёрский круг', 'Собственные начисления, сроки и сохранённые факты — из общего сервера.'],
  terms: ['Условия до вступления', 'Прочитайте опубликованные правила целиком, затем решите, участвовать ли в программе.'],
  history: ['Доход и выплаты', 'Исторические правила каждого начисления и только ваши денежные операции.'],
  share: ['Личный комплект рекомендации', 'Ссылка, промокод и прозрачное раскрытие вознаграждения. Отправка остаётся за вами.'],
}[view]);

function policyFacts(program) {
  const p = program.policy;
  return `<dl class="terms-facts" data-testid="program-terms">
    <div><dt>Формат</dt><dd data-testid="term-kind">${escape(rewardKind(p.kind))}</dd><small>Тип: ${escape(p.kind)}</small></div>
    <div><dt>Ставка</dt><dd data-testid="term-rate">${escape(percent(p.bps))}</dd><small>От подтверждённой оплаты</small></div>
    <div><dt>Окно</dt><dd data-testid="term-window">${escape(p.windowDays)} дней</dd><small>Для атрибуции рекомендации</small></div>
    <div><dt>Hold</dt><dd data-testid="term-hold">${escape(p.holdDays)} дней</dd><small>Проверка возможного возврата</small></div>
    <div><dt>Версия</dt><dd data-testid="term-version">V${escape(p.version)}</dd><small data-testid="term-effective">Опубликована ${date(p.publishedAt)}</small></div>
    <div><dt>Порядок выплаты</dt><dd data-testid="term-schedule">${escape(program.payoutSchedule)}</dd><small>Отметка отправки не равна зачислению</small></div>
  </dl>`;
}

export function termsView(program) {
  const enrollment = program.enrollment;
  const consent = enrollment ? `<section class="joined-card" data-testid="enrollment-status"><span>✓</span><div><strong>Вы участвуете в программе</strong><p>Согласие сохранено ${date(enrollment.joinedAt)} по версии V${escape(enrollment.policyVersion)}. Личная ссылка доступна в материалах.</p></div><button class="secondary" data-view="share">Открыть материалы</button></section>` : `<form id="enrollment-form" class="consent-card" data-testid="enrollment-form">
    <div><span class="section-kicker">ДОБРОВОЛЬНОЕ УЧАСТИЕ</span><h2>Получить личную ссылку</h2><p>${escape(program.terms)}</p></div>
    <label class="consent"><input id="enrollment-consent" data-testid="enrollment-consent" type="checkbox"> <span><b>Я прочитала условия выше и хочу участвовать.</b><small>Согласие создаёт одно участие. Повторный запрос вернёт его же.</small></span></label>
    <button class="primary" id="enrollment-submit" data-testid="enrollment-submit" type="submit">Вступить и получить ссылку</button>
    <small>Личная ссылка отличается от страницы вступления. Открытие экрана само по себе ничего не создаёт.</small>
  </form>`;
  return `<section class="terms-hero"><div><span class="section-kicker">ОПУБЛИКОВАННАЯ ПРОГРАММА</span><h2>20 секунд, чтобы понять правила</h2><p>Комиссия появляется только после подтверждённой оплаты. Саморефералы исключены, а возвраты сохраняются отдельными корректировками.</p></div><div class="terms-seal"><span>V${escape(program.version)}</span><small>актуальные условия</small></div></section>${policyFacts(program)}${consent}`;
}

export function overviewView(program, partner) {
  const s = partner.summary;
  const lastTransfer = partner.transfers.at(-1);
  return `<section class="partner-hero hero"><div class="hero-copy"><span class="section-kicker">АННА · ПАРТНЁРСКИЙ КАБИНЕТ</span><h2>${program.enrollment ? 'Ваши рекомендации уже работают' : 'Сначала правила, затем участие'}</h2><p>${program.enrollment ? 'Сервер показывает ваши комиссии и причины изменений. Здесь нет данных других партнёров.' : 'Условия доступны до согласия. Личная ссылка появится только после добровольного вступления.'}</p><div class="actions"><button class="primary" data-view="${program.enrollment ? 'history' : 'terms'}" data-testid="overview-primary">${program.enrollment ? 'Проверить доход' : 'Прочитать условия'}</button><button class="secondary" id="refresh-partner" data-testid="refresh-partner">Обновить данные</button></div></div><div class="hero-art"><div class="income-card"><small>ДОСТУПНО ПО ДАННЫМ СЕРВЕРА</small><strong>${money(s.availableMinor)}</strong><span>${badge(s.availableMinor > 0 ? 'available' : 'pending')}</span><p>Ориентир выплаты: ${date(s.dueDate)}</p></div></div></section>
  <div class="metrics partner-metrics" data-testid="partner-summary">${summaryMetric('summary-available', 'Доступно', money(s.availableMinor), 'для следующего реестра')}${summaryMetric('summary-held', 'На hold', money(s.heldMinor), 'до конца проверки возврата')}${summaryMetric('summary-adjustment', 'Коррекции', money(s.adjustmentMinor), 'отдельные записи истории')}${summaryMetric('summary-sent', 'Отмечено отправленным', money(s.sentMinor), 'не подтверждение банка')}</div>
  <div class="two-col"><section class="panel next-payment"><span class="section-kicker">СЛЕДУЮЩИЙ ОРИЕНТИР</span><h2>${date(s.dueDate)}</h2><p>${escape(s.explanation)}</p><div data-testid="payout-status" class="status-line">${lastTransfer ? `${badge('sent')}<span>Владелец отметил отправку ${date(lastTransfer.sentAt)}.</span>` : `${badge('pending')}<span>Факт отправки владельцем ещё не сохранён.</span>`}</div></section>
  <section class="panel truth-card"><span class="section-kicker">ЧТО ЗДЕСЬ ПОДТВЕРЖДЕНО</span><h2>Личный денежный срез</h2><ul><li>Только собственные cash-начисления Анны</li><li>Историческая версия правила у каждой записи</li><li>Зачисление в банке остаётся неизвестным</li></ul></section></div>
  <section class="access-note" data-testid="read-only-parity"><strong>Личный агент с read-only grant</strong><p>Может вызвать те же <code>program.read</code>, <code>partner.read</code> и <code>share.read</code> для Анны. Такой grant не разрешает вступление, изменение программы, реестр или отправку и не раскрывает другого партнёра. В F1 это описание parity общего ядра; настоящий wire MCP/A2A не подключён.</p></section>`;
}

function historicalPolicy(partner, version) {
  return partner.policies.find(policy => policy.version === version);
}
function commissionRows(partner) {
  if (!partner.payments.length) return `<div data-testid="commission-empty">${empty('Подтверждённых оплат по вашим рекомендациям пока нет.')}</div>`;
  return `<div class="commission-list" data-testid="commission-history">${[...partner.payments].reverse().map(payment => {
    const policy = historicalPolicy(partner, payment.policyVersion);
    const entries = partner.ledger.filter(entry => entry.paymentId === payment.paymentId);
    return `<article data-testid="commission-${escape(payment.paymentId)}"><div class="commission-main"><span class="commission-icon">${payment.rewardMinor ? '↗' : '–'}</span><div><strong>${escape(channelName(payment.attribution))} · оплата ${money(payment.amountMinor)}</strong><small>${date(payment.paidAt)} · доступность ${date(payment.availableAt)}</small></div><b>${money(payment.rewardMinor)}</b></div><dl><div><dt>Историческое правило</dt><dd data-testid="commission-policy-version">V${escape(payment.policyVersion)} · ${escape(policy ? percent(policy.bps) : 'версия недоступна')} · ${escape(policy?.kind || 'cash')}</dd></div><div><dt>Проводки</dt><dd>${entries.map(entry => `${escape(reasonName(entry.reason))} ${money(entry.amountMinor)}`).join(' · ') || 'Нет денежной проводки'}</dd></div></dl></article>`;
  }).join('')}</div>`;
}
function payoutRows(partner) {
  const content = partner.transfers.length ? [...partner.transfers].reverse().map(item => `<article data-testid="transfer-${escape(item.id)}"><div><strong>${money(item.amountMinor)}</strong><small>${date(item.sentAt)} · реестр V${escape(item.revision)}</small></div><div>${badge('sent')}<small>Зачисление в банке: не подтверждено</small></div><p>Основание fixture-оператора: ${escape(item.evidence)}</p></article>`).join('') : `<div data-testid="payout-empty">${empty('Владелец ещё не сохранил факт ручной отправки. Ориентир — до 5-го следующего месяца.')}</div>`;
  return `<div class="transfer-list" data-testid="payout-history">${content}</div>`;
}

export function historyView(partner, lab) {
  return `<div class="history-grid"><section class="panel"><div class="panel-header"><div><span class="section-kicker">НЕИЗМЕНЯЕМАЯ ИСТОРИЯ</span><h2>Комиссии и корректировки</h2></div><span class="source-pill">источник v${escape(partner.sourceVersion)}</span></div>${commissionRows(partner)}</section>
  <aside class="panel payout-panel"><span class="section-kicker">РУЧНЫЕ ВЫПЛАТЫ</span><h2>Статус перевода</h2><div data-testid="payout-status">${partner.transfers.length ? badge('sent') : badge('pending')}</div><p>${escape(partner.summary.explanation)}</p>${payoutRows(partner)}${partner.exceptions.length ? `<div class="reconcile-note"><strong>Требуется сверка</strong><p>${partner.exceptions.map(item => escape(item.explanation)).join(' ')}</p></div>` : ''}</aside></div>${operatorLab(lab, partner)}`;
}

function operatorLab(lab, partner) {
  if (!lab.available) return '';
  if (!lab.active) return `<section class="operator-lab operator-gate" data-testid="operator-lab"><div><span class="section-kicker">ОПЦИОНАЛЬНАЯ FIXTURE-ЛАБОРАТОРИЯ</span><h2>Отдельный контекст владельца</h2><p>Обычный кабинет уже загружен только с правами партнёра. Откройте лабораторию явно, чтобы проверить смену правил и отметку ручной отправки.</p></div><button class="secondary" id="open-operator-lab" data-testid="open-operator-lab">Открыть лабораторию</button></section>`;
  if (!lab.program?.policy) return `<section class="operator-lab operator-gate" data-testid="operator-lab"><div><h2>Лаборатория не загружена</h2><p>Обычные данные партнёра остаются доступны. Повторите явное открытие лаборатории.</p></div><button class="secondary" id="open-operator-lab" data-testid="open-operator-lab">Повторить загрузку</button></section>`;
  const p = lab.program.policy, artifact = lab.artifact;
  const ownRow = artifact?.rows.find(row => row.partnerId === partner.actor.id);
  const ownTransfer = artifact?.transfers?.find(item => item.partnerId === partner.actor.id && item.revision === artifact.revision);
  const exact = artifact ? `<div class="artifact-proof" data-testid="lab-artifact"><span>ID <code>${escape(artifact.artifactId)}</code></span><span>revision <b>${escape(artifact.revision)}</b></span><span>hash <code>${escape(artifact.hash)}</code></span></div>` : '';
  return `<section class="operator-lab" id="operator-lab-controls" tabindex="-1" data-testid="operator-lab-controls"><header><span>Лаборатория fixture-оператора</span><small>Отдельный merchant-контекст · синтетические факты</small></header><div class="lab-intro"><strong>Проверка смены правил и ручной выплаты</strong><p>Команды ниже явно выполняет «Владелец Круга». Они не расширяют права Анны, не покупают тариф и не переводят деньги. Реестр использует настоящий artifact ID, revision, hash и идемпотентные HTTP-команды общего ядра.</p></div>
  <form id="lab-policy-form" class="lab-policy" data-testid="lab-policy-form"><div><span class="section-kicker">1 · НОВАЯ ТЕКУЩАЯ ПОЛИТИКА</span><p>Старые комиссии сохранят свою версию.</p></div><label class="field">Ставка, %<input id="lab-policy-rate" data-testid="lab-policy-rate" inputmode="decimal" value="${escape(percent(p.bps).slice(0, -1))}" required></label><label class="field">Окно, дней<input id="lab-policy-window" data-testid="lab-policy-window" type="number" min="1" max="365" value="${escape(p.windowDays)}" required></label><label class="field">Hold, дней<input id="lab-policy-hold" data-testid="lab-policy-hold" type="number" min="0" max="90" value="${escape(p.holdDays)}" required></label><label class="lab-check"><input id="lab-policy-recurring" data-testid="lab-policy-recurring" type="checkbox" ${p.recurring ? 'checked' : ''}> Начислять за продления</label><button class="secondary" id="lab-policy-save" data-testid="lab-policy-save" type="submit">Опубликовать cash-версию</button></form>
  <section class="lab-registry"><div><span class="section-kicker">2 · РЕЕСТР И ОТМЕТКА ВЛАДЕЛЬЦА</span><h3>Только собственная строка Анны</h3><p>Реестр может содержать других получателей, но этот стенд показывает и отмечает только строку текущего партнёра.</p></div><div class="lab-buttons"><button class="secondary" id="lab-registry-prepare" data-testid="lab-registry-prepare">Подготовить август</button><button class="secondary" id="lab-registry-approve" data-testid="lab-registry-approve" ${artifact && artifact.rows.length && !artifact.approval ? '' : 'disabled'}>Утвердить точную версию</button><button class="primary" id="lab-registry-sent" data-testid="lab-registry-sent" ${artifact?.approval && ownRow && !ownTransfer ? '' : 'disabled'}>Отметить отправку Анне</button></div>${exact}<div class="lab-status" data-testid="lab-status">${ownTransfer ? `${badge('sent')} Владелец сохранил fixture-факт ${date(ownTransfer.sentAt)}. Банк не подтверждён.` : ownRow ? `Строка Анны: ${money(ownRow.amountMinor)} · ${badge(artifact.approval ? 'approved' : 'draft')}` : artifact ? 'В актуальном снимке нет доступной строки Анны.' : 'Сначала подготовьте серверный снимок.'}</div></section></section>`;
}

export function shareView(share) {
  if (!share) return `<section class="panel locked-share" data-testid="share-empty"><span class="share-lock">↗</span><h2>Личная ссылка появится после согласия</h2><p>Прочитайте опубликованные условия и подтвердите участие отдельным флажком. Страница вступления и будущая личная ссылка — разные адреса.</p><button class="primary" data-view="terms">Открыть условия</button></section>`;
  return `<section class="share-hero" data-testid="share-kit"><div class="share-copy"><span class="section-kicker">ПЕРСОНАЛЬНЫЙ SHARE KIT</span><h2>Рекомендуйте своим голосом</h2><p>Ничего не отправляется автоматически. Раскрытие комиссии уже включено в комплект.</p><label class="field">Личная ссылка<input id="share-url" data-testid="share-url" value="${escape(share.referralUrl)}" readonly></label><label class="field">Промокод<input id="share-promo" data-testid="share-promo" value="${escape(share.promoCode)}" readonly></label><div class="actions"><button class="primary" id="share-copy" data-testid="share-copy">Скопировать комплект</button><button class="secondary" id="share-copy-url" data-testid="share-copy-url">Только ссылку</button></div></div><aside class="share-preview"><span class="mini-brand"><i>к</i> круг.</span><p data-testid="share-text">${escape(share.text)}</p><blockquote data-testid="share-disclosure">${escape(share.disclosure)}</blockquote><small>Личная ссылка ведёт в синтетическую программу F1.</small></aside></section>`;
}
