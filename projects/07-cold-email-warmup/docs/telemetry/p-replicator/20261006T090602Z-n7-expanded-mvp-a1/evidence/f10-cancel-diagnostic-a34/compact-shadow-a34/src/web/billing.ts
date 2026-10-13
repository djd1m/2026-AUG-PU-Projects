import { button, card, copy, details, field, node, note, rows, stableKey, Ui, value } from './dom.js';
import { ApiError } from './client.js';
import type { Billing, Event, Intent, Metadata, Partner } from './models.js';
export async function billingPage(ui: Ui, meta: Metadata, keyFor: ReturnType<typeof stableKey>) {
    const epoch = ui.api.current(), billing = await ui.api.request<Billing>('/api/billing/status');
    if (!ui.api.alive(epoch))
        return;
    ui.content.replaceChildren();
    ui.content.append(card('Тариф и общий бюджет', note(`Ваш тариф: ${billing.plan}. Ящики: ${billing.limits.mailboxes===null?'без ограничения':billing.limits.mailboxes}; активная ёмкость установки: 30; активные кампании: до ${billing.limits.activeCampaigns}. Срок: ${billing.expiresAt ?? 'без платного срока'}. Верхний общий лимит писем: ${billing.hardMailQuota}/ящик/сутки; более низкий лимит провайдера сохраняется.`), rows(Object.entries(meta.plans).map(([plan, limits]) => `${plan}: ${limits.mailboxes===null?'без ограничения':limits.mailboxes} ящиков, ${limits.activeCampaigns} активных кампаний`))));
    const form = node('form'), result = node('div');
    form.append(note(`Team · TEST ${billing.testPlan.amountMinor} минимальных единиц ${billing.testPlan.currency} · ${billing.testPlan.durationDays} дней. Режим: ${billing.mode}. Реального списания нет.`), field('Партнёрский код до checkout · необязательно', 'code', '', 'text', false), note(`Referral cookie: ${meta.referralCookiePresent ? 'присутствует; сервер проверит подпись' : 'не обнаружена'}. Явный код работает независимо от cookie; неверный код будет отклонён. Итог атрибуции появляется в intent.`));
    const checkout = node('button', 'Создать TEST checkout', 'primary');
    checkout.type = 'submit';
    checkout.disabled = !billing.checkoutAvailable;
    form.append(checkout);
    form.addEventListener('submit', e => {
        e.preventDefault();
        void ui.run(async () => {
            const code = value(form, 'code').trim(), payload = { plan: 'team', ...(code ? { code } : {}) };
            const intent = await ui.api.request<Intent>('/api/billing/checkout', 'POST', { ...payload, idempotencyKey: keyFor(payload) });
            if (!ui.api.alive(epoch))
                return;
            show(intent);
        });
    });
    const show = (intent: Intent) => { result.replaceChildren(note(`TEST intent ${intent.id}: ${intent.state}; canonical: ${intent.canonicalStatus ?? 'нет данных'}; атрибуция: ${intent.attribution_reason}; тариф по серверу: ${intent.entitlement.plan}. Возврат из оплаты не даёт тариф. TEST-подтверждение выполняется оператором вне браузера.`), button('Обновить статус этого intent', () => void ui.run(async () => { const data = await ui.api.request<Intent>('/api/billing/intents/' + intent.id); if (!ui.api.alive(epoch))
        return; show(data); }))); };
    ui.content.append(card('Подключить Team', form, !billing.checkoutAvailable ? note('Оплата отключена оператором. Действие недоступно; текущий тариф сохранён.') : note('Checkout создаёт ожидающее намерение. Успех определяется только сервером.'), result));
    const fresh = await ui.api.request<Metadata>('/api/app');
    if (!ui.api.alive(epoch))
        return;
    const intents = node('div');
    for (const intent of fresh.intents)
        intents.append(button(`${intent.created_at} · ${intent.state} · посмотреть`, () => void ui.run(async () => { const data = await ui.api.request<Intent>('/api/billing/intents/' + intent.id); if (ui.api.alive(epoch))
            show(data); })));
    if (!fresh.intents.length)
        intents.append(note('Намерений оплаты пока нет.'));
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
    const events = await ui.api.request<Event[]>('/api/growth/events?limit=100');
    if (!ui.api.alive(epoch))
        return;
    ui.content.replaceChildren();
    if (!partner) {
        ui.content.append(card('Партнёрский код', note('Создайте собственный код. Участие не обещает вознаграждение и не разрешает почтовые приглашения.'), button('Создать мой код', () => void ui.run(async () => { await ui.api.request('/api/partner', 'POST', {}); await partnerPage(ui); }), true)));
        return;
    }
    const data = partner, url = location.origin + '/r/' + data.code;
    ui.content.append(card('Мой партнёрский код', node('p', data.code, 'code'), note(`${data.active ? 'Активен' : 'Отключён'} · TEST. Подтверждённые конверсии: ${data.conversions}. Выплаты не предусмотрены.`), button('Скопировать код', () => void ui.run(async () => { if (!await copy(data.code, () => ui.api.alive(epoch)))
        throw new ApiError('clipboard_failed'); }), true), button('Скопировать партнёрскую ссылку', () => void ui.run(async () => { if (!await copy(url, () => ui.api.alive(epoch)))
        throw new ApiError('clipboard_failed'); })), button(data.active ? 'Отключить код' : 'Включить код', () => void ui.run(async () => { await ui.api.request('/api/partner', 'PATCH', { active: !data.active }); await partnerPage(ui); })), note(`Ссылка: ${url}. Cookie атрибуции устанавливается при открытии ссылки; код можно ввести явно до checkout.`)), card('Явные действия · counts only / TEST', rows([`Публикации: ${data.events.shares}`, `Копирования: ${data.events.copies}`, `Открытия ссылки владельцем: ${data.events.links}`])), details('История действий · последние 100', rows(events.map(e => `${e.created_at} · ${e.kind}`))));
}
