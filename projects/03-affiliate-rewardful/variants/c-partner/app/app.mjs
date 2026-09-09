import { ApiError, connect } from '/shared/client/api.mjs';
import { copy, feedback, shell } from '/shared/ui/ui.mjs';
import { historyView, nav, overviewView, shareView, termsView, titleFor } from './views.mjs';

let api;
let program;
let partner;
let share;
let labProgram;
let labArtifact;
let labActive = false;
let view = 'terms';
const artifactKey = () => `n3.fixture.C.operator-artifact.${api.session.runId}`;
const exact = artifact => ({ artifactId:artifact.artifactId, revision:artifact.revision, hash:artifact.hash });

async function refreshPartner() {
  [program, partner] = await Promise.all([api.command('program.read'), api.command('partner.read')]);
  share = program.enrollment ? await api.command('share.read') : null;
}

async function refreshLab() {
  const merchant = api.actor('merchant');
  if (!merchant) throw new Error('Fixture-контекст владельца недоступен.');
  labProgram = await api.command('program.read', {}, { actorId:merchant.id });
  const artifactId = sessionStorage.getItem(artifactKey());
  if (artifactId) {
    try { labArtifact = await api.command('registry.read', { artifactId }, { actorId:merchant.id }); }
    catch (error) { if (error instanceof ApiError && error.status === 404) sessionStorage.removeItem(artifactKey()); else throw error; }
  }
}

function body() {
  if (view === 'terms') return termsView(program);
  if (view === 'overview') return overviewView(program, partner);
  if (view === 'history') return historyView(partner, { available:Boolean(api.actor('merchant')), active:labActive, program:labProgram, artifact:labArtifact });
  return shareView(share);
}

function render() {
  const [title, subtitle] = titleFor(view);
  shell({ variant:'C', title, subtitle, role:`${partner.actor.name} · партнёр`, nav:nav(view, Boolean(program.enrollment)), body:body() });
  bindCommon();
  if (view === 'terms') bindTerms();
  if (view === 'overview') bindOverview();
  if (view === 'history') bindHistory();
  if (view === 'share') bindShare();
}

function bindCommon() {
  document.querySelector('#restart-demo')?.addEventListener('click', api.restart);
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', async () => {
    view = button.dataset.view;
    if (view === 'history') await loadAndRender('Обновляем историю и payout status…');
    else render();
  }));
}

function showSceneLoading(message) {
  const scene = document.querySelector('#scene');
  if (scene) scene.innerHTML = `<div class="scene-loading" data-testid="state-loading" role="status"><span></span><p>${message}</p></div>`;
}

async function loadAndRender(message = 'Получаем актуальные данные…') {
  showSceneLoading(message);
  try { await refreshPartner(); render(); }
  catch (error) { showOperationError(error, true); }
}

async function run(button, operation) {
  if (button?.disabled) return;
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  try { await operation(); }
  catch (error) { showOperationError(error); }
  finally { button.disabled = false; button.removeAttribute('aria-busy'); }
}

function showOperationError(error, replace = false) {
  const message = error?.message || 'Нет связи с сервером. Повторите запрос.';
  if (!replace) feedback(message, true);
  const denied = error instanceof ApiError && error.status === 403;
  const markup = `<section class="inline-state ${denied ? 'denied' : ''}" data-testid="${denied ? 'state-denied' : 'state-error'}"><strong>${denied ? 'Доступ отклонён сервером' : 'Не удалось обновить данные'}</strong><p>${escapeHtml(message)}</p><button class="secondary" id="retry-inline" data-testid="retry">Повторить</button></section>`;
  const scene = document.querySelector('#scene');
  if (replace && scene) scene.innerHTML = markup;
  else scene?.insertAdjacentHTML('afterbegin', markup);
  document.querySelector('#retry-inline')?.addEventListener('click', () => loadAndRender());
}

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));

function bindTerms() {
  document.querySelector('#enrollment-form')?.addEventListener('submit', event => {
    event.preventDefault();
    const consent = document.querySelector('#enrollment-consent');
    if (!consent.checked) { feedback('Сначала подтвердите добровольное участие отдельным флажком.', true); consent.focus(); return; }
    run(document.querySelector('#enrollment-submit'), async () => {
      await api.command('enrollment.join', { consent:true });
      await refreshPartner();
      view = 'share';
      render();
      feedback('Участие сохранено. Сервер вернул вашу личную ссылку и share kit.');
    });
  });
}

function bindOverview() {
  document.querySelector('#refresh-partner')?.addEventListener('click', event => run(event.currentTarget, async () => {
    await refreshPartner(); render(); feedback('Собственный баланс и payout status обновлены с сервера.');
  }));
}

