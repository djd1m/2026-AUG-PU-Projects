import { button, card, node, note, rows, stableKey, Ui } from './dom.js';
import { mailboxPage } from './mailboxes.js';
import { campaignPage } from './campaigns.js';
import { evidencePage } from './evidence.js';
import { billingPage, partnerPage } from './billing.js';
import type { Campaign, MailboxPage, Metadata } from './models.js';
const content = document.getElementById('content')!, feedback = document.getElementById('feedback')!, title = document.getElementById('title')!, modes = document.getElementById('modes')!;
const ui = new Ui(content, feedback);
let meta: Metadata | null = null;
let checkoutKey = stableKey();
const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('n7-session');
ui.onClear(() => { meta = null; checkoutKey = stableKey(); modes.textContent = ''; title.textContent = 'Вход'; document.querySelectorAll('[data-copy-fallback]').forEach(e => e.remove()); });
channel?.addEventListener('message', () => ui.api.invalidate());
window.addEventListener('pageshow', e => { if (e.persisted)
    ui.api.invalidate(); });
window.addEventListener('focus', () => { void ui.api.request('/api/auth/me').catch(() => { }); });
const labels: Record<string, string> = { overview: 'Обзор', mailboxes: 'Ящики', campaigns: 'Кампании', evidence: 'Наблюдения', billing: 'Тариф', partner: 'Партнёр' };
async function overview() {
    const epoch = ui.api.current();
    const [boxes, campaigns, pool] = await Promise.all([ui.api.request<MailboxPage>('/api/mailboxes'), ui.api.request<Campaign[]>('/api/campaigns'), ui.api.request<{
            count: number;
            status: string;
        }>('/api/pool')]);
    if (!ui.api.alive(epoch))
        return;
    content.replaceChildren(card('Подготовьте безопасную переписку', note('Подключите ящик, дайте отдельное разрешение на нужный контекст и проверьте состояние. Сохранение и регистрация не разрешают отправку.'), rows([`Ваши ящики: ${boxes.total}`, `Ваши кампании: ${campaigns.length}`, `Пригодные участники пула: ${pool.count} · ${pool.status}`, `Репутация: неизвестна; нужны проверяемые наблюдения`]), button('Перейти к ящикам', () => void go('mailboxes'), true)), card('Как продолжить', node('p', 'Пул ждёт минимум двух разных пригодных участников. Локальная TEST-проверка и счётчик пула не доказывают рост доставляемости. Кампании и наблюдения доступны отдельными шагами.')));
}
async function go(page: string) {
    await ui.run(async () => {
        const epoch = ui.api.current();
        const data = await ui.api.request<Metadata>('/api/app');
        if (!ui.api.alive(epoch))
            return;
        meta = data;
        title.textContent = labels[page] ?? labels.overview!;
        title.focus();
        modes.textContent = `Режимы сервера: отправка ${data.modes.dispatch}; опрос ${data.modes.poll}; оплата ${data.modes.billing}. Live не активирован.`;
        document.querySelectorAll<HTMLButtonElement>('[data-page]').forEach(b => { if (b.dataset.page === page)
            b.setAttribute('aria-current', 'page');
        else
            b.removeAttribute('aria-current'); });
        if (page === 'mailboxes')
            await mailboxPage(ui, meta);
        else if (page === 'campaigns')
            await campaignPage(ui);
        else if (page === 'evidence')
            await evidencePage(ui);
        else if (page === 'billing')
            await billingPage(ui, meta, checkoutKey);
        else if (page === 'partner')
            await partnerPage(ui);
        else
            await overview();
    });
}
document.querySelectorAll<HTMLButtonElement>('[data-page]').forEach(b => b.addEventListener('click', () => void go(b.dataset.page!)));
document.getElementById('logout')!.addEventListener('click', () => {
    // Capture the request first, then immediately discard all private state.
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10000);
    const request = fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: '{}' });
    ui.api.invalidate(false);
    channel?.postMessage('logout');
    void request.catch(() => { }).finally(() => { clearTimeout(timer); location.replace('/signin'); });
});
void go('overview');
