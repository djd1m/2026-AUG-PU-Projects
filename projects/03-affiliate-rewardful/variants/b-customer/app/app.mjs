import { connect, ApiError } from '/shared/client/api.mjs';
import { copy, escape, feedback, shell } from '/shared/ui/ui.mjs';
import { creditsView, nav, overviewView, productView, shareView, titleFor } from './views.mjs';
import { embedding } from './embed.mjs';

let api;
let program;
let credit;
let share = null;
let currentView = 'product';
let valueMoment = false;
let declined = false;
let embed;

const momentKey = () => `n3.fixture.B.value-moment.${api.session.runId}`;
const declinedKey = () => `n3.fixture.B.declined.${api.session.runId}`;

function remember(key, value) {
  if (value) sessionStorage.setItem(key, '1');
  else sessionStorage.removeItem(key);
}

function receiveValueMoment() {
  if (valueMoment) return;
  valueMoment = true;
  declined = false;
  if (api) {
    remember(momentKey(), true);
    remember(declinedKey(), false);
    render();
  }
}

function body() {
  if (currentView === 'product') return productView({ program, moment:valueMoment, declined, embedded:embed.enabled });
  if (currentView === 'overview') return overviewView(credit);
  if (currentView === 'credits') return creditsView(credit, api.session.actors);
  return shareView(share);
}

function render() {
  const enrolled = Boolean(program.enrollment);
  if (!enrolled && currentView !== 'product') currentView = 'product';
  const [title, subtitle] = titleFor(currentView);
  shell({ variant:'B', title, subtitle, role:`Клиент · ${credit.actor.name}`, nav:nav(currentView, enrolled), body:body() });
  document.body.classList.toggle('embedded', embed.enabled);
  if (embed.enabled) document.querySelector('#restart-demo')?.remove();
  bindCommon();
  if (currentView === 'product') bindProduct();
  if (currentView === 'credits') bindCredits();
  if (currentView === 'share') bindShare();
}

function bindCommon() {
  document.querySelector('#restart-demo')?.addEventListener('click', api.restart);
  document.querySelector('.brand')?.addEventListener('click', event => { event.preventDefault(); currentView = 'product'; render(); });
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', async () => {
    currentView = button.dataset.view;
    try { await refreshCustomer(); render(); } catch (error) { showOperationError(error); }
  }));
}

function bindProduct() {
  document.querySelector('#publish-widget')?.addEventListener('click', () => {
    valueMoment = true;
    remember(momentKey(), true);
    render();
    feedback('Демо-виджет опубликован. Теперь предложение показано в момент пользы.');
  });
  document.querySelector('#decline-invite')?.addEventListener('click', () => {
    declined = true;
    remember(declinedKey(), true);
    embed.dismissed();
    render();
    feedback('Предложение отложено. Виджет Proofwall продолжает работать, участие не создано.');
  });
  document.querySelector('#restore-invite')?.addEventListener('click', () => {
    declined = false;
    remember(declinedKey(), false);
    render();
  });
  document.querySelector('#enrollment-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const consent = document.querySelector('#enrollment-consent');
    if (!consent.checked) { feedback('Подтвердите добровольное участие отдельным флажком.', true); consent.focus(); return; }
    const button = document.querySelector('#enrollment-submit');
    await run(button, async () => {
      await api.command('enrollment.join', { consent:true });
      await refreshCustomer();
      currentView = 'share';
      render();
      feedback('Участие сохранено. Личная ссылка создана только после вашего согласия.');
    });
  });
}

function bindCredits() {
  document.querySelector('#reserve-credit')?.addEventListener('click', event => run(event.currentTarget, async () => {
    const amountMinor = Math.min(credit.availableMinor, credit.invoice.remainingMinor - credit.invoice.reservedMinor);
    await api.command('credit.reserve', { amountMinor, invoiceId:credit.invoice.id });
    await refreshCustomer();
    render();
    feedback('Резерв создан. Итог биллинга ещё не известен и не будет выбран автоматически.');
  }));
  for (const outcome of ['success', 'failed', 'unknown']) {
    document.querySelector(`#billing-${outcome}`)?.addEventListener('click', event => run(event.currentTarget, async () => {
      const reservationId = document.querySelector('#billing-reservation').value;
      const merchant = api.actor('merchant');
      if (!merchant) throw new Error('Fixture-контекст оператора недоступен.');
      await api.command('credit.resolve', { reservationId, outcome }, { actorId:merchant.id });
      await refreshCustomer();
      render();
      feedback({ success:'Оператор подтвердил применение. Сервер обновил счёт.', failed:'Оператор подтвердил отказ. Сервер освободил резерв.', unknown:'Неизвестный результат сохранён. Резерв удерживается для сверки.' }[outcome]);
    }));
  }
  document.querySelector('#lab-payment')?.addEventListener('click', event => fixtureCreditEvent(event.currentTarget, false));
  document.querySelector('#lab-self-referral')?.addEventListener('click', event => fixtureCreditEvent(event.currentTarget, true));
}

