import {
  AccountApiError, account, addDetails, addFact, byId, createMutationKeys,
  disableWhile, display, element, mcp, parseRub, rub,
} from './helpers.mjs';

const ui = Object.fromEntries([
  'notice', 'auth', 'workspace', 'login', 'email', 'password', 'name', 'register', 'logout',
  'identity', 'membership', 'refresh', 'summary', 'merchant', 'participant', 'owner-invite',
  'invite', 'invitation-output', 'accept', 'payment-status', 'checkout', 'checkout-output',
  'policy', 'registry', 'registries', 'enroll', 'share', 'mint-agent', 'agent-expires',
  'agent-config', 'probe-agent', 'agent-list', 'tasks', 'change-password',
].map(id => [id, byId(id)]));

const roleName = { merchant: 'владелец', partner: 'партнёр', customer: 'клиент' };
const grantActions = {
  merchant: ['dashboard', 'registry.prepare', 'registry.read'],
  partner: ['program.read', 'partner.read', 'share.read'],
  customer: ['program.read', 'credit.read', 'share.read'],
};
const keys = createMutationKeys();
let identity = null;
let membership = null;
let screen = null;
let issuedAgent = null;

function notify(message = '', error = false) {
  ui.notice.textContent = message;
  ui.notice.classList.toggle('error', error);
}

function clearIssuedAgent() {
  issuedAgent = null;
  ui['agent-config'].value = '';
  ui['agent-config'].hidden = true;
  ui['agent-expires'].textContent = '';
  ui['probe-agent'].hidden = true;
}

function signedOut(message = '') {
  identity = null;
  membership = null;
  screen = null;
  keys.clear();
  clearIssuedAgent();
  ui.workspace.hidden = true;
  ui.auth.hidden = false;
  ui.membership.replaceChildren();
  if (message) notify(message);
}

function report(error) {
  if (error instanceof AccountApiError && error.status === 401) {
    signedOut('Сеанс завершён. Войдите снова.');
    return;
  }
  notify(error?.message || 'Действие не выполнено.', true);
}

async function action(target, operation, success) {
  notify();
  try {
    const result = await disableWhile(target, operation);
    if (success) notify(success);
    return result;
  } catch (error) {
    report(error);
    return undefined;
  }
}

async function command(name, input = {}, mutating = false) {
  const body = { membershipId: membership.membershipId, action: name, input };
  const scope = `command:${membership.membershipId}:${name}`;
  if (mutating) body.idempotencyKey = keys.key(scope, input);
  const result = await account('command', body);
  if (mutating) keys.complete(scope);
  return result;
}

async function optionalCommand(name) {
  try { return await command(name); }
  catch (error) {
    if (error instanceof AccountApiError && error.status === 401) throw error;
    return null;
  }
}

function list(value, field) {
  if (Array.isArray(value)) return value;
  return Array.isArray(value?.[field]) ? value[field] : null;
}

async function loadIdentity(preferredMembershipId) {
  identity = await account('me', undefined, { get: true });
  const memberships = Array.isArray(identity.memberships) ? identity.memberships : [];
  membership = memberships.find(item => item.membershipId === preferredMembershipId)
    ?? memberships[0] ?? null;
  ui.membership.replaceChildren(...memberships.map(item => {
    const option = element('option', `${display(item.name)} · ${roleName[item.role] ?? item.role}`);
    option.value = item.membershipId;
    option.selected = item.membershipId === membership?.membershipId;
    return option;
  }));
  if (!membership) throw new Error('У аккаунта нет доступной организации.');
  ui.auth.hidden = true;
  ui.workspace.hidden = false;
  await refreshWorkspace();
}

async function refreshWorkspace() {
  const role = membership.role;
  const primaryPromise = role === 'merchant'
    ? command('dashboard')
    : Promise.all([
      command('program.read'),
      command(role === 'partner' ? 'partner.read' : 'credit.read'),
    ]).then(([program, personal]) => ({ program, personal }));
  const [primary, grantsResult, tasksResult, payments] = await Promise.all([
    primaryPromise,
    optionalCommand('grant.list'),
    optionalCommand('task.list'),
    role === 'merchant'
      ? account('payment-status', { membershipId: membership.membershipId }).catch(error => {
        if (error instanceof AccountApiError && error.status === 401) throw error;
        return null;
      })
      : Promise.resolve({ configured: false, unavailableForRole: true, orders: [] }),
  ]);
  let share = null;
  if (role !== 'merchant' && primary.program?.enrollment) {
    try { share = await command('share.read'); } catch (error) {
      if (error instanceof AccountApiError && error.status === 401) throw error;
    }
  }
  screen = {
    primary,
    grants: list(grantsResult, 'grants'),
    tasks: list(tasksResult, 'tasks'),
    payments,
    share,
  };
  render();
}

