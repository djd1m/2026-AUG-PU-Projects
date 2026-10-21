'use strict';

const $=s=>document.querySelector(s);

const stages=['Замысел','Основа','Обмеры','Референсы','Варианты','Согласование','Покупки','Бюджет','Пересмотр','Сохранить'];

const state={step:0,source:'plan',w:6,l:3,h:2.7,verified:false,verifiedArea:null,changed:false,ref:'',file:'',pinDenied:false,style:'Тихий модернизм',view:'concept',before:false,design:'Светлый дуб',approved:false,version:1,history:['v1 · исходный концепт'],region:'Москва',regionStale:false,area:18,waste:8,pack:1.99,price:1600,delivery:'',labor:'',reserve:10,cap:60000,alt:false,out:false,exportOpen:false,paywall:false,share:false,shareMeasures:false,selected:false,phase:'Черновые работы',note:'',unknownItemCount:2};

const fmt=n=>new Intl.NumberFormat('ru-RU').format(Math.round(n));

function validNum(v,min=0,max=1e6){const n=Number(v);
return Number.isFinite(n)&&n>min&&n<=max}
function calc(){const ok=Number.isFinite(Number(state.area))&&state.area>0&&state.area<=10000&&Number.isFinite(Number(state.waste))&&state.waste>=0&&state.waste<=100&&Number.isFinite(Number(state.pack))&&state.pack>0&&state.pack<=100&&Number.isFinite(Number(state.price))&&state.price>0&&state.price<=10000000&&Number.isFinite(Number(state.reserve))&&state.reserve>=0&&state.reserve<=100;
if(!ok)return {ok:false};
const need=state.area*(1+state.waste/100),packs=Math.ceil(need/state.pack),floor=packs*state.price,delivery=state.delivery===''?null:Number(state.delivery),labor=state.labor===''?null:Number(state.labor);
if((delivery!==null&&(!Number.isFinite(delivery)||delivery<0))||(labor!==null&&(!Number.isFinite(labor)||labor<0)))return {ok:false};
const known=floor+(delivery||0)+(labor||0),scenario=known*(1+state.reserve/100);
return {ok:true,need,packs,buy:packs*state.pack,floor,known,scenario,complete:delivery!==null&&labor!==null&&state.unknownItemCount===0}}
function invalidateDesign(reason){state.approved=false;state.version++;state.history.push(`v${state.version} · ${reason}; требуется согласование`)}
function status(){if(state.verified&&!state.changed)return '<span class="status-chip ok" data-testid="geometry-status">Контур подтверждён пользователем · demo</span>';
if(state.changed)return '<span class="status-chip warn" data-testid="geometry-status">Основа изменилась · нужна повторная проверка</span>';
return '<span class="status-chip warn" data-testid="geometry-status">Геометрия не подтверждена</span>'}
function room(){const warm=state.style==='Тихий модернизм'?'#b98961':state.style==='Мягкий минимализм'?'#d0c5b5':'#657365';
const label=state.view==='plan'?'Черновой план':state.view==='iso'?'Изометрическая схема':'AI-концепт';
return `<div class="room ${state.before?'before':''}" data-testid="room-visual"><svg viewBox="0 0 700 400" role="img" aria-label="${label}: демонстрационная схема комнаты"><rect width="700" height="400" fill="#d8cfbf"/><polygon points="95,95 470,45 640,140 260,205" fill="#f6f0e3" stroke="#403d37" stroke-width="3"/><polygon points="95,95 260,205 260,360 95,240" fill="#e3d7c4" stroke="#403d37" stroke-width="3"/><polygon points="260,205 640,140 640,295 260,360" fill="#ece2d3" stroke="#403d37" stroke-width="3"/><polygon points="320,220 570,180 585,250 335,290" fill="${warm}" opacity=".88"/><rect x="125" y="135" width="85" height="125" fill="#a8b9b4" stroke="#403d37" stroke-width="3"/><path d="M410 184v-83h120v61" fill="none" stroke="#f8f4e9" stroke-width="12"/><circle cx="505" cy="255" r="38" fill="#f4ead7" stroke="#403d37"/><path d="M470 300h90M490 284v54M540 280v45" stroke="#403d37" stroke-width="7"/></svg><span class="room-label">${label} · ${state.before?'до':'после'}</span></div>`}
function budgetDock(){if(CFG.entry!=='budget')return '';
const c=calc(),used=c.ok?c.known:0,pct=Math.min(100,used/state.cap*100),delta=state.cap-used;
return `<div class="budget-dock" data-testid="budget-dock"><div class="row spread"><div><span class="eyebrow">Лимит материалов · гипотеза B</span><p class="metric">${fmt(state.cap)} ₽</p></div><div><label for="cap">Изменить лимит</label><input id="cap" data-bind="cap" type="number" min="1" max="100000000" value="${state.cap}"></div></div><div class="meter"><i style="width:${pct}%"></i></div><p class="small">Известно сейчас: ${fmt(used)} ₽ · ${delta>=0?'запас по известной части '+fmt(delta):'дефицит по известной части '+fmt(-delta)} ₽. ${c.complete?'Состав заполнен, но цены demo.':'Доставка/работы и неподобранные позиции не позволяют подтвердить «уложились».'}</p></div>`}
function s0(){return `<p class="eyebrow">Гипотеза пути ${CFG.letter}</p><h1>${CFG.name}</h1><p class="lede">${CFG.promise}. Один канон: измеренная комната и референс → образ → согласованный дизайн → реальные карточки товаров → бюджет → пересмотр.</p>${budgetDock()}<div class="grid"><div class="card soft"><h3>Что будет честно видно</h3><p>Где данные ваши, где состояние demo, а где цена, наличие, доставка и габариты пока неизвестны.</p></div><div class="card"><h3>Что останется за кадром</h3><p>Этот файл не импортирует 3D, не обращается к магазинам, не оплачивает и не отправляет сообщения.</p></div></div><button class="action primary" data-action="next">Начать с помещения →</button>`}
function s1(){return `<p class="eyebrow">S1 · Основа пространства</p><h2>С чего начнём комнату?</h2><p class="lede">Выберите знакомый вам источник. Это фиксирует происхождение, а не доказывает точность.</p><div class="grid three">${[['plan','План','Размерная основа после ручной проверки'],['mesh','Mesh / облако точек','Можно использовать с контрольными размерами'],['splat','Gaussian splat','Только визуальный контекст, не размерная основа']].map(x=>`<label class="card source-choice ${state.source===x[0]?'selected':''}"><span><input name="source" type="radio" value="${x[0]}" ${state.source===x[0]?'checked':''}> <strong>${x[1]}</strong></span><p class="muted">${x[2]}</p></label>`).join('')}</div><div class="drop"><label for="spaceFile">Локальный файл плана / модели</label><input id="spaceFile" type="file" accept=".pdf,.png,.jpg,.jpeg,.glb,.obj,.ply"><p id="spaceFileName" class="small muted"></p></div>${state.source==='splat'?'<p class="notice">Splat не станет размерной основой. На S2 выберите план/mesh и введите контрольные размеры.</p>':''}`}
function s2(){return `<p class="eyebrow">S2 · Контрольные размеры</p><h2>Проверьте контур до дизайна</h2><p class="lede">Одно расстояние калибрует масштаб, но не подтверждает весь scan. В demo вы подтверждаете контур и проёмы вручную.</p><div class="grid"><form id="measureForm" class="card" novalidate><div class="grid three"><div class="field"><label for="width">Ширина, м</label><input id="width" data-bind="w" type="number" min="0.1" max="50" step="0.01" required value="${state.w}"></div><div class="field"><label for="length">Длина, м</label><input id="length" data-bind="l" type="number" min="0.1" max="50" step="0.01" required value="${state.l}"></div><div class="field"><label for="height">Высота, м</label><input id="height" data-bind="h" type="number" min="0.1" max="10" step="0.01" required value="${state.h}"></div></div><button class="action accent" type="submit" data-testid="verify-dimensions">Подтвердить контур и проёмы · demo</button><p id="measureError" class="error" role="alert"></p></form><div class="card soft"><span class="eyebrow">Черновая площадь</span><p class="metric" data-testid="area-label">${validNum(state.w)&&validNum(state.l)?(state.w*state.l).toFixed(2):'—'} м²</p>${status()}<p class="small muted">Допуски реального продукта ещё не измерены. Подтверждение здесь — действие пользователя в макете.</p></div></div>${room()}<p class="small muted">Демонстрация проверки геометрии. Демонстрация состояния 3D;
 реальная модель не импортируется.</p>`}
