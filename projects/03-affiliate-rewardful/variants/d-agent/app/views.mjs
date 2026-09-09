import { escape as e, money, date, badge, metric, empty } from '/shared/ui/ui.mjs';
import { roles } from './state.mjs';

const button = (id, text, style='secondary', disabled=false) => `<button id="${id}" data-testid="${id}" class="${style}" ${disabled?'disabled':''}>${text}</button>`;
const meta = (label, value, test='') => `<div><dt>${label}</dt><dd ${test?`data-testid="${test}"`:''}>${e(value)}</dd></div>`;
const time = value => value ? new Date(value).toLocaleString('ru-RU', {timeZone:'UTC'}) + ' UTC' : '—';
const reasons = { subscription_credit:'Бонус подписки — отдельное обязательство', outside_period:'За пределами августа', held:'Ещё на проверке', sent:'Уже отправлено вручную', allocated:'Закреплено за другим реестром', refunded_or_disputed:'Возврат или спор: к выплате не включён' };

export function nav(view) {
  return [['task','◇','Поручение'],['result','▤','Результат'],['access','↗','Полномочия']].map(([id,icon,title])=>`<button data-view="${id}" class="${view===id?'active':''}" aria-current="${view===id?'page':'false'}"><span aria-hidden="true">${icon}</span>${title}</button>`).join('');
}
export function roleSelector(role, available) {
  return `<div class="fixture-context"><span>Лаборатория · выбор роли в этом сеансе</span><div class="role-tabs" aria-label="Fixture-контекст">${available.map(r=>`<button data-role="${r}" data-testid="role-${r}" class="${r===role?'active':''}" aria-pressed="${r===role}">${roles[r].label}</button>`).join('')}</div><small>Каждый контекст действует от своего субъекта. Доступ проверяет сервер.</small></div>`;
}
export function hero(role, task) {
  return `<section class="agent-hero"><div><span class="section-kicker">ВАШ ЛИЧНЫЙ АГЕНТ</span><h2>Поручите подготовку.<br>Сохраните контроль.</h2><p>${e(roles[role].detail)}</p><div class="hero-tags"><span>Ограниченные права</span><span>Проверяемый результат</span></div></div><div class="agent-visual" aria-hidden="true"><div class="orbit"><span class="agent-mark">к</span><i>✓</i></div><div class="visual-card"><span>ПОРУЧЕНИЕ</span><strong>${task?'Задача сохранена':'Готов к вашему поручению'}</strong><small>Общий сервер · PostgreSQL</small></div></div></section>`;
}
export function grantView(role, actor, state) {
  const grant=state.grant;
  return `<section class="panel grant-panel"><div class="panel-header"><div><span class="section-kicker">01 / ПОЛНОМОЧИЯ</span><h2>Ровно столько, сколько нужно</h2></div><span class="scope-icon" aria-hidden="true">⌑</span></div><p>${e(roles[role].goal)}</p>
    <dl class="meta-grid">${meta('Субъект', `${actor.name} · ${actor.id}`, 'grant-subject')}${meta('Разрешённые действия', (grant?.actions||roles[role].actions).join(', '), 'grant-scope')}${meta('Область', 'Только собственные данные этого субъекта')}${meta('Срок', grant ? time(grant.expiresAt) : '10 минут после подтверждения', 'grant-expiry')}</dl>
    <p class="scope-excluded">${role==='merchant'?'Утверждение, экспорт и отправка не входят в делегацию.':'Только чтение. Изменение баланса и отправка не входят в делегацию.'}</p>
    ${grant?`<div class="grant-saved"><span>Grant <code data-testid="grant-id">${e(grant.grantId)}</code></span>${badge(grant.revokedAt?'revoked':state.grantDenied?'revoked':'available')}</div><small>${grant.revokedAt?'Доступ отозван.':state.grantDenied?'Сервер отказал в следующем защищённом шаге.':'Срок и отзыв проверяются сервером при каждом защищённом шаге.'}</small><div class="actions">${button('grant-revoke','Отозвать доступ','secondary',!!grant.revokedAt)}</div>`:''}
    <details class="grant-confirm" ${!grant?'open':''}><summary>${grant?'Выдать новое разрешение':'Подтвердить делегацию'}</summary><label class="consent"><input id="grant-consent" data-testid="grant-consent" type="checkbox"><span>Разрешаю агенту ${role==='merchant'?'чтение и подготовку черновика':'чтение моих данных'} на 10 минут в указанной области.</span></label>${button('grant-create',grant?'Подтвердить новое разрешение':'Разрешить на 10 минут','primary')}</details>
  </section>`;
}
export function taskView(role, state) {
  const task=state.task, has=!!state.selectedTaskId;
  return `<section class="panel task-panel"><div class="panel-header"><div><span class="section-kicker">02 / ИСПОЛНЕНИЕ</span><h2>${e(roles[role].goal)}</h2></div>${task?`<span data-testid="task-state" data-state="${e(task.state)}">${badge(task.state)}</span>`:''}</div>
    <div class="runner-note"><b>Детерминированный fixture runner</b><p>Задача выполняется синхронно на сервере. LLM и внешние MCP/A2A не подключены.</p></div>
    ${has?`<dl class="meta-grid">${meta('Task ID',state.selectedTaskId,'task-id')}${meta('Runner',task?.runner||'Ожидает чтения с сервера')}${meta('Расход',task?.usage==null?'Не измерен · usage: null':JSON.stringify(task.usage))}${meta('Создана',time(task?.createdAt))}</dl>${task?.error?`<div class="notice warning">${e(task.error.message)} · ${e(task.error.code)}</div>`:''}`:empty('После подтверждения создайте задачу. Результат сохранится в этом сеансе.')}
    <div class="actions">${!state.logical?button('task-create','Создать задачу','primary',!state.grant):button('task-repeat','Повторить тот же запрос')}${button('task-run',task?.state==='completed'?'Повторить выполнение':'Выполнить задачу','primary',!has)}${button('task-read','Обновить статус','secondary',!has)}${button('task-cancel','Отменить задачу','quiet',!has)}</div>
    ${role==='merchant'&&state.artifactId?`<div class="task-next">${button('task-recount','Пересчитать этот реестр')}<small>Новая задача, тот же artifact ID. Утверждение новой версии потребуется отдельно.</small></div>`:''}
    ${role!=='merchant'&&task&&['canceled','completed','failed'].includes(task.state)?`<div class="task-next">${button('task-new','Создать следующую задачу')}<small>Повтор выше сохраняет прежний Task ID; следующая задача получает новый.</small></div>`:''}
    <p class="hint">Отмена останавливает дальнейшее выполнение задачи. Уже совершённые внешние действия не откатываются.</p>
    ${state.previousTaskId?`<details class="late-lab"><summary>Проверить поздний ответ старой задачи</summary><p>Запросить выполнение отменённой T1, сохранив выбранную T2.</p>${button('task-late','Получить поздний ответ T1')}${state.late?`<div class="late-result" data-testid="late-result"><b>Отдельный ответ T1</b><code>${e(state.late.taskId)}</code>${badge(state.late.state)}<p>Выбранная задача не заменена этим ответом.</p></div>`:''}</details>`:''}
  </section>`;
}
function correctionsView(artifact, dashboard) {
  if(!dashboard)return '<p class="hint">Для объяснения коррекций обновите данные владельца.</p>';
  if(dashboard.sourceVersion!==artifact.sourceVersion)return '<div class="notice warning" data-testid="artifact-corrections">Источник изменился после подготовки этого снимка. Выполните пересчёт; новые коррекции пока не относятся к показанной версии.</div>';
  const payments=new Set([...artifact.rows.flatMap(row=>row.obligationIds),...artifact.exclusions.map(item=>item.paymentId)]);
  const corrections=dashboard.ledger.filter(entry=>entry.kind==='cash'&&entry.reason==='refund'&&payments.has(entry.paymentId));
  if(!corrections.length)return '<p class="hint" data-testid="artifact-corrections">В источнике этого снимка нет коррекций cash-начислений из-за возвратов.</p>';
  return `<section class="notice" data-testid="artifact-corrections"><b>Коррекции, учтённые в этой версии · источник V${e(artifact.sourceVersion)}</b><p>Возврат уменьшает исходное вознаграждение. Исходная оплата и отдельная запись коррекции сохранены сервером.</p><ul class="correction-list">${corrections.map(entry=>`<li><div><b>Возврат оплаты</b><code data-testid="correction-payment">${e(entry.paymentId)}</code><small>Коррекция: ${e(entry.id)} · исходное начисление: ${e(entry.originalEntryId)}</small></div><strong data-testid="correction-amount" data-amount-minor="${e(entry.amountMinor)}">${money(entry.amountMinor)}</strong></li>`).join('')}</ul><small>Утверждение относится только к указанным версии и hash. Изменение источника требует пересчёта и нового утверждения.</small></section>`;
}
export function artifactView(artifact, state, handoff, dashboard) {
  if(!artifact)return `<section class="panel">${empty('Готовый реестр появится после выполнения задачи.')} ${state.artifactId?button('owner-refresh','Прочитать реестр как владелец'):''}</section>`;
  const staleTask=state.task?.result && (state.task.result.hash!==artifact.hash || state.task.result.revision!==artifact.revision || artifact.status==='stale');
  return `<section class="panel artifact-panel"><div class="panel-header"><div><span class="section-kicker">03 / ПРОВЕРКА ВЛАДЕЛЬЦА</span><h2>Реестр за август 2026</h2></div><span data-testid="artifact-status">${badge(artifact.status)}</span></div>
    <p>Прочитан отдельно по правам владельца. Делегация не требуется для утверждения и ручного продолжения.</p>
    ${staleTask?'<div class="notice warning" data-testid="stale-task-result">Сохранённый ответ задачи — прежний снимок. Ниже текущий реестр; прежнее утверждение к изменённому источнику неприменимо.</div>':''}
    <dl class="artifact-meta">${meta('Artifact ID',artifact.artifactId,'artifact-id')}${meta('Версия',artifact.revision,'artifact-revision')}${meta('SHA-256',artifact.hash,'artifact-hash')}</dl>
    <div class="artifact-total"><span>К выплате по этому снимку</span><strong data-testid="artifact-amount" data-amount-minor="${e(artifact.amountMinor)}">${money(artifact.amountMinor)}</strong><small>${e(artifact.currency)} · ${artifact.rows.length} получателя · источник V${e(artifact.sourceVersion)}</small></div>
    ${correctionsView(artifact,dashboard)}
    <div class="registry-rows" data-testid="artifact-rows">${artifact.rows.length?artifact.rows.map(row=>`<article><span class="recipient-avatar" aria-hidden="true">${e(row.name.slice(0,1))}</span><div><b>${e(row.name)}</b><small>${row.obligationIds.length} начислений</small></div><strong>${money(row.amountMinor)}</strong></article>`).join(''):empty('Нет доступных строк для выплаты.')}</div>
    <details class="exclusions" open><summary>Почему исключены · ${artifact.exclusions.length}</summary><ul data-testid="artifact-exclusions">${artifact.exclusions.map(item=>`<li><b>${e(reasons[item.reason]||item.reason)}</b><span>${money(item.amountMinor)}</span><small>${e(item.paymentId)}</small></li>`).join('')}</ul></details>
    <div class="owner-actions"><b>Решение владельца · версия ${e(artifact.revision)}</b><div class="actions">${button('owner-refresh','Обновить реестр')}${button('owner-approve',`Утвердить V${e(artifact.revision)}`,'primary')}${button('owner-export','Скачать утверждённый CSV')}<a id="owner-handoff" data-testid="owner-handoff" class="secondary handoff-link" href="${e(handoff)}">Продолжить вручную в A ↗</a></div><p class="hint">Утверждаются указанные revision и hash. Скачивание CSV не отправляет деньги.</p></div>
  </section>`;
}
export function personalView(role, task) {
  const result=task?.result;
  if(!result)return `<section class="panel">${empty('Выполните задачу, чтобы получить собственный ответ с сервера.')}</section>`;
  if(role==='customer')return `<section class="panel" data-testid="credit-result"><span class="section-kicker">ЛИЧНЫЙ БОНУС · ${e(result.actor.name)}</span><h2>Бонус к следующему счёту</h2><div class="metrics personal-metrics">${metric('Доступно',money(result.availableMinor))}${metric('На проверке',money(result.heldMinor))}${metric('В резерве',money(result.reservedMinor))}${metric('Применено',money(result.appliedMinor))}</div><p class="notice">${e(result.explanation)}</p><dl class="meta-grid">${meta('Остаток счёта',money(result.invoice.remainingMinor))}${meta('Срок счёта',date(result.invoice.dueDate))}${meta('Субъект',result.actor.id)}${meta('Источник',`V${result.sourceVersion}`)}</dl><div class="read-only-check"><h3>Проверка границы чтения</h3><p>Попытка резервирования 1 ₽ с текущим read-only grant должна быть отклонена сервером до изменения баланса.</p>${button('credit-deny-reserve','Проверить запрет резервирования')}</div></section>`;
  return `<section class="panel" data-testid="partner-result"><span class="section-kicker">ЛИЧНЫЙ СТАТУС · ${e(result.actor.name)}</span><h2>Ваше вознаграждение</h2><div class="metrics personal-metrics">${metric('Доступно',money(result.summary.availableMinor))}${metric('На проверке',money(result.summary.heldMinor))}${metric('В реестре',money(result.summary.allocatedMinor))}${metric('Отправлено вручную',money(result.summary.sentMinor))}</div><p class="notice">${e(result.summary.explanation)}</p><h3>История собственных начислений</h3><div class="personal-ledger">${result.ledger.map(row=>`<article><div><b>${e(row.reason||'Подтверждённая оплата')}</b><small>${e(row.paymentId)}</small></div><strong>${money(row.amountMinor)}</strong></article>`).join('')}</div><p class="hint">Субъект: ${e(result.actor.id)} · источник V${e(result.sourceVersion)}</p></section>`;
}
export function ownerLab(active, dashboard) {
  return `<section class="owner-lab"><div><span class="section-kicker">F1 / ЛАБОРАТОРИЯ ВЛАДЕЛЬЦА</span><h3>Проверить изменение источника</h3><p>Явные синтетические события в текущем сеансе.</p></div>${!active?button('lab-open','Открыть лабораторию'):`<div class="lab-body"><p>Часы стенда: <b data-testid="lab-clock">${e(time(dashboard?.clock))}</b></p><div class="actions">${button('lab-refund','Добавить fixture refund')}${button('lab-advance','Сдвинуть часы на 1 день')}</div><small>Refund уменьшает начисление и отменяет прежнее утверждение. Сдвиг часов проверяет истечение grant на сервере и меняет доступность начислений.</small></div>`}</section>`;
}