function metric(parent, label, value) {
  const box = element('div', undefined, 'row');
  box.append(element('span', label), element('div', value, 'metric'));
  parent.append(box);
}

function renderSummary() {
  ui.summary.replaceChildren();
  const role = membership.role;
  const summary = role === 'merchant' ? screen.primary.summary
    : role === 'partner' ? screen.primary.personal?.summary : screen.primary.personal;
  if (!summary || typeof summary !== 'object') {
    ui.summary.append(element('p', 'Сводка недоступна.'));
    return;
  }
  if (role === 'customer') {
    metric(ui.summary, 'Доступный бонус', rub(summary.availableMinor));
    metric(ui.summary, 'Удерживается', rub(summary.heldMinor));
    metric(ui.summary, 'Зарезервировано', rub(summary.reservedMinor));
    addFact(ui.summary, 'Назначение', summary.explanation);
  } else {
    metric(ui.summary, role === 'merchant' ? 'Доступно партнёрам' : 'Доступно', rub(summary.availableMinor));
    metric(ui.summary, 'Удерживается', rub(summary.heldMinor));
    metric(ui.summary, 'Отправлено по реестру', rub(summary.sentMinor));
    addFact(ui.summary, 'Ориентир выплаты', summary.dueDate);
    addFact(ui.summary, 'Пояснение', summary.explanation);
  }
}

function registryRef(registry) {
  return { artifactId: registry.artifactId, revision: registry.revision, hash: registry.hash };
}

function renderRegistries() {
  ui.registries.replaceChildren();
  const registries = Array.isArray(screen.primary.registries) ? screen.primary.registries : null;
  if (!registries) return ui.registries.append(element('p', 'Реестры недоступны.'));
  if (!registries.length) return ui.registries.append(element('p', 'Подготовленных реестров пока нет.'));
  for (const registry of registries) {
    const row = element('div', undefined, 'row');
    row.append(element('strong', `${display(registry.period)} · ${rub(registry.amountMinor)}`));
    addFact(row, 'Артефакт', registry.artifactId);
    addFact(row, 'Версия', registry.revision);
    addFact(row, 'Хэш', registry.hash);
    addFact(row, 'Статус', registry.status);
    addFact(row, 'Строк', Array.isArray(registry.rows) ? registry.rows.length : 'Недоступно');
    const approve = element('button', 'Утвердить реестр');
    approve.type = 'button';
    approve.disabled = registry.status !== 'draft' || !registry.rows?.length;
    approve.addEventListener('click', () => action(approve, async () => {
      await command('registry.approve', registryRef(registry), true);
      await refreshWorkspace();
    }, 'Актуальная версия реестра утверждена.'));
    const download = element('button', 'Скачать CSV (деньги не отправляются)', 'secondary');
    download.type = 'button';
    download.disabled = !['approved', 'partially_sent', 'sent'].includes(registry.status);
    download.addEventListener('click', () => action(download, async () => {
      const result = await command('registry.export', registryRef(registry), true);
      if (typeof result?.csv !== 'string' || typeof result?.filename !== 'string') {
        throw new Error('Экспорт не вернул CSV.');
      }
      const href = URL.createObjectURL(new Blob([result.csv], { type: 'text/csv;charset=utf-8' }));
      const link = element('a'); link.href = href; link.download = result.filename; link.click();
      setTimeout(() => URL.revokeObjectURL(href), 0);
    }, 'CSV скачан. Это не отметка отправки денег.'));
    row.append(approve, download,
      element('p', 'Факт банковской отправки и сверка здесь намеренно не вводятся: скачивание CSV их не подтверждает.', 'muted'));
    ui.registries.append(row);
  }
}

