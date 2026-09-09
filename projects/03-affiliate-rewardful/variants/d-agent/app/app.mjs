import { connect, ApiError } from '/shared/client/api.mjs';
import { shell, feedback, download, escape as e } from '/shared/ui/ui.mjs';
import { roles, logicalTask, acceptsTask, exact, storedState } from './state.mjs';
import { nav, roleSelector, hero, grantView, taskView, artifactView, personalView, ownerLab } from './views.mjs';

let api, role, state, artifact, dashboard;
let view='task', generation=0, busy=false, labActive=false, retryOperation;
const storageKey = () => `n3.fixture.D.task.${api.session.runId}.${api.actor(role).id}`;
const selectedRoleKey = () => `n3.fixture.D.role.${api.session.runId}`;
const availableRoles = () => Object.keys(roles).filter(r=>api.actor(r));
const actor = () => {
  const value=api.actor(role);
  if(!value)throw new Error('Выбранный субъект недоступен в этом сеансе.');
  return value;
};
const direct = (action,input={},options={}) => api.command(action,input,{...options,actorId:actor().id});
const delegated = (action,input={},options={}) => {
  if(!state.grant?.grantId)throw new Error('Сначала подтвердите ограниченную делегацию.');
  return direct(action,input,{...options,grantId:state.grant.grantId});
};
function save() {
  // Store references and replay keys, never cached financial results or credentials.
  const {grant,grantDenied,logical,selectedTaskId,previousTaskId,artifactId,grantKey,refundReceipt}=state;
  sessionStorage.setItem(storageKey(),JSON.stringify({grant,grantDenied,logical,selectedTaskId,previousTaskId,artifactId,grantKey,refundReceipt}));
}
async function refreshOwner() {
  if(role!=='merchant')return;
  if(state.artifactId)artifact=await direct('registry.read',{artifactId:state.artifactId});
  if(labActive)dashboard=await direct('dashboard');
}
async function refreshTask() {
  if(!state.selectedTaskId)return;
  const captured=generation;
  const result=await delegated('task.read',{taskId:state.selectedTaskId});
  accept(result,captured);
}
function accept(result,captured) {
  if(!acceptsTask(state.selectedTaskId,generation,result,captured))return false;
  state.task=result;
  if(role==='merchant'&&result.result?.artifactId)state.artifactId=result.result.artifactId;
  save();
  return true;
}
async function refresh() {
  // A refused delegated read must not block an independent owner artifact read.
  let taskError;
  try{await refreshTask();}catch(error){taskError=error;}
  await refreshOwner();
  if(taskError)throw taskError;
}
function render() {
  const common=roleSelector(role,availableRoles());
  const result=role==='merchant'?artifactView(artifact,state,state.artifactId?api.handoff(state.artifactId):''):personalView(role,state.task);
  const body=common+(view==='access'?grantView(role,actor(),state):view==='result'?result:
    hero(role,state.task)+`<div class="workflow-grid">${grantView(role,actor(),state)}${taskView(role,state)}</div>`+result)+
    (role==='merchant'?ownerLab(labActive,dashboard):'');
  shell({variant:'D',title:view==='access'?'Управляйте полномочиями':view==='result'?'Проверьте результат':'Поручение личному агенту',
    subtitle:'От явного разрешения до сохранённого результата — в одном рабочем пространстве.',role:`${actor().name} · ${roles[role].label.toLowerCase()}`,nav:nav(view),body});
  bind();
}
function showError(error) {
  const denied=error instanceof ApiError&&error.status===403;
  if(denied&&error.code==='GRANT_INACTIVE'){state.grantDenied=true;save();}
  feedback(`${denied?'Доступ отклонён сервером. ':''}${error.message||'Нет связи с сервером.'}${error.code?` · ${error.code} (${error.status})`:''}`,true);
  const el=document.querySelector('#feedback');
  el.dataset.testid=denied?'state-denied':'state-error';
  const retry=document.createElement('button');
  retry.className='secondary';retry.id='retry';retry.dataset.testid='retry';retry.textContent='Повторить';
  retry.onclick=()=>run(retryOperation||refresh);
  el.append(document.createElement('br'),retry);
}
async function run(operation,message='Готово. Данные подтверждены сервером.') {
  if(busy)return;
  busy=true;retryOperation=operation;
  const focusId=document.activeElement?.id;
  document.querySelector('#scene')?.setAttribute('aria-busy','true');
  document.querySelectorAll('#scene button, [data-view]').forEach(b=>b.disabled=true);
  feedback('Выполняем запрос к серверу…');document.querySelector('#feedback').dataset.testid='state-loading';
  try{await operation();render();feedback(message);}
  catch(error){render();showError(error);}
  finally{busy=false;document.querySelector('#scene')?.removeAttribute('aria-busy');if(focusId)document.getElementById(focusId)?.focus();}
}
async function newGrant() {
  if(!document.querySelector('#grant-consent')?.checked)throw new Error('Подтвердите область и срок разрешения отдельным флажком.');
  if(role==='merchant'&&state.selectedTaskId&&!state.artifactId){
    const previous=await direct('task.read',{taskId:state.selectedTaskId});
    if(previous.result?.artifactId){state.artifactId=previous.result.artifactId;save();await refreshOwner();}
  }
  state.grantKey??=crypto.randomUUID();save();
  const grant=await direct('grant.create',{actions:roles[role].actions,expiresInSeconds:600},{key:state.grantKey});
  // A new grant starts a distinct task; an existing artifact is always reused.
  state.grant=grant;state.grantDenied=false;delete state.grantKey;
  delete state.logical;delete state.selectedTaskId;delete state.task;delete state.previousTaskId;delete state.late;
  generation++;save();
}
async function createTask(next=false) {
  if(!state.logical||(next&&state.selectedTaskId)){
    if(state.task?.state==='canceled')state.previousTaskId=state.selectedTaskId;
    state.logical=logicalTask(role,state.artifactId,crypto.randomUUID());
    delete state.selectedTaskId;delete state.task;generation++;save();
  }
  retryOperation=()=>createTask();
  const captured=generation;
  const result=await delegated('task.create',state.logical.input,{key:state.logical.key});
  if(captured!==generation)return;
  state.selectedTaskId=result.taskId;
  accept(result,captured);
  // A cached task.create response may say pending after the task completed.
  await refreshTask();await refreshOwner();
}
async function taskCommand(action) {
  const captured=generation;
  const result=await delegated(action,{taskId:state.selectedTaskId});
  if(accept(result,captured))await refreshOwner();
}
async function lateTask() {
  const prior=state.previousTaskId,captured=generation;
  const result=await delegated('task.run',{taskId:prior});
  if(captured===generation&&prior===state.previousTaskId){state.late=result;save();}
}
async function denyReserve() {
  const before=await delegated('credit.read');
  try {
    await delegated('credit.reserve',{amountMinor:100,invoiceId:before.invoice.id});
  } catch(error) {
    if(!(error instanceof ApiError)||error.status!==403)throw error;
    const after=await delegated('credit.read');
    const fields=['availableMinor','heldMinor','reservedMinor','appliedMinor'];
    if(fields.some(key=>before[key]!==after[key])||JSON.stringify(before.reservations)!==JSON.stringify(after.reservations))
      throw new Error('После отказа баланс изменился. Нужна проверка состояния.');
    if(state.task?.result)state.task.result=after;
    throw new ApiError({code:error.code,message:'Read-only grant: резервирование отклонено до изменения баланса. Повторное чтение подтвердило прежний баланс.'},403);
  }
  throw new Error('Нарушение границы: сервер разрешил запись через grant чтения. Нужна проверка.');
}
function bind() {
  document.querySelector('#restart-demo').onclick=api.restart;
  document.querySelectorAll('[data-view]').forEach(button=>button.onclick=()=>{if(busy)return;view=button.dataset.view;render();});
  document.querySelectorAll('[data-role]').forEach(button=>button.onclick=()=>run(async()=>{
    role=button.dataset.role;sessionStorage.setItem(selectedRoleKey(),role);
    generation++;state=storedState(sessionStorage,storageKey());artifact=null;dashboard=null;labActive=false;view='task';await refresh();
  },'Fixture-контекст переключён. Права и данные принадлежат выбранному субъекту.'));
  const actions={
    'grant-create':[newGrant,'Ограниченное разрешение сохранено. Можно создать задачу.'],
    'grant-revoke':[async()=>{const result=await direct('grant.revoke',{grantId:state.grant.grantId});state.grant={...state.grant,...result};save();await refreshOwner();},'Доступ отозван. Следующий делегированный шаг будет отклонён; права владельца сохраняются.'],
    'task-create':[()=>createTask()], 'task-repeat':[()=>createTask(), 'Повторён тот же logical request. Показан актуальный статус прежней задачи.'],
    'task-new':[()=>createTask(true)],'task-recount':[()=>createTask(true),'Создана задача пересчёта того же реестра. Выполните её для получения новой версии.'],
    'task-run':[()=>taskCommand('task.run')],'task-read':[refreshTask],'task-cancel':[()=>taskCommand('task.cancel'),'Сервер вернул состояние задачи. Отмена не означает откат внешних действий.'],
    'task-late':[lateTask,'Ответ старой задачи показан отдельно. Выбранная задача сохранилась.'],
    'owner-refresh':[refreshOwner],
    'owner-approve':[async()=>{artifact=await direct('registry.approve',exact(artifact));},'Владелец утвердил показанные revision и hash.'],
    'owner-export':[async()=>{const result=await direct('registry.export',exact(artifact));download(result.filename,result.csv);await refreshOwner();},'Утверждённый CSV скачан. Перевод не запускался.'],
    'lab-open':[async()=>{dashboard=await direct('dashboard');labActive=true;},'Лаборатория открыта явным действием владельца.'],
    'lab-refund':[async()=>{const result=await direct('fixture.event',dashboard.fixtureEvents.refund);await refreshOwner();state.refundReceipt={...result,sourceVersion:dashboard.sourceVersion};save();},'Fixture refund обработан сервером. Пересчитайте тот же реестр новой задачей.'],
    'lab-advance':[async()=>{await direct('fixture.advance',{days:1});await refreshOwner();},'Часы стенда сдвинуты на день. Следующий делегированный шаг проверит срок grant.'],
    'credit-deny-reserve':[denyReserve],
  };
  for(const [id,[fn,message]]of Object.entries(actions))document.getElementById(id)?.addEventListener('click',()=>run(fn,message));
}
function fatal(error) {
  document.querySelector('#app').innerHTML=`<main class="agent-boot" data-testid="state-error"><h1>Сеанс недоступен</h1><p role="alert">${e(error.message||'Не удалось подключиться к серверу.')}</p><div class="actions"><button id="retry" data-testid="retry" class="primary">Повторить</button><button id="fresh" class="secondary">Новый демосеанс</button></div></main>`;
  document.querySelector('#retry').onclick=()=>location.reload();
  document.querySelector('#fresh').onclick=()=>{for(const key of Object.keys(sessionStorage))if(key.startsWith('n3.fixture.D'))sessionStorage.removeItem(key);location.replace(location.pathname);};
}
async function start() {
  try{
    api=await connect('D','merchant');
    const storedRole=sessionStorage.getItem(selectedRoleKey());
    role=availableRoles().includes(storedRole)?storedRole:availableRoles()[0];
    if(!role)throw new Error('В этом сеансе нет доступных субъектов.');
    state=storedState(sessionStorage,storageKey());
    try{await refresh();render();}catch(error){render();retryOperation=refresh;showError(error);}
  }catch(error){fatal(error);}
}
start();
