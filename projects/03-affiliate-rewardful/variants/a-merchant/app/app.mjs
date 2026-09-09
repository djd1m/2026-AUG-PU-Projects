import { connect } from '/shared/client/api.mjs';
import { copy, download, fatal, feedback, shell } from '/shared/ui/ui.mjs';
import { dashboardView, enrollmentPreview, inviteView, nav, programView, registryView, tariffView, titleFor } from './views.mjs';

let api;
let dashboard;
let program;
let editingPolicy;
let editingKind = 'cash';
let artifact;
let view = 'dashboard';
let handoff = false;
const joinMode = location.pathname.replace(/\/$/, '') === '/join';
const registryStorageKey = () => `n3.fixture.A.registry.${api.session.runId}`;

const exact = item => ({ artifactId: item.artifactId, revision: item.revision, hash: item.hash });
const labRefund = () => ({ ...dashboard.fixtureEvents.refund, objectId: `${dashboard.fixtureEvents.payment.objectId}-partial-refund`, paymentId: dashboard.fixtureEvents.payment.objectId });

function showLoading(message = 'Получаем актуальные данные с сервера…') {
  document.querySelector('#scene')?.replaceChildren();
  const scene = document.querySelector('#scene');
  if (scene) scene.innerHTML = `<div class="scene-loading" role="status"><span></span><p>${message}</p></div>`;
}

async function refreshBase() {
  [dashboard, program] = await Promise.all([
    api.command('dashboard'), api.command('program.read'),
  ]);
  editingPolicy = program.policies.findLast(policy => policy.kind === editingKind);
}

async function refreshArtifact() {
  if (!artifact?.artifactId) return;
  artifact = await api.command('registry.read', { artifactId: artifact.artifactId });
  sessionStorage.setItem(registryStorageKey(), artifact.artifactId);
}

function bodyFor() {
  if (joinMode) return enrollmentPreview(program);
  if (view === 'dashboard') return dashboardView({ ...dashboard, labRefund: labRefund() });
  if (view === 'program') return programView({ ...program, policy: editingPolicy || program.policy, version: (editingPolicy || program.policy).version });
  if (view === 'registry') return registryView(artifact, dashboard, handoff);
  if (view === 'invite') return inviteView(program);
  return tariffView(dashboard.tariff);
}

function render() {
  const [title, subtitle] = joinMode ? ['Условия партнёрской программы', 'Предпросмотр приглашения: участие не создаётся автоматически.'] : titleFor(view);
  shell({ variant: 'A', title, subtitle, role: joinMode ? 'Владелец · предпросмотр' : dashboard.actor.name, nav: joinMode ? '' : nav(view), body: bodyFor() });
  bindCommon();
  if (joinMode) return;
  if (view === 'dashboard') bindDashboard();
  if (view === 'program') bindProgram();
  if (view === 'registry') bindRegistry();
  if (view === 'invite') document.querySelector('#copy-enrollment')?.addEventListener('click', () => run(document.querySelector('#copy-enrollment'), async () => copy(document.querySelector('#enrollment-link').value)));
  if (view === 'tariff') document.querySelector('#tariff-interest')?.addEventListener('click', () => feedback('Интерес отмечен только в этом экране. Оплата не запускалась.'));
}

function bindCommon() {
  document.querySelector('#restart-demo')?.addEventListener('click', api.restart);
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', async () => {
    view = button.dataset.view;
    try {
      if (view === 'registry' && artifact) await refreshArtifact();
      render();
    } catch (error) { feedback(error.message || 'Не удалось обновить раздел.', true); }
  }));
}

async function run(button, operation, message) {
  if (button?.disabled) return;
  if (button) { button.disabled = true; button.setAttribute('aria-busy', 'true'); }
  try {
    await operation();
    if (message) feedback(message);
  } catch (error) {
    feedback(error.message || 'Нет связи с сервером. Повторите запрос.', true);
    throw error;
  } finally {
    if (button) { button.disabled = false; button.removeAttribute('aria-busy'); }
  }
}

async function mutate(button, action, input, message) {
  try {
    await run(button, async () => {
      await api.command(action, input);
      await refreshBase();
      if (artifact) await refreshArtifact();
      render();
      feedback(message);
    });
  } catch { /* feedback is already visible */ }
}

function bindDashboard() {
  const payment = dashboard.fixtureEvents.payment;
  document.querySelector('#fixture-payment')?.addEventListener('click', event => mutate(event.currentTarget, 'fixture.event', payment, 'Оплата подтверждена. Сервер сохранил начисление.'));
  document.querySelector('#fixture-replay')?.addEventListener('click', event => mutate(event.currentTarget, 'fixture.event', payment, 'Повтор доставлен. Нового начисления не создано, коррекции сохранены.'));
  document.querySelector('#fixture-refund')?.addEventListener('click', event => mutate(event.currentTarget, 'fixture.event', labRefund(), 'Возврат зарегистрирован отдельной коррекцией.'));
  document.querySelector('#fixture-advance')?.addEventListener('click', event => {
    const input = document.querySelector('#advance-days');
    const days = Number(input.value);
    if (!Number.isInteger(days) || days < 0 || days > 365) { feedback('Введите целое число дней от 0 до 365.', true); input.focus(); return; }
    mutate(event.currentTarget, 'fixture.advance', { days }, 'Демо-время обновлено. Снимки реестра могут потребовать пересчёта.');
  });
}