function renderMerchant() {
  ui.merchant.hidden = false;
  ui.participant.hidden = true;
  ui['owner-invite'].hidden = false;
  const configured = Array.isArray(screen.primary.policyConfigured)
    ? screen.primary.policyConfigured.join(', ') : 'Недоступно';
  addFact(ui.summary, 'Опубликованные типы условий', configured || 'Не опубликованы');
  const partners = Array.isArray(screen.primary.partners) ? screen.primary.partners : [];
  if (partners.length) {
    const title = element('h3', 'Партнёры'); ui.summary.append(title);
    partners.forEach(partner => addFact(ui.summary, display(partner.name), rub(partner.summary?.availableMinor)));
  }
  renderRegistries();
}

function renderParticipant() {
  ui.merchant.hidden = true;
  ui.participant.hidden = false;
  ui['owner-invite'].hidden = true;
  const { program, personal } = screen.primary;
  ui.enroll.hidden = Boolean(program?.enrollment);
  addFact(ui.summary, 'Условия', program?.terms);
  addFact(ui.summary, 'Ставка', Number.isInteger(program?.policy?.bps)
    ? `${Math.floor(program.policy.bps / 100)}.${String(program.policy.bps % 100).padStart(2, '0')}%` : 'Недоступно');
  addFact(ui.summary, 'Версия условий', program?.policy?.version);
  if (membership.role === 'partner' && Array.isArray(personal?.payments)) {
    addFact(ui.summary, 'Подтверждённых оплат', personal.payments.length);
  }
  ui.share.replaceChildren();
  if (screen.share) {
    addFact(ui.share, 'Реферальная ссылка', new URL(screen.share.referralUrl, location.origin).href);
    addFact(ui.share, 'Промокод', screen.share.promoCode);
    addFact(ui.share, 'Раскрытие', screen.share.disclosure);
  } else {
    ui.share.append(element('p', program?.enrollment
      ? 'Ссылка рекомендации временно недоступна.' : 'Подтвердите участие, чтобы получить ссылку.'));
  }
}

function renderPayments() {
  ui.checkout.hidden = true;
  ui['checkout-output'].replaceChildren();
  const status = screen.payments;
  if (!status) return void (ui['payment-status'].textContent = 'Статус ЮKassa недоступен.');
  if (status.unavailableForRole) {
    ui['payment-status'].textContent = 'Создание и сверка оплат доступны владельцу организации.';
    return;
  }
  if (status.configured !== true) {
    ui['payment-status'].textContent = 'ЮKassa для этой организации не подключена.';
    return;
  }
  ui['payment-status'].textContent = `${status.testMode ? 'Тестовый' : 'Боевой'} магазин ЮKassa ${display(status.shopId)} подключён.`;
  const select = ui.checkout.elements.beneficiaryId;
  const partners = Array.isArray(screen.primary.partners) ? screen.primary.partners : [];
  select.replaceChildren(...partners.map(partner => {
    const option = element('option', display(partner.name)); option.value = partner.id; return option;
  }));
  ui.checkout.hidden = partners.length === 0;
  if (!partners.length) ui['checkout-output'].append(element('p', 'Сначала пригласите партнёра и дождитесь принятия приглашения.'));
  for (const order of Array.isArray(status.orders) ? status.orders : []) {
    const row = element('div', undefined, 'row');
    addFact(row, 'Заказ', order.orderId);
    addFact(row, 'Платёж', order.paymentId);
    addFact(row, 'Статус', order.status);
    addFact(row, 'Сумма', rub(order.amountMinor));
    ui['checkout-output'].append(row);
  }
}

