import { button, card, copy, details, field, node, note, rows, stableKey, Ui, value } from './dom.js';
import { ApiError } from './client.js';
import type { Billing, Event, Intent, Metadata, Partner } from './models.js';
export function safeCheckoutUrl(input: string | null): string | null {
    if (!input || /[\x00-\x20\x7f]/.test(input)) return null;
    try {
        const url = new URL(input);
        return url.protocol === 'https:' && url.hostname === 'yoomoney.ru' && !url.username && !url.password && !url.port ? url.href : null;
    } catch { return null; }
}
export function billingReturnId(search: string): string | null {
    const params = new URLSearchParams(search), ids = params.getAll('billingIntent');
    return ids.length === 1 && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ids[0]!) ? ids[0]! : null;
}
export function intentPath(id: string, mode: Intent['mode'], runtime: Metadata['modes']['billing']) {
    return '/api/billing/intents/' + id + (mode !== 'live_provider' && runtime === 'live_provider' ? '?history=TEST' : '');
}
export function intentSummary(intent: Intent) {
    if (intent.mode !== 'live_provider') return `TEST intent ${intent.id}: ${intent.state}; canonical: ${intent.canonicalStatus ?? 'нет данных'}; атрибуция: ${intent.attribution_reason ?? 'история TEST, только чтение'}. TEST-подтверждение выполняется оператором вне браузера; реального списания нет.`;
    const state = intent.state === 'succeeded' ? 'успех подтверждён сервером' : intent.state === 'pending' ? 'ожидается подтверждение' : intent.state;
    return `LIVE intent ${intent.id}: ${state}. ${intent.availability === 'available' ? 'Статус проверяет сервер.' : 'Провайдер временно недоступен; подтверждённый тариф сохраняется.'} Тариф по серверу: ${intent.entitlement.plan}; срок: ${intent.entitlement.expiresAt ?? 'без платного срока'}. Возврат из оплаты не даёт тариф.`;
}
export function livePriceText(price: Extract<Billing, {mode:'live_provider'}>['price']) {
    return `Team · LIVE ${new Intl.NumberFormat('ru-RU', {style:'currency', currency:price.currency}).format(price.amountMinor / 100)} · ${price.durationDays} дней`;
}
export async function billingPage(ui: Ui, meta: Metadata, keyFor: ReturnType<typeof stableKey>, selected?: {id:string;mode:Intent['mode']}) {
    const epoch = ui.api.current();
    const intent = selected ? await ui.api.request<Intent>(intentPath(selected.id, selected.mode, meta.modes.billing)) : null;
    if (!ui.api.alive(epoch)) return;
    const billing = await ui.api.request<Billing>('/api/billing/status');
    if (!ui.api.alive(epoch)) return;
    const fresh = await ui.api.request<Metadata>('/api/app');
    if (!ui.api.alive(epoch)) return;
    ui.content.replaceChildren();
    ui.content.append(card('Тариф и общий бюджет', note(`Ваш тариф: ${billing.plan}. Ящики: ${billing.limits.mailboxes===null?'без ограничения':billing.limits.mailboxes}; активная ёмкость установки: 30; активные кампании: до ${billing.limits.activeCampaigns}. Срок: ${billing.expiresAt ?? 'без платного срока'}. Верхний общий лимит писем: ${billing.hardMailQuota}/ящик/сутки; более низкий лимит провайдера сохраняется.`), rows(Object.entries(fresh.plans).map(([plan, limits]) => `${plan}: ${limits.mailboxes===null?'без ограничения':limits.mailboxes} ящиков, ${limits.activeCampaigns} активных кампаний`))));
    const form = node('form'), result = node('div');
    if (billing.mode === 'live_provider') {
        form.append(note(livePriceText(billing.price)), note('Реальная оплата. Партнёрская атрибуция для LIVE не применяется. Подтверждение и тариф определяет сервер.'));
        if (billing.availability !== 'available') form.append(note('Провайдер временно недоступен. Подтверждённый тариф сохраняется; повторите проверку позже.'));
    } else if (billing.mode === 'local_test') {
        form.append(note(`Team · TEST ${billing.testPlan.amountMinor} минимальных единиц ${billing.testPlan.currency} · ${billing.testPlan.durationDays} дней. Реального списания нет.`), field('Партнёрский код до checkout · необязательно', 'code', '', 'text', false), note(`Referral cookie: ${fresh.referralCookiePresent ? 'присутствует; сервер проверит подпись' : 'не обнаружена'}. Явный код работает независимо от cookie; неверный код будет отклонён.`));
    } else form.append(note('Оплата отключена оператором. Текущий тариф сохранён.'));
    const checkout = node('button', billing.mode === 'live_provider' ? 'Создать LIVE checkout' : billing.mode === 'local_test' ? 'Создать TEST checkout' : 'Checkout недоступен', 'primary');
    checkout.type = 'submit'; checkout.disabled = !billing.checkoutAvailable; form.append(checkout);
    form.addEventListener('submit', e => {
        e.preventDefault();
        void ui.run(async () => {
            if (!ui.api.alive(epoch) || !billing.checkoutAvailable) return;
            const code = billing.mode === 'local_test' ? value(form, 'code').trim() : '';
            const payload = { plan: 'team', ...(code ? {code} : {}) };
            const created = await ui.api.request<Intent>('/api/billing/checkout', 'POST', {...payload, idempotencyKey:keyFor(payload)});
            if (!ui.api.alive(epoch)) return;
            await billingPage(ui, fresh, keyFor, {id:created.id,mode:created.mode});
        });
    });
    const refresh = (choice?: {id:string;mode:Intent['mode']}) => void ui.run(async () => {
        if (!ui.api.alive(epoch)) return;
        await billingPage(ui, fresh, keyFor, choice);
    });
    if (intent) {
        result.append(note(intentSummary(intent)), button('Обновить статус этого intent', () => refresh({id:intent.id,mode:intent.mode})));
        if (intent.mode === 'live_provider') {
            const href = safeCheckoutUrl(intent.checkoutUrl);
            if (href && intent.state === 'pending') { const link = node('a', 'Перейти к оплате · YooMoney'); link.href=href; link.target='_blank'; link.rel='noopener noreferrer'; result.append(link); }
            else if (intent.checkoutUrl && intent.state === 'pending') result.append(note('Ссылка оплаты недоступна. Обновите статус или обратитесь к оператору.'));
        }
    }
    ui.content.append(card('Подключить Team', form, note('Checkout создаёт ожидающее намерение. Возврат и параметры URL не подтверждают оплату.'), button('Обновить тариф и историю', () => refresh(selected)), result));
    const intents = node('div');
    for (const entry of fresh.intents) intents.append(button(`${entry.label} · ${entry.created_at} · ${entry.state} · посмотреть`, () => refresh({id:entry.id,mode:entry.mode})));
    if (!fresh.intents.length) intents.append(note('Намерений оплаты пока нет.'));
    ui.content.append(details('История намерений · последние 50', intents));
}
export async function partnerPage(ui: Ui) {
    const epoch = ui.api.current();
    let partner: Partner | null = null;
    try {
        partner = await ui.api.request<Partner>('/api/partner');
    }
    catch (error) {
        if (!(error instanceof ApiError && error.code === 'not_found'))
            throw error;
    }
    if (!ui.api.alive(epoch)) return;
    const events = await ui.api.request<Event[]>('/api/growth/events?limit=100');
    if (!ui.api.alive(epoch))
        return;
    ui.content.replaceChildren();
    if (!partner) {
        ui.content.append(card('Партнёрский код', note('Создайте собственный код. Участие не обещает вознаграждение и не разрешает почтовые приглашения.'), button('Создать мой код', () => void ui.run(async () => { await ui.api.request('/api/partner', 'POST', {}); if (ui.api.alive(epoch)) await partnerPage(ui); }), true)));
        return;
    }
    const data = partner, url = location.origin + '/r/' + data.code;
    ui.content.append(card('Мой партнёрский код', node('p', data.code, 'code'), note(`${data.active ? 'Активен' : 'Отключён'} · TEST. Подтверждённые конверсии: ${data.conversions}. Выплаты не предусмотрены.`), button('Скопировать код', () => void ui.run(async () => { if (!await copy(data.code, () => ui.api.alive(epoch)))
        throw new ApiError('clipboard_failed'); }), true), button('Скопировать партнёрскую ссылку', () => void ui.run(async () => { if (!await copy(url, () => ui.api.alive(epoch)))
        throw new ApiError('clipboard_failed'); })), button(data.active ? 'Отключить код' : 'Включить код', () => void ui.run(async () => { await ui.api.request('/api/partner', 'PATCH', { active: !data.active }); if (ui.api.alive(epoch)) await partnerPage(ui); })), note(`Ссылка: ${url}. Cookie атрибуции устанавливается при открытии ссылки; код можно ввести явно до checkout.`)), card('Явные действия · counts only / TEST', rows([`Публикации: ${data.events.shares}`, `Копирования: ${data.events.copies}`, `Открытия ссылки владельцем: ${data.events.links}`])), details('История действий · последние 100', rows(events.map(e => `${e.created_at} · ${e.kind}`))));
}
