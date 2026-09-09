import {
  AccountApiError, account, addDetails, addFact, byId, createContextGuard, createMutationKeys,
  disableWhile, display, element, mcp, parseRub, renderAccountSummary, renderParticipant,
  renderPayments, rub,
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
const contexts = createContextGuard();
let identity = null;
let membership = null;
let screen = null;
let issuedAgent = null;
let logoutPending = false;
let fragmentInvitation = false;

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

function clearContextSecrets({ preserveIncoming = false, resetAuth = false } = {}) {
  clearIssuedAgent();
  ui['invitation-output'].value = '';
  ui['invitation-output'].hidden = true;
  ui.invite.reset();
  for (const form of [ui.checkout, ui.policy, ui.registry]) form.reset();
  ui.checkout.elements.beneficiaryId.replaceChildren();
  if (!preserveIncoming) ui.accept.reset();
  ui['change-password'].reset();
  ui.password.value = '';
  if (resetAuth) ui.login.reset();
  ui.identity.textContent = '';
  for (const id of ['summary', 'registries', 'share', 'checkout-output', 'agent-list', 'tasks']) {
    ui[id].replaceChildren();
  }
  ui['payment-status'].textContent = '';
  ui.workspace.hidden = true;
}

function signedOut(message = '', { invalidate = true, preserveIncoming = false } = {}) {
  if (invalidate) contexts.replace();
  identity = null;
  membership = null;
  screen = null;
  keys.clear();
  clearContextSecrets({ preserveIncoming, resetAuth: true });
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

async function action(target, operation, success, { replace = false } = {}) {
  const context = replace ? contexts.replace() : contexts.capture();
  notify();
  try {
    const result = await disableWhile(target, () => operation(context));
    if (!contexts.current(context)) return undefined;
    if (success) notify(success);
    return result;
  } catch (error) {
    if (!contexts.current(context) || error?.name === 'AbortError') return undefined;
    report(error);
    return undefined;
  }
}

async function request(context, path, input, options) {
  contexts.assert(context);
  const result = await account(path, input, { ...options, signal: context.signal });
  contexts.assert(context);
  return result;
}

async function command(context, name, input = {}, mutating = false) {
  contexts.assert(context);
  const body = { membershipId: membership.membershipId, action: name, input };
  const scope = `command:${membership.membershipId}:${name}`;
  if (mutating) body.idempotencyKey = keys.key(scope, input);
  const result = await request(context, 'command', body);
  if (mutating) keys.complete(scope);
  return result;
}

async function optionalCommand(context, name) {
  try { return await command(context, name); }
  catch (error) {
    if (error instanceof AccountApiError && error.status === 401) throw error;
    return null;
  }
}

function list(value, field) {
  if (Array.isArray(value)) return value;
  return Array.isArray(value?.[field]) ? value[field] : null;
}

async function loadIdentity(context, preferredMembershipId) {
  const nextIdentity = await request(context, 'me', undefined, { get: true });
  const memberships = Array.isArray(nextIdentity.memberships) ? nextIdentity.memberships : [];
  identity = nextIdentity;
  membership = memberships.find(item => item.membershipId === preferredMembershipId)
    ?? memberships[0] ?? null;
  ui.membership.replaceChildren(...memberships.map(item => {
    const option = element('option', `${display(item.name)} · ${roleName[item.role] ?? item.role}`);
    option.value = item.membershipId;
    option.selected = item.membershipId === membership?.membershipId;
    return option;
  }));
  if (!membership) throw new Error('У аккаунта нет доступной организации.');
  await refreshWorkspace(context);
}

async function refreshWorkspace(context = contexts.capture()) {
  contexts.assert(context);
  const role = membership.role;
  const primaryPromise = role === 'merchant'
    ? command(context, 'dashboard')
    : Promise.all([
      command(context, 'program.read'),
      command(context, role === 'partner' ? 'partner.read' : 'credit.read'),
    ]).then(([program, personal]) => ({ program, personal }));
  const [primary, grantsResult, tasksResult, payments] = await Promise.all([
    primaryPromise,
    optionalCommand(context, 'grant.list'),
    optionalCommand(context, 'task.list'),
    role === 'merchant'
      ? request(context, 'payment-status', { membershipId: membership.membershipId }).catch(error => {
        if (error instanceof AccountApiError && error.status === 401) throw error;
        return null;
      })
      : Promise.resolve({ configured: false, unavailableForRole: true, orders: [] }),
  ]);
  let share = null;
  if (role !== 'merchant' && primary.program?.enrollment) {
    try { share = await command(context, 'share.read'); } catch (error) {
      if (error instanceof AccountApiError && error.status === 401) throw error;
    }
  }
  contexts.assert(context);
  screen = {
    primary,
    grants: list(grantsResult, 'grants'),
    tasks: list(tasksResult, 'tasks'),
    payments,
    share,
  };
  render();
  ui.auth.hidden = true;
  ui.workspace.hidden = false;
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
    approve.addEventListener('click', () => action(approve, async context => {
      await command(context, 'registry.approve', registryRef(registry), true);
      await refreshWorkspace(context);
    }, 'Актуальная версия реестра утверждена.'));
    const download = element('button', 'Скачать CSV (деньги не отправляются)', 'secondary');
    download.type = 'button';
    download.disabled = !['approved', 'partially_sent', 'sent'].includes(registry.status);
    download.addEventListener('click', () => action(download, async context => {
      const result = await command(context, 'registry.export', registryRef(registry), true);
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
      revoke.addEventListener('click', () => action(revoke, async context => {
        await command(context, 'grant.revoke', { grantId: grant.grantId ?? grant.id }, true);
        if (issuedAgent?.grantId === (grant.grantId ?? grant.id)) clearIssuedAgent();
        await refreshWorkspace(context);
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
  renderAccountSummary(ui, membership, screen);
  if (membership.role === 'merchant') renderMerchant(); else renderParticipant(ui, membership, screen);
  renderPayments(ui, screen);
  renderAgents();
}

ui.login.addEventListener('submit', event => {
  event.preventDefault();
  if (logoutPending) return notify('Выход ещё не подтверждён сервером. Дождитесь ответа.', true);
  const credentials = { email: ui.email.value, password: ui.password.value };
  clearContextSecrets({ preserveIncoming: fragmentInvitation });
  void action(ui.login, async context => {
    await request(context, 'login', credentials);
    await loadIdentity(context);
    fragmentInvitation = false;
  }, 'Вход выполнен.', { replace: true });
});

ui.register.addEventListener('click', () => {
  if (logoutPending) return notify('Выход ещё не подтверждён сервером. Дождитесь ответа.', true);
  const registration = { email: ui.email.value, password: ui.password.value, name: ui.name.value };
  clearContextSecrets({ preserveIncoming: fragmentInvitation });
  return void action(ui.login, async context => {
    await request(context, 'register', registration);
    await loadIdentity(context);
    fragmentInvitation = false;
  }, 'Аккаунт и организация созданы.', { replace: true });
});

ui.logout.addEventListener('click', () => {
  const context = contexts.replace();
  signedOut('', { invalidate: false });
  logoutPending = true;
  void disableWhile(ui.login, async () => {
    try {
      await request(context, 'logout', {});
      if (contexts.current(context)) notify('Вы вышли из аккаунта.');
    } catch (error) {
      if (contexts.current(context)) notify('Кабинет закрыт локально. Сервер не подтвердил отзыв сеанса.', true);
    } finally { if (contexts.current(context)) logoutPending = false; }
  });
});

ui.refresh.addEventListener('click', () => void action(ui.refresh, refreshWorkspace, 'Данные обновлены.'));
ui.membership.addEventListener('change', () => void action(ui.membership, async context => {
  clearContextSecrets(); keys.clear();
  membership = identity.memberships.find(item => item.membershipId === ui.membership.value);
  if (!membership) throw new Error('Организация недоступна.');
  await refreshWorkspace(context);
}, 'Рабочий контекст переключён.', { replace: true }));

ui.policy.addEventListener('submit', event => {
  event.preventDefault();
  void action(ui.policy, async context => {
    const form = new FormData(ui.policy);
    const bps = parseRub(form.get('percent'));
    await command(context, 'program.save', {
      kind: form.get('kind'), bps, holdDays: Number(form.get('hold')),
      windowDays: Number(form.get('window')), recurring: true,
    }, true);
    await refreshWorkspace(context);
  }, 'Условия опубликованы и будут применяться к новым оплатам.');
});

ui.registry.addEventListener('submit', event => {
  event.preventDefault();
  void action(ui.registry, async context => {
    await command(context, 'registry.prepare', { period: new FormData(ui.registry).get('period') }, true);
    await refreshWorkspace(context);
  }, 'Реестр подготовлен. Проверьте версию и хэш.');
});

ui.enroll.addEventListener('click', () => void action(ui.enroll, async context => {
  await command(context, 'enrollment.join', { consent: true }, true);
  await refreshWorkspace(context);
}, 'Участие подтверждено.'));

ui.invite.addEventListener('submit', event => {
  event.preventDefault();
  void action(ui.invite, async context => {
    const result = await request(context, 'invite', {
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
  void action(ui.accept, async context => {
    const form = new FormData(ui.accept);
    const joined = await request(context, 'accept-invite', { invitation: form.get('invitation'), name: form.get('name') });
    const nextContext = contexts.replace();
    clearContextSecrets(); keys.clear();
    await loadIdentity(nextContext, joined.membershipId);
    if (contexts.current(nextContext)) notify('Вы присоединились к организации.');
  });
});

ui.checkout.addEventListener('submit', event => {
  event.preventDefault();
  void action(ui.checkout, async context => {
    const form = new FormData(ui.checkout);
    const input = {
      beneficiaryId: form.get('beneficiaryId'), customerId: form.get('customerId'),
      amountMinor: parseRub(form.get('amount')), kind: 'cash',
    };
    const scope = `checkout:${membership.membershipId}`;
    const result = await request(context, 'checkout', {
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

ui['mint-agent'].addEventListener('click', () => void action(ui['mint-agent'], async context => {
  const actions = grantActions[membership.role];
  const result = await request(context, 'agent-token', {
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
  await refreshWorkspace(context);
}, 'Ключ показан один раз. Скопируйте его сейчас.'));

ui['probe-agent'].addEventListener('click', () => void action(ui['probe-agent'], async context => {
  if (!issuedAgent?.token) throw new Error('Сначала выдайте новый ключ.');
  const initialized = await mcp(issuedAgent.token, 'initialize', {
    protocolVersion: '2025-11-25', capabilities: {},
    clientInfo: { name: 'n3-account-probe', version: '1.0.0' },
  }, 'n3-init', context.signal);
  contexts.assert(context);
  if (initialized?.protocolVersion !== '2025-11-25') throw new Error('MCP не подтвердил версию протокола.');
  const tools = await mcp(issuedAgent.token, 'tools/list', {}, 'n3-tools', context.signal);
  contexts.assert(context);
  if (!Array.isArray(tools?.tools)) throw new Error('MCP не вернул список инструментов.');
  notify(`MCP подключён. Доступно инструментов: ${tools.tools.length}.`);
}));

ui['change-password'].addEventListener('submit', event => {
  event.preventDefault();
  void action(ui['change-password'], async context => {
    const form = new FormData(ui['change-password']);
    await request(context, 'password', {
      currentPassword: form.get('currentPassword'), newPassword: form.get('newPassword'),
    });
    signedOut('Пароль изменён. Все сеансы и агентные ключи отозваны; войдите снова.');
  });
});

function invitationFromFragment() {
  const match = /^#invite=([^&]+)$/.exec(location.hash);
  if (!match) return;
  try {
    const value = decodeURIComponent(match[1]);
    if (/^[A-Za-z0-9_-]{43}$/.test(value)) {
      ui.accept.elements.invitation.value = value;
      fragmentInvitation = true;
    }
    else notify('Ссылка приглашения имеет неверный формат.', true);
  } catch { notify('Ссылка приглашения имеет неверный формат.', true); }
  history.replaceState(null, '', `${location.pathname}${location.search}`);
}

invitationFromFragment();
const initialContext = contexts.capture();
loadIdentity(initialContext).catch(error => {
  if (!contexts.current(initialContext)) return;
  if (error instanceof AccountApiError && error.status === 401) {
    signedOut('', { preserveIncoming: fragmentInvitation });
  } else { signedOut('', { preserveIncoming: fragmentInvitation }); report(error); }
});