function s3(){return `<p class="eyebrow">S3 · Референсы</p><h2>Сохраните источник вдохновения</h2><p class="lede">Ссылка остаётся источником даже при отказе Pinterest. Изображение можно выбрать локально.</p><div class="grid"><div class="card"><label for="refUrl">Ссылка Pinterest или сайта</label><input id="refUrl" type="url" value="https://ru.pinterest.com/pin/1117807570051119485/" readonly><p><a href="https://ru.pinterest.com/pin/1117807570051119485/" target="_blank" rel="noreferrer">Открыть источник Pinterest ↗</a></p><div class="row"><button class="action" data-action="save-ref">Сохранить пример ссылки</button><label><input id="pinDenied" type="checkbox" ${state.pinDenied?'checked':''}> Доступ запрещён</label></div><p id="refStatus" class="small muted"></p></div><div class="drop"><label for="refFile">Изображение пользователя — fallback</label><input id="refFile" type="file" accept="image/*"><p id="refFileName" class="small muted"></p></div></div><div class="rule"></div><h3>Постоянное стилевое направление</h3><div class="grid three">${[['Тихий модернизм','#b98961'],['Мягкий минимализм','#d0c5b5'],['Природный акцент','#657365']].map(x=>`<label class="card style-choice ${state.style===x[0]?'selected':''}"><input name="style" type="radio" value="${x[0]}" ${state.style===x[0]?'checked':''}><i class="swatch" style="background:${x[1]}"></i>${x[0]}</label>`).join('')}</div>`}
function visualControls(){return `<div class="modebar" aria-label="Режим визуализации">${[['concept','AI-концепт'],['plan','План'],['iso','3D-схема']].map(x=>`<button data-action="view" data-view="${x[0]}" aria-pressed="${state.view===x[0]}">${x[1]}</button>`).join('')}<button data-action="before" aria-pressed="${state.before}">${state.before?'Показать после':'Показать до'}</button></div>`}
function s4(){return `<p class="eyebrow">S4 · Варианты</p><h2>Узнаётся ли ваша комната?</h2><p class="lede">Стиль «${state.style}» сохранён. Концепт доступен для обсуждения даже до проверки, но закупочная готовность остаётся закрытой.</p>${visualControls()}<div class="grid"><div>${room()}<p class="small muted">${state.view==='concept'?'Образ, размеры не проверены как результат AI.':'Демонстрация состояния 3D, реальная модель не импортируется.'}</p></div><div class="stack">${['Светлый дуб','Тёплый орех','Зелёная ниша'].map((x,i)=>`<button class="card ${state.design===x?'selected':''}" data-action="design" data-design="${x}"><span class="eyebrow">Вариант 0${i+1}</span><h3>${x}</h3><span class="small">Стены и проёмы не меняются</span></button>`).join('')}<button class="action ghost" data-action="goto-ref">← Вернуться к референсам</button></div></div>`}
function history(){return `<ol id="historyList" class="timeline"></ol>`}
function s5(){return `<p class="eyebrow">S5 · Согласование</p><h2>${state.design} · версия ${state.version}</h2><div class="grid"><div>${visualControls()}${room()}</div><div class="card"><h3>Ограничения версии</h3><ul><li>Контур и проёмы не меняются</li><li>Габариты мебели пока неизвестны</li><li>Fit мебели не подтверждён</li></ul>${status()}<label for="designNote">Комментарий к версии</label><textarea id="designNote" placeholder="Например: сохранить кресло"></textarea><button class="action accent" data-action="approve" data-testid="approve-design">${state.approved?'Согласовано локально · demo':'Согласовать эту версию · demo'}</button><p id="approvalHelp" class="small muted"></p><details><summary>История версий</summary>${history()}</details><button class="action ghost" data-action="goto-ref">Изменить референс</button></div></div>`}
function s6(){return `<p class="eyebrow">S6 · Покупки</p><h2>От элемента дизайна к товару</h2><p class="lede">Реальная карточка существует. Цена 1600 ₽/уп. — учебное значение, наличие и срок не подтверждены.</p>${!state.approved?'<p class="notice" data-testid="unapproved-design">Дизайн не согласован. Список предварительный: подтвердите текущую версию на S5.</p>':''}${state.changed||!state.verified?'<p class="notice" data-testid="stale-fit">Согласование и fit устарели: нужна повторная проверка размеров. Новая площадь уже передана в бюджет.</p>':''}<div class="row"><label for="region">Регион</label><select id="region" style="width:auto"><option>Москва</option><option>Московская область</option><option>Санкт-Петербург</option></select>${state.regionStale?'<span class="status-chip warn">Цена и остаток устарели для нового региона. Прежняя сумма остаётся снимком до перепроверки.</span>':''}</div><article class="card product"><div class="sample" aria-hidden="true"></div><div><span class="demo-chip">цена demo · остаток неизвестен</span><h3>Ламинат «Дуб Дон», 33 класс</h3><p>Лемана ПРО · артикул 89433614 · 1,99 м²/уп.</p><p class="price">1600 ₽ / уп. <small>DEMO</small></p><p><a href="https://lemanapro.ru/product/laminat-kreaforta-dub-don-33-klass-tolshchina-8-mm-s-faskoy-199-m-89433614/" target="_blank" rel="noreferrer">Официальная карточка товара ↗</a></p><p class="small muted">Источник карточки исследован 13.10.2026. Два пробных retailer-запроса вернули 401;
 live-проверки здесь нет.</p><button class="action" data-action="alt">${state.alt?'Скрыть альтернативу':'Показать альтернативу при отсутствии'}</button></div></article>${state.alt?'<div class="card soft"><h3>Альтернатива · демонстрация</h3><p>Ламинат схожего тона · 1450 ₽/уп. demo · артикул и остаток не подобраны.</p><button class="action" data-action="choose-alt">Предварительно выбрать замену</button></div>':''}<div class="table-wrap"><table><thead><tr><th>Элемент</th><th>Статус</th><th>Что дальше</th></tr></thead><tbody><tr><td>Напольное покрытие</td><td>Карточка найдена;
 наличие неизвестно</td><td>Перепроверить регион вручную</td></tr><tr><td>Кресло</td><td class="unknown">Не подобрано · габариты неизвестны</td><td>Не исчезает из бюджета</td></tr><tr><td>Светильник</td><td class="unknown">Не подобрано</td><td>Нужен товар и цена</td></tr></tbody></table></div>`}