async function fixtureCreditEvent(button, selfReferral) {
  await run(button, async () => {
    const customer = api.actor('customer');
    const merchant = api.actor('merchant');
    if (!customer?.promoCode || !merchant) throw new Error('Fixture-контекст события недоступен.');
    const suffix = selfReferral ? 'self-referral' : 'friend-payment';
    const result = await api.command('fixture.event', {
      type:'payment', provider:'fixture', accountId:'demo', objectId:`b-${suffix}-${api.session.runId}`,
      verified:true, status:'confirmed', customerId:selfReferral ? customer.id : `friend-${api.session.runId}`,
      beneficiaryId:customer.id, kind:'credit', amountMinor:150000, paidAt:credit.clock,
      promo:{ code:customer.promoCode, attributedAt:credit.clock },
    }, { actorId:merchant.id });
    await refreshCustomer();
    render();
    feedback(selfReferral
      ? `Самореферал проверен: ${result.status === 'no_reward' ? 'доступный бонус не создан.' : 'неожиданный результат.'}`
      : 'Подтверждённая fixture-оплата друга сохранена. Бонус находится на hold-проверке.');
  });
}

function bindShare() {
  if (!share) return;
  document.querySelector('#copy-url')?.addEventListener('click', event => run(event.currentTarget, () => copy(share.referralUrl)));
  document.querySelector('#copy-share')?.addEventListener('click', event => run(event.currentTarget, () => copy(`${share.text}\n\n${share.disclosure}\n${share.referralUrl}\nПромокод: ${share.promoCode}`)));
}

async function run(button, operation) {
  if (button?.disabled) return;
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  try { await operation(); }
  catch (error) {
    // A confirmed conflict can mean another tab won the same credit. Read fresh
    // server state, but never retry a mutation or resolve an unknown outcome.
    if (error instanceof ApiError && error.status === 409) {
      try { await refreshCustomer(); render(); }
      catch { showOperationError(error); feedback(`${error.message} Не удалось обновить баланс. Откройте раздел повторно.`, true); return; }
    }
    showOperationError(error);
  }
  finally { button.disabled = false; button.removeAttribute('aria-busy'); }
}

function showOperationError(error) {
  const message = error?.message || 'Нет связи с сервером. Повторите запрос.';
  feedback(message, true);
  if (error instanceof ApiError && error.status === 403) {
    const scene = document.querySelector('#scene');
    scene?.insertAdjacentHTML('afterbegin', `<section class="denied-inline" data-testid="state-denied"><strong>Действие отклонено сервером</strong><p>${escape(message)} Текущий экран не расширяет полномочия клиента.</p></section>`);
  }
}

async function refreshCustomer() {
  [program, credit] = await Promise.all([
    api.command('program.read'),
    api.command('credit.read'),
  ]);
  share = program.enrollment ? await api.command('share.read') : null;
}

function bootFailure(error) {
  const denied = error instanceof ApiError && error.status === 403;
  document.querySelector('#app').innerHTML = `<main class="fatal" data-testid="${denied ? 'state-denied' : 'state-error'}"><span class="boot-mark">к</span><h1>${denied ? 'Доступ к кабинету отклонён' : 'Не удалось открыть кабинет'}</h1><p role="alert">${escape(error.message || 'Проверьте соединение и повторите попытку.')}</p><div class="actions"><button class="primary" id="retry" data-testid="retry">Повторить</button>${embed?.enabled ? '' : '<button class="secondary" id="fresh" data-testid="fresh-session">Новый демосеанс</button>'}</div></main>`;
  document.querySelector('#retry').onclick = () => location.reload();
  document.querySelector('#fresh')?.addEventListener('click', () => {
    for (const key of Object.keys(sessionStorage)) if (key.startsWith('n3.fixture.B')) sessionStorage.removeItem(key);
    location.replace(location.pathname);
  });
}

async function start() {
  embed = embedding(receiveValueMoment);
  if (!embed.valid) {
    bootFailure(new ApiError({ message:'Родительский origin не разрешён. Передайте точный parentOrigin для локального embed-host.' }, 403));
    return;
  }
  embed.ready();
  try {
    api = await connect('B', 'customer');
    await refreshCustomer();
    valueMoment = valueMoment || Boolean(program.enrollment) || sessionStorage.getItem(momentKey()) === '1';
    declined = !program.enrollment && sessionStorage.getItem(declinedKey()) === '1';
    if (program.enrollment) currentView = 'overview';
    render();
  } catch (error) { bootFailure(error); }
}

start();