function renderAgents() {
  ui['agent-list'].replaceChildren();
  if (screen.grants === null) ui['agent-list'].append(element('p', 'Список ключей недоступен.'));
  else if (!screen.grants.length) ui['agent-list'].append(element('p', 'Действующих ключей нет.'));
  else for (const grant of screen.grants) {
    const row = element('div', undefined, 'row');
    addFact(row, 'Полномочия', Array.isArray(grant.actions) ? grant.actions.join(', ') : 'Недоступно');
    addFact(row, 'Истекает', grant.expiresAt);
    addFact(row, 'Статус', grant.revokedAt ? `отозван ${grant.revokedAt}` : 'действует');
    if (!grant.revokedAt) {
      const revoke = element('button', 'Отозвать ключ', 'secondary'); revoke.type = 'button';
      revoke.addEventListener('click', () => action(revoke, async () => {
        await command('grant.revoke', { grantId: grant.grantId ?? grant.id }, true);
        if (issuedAgent?.grantId === (grant.grantId ?? grant.id)) clearIssuedAgent();
        await refreshWorkspace();
      }, 'Ключ отозван.'));
      row.append(revoke);
    }
    ui['agent-list'].append(row);
  }
  ui.tasks.replaceChildren();
  if (screen.tasks === null) ui.tasks.append(element('p', 'Список задач недоступен.'));
  else if (!screen.tasks.length) ui.tasks.append(element('p', 'Задач пока нет.'));
  else for (const task of screen.tasks) {
    const row = element('div', undefined, 'row');
    addFact(row, 'Задача', task.taskId ?? task.id);
    addFact(row, 'Тип', task.kind);
    addFact(row, 'Статус', task.state);
    if (task.result !== undefined && task.result !== null) addDetails(row, task.result);
    if (task.error) addFact(row, 'Ошибка', task.error.message ?? task.error.code);
    ui.tasks.append(row);
  }
}

function render() {
  ui.identity.textContent = `${identity.email} · ${display(membership.name)} · ${roleName[membership.role] ?? membership.role}`;
  renderSummary();
  if (membership.role === 'merchant') renderMerchant(); else renderParticipant();
  renderPayments();
  renderAgents();
}

ui.login.addEventListener('submit', event => {
  event.preventDefault();
  void action(ui.login, async () => {
    await account('login', { email: ui.email.value, password: ui.password.value });
    ui.password.value = '';
    await loadIdentity();
  }, 'Вход выполнен.');
});

ui.register.addEventListener('click', () => void action(ui.login, async () => {
  await account('register', { email: ui.email.value, password: ui.password.value, name: ui.name.value });
  ui.password.value = '';
  await loadIdentity();
}, 'Аккаунт и организация созданы.'));

ui.logout.addEventListener('click', () => void action(ui.logout, async () => {
  await account('logout', {});
  signedOut('Вы вышли из аккаунта.');
}));

ui.refresh.addEventListener('click', () => void action(ui.refresh, refreshWorkspace, 'Данные обновлены.'));
ui.membership.addEventListener('change', () => void action(ui.membership, async () => {
  clearIssuedAgent(); keys.clear();
  membership = identity.memberships.find(item => item.membershipId === ui.membership.value);
  if (!membership) throw new Error('Организация недоступна.');
  await refreshWorkspace();
}, 'Рабочий контекст переключён.'));

ui.policy.addEventListener('submit', event => {
  event.preventDefault();
  void action(ui.policy, async () => {
    const form = new FormData(ui.policy);
    const bps = parseRub(form.get('percent'));
    await command('program.save', {
      kind: form.get('kind'), bps, holdDays: Number(form.get('hold')),
      windowDays: Number(form.get('window')), recurring: true,
    }, true);
    await refreshWorkspace();
  }, 'Условия опубликованы и будут применяться к новым оплатам.');
});

ui.registry.addEventListener('submit', event => {
  event.preventDefault();
  void action(ui.registry, async () => {
    await command('registry.prepare', { period: new FormData(ui.registry).get('period') }, true);
    await refreshWorkspace();
  }, 'Реестр подготовлен. Проверьте версию и хэш.');
});

ui.enroll.addEventListener('click', () => void action(ui.enroll, async () => {
  await command('enrollment.join', { consent: true }, true);
  await refreshWorkspace();
}, 'Участие подтверждено.'));

ui.invite.addEventListener('submit', event => {
  event.preventDefault();
  void action(ui.invite, async () => {
    const result = await account('invite', {
      membershipId: membership.membershipId,
      input: { role: new FormData(ui.invite).get('role') },
    });
    const link = new URL('/account', location.origin); link.hash = `invite=${encodeURIComponent(result.invitation)}`;
    ui['invitation-output'].value = link.href;
    ui['invitation-output'].hidden = false;
  }, 'Одноразовое приглашение создано.');
});

ui.accept.addEventListener('submit', event => {
  event.preventDefault();
  void action(ui.accept, async () => {
    const form = new FormData(ui.accept);
    const joined = await account('accept-invite', { invitation: form.get('invitation'), name: form.get('name') });
    ui.accept.reset();
    await loadIdentity(joined.membershipId);
  }, 'Вы присоединились к организации.');
});