function policyInput() {
  const rawRate = document.querySelector('#lab-policy-rate').value.trim().replace(',', '.');
  const match = rawRate.match(/^(\d{1,3})(?:\.(\d{1,2}))?$/);
  const bps = match ? Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0')) : NaN;
  const windowDays = Number(document.querySelector('#lab-policy-window').value);
  const holdDays = Number(document.querySelector('#lab-policy-hold').value);
  if (!Number.isInteger(bps) || bps < 1 || bps > 10000) throw new Error('Ставка должна быть от 0,01% до 100%.');
  if (!Number.isInteger(windowDays) || windowDays < 1 || windowDays > 365) throw new Error('Окно должно быть от 1 до 365 дней.');
  if (!Number.isInteger(holdDays) || holdDays < 0 || holdDays > 90) throw new Error('Hold должен быть от 0 до 90 дней.');
  return { kind:'cash', bps, windowDays, holdDays, recurring:document.querySelector('#lab-policy-recurring').checked };
}

function merchant() {
  const actor = api.actor('merchant');
  if (!actor) throw new Error('Fixture-контекст владельца недоступен.');
  return actor;
}

function bindHistory() {
  document.querySelector('#open-operator-lab')?.addEventListener('click', event => run(event.currentTarget, async () => {
    await refreshLab();
    labActive = true;
    render();
    document.querySelector('#operator-lab-controls')?.focus();
  }));
  document.querySelector('#lab-policy-form')?.addEventListener('submit', event => {
    event.preventDefault();
    run(document.querySelector('#lab-policy-save'), async () => {
      const saved = await api.command('program.save', policyInput(), { actorId:merchant().id });
      await refreshPartner(); labProgram = program; render();
      feedback(`Fixture-владелец опубликовал V${saved.version}. Исторические комиссии сохранили прежние версии.`);
    });
  });
  document.querySelector('#lab-registry-prepare')?.addEventListener('click', event => run(event.currentTarget, async () => {
    const input = { period:'2026-08' };
    if (labArtifact?.artifactId) input.artifactId = labArtifact.artifactId;
    labArtifact = await api.command('registry.prepare', input, { actorId:merchant().id });
    sessionStorage.setItem(artifactKey(), labArtifact.artifactId);
    render(); feedback('Fixture-владелец подготовил точный серверный снимок реестра.');
  }));
  document.querySelector('#lab-registry-approve')?.addEventListener('click', event => run(event.currentTarget, async () => {
    labArtifact = await api.command('registry.approve', exact(labArtifact), { actorId:merchant().id });
    render(); feedback('Fixture-владелец утвердил текущие revision и hash.');
  }));
  document.querySelector('#lab-registry-sent')?.addEventListener('click', event => run(event.currentTarget, async () => {
    await api.command('registry.sent', { ...exact(labArtifact), partnerId:partner.actor.id, evidence:'fixture operator receipt C', sentAt:partner.clock }, { actorId:merchant().id });
    await Promise.all([refreshPartner(), refreshLab()]); render();
    feedback('Fixture-владелец отметил собственную строку Анны отправленной. Зачисление в банке не заявлено.');
  }));
}

function bindShare() {
  if (!share) return;
  document.querySelector('#share-copy-url')?.addEventListener('click', event => run(event.currentTarget, () => copy(share.referralUrl)));
  document.querySelector('#share-copy')?.addEventListener('click', event => run(event.currentTarget, () => copy(`${share.text}\n\n${share.disclosure}\n${share.referralUrl}\nПромокод: ${share.promoCode}`)));
}

function fatalState(error) {
  const denied = error instanceof ApiError && error.status === 403;
  document.querySelector('#app').innerHTML = `<main class="fatal partner-fatal" data-testid="${denied ? 'state-denied' : 'state-error'}"><span class="boot-orbit"><i>к</i></span><h1>${denied ? 'Доступ к кабинету отклонён' : 'Не удалось открыть кабинет'}</h1><p role="alert">${escapeHtml(error?.message || 'Проверьте соединение и повторите попытку.')}</p><div class="actions"><button class="primary" id="retry" data-testid="retry">Повторить</button><button class="secondary" id="fresh" data-testid="fresh-session">Новый демосеанс</button></div></main>`;
  document.querySelector('#retry').onclick = () => location.reload();
  document.querySelector('#fresh').onclick = () => { for (const key of Object.keys(sessionStorage)) if (key.startsWith('n3.fixture.C')) sessionStorage.removeItem(key); location.replace(location.pathname); };
}

async function start() {
  try {
    api = await connect('C', 'partner');
    await refreshPartner();
    view = program.enrollment ? 'overview' : 'terms';
    render();
  } catch (error) { fatalState(error); }
}

start();
