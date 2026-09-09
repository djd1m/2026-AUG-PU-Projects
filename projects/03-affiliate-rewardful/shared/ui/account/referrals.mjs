import { addFact, display, element } from './helpers.mjs';

function metric(parent, label, value) {
  const row = element('div', undefined, 'row');
  row.append(element('span', label), element('div', display(value), 'metric'));
  parent.append(row);
}

export function mountReferralPanel({ container, action, request, getMembership, notify }) {
  if (!container || typeof action !== 'function' || typeof request !== 'function'
    || typeof getMembership !== 'function' || typeof notify !== 'function') {
    throw new TypeError('Referral panel dependencies are required.');
  }
  const intro = element('p', 'Настройте переход в ваш продукт и подключите подтверждённую регистрацию и оплату на сервере.');
  const statusBox = element('div');
  const controls = element('div');
  const form = element('form');
  const landing = element('input'); landing.name = 'landingUrl'; landing.type = 'url'; landing.required = true;
  const returning = element('input'); returning.name = 'returnUrl'; returning.type = 'url'; returning.required = true;
  const landingLabel = element('label', 'Страница регистрации'); landingLabel.append(landing);
  const returnLabel = element('label', 'Возврат после оплаты'); returnLabel.append(returning);
  const save = element('button', 'Сохранить адреса'); save.type = 'submit'; save.dataset.referralAction = 'save';
  form.append(landingLabel, returnLabel, save);
  const issue = element('button', 'Выдать новый ключ'); issue.type = 'button'; issue.dataset.referralAction = 'issue';
  const revoke = element('button', 'Отозвать ключ', 'secondary'); revoke.type = 'button'; revoke.dataset.referralAction = 'revoke';
  const keyOutput = element('textarea'); keyOutput.readOnly = true; keyOutput.hidden = true;
  keyOutput.setAttribute('aria-label', 'Одноразовый ключ интеграции');
  const keyNote = element('p', '', 'muted');
  const instructions = element('div');
  const metrics = element('div');
  controls.append(form, issue, revoke, keyOutput, keyNote, instructions);
  container.replaceChildren(intro, statusBox, controls, metrics);

  let generation = 0;
  let membershipKey;

  function identityOf(membership) { return membership ? `${membership.membershipId}:${membership.tenantId}:${membership.role}` : ''; }
  function current(captured, member) {
    return captured === generation && identityOf(getMembership()) === identityOf(member);
  }
  function eraseSecret() {
    keyOutput.value = ''; keyOutput.hidden = true; keyNote.textContent = '';
  }
  function renderMetrics(status, membership) {
    metrics.replaceChildren(element('h3', membership.role === 'partner' ? 'Ваш результат рекомендаций' : 'Воронка рекомендаций'));
    const values = status?.metrics;
    if (!values || typeof values !== 'object') return metrics.append(element('p', 'Метрики недоступны.'));
    metric(metrics, 'Переходы', values.visits);
    metric(metrics, 'Регистрации', values.registrations);
    metric(metrics, 'Платящие клиенты · боевой магазин', values.payingCustomers);
    metric(metrics, 'Платящие клиенты · тестовый магазин', values.testPayingCustomers);
    addFact(metrics, 'Первая комиссия', values.firstCommissionAt);
    addFact(metrics, 'Первая боевая комиссия', values.firstLiveCommissionAt);
    addFact(metrics, 'Активация на этой неделе', values.activatedThisWeek);
    addFact(metrics, 'MRR', values.mrr === null ? 'Недоступно: подписочная модель не подключена' : values.mrr);
  }
  function renderInstructions(membership) {
    instructions.replaceChildren(element('h3', 'Установка'));
    instructions.append(element('p', 'Добавьте трекер на страницу регистрации. Ключ интеграции храните только на сервере.'));
    const snippet = element('pre');
    const origin = globalThis.location?.origin;
    snippet.textContent = origin && membership.tenantId
      ? `<script src="${origin}/api/referrals/${membership.tenantId}/tracker.js" defer></script>`
      : 'Адрес трекера появится для выбранной организации.';
    instructions.append(snippet, element('p', 'После проверки почты передайте стабильный customerId серверному клиенту; сумму оплаты берите из собственного счёта. Завершение заказа подтверждайте через статус N3.'));
  }
  function paint(status, membership) {
    if (membership.role === 'merchant') {
      statusBox.replaceChildren(element('h3', 'Статус подключения'));
      addFact(statusBox, 'Адреса настроены', status?.configured);
      addFact(statusBox, 'Ключ действует', status?.keyActive);
      addFact(statusBox, 'Ключ истекает', status?.keyExpiresAt);
      if (typeof status?.landingUrl === 'string') landing.value = status.landingUrl;
      if (typeof status?.returnUrl === 'string') returning.value = status.returnUrl;
      addFact(statusBox, 'Регистрация', status?.landingUrl);
      addFact(statusBox, 'Возврат', status?.returnUrl);
      revoke.disabled = status?.keyActive !== true;
    } else statusBox.replaceChildren();
    renderMetrics(status, membership);
  }
  async function refresh(context, member, captured) {
    const status = await request(context, 'referral-status', { membershipId: member.membershipId });
    if (current(captured, member)) paint(status, member);
    return status;
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    const member = getMembership(), captured = generation;
    return action(form, async context => {
      await request(context, 'referral-settings', { membershipId: member.membershipId,
        input: { landingUrl: landing.value, returnUrl: returning.value } });
      if (!current(captured, member)) return;
      await refresh(context, member, captured);
      if (current(captured, member)) notify('Адреса подключения сохранены.');
    });
  });
  issue.addEventListener('click', () => {
    const member = getMembership(), captured = generation;
    return action(issue, async context => {
      const issued = await request(context, 'referral-key', { membershipId: member.membershipId });
      if (!current(captured, member)) return;
      if (typeof issued?.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(issued.token)
        || typeof issued.expiresAt !== 'string') throw new Error('Сервер не вернул новый ключ.');
      keyOutput.value = issued.token; keyOutput.hidden = false;
      keyNote.textContent = `Ключ показан один раз и действует до ${display(issued.expiresAt)}. Скопируйте его в защищённые настройки backend.`;
      notify('Новый ключ показан один раз.');
      await refresh(context, member, captured);
    });
  });
  revoke.addEventListener('click', () => {
    const member = getMembership(), captured = generation;
    return action(revoke, async context => {
      await request(context, 'referral-revoke', { membershipId: member.membershipId });
      if (!current(captured, member)) return;
      eraseSecret();
      await refresh(context, member, captured);
      if (current(captured, member)) notify('Ключ интеграции отозван.');
    });
  });

  return {
    render(status, membership) {
      const nextKey = identityOf(membership);
      if (membershipKey !== undefined && membershipKey !== nextKey) {
        generation += 1; eraseSecret(); landing.value = ''; returning.value = '';
        statusBox.replaceChildren(); instructions.replaceChildren();
      }
      membershipKey = nextKey;
      const merchant = membership?.role === 'merchant';
      intro.hidden = !merchant;
      statusBox.hidden = !merchant;
      controls.hidden = !merchant;
      if (merchant) renderInstructions(membership);
      paint(status, membership);
    },
    clear() {
      generation += 1; membershipKey = undefined;
      eraseSecret(); landing.value = ''; returning.value = '';
      statusBox.replaceChildren(); metrics.replaceChildren(); intro.hidden = true; statusBox.hidden = true; controls.hidden = true;
    },
  };
}
