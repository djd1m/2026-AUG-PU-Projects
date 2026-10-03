import { button, card, check, checked, details, field, node, note, options, rows, select, submit, Ui, value } from './dom.js';
import { ApiError } from './client.js';
import type { Campaign, Consent, Mailbox, Metadata, Poll } from './models.js';
const stop = 'Отзыв, пауза и карантин отменяют будущие задания. После уже зафиксированного перехода submitting возможна максимум одна отправка в полёте; её нельзя отозвать.';
export async function mailboxPage(ui: Ui, meta: Metadata) {
    const epoch = ui.api.current();
    const [boxes, campaigns, pool] = await Promise.all([ui.api.request<Mailbox[]>('/api/mailboxes'), ui.api.request<Campaign[]>('/api/campaigns'), ui.api.request<{
            count: number;
            status: string;
        }>('/api/pool')]);
    if (!ui.api.alive(epoch))
        return;
    const content = ui.content;
    content.replaceChildren();
    content.append(note(`Пул: ${pool.count} пригодных ящиков · ${pool.status === 'waiting' ? 'ожидание двух разных участников' : 'готовность по API'}. Приглашения не равны пригодным участникам. Репутация неизвестна.`));
    const chooser = node('form');
    chooser.append(select('Ваш ящик', 'mailbox', options(boxes)));
    const area = node('div');
    content.append(card('Ящики', chooser, rows(boxes.map(b => `${b.label} · ${b.metadata?.senderAddress ?? 'не настроен'} · ${b.state} · общий лимит ${b.effective_limit}/сутки`), 'Добавьте первый почтовый ящик.')), area);
    const edit = (box?: Mailbox) => {
        area.replaceChildren();
        const form = node('form');
        form.append(note('Сохранение не разрешает отправку. При изменении подключения введите адрес и секреты заново: API их не возвращает.'), field('Название', 'label', box?.label ?? ''), field('Адрес отправителя', 'senderAddress', '', 'email'), field('SMTP сервер', 'smtpHost', box?.metadata?.smtpHost ?? ''), select('SMTP порт · обязательный TLS', 'smtpPort', [{ value: '465', label: '465 · TLS' }, { value: '587', label: '587 · STARTTLS' }], String(box?.metadata?.smtpPort ?? 465)), field('SMTP логин', 'smtpUsername'), field('SMTP пароль приложения', 'smtpPassword', '', 'password'), details('IMAP · обязательный TLS на порту 993', field('IMAP сервер', 'imapHost', box?.metadata?.imapHost ?? ''), field('IMAP логин', 'imapUsername'), field('IMAP пароль приложения', 'imapPassword', '', 'password')), field('Общий суточный лимит · прогрев + кампании', 'dailyLimit', String(box?.daily_limit ?? 10), 'number'), note(`Разрешённые серверы: ${meta.providers.map(p => `${p.host} (до ${p.limit}/сутки)`).join(', ')}. Адреса проходят серверную проверку безопасности.`));
        for (const name of ['smtpPassword', 'imapPassword', 'smtpUsername', 'imapUsername'])
            (form.elements.namedItem(name) as HTMLInputElement).autocomplete = 'off';
        const limit = form.elements.namedItem('dailyLimit') as HTMLInputElement;
        limit.min = '1';
        limit.max = '30';
        limit.step = '1';
        submit(form, box ? 'Сохранить подключение' : 'Добавить ящик', async () => {
            const payload = Object.fromEntries(['label', 'senderAddress', 'smtpHost', 'smtpUsername', 'smtpPassword', 'imapHost', 'imapUsername', 'imapPassword'].map(k => [k, value(form, k)]));
            await ui.api.request('/api/mailboxes' + (box ? '/' + box.id : ''), box ? 'PUT' : 'POST', { ...payload, smtpPort: Number(value(form, 'smtpPort')), imapPort: 993, requiredTLS: true, dailyLimit: Number(value(form, 'dailyLimit')) });
            if (!ui.api.alive(epoch))
                return;
            for (const name of ['smtpPassword', 'imapPassword', 'smtpUsername', 'imapUsername', 'senderAddress'])
                (form.elements.namedItem(name) as HTMLInputElement).value = '';
            await mailboxPage(ui, meta);
        }, ui);
        area.append(card(box ? 'Изменить подключение' : 'Подключить ящик', form));
    };
    content.append(button('Добавить новый ящик', () => edit(), true));
    const inspect = async (id: string) => {
        const [box, consents, poll] = await Promise.all([ui.api.request<Mailbox>('/api/mailboxes/' + id), ui.api.request<Consent[]>(`/api/mailboxes/${id}/consents`), ui.api.request<Poll>(`/api/mailboxes/${id}/reply-status`)]);
        if (!ui.api.alive(epoch))
            return;
        area.replaceChildren();
        const fresh = poll.scanComplete && poll.lastComplete !== null && Date.now() - Date.parse(poll.lastComplete) >= 0 && Date.now() - Date.parse(poll.lastComplete) < 60000;
        area.append(card(box.label, note(`Подключение: ${box.state}. Проверка local TEST не означает реальное SMTP/IMAP соединение.`), note(`Проверка ответов: ${poll.mode} · ${poll.scan?.state ?? 'нет сканирования'} · источник ${poll.scan?.provenance ?? 'нет данных'} · последний полный опрос ${poll.lastComplete ?? 'отсутствует'} · ${fresh ? 'свежий на момент чтения' : 'устарел / не завершён — отправка блокируется'}. Реальная проверка: ${poll.realVerification}. Свежесть <60 секунд; сервер перепроверяет её перед отправкой.`), button('Проверить локально · TEST', () => void ui.run(async () => { await ui.api.request(`/api/mailboxes/${id}/verify-test`, 'POST', {}); await inspect(id); }), true), button('Изменить подключение', () => edit(box)), button('Обновить опрос и согласия', () => void ui.run(() => inspect(id))), note(stop)));
        const limits = node('form');
        limits.append(field('Общий лимит 1–30', 'dailyLimit', String(box.daily_limit), 'number'));
        const limit = limits.elements.namedItem('dailyLimit') as HTMLInputElement;
        limit.min = '1';
        limit.max = '30';
        limit.step = '1';
        submit(limits, 'Обновить лимит', async () => { await ui.api.request('/api/mailboxes/' + id, 'PATCH', { dailyLimit: Number(value(limits, 'dailyLimit')) }); await inspect(id); }, ui, false);
        area.append(details('Лимит, пауза и карантин', limits, button('Приостановить ящик', () => void ui.run(async () => { await ui.api.request('/api/mailboxes/' + id, 'PATCH', { state: 'paused' }); await inspect(id); })), button('Поместить в карантин', () => void ui.run(async () => { await ui.api.request('/api/mailboxes/' + id, 'PATCH', { state: 'quarantined' }); await inspect(id); }))));
        const poolForm = node('form');
        poolForm.append(note(`Участники пула увидят ваш адрес отправителя, заголовки маршрутизации (${meta.poolDisclosure.headers.join(', ')}) и тестовое тело: ${meta.poolDisclosure.testBody}. Приватные кампании, списки контактов и учётные данные им недоступны. Версия раскрытия ${meta.poolDisclosure.version}.`), check('Я отдельно разрешаю участие этого ящика в общем пуле', 'affirmative'));
        submit(poolForm, 'Подтвердить участие в пуле', async () => { if (!checked(poolForm, 'affirmative'))
            throw new ApiError('consent_required'); await ui.api.request(`/api/mailboxes/${id}/consents`, 'POST', { scope: 'pool', action: 'grant', affirmative: true, scopeVersion: meta.poolDisclosure.version }); await inspect(id); }, ui, false);
        poolForm.append(button('Отозвать участие в пуле', () => void ui.run(async () => { await ui.api.request(`/api/mailboxes/${id}/consents`, 'POST', { scope: 'pool', action: 'revoke' }); await inspect(id); })));
        area.append(card('Отдельное согласие · пул', poolForm));
        const campaignForm = node('form');
        campaignForm.append(select('Кампания для этого ящика', 'campaign', options(campaigns.map(c => ({ id: c.id, label: `${c.steps[0]?.subject ?? 'Цепочка'} · v${c.content_version}` })))), note('Согласие относится только к текущему содержимому и списку получателей. После изменений потребуется новое разрешение.'), check('Я отдельно разрешаю эту кампанию для этого ящика', 'affirmative'));
        const act = async (action: string) => { const campaign = campaigns.find(c => c.id === value(campaignForm, 'campaign')); if (!campaign)
            throw new Error('selection'); if (action === 'grant' && !checked(campaignForm, 'affirmative'))
            throw new Error('consent'); await ui.api.request(`/api/mailboxes/${id}/consents`, 'POST', { scope: 'campaign', action, campaignId: campaign.id, affirmative: action === 'grant', scopeVersion: campaign.content_version, recipientFingerprint: campaign.recipient_fingerprint }); await inspect(id); };
        campaignForm.addEventListener('change', e => { if ((e.target as HTMLInputElement).name !== 'campaign')
            return; (campaignForm.elements.namedItem('affirmative') as HTMLInputElement).checked = false; });
        submit(campaignForm, 'Подтвердить выбранную кампанию', () => act('grant'), ui, false);
        campaignForm.append(button('Отозвать выбранную кампанию', () => void ui.run(() => act('revoke'))));
        area.append(card('Отдельное согласие · кампания', campaignForm), details('История согласий', rows(consents.map(c => `${c.scope === 'pool' ? 'Пул' : 'Кампания'} · версия ${c.scope_version} · ${c.granted_at} · ${c.revoked_at ? 'отозвано ' + c.revoked_at : 'разрешено'}${c.campaign_id ? ' · ' + c.campaign_id : ''}`))));
    };
    chooser.addEventListener('change', () => { const id = value(chooser, 'mailbox'); if (id)
        void ui.run(() => inspect(id));
    else
        area.replaceChildren(); });
    if (!boxes.length)
        edit();
}