ui.checkout.addEventListener('submit', event => {
  event.preventDefault();
  void action(ui.checkout, async () => {
    const form = new FormData(ui.checkout);
    const input = {
      beneficiaryId: form.get('beneficiaryId'), customerId: form.get('customerId'),
      amountMinor: parseRub(form.get('amount')), kind: 'cash',
    };
    const scope = `checkout:${membership.membershipId}`;
    const result = await account('checkout', {
      membershipId: membership.membershipId, input, idempotencyKey: keys.key(scope, input),
    });
    keys.complete(scope);
    const output = element('div', undefined, 'row');
    addFact(output, 'Заказ', result.orderId);
    addFact(output, 'Платёж', result.paymentId);
    addFact(output, 'Статус', result.status);
    if (result.confirmationUrl) {
      let url;
      try { url = new URL(result.confirmationUrl); }
      catch { throw new Error('ЮKassa вернула некорректную ссылку подтверждения.'); }
      if (result.confirmationUrl.length > 2_048 || url.protocol !== 'https:' || url.username || url.password) {
        throw new Error('ЮKassa вернула небезопасную ссылку подтверждения.');
      }
      const link = element('a', 'Открыть защищённую страницу оплаты ЮKassa');
      link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; output.append(link);
    }
    ui['checkout-output'].prepend(output);
  }, 'Заявка создана. Платёж станет подтверждённым только после проверки ЮKassa.');
});

ui['mint-agent'].addEventListener('click', () => void action(ui['mint-agent'], async () => {
  const actions = grantActions[membership.role];
  const result = await account('agent-token', {
    membershipId: membership.membershipId, input: { actions, expiresInSeconds: 3600 },
  });
  issuedAgent = result;
  ui['agent-config'].value = JSON.stringify({
    transport: 'MCP Streamable HTTP', endpoint: `${location.origin}/mcp`,
    agentCard: `${location.origin}/.well-known/agent-card.json`,
    authorization: `Bearer ${result.token}`,
  }, null, 2);
  ui['agent-config'].hidden = false;
  ui['agent-expires'].textContent = `Ключ действует до ${display(result.expiresAt)} и хранится только на этой странице.`;
  ui['probe-agent'].hidden = false;
  await refreshWorkspace();
}, 'Ключ показан один раз. Скопируйте его сейчас.'));

ui['probe-agent'].addEventListener('click', () => void action(ui['probe-agent'], async () => {
  if (!issuedAgent?.token) throw new Error('Сначала выдайте новый ключ.');
  const initialized = await mcp(issuedAgent.token, 'initialize', {
    protocolVersion: '2025-11-25', capabilities: {},
    clientInfo: { name: 'n3-account-probe', version: '1.0.0' },
  }, 'n3-init');
  if (initialized?.protocolVersion !== '2025-11-25') throw new Error('MCP не подтвердил версию протокола.');
  const tools = await mcp(issuedAgent.token, 'tools/list', {}, 'n3-tools');
  if (!Array.isArray(tools?.tools)) throw new Error('MCP не вернул список инструментов.');
  notify(`MCP подключён. Доступно инструментов: ${tools.tools.length}.`);
}));

ui['change-password'].addEventListener('submit', event => {
  event.preventDefault();
  void action(ui['change-password'], async () => {
    const form = new FormData(ui['change-password']);
    await account('password', {
      currentPassword: form.get('currentPassword'), newPassword: form.get('newPassword'),
    });
    ui['change-password'].reset();
    signedOut('Пароль изменён. Все сеансы и агентные ключи отозваны; войдите снова.');
  });
});

function invitationFromFragment() {
  const match = /^#invite=([^&]+)$/.exec(location.hash);
  if (!match) return;
  try {
    const value = decodeURIComponent(match[1]);
    if (/^[A-Za-z0-9_-]{43}$/.test(value)) ui.accept.elements.invitation.value = value;
    else notify('Ссылка приглашения имеет неверный формат.', true);
  } catch { notify('Ссылка приглашения имеет неверный формат.', true); }
  history.replaceState(null, '', `${location.pathname}${location.search}`);
}

invitationFromFragment();
loadIdentity().catch(error => {
  if (error instanceof AccountApiError && error.status === 401) signedOut();
  else { signedOut(); report(error); }
});