function s7(){const c=calc();
return `<p class="eyebrow">S7 · Бюджет</p><h2>${c.ok&&c.complete?'Сценарная сумма':'Известная часть бюджета'}</h2>${budgetDock()}<div class="grid"><form id="budgetForm" class="card"><div class="grid"><div class="field"><label for="area">Площадь, м²</label><input id="area" data-bind="area" type="number" min="0.1" max="10000" step="0.01" value="${state.area}"></div><div class="field"><label for="waste">Запас материала, %</label><input id="waste" data-bind="waste" type="number" min="0" max="100" step="1" value="${state.waste}"></div><div class="field"><label for="pack">В упаковке, м²</label><input id="pack" data-bind="pack" type="number" min="0.01" max="100" step="0.01" value="${state.pack}"></div><div class="field"><label for="price">Цена упаковки, ₽ · demo</label><input id="price" data-bind="price" type="number" min="0.01" max="10000000" step="0.01" value="${state.price}"></div><div class="field"><label for="delivery">Доставка, ₽</label><input id="delivery" data-bind="delivery" type="number" min="0" max="10000000" placeholder="Неизвестно" value="${state.delivery}"></div><div class="field"><label for="labor">Работы, ₽</label><input id="labor" data-bind="labor" type="number" min="0" max="100000000" placeholder="Неизвестно" value="${state.labor}"></div><div class="field"><label for="reserve">Денежный резерв, % от известного</label><input id="reserve" data-bind="reserve" type="number" min="0" max="100" value="${state.reserve}"></div></div><button class="action" type="submit">Пересчитать</button><p id="budgetError" class="error" role="alert"></p></form><div class="card soft">${c.ok?`<p class="formula">${state.area} × ${(1+state.waste/100).toFixed(2)} / ${state.pack} = ${c.packs} уп.</p><p class="metric" data-testid="pack-count">${c.packs} упаковок</p><p>${c.buy.toFixed(2)} м² к покупке · <b>${fmt(c.floor)} ₽</b> за ламинат</p><p>Известная сумма: <b>${fmt(c.known)} ₽</b></p><p>С резервом ${state.reserve}%: <b>${fmt(c.scenario)} ₽</b></p>`:'<p class="error">Введите конечные положительные числа.</p>'}<p class="unknown">Кресло и светильник не подобраны. ${state.delivery===''?'Доставка неизвестна.':''} ${state.labor===''?'Работы неизвестны.':''}</p></div></div>${CFG.entry==='phases'?phases(c):''}`}
function phases(c){const total=c.ok?c.known:0;
return `<h3>Очередь закупок · вариант C</h3><p class="small muted">Перенос строки меняет этап, общая известная сумма остаётся ${fmt(total)} ₽.</p><div class="phases"><div class="phase"><b>1 · Черновые работы</b><p>${state.phase==='Черновые работы'?'Ламинат · '+fmt(c.floor)+' ₽':'Пока пусто'}</p></div><div class="phase"><b>2 · Чистовая отделка</b><p>${state.phase==='Чистовая отделка'?'Ламинат · '+fmt(c.floor)+' ₽':'Пока пусто'}</p></div><div class="phase"><b>3 · Мебель и свет</b><p>${state.phase==='Мебель и свет'?'Ламинат · '+fmt(c.floor)+' ₽':'Кресло и свет — не подобраны'}</p></div></div><label for="phaseMove">Перенести ламинат в этап</label><select id="phaseMove"><option>Черновые работы</option><option>Чистовая отделка</option><option>Мебель и свет</option></select>`}
function s8(){const c=calc();
return `<p class="eyebrow">S8 · Пересмотр</p><h2>Изменение — это новая версия</h2><p class="lede">Причина видна, прежняя версия сохранена, а дизайн и бюджет требуют повторного согласования.</p><div class="grid"><div class="card ${state.out?'selected':''}"><span class="eyebrow">Сигнал магазина · demo</span><h3>${state.out?'Товар отмечен как отсутствующий':'Смоделировать «товара нет»'}</h3><p>Никакой live-проверки не выполняется.</p><button class="action" data-action="out">${state.out?'Отменить demo-сигнал':'Товара нет · demo'}</button></div><div class="card"><h3>Что затронуто</h3><ul><li>Напольное покрытие и его сумма</li><li>Согласование дизайна</li><li>Региональная проверка наличия</li></ul>${state.out?'<div class="row"><button class="action accent" data-action="accept-alt">Согласовать замену · demo</button><button class="action" data-action="back-design">Вернуться к дизайну</button></div>':'<p class="muted">Сначала включите demo-сигнал.</p>'}</div></div><details open><summary>История и разница</summary>${history()}<p>Текущая строка пола: ${fmt(c.ok?c.floor:0)} ₽. ${state.version>1?'Предыдущая версия сохранена, изменение суммы видно в истории.':'Замена ещё не принята.'}</p></details>`}
function s9(){const c=calc();
return `<p class="eyebrow">S9 · Сохранить и обсудить</p><h2>Что именно уйдёт из макета?</h2><p class="lede">Все действия локальны. Экспорт содержит demo-статусы;
 приватный просмотр не отправляет приглашение.</p><div class="row"><button class="action primary" data-action="export">${state.exportOpen?'Закрыть preview':'Открыть preview списка'}</button><button class="action" data-action="paywall">${state.paywall?'Закрыть тариф':'Посмотреть тарифную гипотезу'}</button><button class="action" data-action="share">${state.share?'Закрыть приглашение':'Приватный preview'}</button></div>${state.exportOpen?`<div class="modalish" data-testid="export-preview"><h3>Лист закупки · preview</h3><p>Ламинат 89433614 · ${c.ok?c.packs:'—'} уп. × ${fmt(state.price)} ₽ demo = ${c.ok?fmt(c.floor):'—'} ₽</p><p>Кресло · не подобрано · сумма неизвестна</p><p>Светильник · не подобран · сумма неизвестна</p><p class="small">Регион: ${state.region};
 цена/остаток ${state.regionStale?'устарели':'не подтверждены live'}.</p><button class="action" data-action="download">Скачать .txt локально</button></div>`:''}${state.paywall?'<div class="modalish"><h3>Гипотеза тарифа</h3><p>Экспорт спецификации и история версий могут стать платной ценностью. Цена и состав не утверждены.</p><p class="small">Списания, checkout и аккаунта в прототипе нет.</p></div>':''}${state.share?`<div class="modalish"><h3>Приватный preview · сообщение не отправлено</h3><label><input id="shareMeasures" type="checkbox" ${state.shareMeasures?'checked':''}> Включить обмеры</label><p>${state.shareMeasures?'Обмеры будут видны в hypothetical preview.':'Обмеры выключены.'}</p><button class="action" data-action="revoke">Отозвать demo-доступ</button></div>`:''}<div class="prototype-choice"><h3>Это подходящий путь?</h3><p>Отметка сохранится только до закрытия страницы. Владелец уже выбрал путь A, ближайший к gist. Эта отметка не меняет выбор проекта.</p><button class="action accent" data-action="select-prototype" data-testid="select-prototype">${state.selected?'Предварительно отмечено локально':'Мне подходит этот вариант'}</button></div>`}
