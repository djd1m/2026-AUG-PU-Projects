import { byId } from './helpers.mjs';

const PROOF_TOKEN = /^[A-Za-z0-9_-]{43}$/;
const PROOF_PURPOSES = new Set(['register', 'reset', 'contact']);
const CALLBACK_ERRORS = {
  cancelled: 'Вход через Яндекс отменён. Можно выбрать другой способ входа.',
  collision: 'Эта почта уже занята. Войдите прежним способом и подключите Яндекс в настройках безопасности.',
  bound: 'Этот Яндекс ID уже связан с другим аккаунтом.',
  unavailable: 'Яндекс ID временно недоступен. Повторите попытку позже.',
  invalid: 'Ссылка входа через Яндекс недействительна или устарела. Начните вход заново.',
};

export function readAccountFragment(browser = globalThis) {
  const hash = browser.location?.hash ?? '';
  if (!hash.startsWith('#')) return {};
  const params = new URLSearchParams(hash.slice(1));
  const known = ['invite', 'access', 'access-error', 'access-result'].some(key => params.has(key));
  if (!known) return {};
  browser.history.replaceState(browser.history.state ?? null, '',
    `${browser.location.pathname}${browser.location.search}`);

  if (params.size === 1 && params.has('invite')) {
    const invitation = params.get('invite');
    return PROOF_TOKEN.test(invitation) ? { invitation } : { error: 'Ссылка приглашения имеет неверный формат.' };
  }
  if (params.size === 2 && params.has('access') && params.has('token')) {
    const purpose = params.get('access'), token = params.get('token');
    if (PROOF_PURPOSES.has(purpose) && PROOF_TOKEN.test(token)) return { proof: { purpose, token } };
    return { error: 'Ссылка подтверждения имеет неверный формат.' };
  }
  if (params.size === 1 && params.has('access-error')) {
    return { error: CALLBACK_ERRORS[params.get('access-error')] ?? CALLBACK_ERRORS.invalid };
  }
  if (params.size === 1 && params.get('access-result') === 'linked') {
    return { result: 'Яндекс ID подключён к аккаунту.' };
  }
  return { error: 'Ссылка доступа имеет неверный формат.' };
}

function nodes() {
  return Object.fromEntries([
    'access-status', 'login', 'login-email', 'login-password', 'yandex-login',
    'register-form', 'register-email', 'register-name', 'register-submit', 'register-cooldown',
    'forgot-form', 'forgot-email', 'forgot-submit', 'forgot-cooldown',
    'access-completion', 'completion-title', 'completion-copy', 'completion-form',
    'completion-password-label', 'completion-password', 'completion-submit',
    'security-message', 'security-provider', 'contact-request', 'contact-cooldown', 'recovery-request',
    'recovery-cooldown', 'yandex-link', 'yandex-link-password', 'yandex-unlink',
    'yandex-unlink-password', 'change-password',
  ].map(id => [id, byId(id)]));
}

function validYandexUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.origin !== 'https://oauth.yandex.ru'
      || url.username || url.password || value.length > 2_048) throw new Error();
    return url.href;
  } catch { throw new Error('Сервер вернул небезопасную ссылку Яндекс ID.'); }
}