function policyInput(form) {
  const data = new FormData(form);
  const raw = {
    kind: data.get('kind'), rate: String(data.get('rate') || '').trim().replace(',', '.'), windowDays: data.get('windowDays'),
    holdDays: data.get('holdDays'), recurring: data.get('recurring') === 'on',
  };
  const errors = [];
  if (!['cash', 'credit'].includes(raw.kind)) errors.push('Выберите тип вознаграждения.');
  const rateMatch = raw.rate.match(/^(\d{1,3})(?:\.(\d{1,2}))?$/);
  const bps = rateMatch ? Number(rateMatch[1]) * 100 + Number((rateMatch[2] || '').padEnd(2, '0')) : NaN;
  if (!Number.isInteger(bps) || bps < 1 || bps > 10000) errors.push('Ставка: число от 0,01% до 100%, не более двух знаков после запятой.');
  for (const [key, label, min, max] of [['windowDays', 'Окно атрибуции', 1, 365], ['holdDays', 'Проверка возврата', 0, 90]]) {
    if (raw[key] === '' || !Number.isInteger(Number(raw[key])) || Number(raw[key]) < min || Number(raw[key]) > max) errors.push(`${label}: целое число от ${min} до ${max}.`);
  }
  return { errors, value: { kind: raw.kind, bps, windowDays: Number(raw.windowDays), holdDays: Number(raw.holdDays), recurring: raw.recurring } };
}

function bindProgram() {
  document.querySelector('#policy-kind')?.addEventListener('change', event => {
    if (!['cash', 'credit'].includes(event.target.value)) return;
    editingKind = event.target.value;
    sessionStorage.setItem(`n3.fixture.A.policy-kind.${api.session.runId}`, editingKind);
    editingPolicy = program.policies.findLast(policy => policy.kind === editingKind);
    render();
  });
  document.querySelector('#policy-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const { errors, value } = policyInput(form);
    const box = document.querySelector('#policy-errors');
    if (errors.length) { box.hidden = false; box.innerHTML = `<strong>Исправьте поля:</strong><ul>${errors.map(error => `<li>${error}</li>`).join('')}</ul>`; form.querySelector(':invalid, select')?.focus(); return; }
    box.hidden = true;
    const button = document.querySelector('#policy-save');
    try {
      await run(button, async () => {
        editingPolicy = await api.command('program.save', value);
        await refreshBase();
        render();
        feedback(`Опубликована версия ${editingPolicy.version}. Будущие начисления этого типа используют её.`);
      });
    } catch { /* server validation remains visible in feedback */ }
  });
}

async function prepareRegistry(button, preserve = false) {
  const periodInput = document.querySelector('#registry-period');
  const period = artifact?.period || periodInput?.value;
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(period || '')) { feedback('Выберите корректный расчётный месяц.', true); periodInput?.focus(); return; }
  try {
    await run(button, async () => {
      const input = { period };
      if ((preserve || artifact?.status === 'stale') && artifact?.artifactId) input.artifactId = artifact.artifactId;
      artifact = await api.command('registry.prepare', input);
      sessionStorage.setItem(registryStorageKey(), artifact.artifactId);
      await refreshBase();
      render();
      feedback(artifact.rows.length ? `Подготовлена версия ${artifact.revision}. Проверьте строки и исключения.` : 'Снимок подготовлен: сумм к переводу нет.');
    });
  } catch { /* feedback is already visible */ }
}

function bindRegistry() {
  document.querySelector('#registry-prepare')?.addEventListener('click', event => prepareRegistry(event.currentTarget));
  document.querySelector('#registry-recompute')?.addEventListener('click', event => prepareRegistry(event.currentTarget, true));
  document.querySelector('#registry-refresh')?.addEventListener('click', event => run(event.currentTarget, async () => { await refreshBase(); await refreshArtifact(); render(); feedback('Открыта актуальная серверная версия.'); }).catch(() => {}));
  document.querySelector('#registry-approve')?.addEventListener('click', event => mutate(event.currentTarget, 'registry.approve', exact(artifact), `Версия ${artifact.revision} утверждена.`));
  document.querySelector('#registry-export')?.addEventListener('click', event => run(event.currentTarget, async () => {
    const result = await api.command('registry.export', exact(artifact));
    download(result.filename, result.csv);
    feedback(`Скачан CSV версии ${result.revision}. Выгрузка не отмечена как отправка.`);
  }).catch(async () => { try { await refreshArtifact(); render(); } catch {} }));
  document.querySelector('#sent-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const button = document.querySelector('#registry-sent');
    const partnerId = document.querySelector('#sent-partner').value;
    const evidence = document.querySelector('#sent-evidence').value.trim();
    const day = document.querySelector('#sent-date').value;
    if (!partnerId || !evidence || !day) { feedback('Выберите партнёра, укажите доказательство и дату отправки.', true); event.currentTarget.querySelector(':invalid')?.focus(); return; }
    await mutate(button, 'registry.sent', { ...exact(artifact), partnerId, evidence, sentAt: `${day}T12:00:00.000Z` }, 'Синтетический факт ручной отправки сохранён. Он не подтверждает зачисление.');
  });
}

async function start() {
  try {
    api = await connect('A', 'merchant');
    const storedKind = sessionStorage.getItem(`n3.fixture.A.policy-kind.${api.session.runId}`);
    if (['cash', 'credit'].includes(storedKind)) editingKind = storedKind;
    await refreshBase();
    if (api.session.handoffArtifactId) {
      artifact = await api.command('registry.read', { artifactId: api.session.handoffArtifactId });
      sessionStorage.setItem(registryStorageKey(), artifact.artifactId);
      handoff = true;
      view = 'registry';
    } else {
      const selectedArtifactId = sessionStorage.getItem(registryStorageKey());
      if (selectedArtifactId) artifact = await api.command('registry.read', { artifactId: selectedArtifactId });
      else if (dashboard.registries.length) artifact = dashboard.registries.at(-1);
    }
    if (joinMode) view = 'invite';
    render();
  } catch (error) { fatal(error); }
}

start();