const screens=[s0,s1,s2,s3,s4,s5,s6,s7,s8,s9];

function render(){document.documentElement.style.setProperty('--accent',CFG.accent);
document.documentElement.style.setProperty('--accent2',CFG.secondary);
$('#steps').innerHTML=stages.map((x,i)=>`<button class="step" data-step="${i}" ${i===state.step?'aria-current="step"':''}><span class="step-num">${i}</span><span>${x}<small>${i<state.step?'просмотрено':'этап '+i}</small></span></button>`).join('');
$('#stageName').textContent=`S${state.step} · ${stages[state.step]}`;
$('#screen').innerHTML=screens[state.step]();
$('#back').disabled=state.step===0;
$('#next').disabled=state.step===9;
$('#live').textContent='';
bind();
hydrateSafe()}
function hydrateSafe(){const f=$('#spaceFileName');
if(f)f.textContent=state.file?`Выбрано локально: ${state.file}. Файл никуда не отправлен.`:'Файл не выбран.';
const rf=$('#refFileName');
if(rf)rf.textContent=state.ref?`Локальное изображение: ${state.ref}`:'Изображение не выбрано.';
const rs=$('#refStatus');
if(rs)rs.textContent=state.pinDenied?'Источник сохранён, но доступ запрещён. Используйте своё изображение, это не означает, что pin отсутствует.':'Ссылка ещё не импортирована: сетевого запроса нет.';
const note=$('#designNote');
if(note)note.value=state.note;
document.querySelectorAll('#historyList').forEach(list=>state.history.forEach(item=>{const li=document.createElement('li');
li.textContent=item;
list.appendChild(li)}));
const region=$('#region');
if(region)region.value=state.region;
const phase=$('#phaseMove');
if(phase)phase.value=state.phase}
function say(t){$('#live').textContent=t}
function bind(){document.querySelectorAll('[data-bind]').forEach(el=>el.addEventListener('change',()=>{state[el.dataset.bind]=el.value===''?'':Number(el.value);
if(['w','l','h'].includes(el.dataset.bind)&&(state.verified||state.approved)){state.changed=true;
state.verified=false;
state.approved=false;
state.area=validNum(state.w)&&validNum(state.l)?state.w*state.l:state.area;
state.history.push(`v${state.version} · размеры изменены, согласование устарело`) }if(el.dataset.bind==='cap')render()}));
document.querySelectorAll('input[name=source]').forEach(el=>el.addEventListener('change',()=>{if(state.verified||state.approved){state.changed=true;state.approved=false;state.history.push(`v${state.version} · источник размерной основы изменён, согласование устарело`)}state.source=el.value;
state.verified=false;
render()}));
document.querySelectorAll('input[name=style]').forEach(el=>el.addEventListener('change',()=>{if(state.style!==el.value){state.style=el.value;invalidateDesign('Стиль изменён')}
render()}));
const sf=$('#spaceFile');
if(sf)sf.addEventListener('change',e=>{state.file=e.target.files[0]?.name||'';
hydrateSafe()});
const rf=$('#refFile');
if(rf)rf.addEventListener('change',e=>{state.ref=e.target.files[0]?.name||'';
hydrateSafe()});
const pd=$('#pinDenied');
if(pd)pd.addEventListener('change',e=>{state.pinDenied=e.target.checked;
hydrateSafe()});
const note=$('#designNote');
if(note)note.addEventListener('input',e=>state.note=e.target.value);
const region=$('#region');
if(region)region.addEventListener('change',e=>{state.region=e.target.value;
state.regionStale=true;
render()});
const phase=$('#phaseMove');
if(phase)phase.addEventListener('change',e=>{state.phase=e.target.value;
render()});
const share=$('#shareMeasures');
if(share)share.addEventListener('change',e=>{state.shareMeasures=e.target.checked;
render()});
const mf=$('#measureForm');
if(mf)mf.addEventListener('submit',e=>{e.preventDefault();
if(state.source==='splat'){ $('#measureError').textContent='Splat не может быть размерной основой. Вернитесь на S1 и выберите план или mesh.';
return}if(![state.w,state.l,state.h].every((v,i)=>validNum(v,.09,i===2?10:50))){$('#measureError').textContent='Введите конечные положительные размеры в допустимом диапазоне.';
return}state.verified=true;
state.changed=false;
state.verifiedArea=state.w*state.l;
state.area=state.verifiedArea;
state.history.push(`v${state.version} · контур ${state.w} × ${state.l} м подтверждён пользователем (demo)`);
render()});
const bf=$('#budgetForm');
if(bf)bf.addEventListener('submit',e=>{e.preventDefault();
if(!calc().ok){$('#budgetError').textContent='Проверьте площадь, запас, упаковку и цену: нужны конечные числа.';
return}render()})}
function navigate(n){state.step=Math.max(0,Math.min(9,n));
render();
$('.sheet').scrollIntoView({block:'start'})}
document.addEventListener('click',e=>{const step=e.target.closest('[data-step]');
if(step){navigate(Number(step.dataset.step));
return}const b=e.target.closest('[data-action]');
if(!b)return;
const a=b.dataset.action;
if(a==='next')navigate(state.step+1);
if(a==='back')navigate(state.step-1);
if(a==='goto-ref')navigate(3);
if(a==='back-design')navigate(4);
if(a==='view'){state.view=b.dataset.view;
render()}if(a==='before'){state.before=!state.before;
render()}if(a==='design'){if(state.design!==b.dataset.design){state.design=b.dataset.design;invalidateDesign('Выбран другой дизайн')}
render()}if(a==='save-ref'){say('Ссылка на источник сохранена локально. Импорт и проверка Pinterest не выполнялись.')}if(a==='approve'){if(!state.verified||state.changed){$('#approvalHelp').textContent='Сначала подтвердите актуальный контур на S2.'}else{state.approved=true;
state.note=state.note.trim();
state.history.push(`v${state.version} · ${state.design} согласован локально${state.note?' · комментарий: '+state.note:''}`);
render()}}if(a==='alt'){state.alt=!state.alt;
render()}if(a==='choose-alt'){state.alt=true;
say('Замена предварительно выбрана, согласуйте её на S8.')}if(a==='out'){state.out=!state.out;
render()}if(a==='accept-alt'){const old=calc();
state.price=1450;
state.version++;
state.approved=false;
state.regionStale=true;
state.history.push(`v${state.version} · замена принята локально;
 пол ${fmt(old.floor)} → ${fmt(calc().floor)} ₽ demo;
 требуется согласование`);
render()}if(a==='export'){state.exportOpen=!state.exportOpen;
render()}if(a==='paywall'){state.paywall=!state.paywall;
render()}if(a==='share'){state.share=!state.share;
render()}if(a==='revoke'){state.share=false;
state.shareMeasures=false;
render();
say('Demo-доступ отозван локально.')}if(a==='select-prototype'){state.selected=true;
render();
say('Отметка сделана локально. Владелец уже выбрал A; эта отметка не меняет выбранный путь проекта.')}if(a==='download'){const c=calc(),txt=`DEMO — не live-данные\nЛаминат 89433614: ${c.packs} уп. × ${state.price} ₽ = ${c.floor} ₽\nКресло: не подобрано\nСветильник: не подобран\nРегион: ${state.region};
 наличие неизвестно.`;
const url=URL.createObjectURL(new Blob([txt],{type:'text/plain;charset=utf-8'})),link=document.createElement('a');
link.href=url;
link.download=`cjm-${CFG.letter.toLowerCase()}-demo-list.txt`;
link.click();
setTimeout(()=>URL.revokeObjectURL(url),0);
say('Локальный demo-файл подготовлен браузером.')}});

$('#back').addEventListener('click',()=>navigate(state.step-1));
$('#next').addEventListener('click',()=>navigate(state.step+1));
render();