export function mountAccessUI({
  ui = nodes(), action, request, onAuthenticated, onBeforeAuthSwitch, onSignedOut,
  notify, navigate = url => globalThis.location.assign(url), fragment = {},
  now = () => Date.now(), setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = timer => clearTimeout(timer),
}) {
  if (![action, request, onAuthenticated, onBeforeAuthSwitch, onSignedOut, notify].every(value => typeof value === 'function')) {
    throw new TypeError('Access UI dependencies are required.');
  }
  let status = { mailConfigured: null, yandexConfigured: null, verificationRequired: null };
  let identity = null;
  let proof = fragment.proof ?? null;
  const cooldowns = new Map();
  let timer = null;

  function remaining(kind) {
    return Math.max(0, Math.ceil(((cooldowns.get(kind) ?? 0) - now()) / 1_000));
  }

  function availability() {
    const mail = status.mailConfigured === true;
    const yandex = status.yandexConfigured === true;
    ui['register-submit'].disabled = !mail || remaining('register') > 0;
    ui['forgot-submit'].disabled = !mail || remaining('forgot') > 0;
    ui['yandex-login'].disabled = !yandex;
    ui['contact-request'].disabled = !mail || remaining('contact') > 0;
    ui['recovery-request'].disabled = !mail || remaining('recovery') > 0;
    ui['yandex-link'].querySelector('button').disabled = !yandex;
    for (const [kind, output] of [['register', ui['register-cooldown']], ['forgot', ui['forgot-cooldown']],
      ['contact', ui['contact-cooldown']], ['recovery', ui['recovery-cooldown']]]) {
      const seconds = remaining(kind);
      output.textContent = seconds ? `Повторный запрос доступен через ${seconds} с.` : '';
    }
  }

  function scheduleCooldowns() {
    if (timer) clearTimer(timer);
    availability();
    if (![...cooldowns.keys()].some(kind => remaining(kind) > 0)) { timer = null; return; }
    timer = setTimer(scheduleCooldowns, 1_000);
    timer?.unref?.();
  }

  function beginCooldown(kind) {
    cooldowns.set(kind, now() + 60_000);
    scheduleCooldowns();
  }

  function renderStatus() {
    const mail = status.mailConfigured === true
      ? 'Письма доступа подключены.'
      : status.mailConfigured === false
        ? 'Письма доступа не настроены оператором: регистрация и восстановление недоступны.'
        : 'Статус писем доступа недоступен: регистрация и восстановление временно отключены.';
    const yandex = status.yandexConfigured === true
      ? 'Яндекс ID подключён.'
      : status.yandexConfigured === false
        ? 'Яндекс ID не настроен оператором.'
        : 'Статус Яндекс ID недоступен.';
    const policy = status.verificationRequired === true ? 'Подтверждение почты обязательно для рабочих данных.'
      : status.verificationRequired === false ? 'Обязательная проверка почты для прежних аккаунтов пока не включена.'
        : 'Статус проверки почты недоступен.';
    ui['access-status'].textContent = `${mail} ${yandex} ${policy}`;
    availability();
  }

  function renderCompletion() {
    const active = Boolean(proof);
    ui['access-completion'].hidden = !active;
    if (!active) {
      ui['completion-password'].value = '';
      return;
    }
    const contact = proof.purpose === 'contact';
    ui['completion-title'].textContent = contact ? 'Подтвердить контактную почту'
      : proof.purpose === 'register' ? 'Завершить регистрацию' : 'Задать новый пароль';
    ui['completion-copy'].textContent = contact
      ? 'Подтверждение использует текущий сеанс и одноразовую ссылку. Нажмите кнопку, чтобы продолжить.'
      : 'Ссылка сама по себе ничего не меняет. Задайте новый пароль и явно подтвердите действие.';
    ui['completion-password-label'].hidden = contact;
    ui['completion-password'].required = !contact;
    ui['completion-submit'].textContent = contact ? 'Подтвердить почту'
      : proof.purpose === 'register' ? 'Создать аккаунт и организацию' : 'Сменить пароль';
  }

  function renderSecurity() {
    const signedIn = Boolean(identity);
    const hasPassword = identity?.hasPassword === true;
    const verified = identity?.emailVerified === true;
    const linked = identity?.yandexLinked === true;
    ui['change-password'].hidden = !signedIn || !hasPassword;
    ui['contact-request'].hidden = !signedIn || hasPassword || verified;
    ui['recovery-request'].hidden = !signedIn || !((hasPassword && !verified) || (!hasPassword && verified));
    ui['yandex-link'].hidden = !signedIn || !verified || !hasPassword || linked;
    ui['yandex-unlink'].hidden = !signedIn || !hasPassword || !linked;
    const mailStatus = status.mailConfigured === true ? 'Письма подтверждения доступны.'
      : status.mailConfigured === false ? 'Письма подтверждения не настроены оператором.'
        : 'Статус писем подтверждения недоступен.';
    const yandexStatus = status.yandexConfigured === true ? 'Яндекс ID доступен для подключения.'
      : status.yandexConfigured === false ? 'Яндекс ID не настроен оператором.' : 'Статус Яндекс ID недоступен.';
    ui['security-provider'].textContent = `${mailStatus} ${yandexStatus}`;
    if (!signedIn) ui['security-message'].textContent = '';
    else if (!verified && hasPassword) ui['security-message'].textContent =
      'Почта не подтверждена. Запросите восстановление и задайте новый пароль: это отзовёт прежние сеансы и ключи.';
    else if (!verified) ui['security-message'].textContent =
      'Подтвердите контактную почту в этом сеансе. После подтверждения восстановление позволит создать пароль.';
    else if (!hasPassword) ui['security-message'].textContent =
      'Контактная почта подтверждена. Через восстановление можно создать пароль для независимого входа.';
    else ui['security-message'].textContent = linked
      ? 'Пароль и Яндекс ID доступны для входа.' : 'Пароль доступен для входа. При желании подключите Яндекс ID.';
    availability();
  }

  function clearPasswords() {
    for (const id of ['login-password', 'completion-password', 'yandex-link-password', 'yandex-unlink-password']) {
      ui[id].value = '';
    }
    ui['change-password'].reset();
  }

  function mailRequest(target, path, input, kind) {
    return action(target, async context => {
      const result = await request(context, path, input);
      if (result?.accepted !== true) throw new Error('Сервер не подтвердил приём запроса.');
      return true;
    }, 'Запрос принят. Если адрес подходит, письмо может прийти в течение нескольких минут. Доставка не гарантируется.')
      .then(done => { if (done) beginCooldown(kind); return done; });
  }

  ui.login.addEventListener('submit', event => {
    event.preventDefault();
    const credentials = { email: ui['login-email'].value, password: ui['login-password'].value };
    if (onBeforeAuthSwitch() === false) return undefined;
    return action(ui.login, async context => {
      await request(context, 'login', credentials);
      await onAuthenticated(context);
      return true;
    }, 'Вход выполнен.', { replace: true });
  });
  ui['register-form'].addEventListener('submit', event => {
    event.preventDefault();
    return mailRequest(ui['register-form'], 'register', {
      email: ui['register-email'].value, name: ui['register-name'].value,
    }, 'register');
  });
  ui['forgot-form'].addEventListener('submit', event => {
    event.preventDefault();
    return mailRequest(ui['forgot-form'], 'forgot', { email: ui['forgot-email'].value }, 'forgot');
  });
  ui['yandex-login'].addEventListener('click', () => action(ui['yandex-login'], async context => {
    const result = await request(context, 'yandex/start', { intent: 'login' });
    navigate(validYandexUrl(result?.url));
    return true;
  }));
  ui['completion-form'].addEventListener('submit', event => {
    event.preventDefault();
    if (!proof) return undefined;
    const submitted = proof;
    return action(ui['completion-form'], async context => {
      const path = submitted.purpose === 'register' ? 'activate'
        : submitted.purpose === 'reset' ? 'reset' : 'verify-contact';
      const input = submitted.purpose === 'contact' ? { token: submitted.token }
        : { token: submitted.token, password: ui['completion-password'].value };
      const result = await request(context, path, input);
      if (submitted.purpose !== 'contact'
        && (result?.completed !== true || result?.loginRequired !== true)) {
        throw new Error('Сервер не подтвердил завершение операции.');
      }
      proof = null;
      clearPasswords();
      renderCompletion();
      if (submitted.purpose === 'contact') {
        await onAuthenticated(context);
        notify('Контактная почта подтверждена.');
      }
      else onSignedOut(submitted.purpose === 'register'
        ? 'Аккаунт создан, почта подтверждена. Теперь войдите с новым паролем.'
        : 'Пароль изменён, прежние сеансы и ключи отозваны. Войдите снова.');
      return true;
    });
  });
  ui['contact-request'].addEventListener('click', () => mailRequest(ui['contact-request'], 'contact-email', {}, 'contact'));
  ui['recovery-request'].addEventListener('click', () => mailRequest(ui['recovery-request'], 'forgot',
    { email: identity?.email ?? '' }, 'recovery'));
  ui['yandex-link'].addEventListener('submit', event => {
    event.preventDefault();
    const password = ui['yandex-link-password'].value;
    return action(ui['yandex-link'], async context => {
      const result = await request(context, 'yandex/start', { intent: 'link', currentPassword: password });
      ui['yandex-link-password'].value = '';
      navigate(validYandexUrl(result?.url));
      return true;
    });
  });
  ui['yandex-unlink'].addEventListener('submit', event => {
    event.preventDefault();
    const password = ui['yandex-unlink-password'].value;
    return action(ui['yandex-unlink'], async context => {
      await request(context, 'yandex/unlink', { currentPassword: password });
      ui['yandex-unlink-password'].value = '';
      onSignedOut('Яндекс ID отключён. Все прежние сеансы и ключи отозваны; войдите снова.');
      return true;
    });
  });
  ui['change-password'].addEventListener('submit', event => {
    event.preventDefault();
    const form = new FormData(ui['change-password']);
    return action(ui['change-password'], async context => {
      await request(context, 'password', {
        currentPassword: form.get('currentPassword'), newPassword: form.get('newPassword'),
      });
      clearPasswords();
      onSignedOut('Пароль изменён. Все сеансы и агентные ключи отозваны; войдите снова.');
      return true;
    });
  });

  renderCompletion();
  renderStatus();
  if (fragment.error) notify(fragment.error, true);
  else if (fragment.result) notify(fragment.result);

  return {
    async loadStatus(context) {
      try {
        const next = await request(context, 'access-status', undefined, { get: true });
        if (!['mailConfigured', 'yandexConfigured', 'verificationRequired']
          .every(key => typeof next?.[key] === 'boolean')) throw new Error('Invalid access status');
        status = {
          mailConfigured: next?.mailConfigured === true,
          yandexConfigured: next?.yandexConfigured === true,
          verificationRequired: next?.verificationRequired === true,
        };
      } catch (error) {
        if (error?.name === 'AbortError') return;
        status = { mailConfigured: null, yandexConfigured: null, verificationRequired: null };
      }
      renderStatus(); renderSecurity();
    },
    setIdentity(next) { identity = next; renderSecurity(); },
    securityOnly(next = identity) {
      return next?.verificationRequired === true && next?.emailVerified !== true;
    },
    clearSecrets({ preserveProof = false } = {}) {
      clearPasswords();
      if (!preserveProof) { proof = null; renderCompletion(); }
    },
    dispose() {
      if (timer) clearTimer(timer);
      timer = null; cooldowns.clear(); proof = null; identity = null; clearPasswords(); renderCompletion();
    },
  };
}
