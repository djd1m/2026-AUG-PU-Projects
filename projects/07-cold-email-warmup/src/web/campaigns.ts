import { button, card, check, checked, details, field, node, note, options, rows, select, submit, Ui, value } from './dom.js';
import { ApiError } from './client.js';
import type { Campaign, Consent, Mailbox, Poll, Step } from './models.js';
export async function campaignPage(ui: Ui) {
    const epoch = ui.api.current();
    const [campaigns, boxes] = await Promise.all([ui.api.request<Campaign[]>('/api/campaigns'), ui.api.request<Mailbox[]>('/api/mailboxes')]);
    if (!ui.api.alive(epoch))
        return;
    ui.content.replaceChildren();
    const chooser = node('form'), area = node('div');
    chooser.append(select('Ваша кампания', 'campaign', options(campaigns.map(c => ({ id: c.id, label: `${c.steps[0]?.subject} · ${c.state} · v${c.content_version}` })))));
    ui.content.append(card('Кампании', note('Цепочки используют общий суточный бюджет ящика. Ответ, отписка и жалоба блокируют последующие сообщения; ссылка отписки добавляется сервером.'), chooser, rows(campaigns.map(c => `${c.steps[0]?.subject} · ${c.recipients.length} получателей · ${c.steps.length} шагов · ${c.state}`), 'Создайте первую цепочку.')), button('Создать кампанию', () => edit(), true), area);
    const edit = (campaign?: Campaign) => {
        area.replaceChildren();
        const form = node('form'), steps = node('div');
        const add = (step: Step = { subject: '', body: '', delayHours: 24 }) => { if (steps.children.length >= 5)
            return; const row = node('fieldset'); row.append(node('legend', 'Шаг ' + (steps.children.length + 1)), field('Тема', 'subject', step.subject), field('Текст письма', 'body', step.body, 'textarea'), field('Задержка в часах · минимум 24', 'delay', String(step.delayHours), 'number'), button('Удалить шаг', () => { if (steps.children.length > 1)
            row.remove(); })); const delay = row.querySelector<HTMLInputElement>('[name=delay]')!; delay.min = '24'; delay.max = '8760'; steps.append(row); };
        (campaign?.steps ?? [{ subject: '', body: '', delayHours: 24 }]).forEach(add);
        form.append(note('1–5 шагов. Разрешённые переменные: {{firstName}}, {{lastName}}, {{company}}. Заполните используемые поля у всех получателей. Обычный текст без HTML.'), steps, button('Добавить шаг', () => add()), field('Получатели · одна строка: email; firstName; lastName; company', 'recipients', campaign?.recipients.map(address => [address, ...['firstName', 'lastName', 'company'].map(k => campaign.personalization[address]?.[k] ?? '')].join(';')).join('\n') ?? '', 'textarea'), note('До 100 уникальных адресов. Вставьте строки из таблицы с разделителем «;». Сохранение не даёт согласия и не запускает отправку. Изменение содержимого отменяет прежнее согласие.'));
        submit(form, campaign ? 'Сохранить изменения' : 'Сохранить кампанию', async () => {
            const recipients = value(form, 'recipients').split(/\r?\n/).filter(x => x.trim()).map(line => { const [address, ...fields] = line.split(';').map(x => x.trim()); if (fields.length > 3)
                throw new ApiError('invalid_campaign'); return { address, fields: Object.fromEntries(['firstName', 'lastName', 'company'].flatMap((k, i) => fields[i] ? [[k, fields[i]!]] : [])) }; });
            const payload = { recipients, steps: [...steps.children].map(row => ({ subject: row.querySelector<HTMLInputElement>('[name=subject]')!.value, body: row.querySelector<HTMLTextAreaElement>('[name=body]')!.value, delayHours: Number(row.querySelector<HTMLInputElement>('[name=delay]')!.value) })) };
            await ui.api.request('/api/campaigns' + (campaign ? '/' + campaign.id : ''), campaign ? 'PUT' : 'POST', payload);
            await campaignPage(ui);
        }, ui);
        area.append(card(campaign ? 'Изменить цепочку' : 'Новая цепочка', form));
    };
    const inspect = async (id: string) => {
        const campaign = await ui.api.request<Campaign>('/api/campaigns/' + id);
        if (!ui.api.alive(epoch))
            return;
        area.replaceChildren();
        const preview = node('div'), control = node('form');
        const boxSelect = select('Ящик для запуска', 'mailbox', options(boxes));
        control.append(boxSelect, note(`Текущая версия ${campaign.content_version}; ${campaign.recipients.length} получателей. Выберите ящик и обновите проверку готовности.`));
        const readiness = node('div'), consentBox = check('Разрешаю выбранную кампанию и текущий список получателей для выбранного ящика', 'affirmative');
        control.append(readiness, consentBox);
        let consent: Consent[] = [];
        let poll: Poll | null = null;
        let selected = '';
        const grant = button('Подтвердить отдельное согласие', () => void ui.run(async () => { const mailbox = value(control, 'mailbox'); if (!mailbox || !checked(control, 'affirmative'))
            throw new ApiError('consent_required'); await ui.api.request(`/api/mailboxes/${mailbox}/consents`, 'POST', { scope: 'campaign', action: 'grant', campaignId: id, affirmative: true, scopeVersion: campaign.content_version, recipientFingerprint: campaign.recipient_fingerprint }); await refresh(); }));
        const start = button('Запустить цепочку', () => void ui.run(async () => { if (start.disabled)
            throw new ApiError('consent_required'); await ui.api.request(`/api/campaigns/${id}/start`, 'POST', { mailboxIds: [selected] }); await inspect(id); }), true);
        start.disabled = true;
        const refresh = async () => {
            const mailbox = value(control, 'mailbox');
            selected = mailbox;
            start.disabled = true;
            consent = [];
            poll = null;
            if (!mailbox) {
                readiness.replaceChildren(note('Выберите ящик.'));
                return;
            }
            const data = await Promise.all([ui.api.request<Consent[]>(`/api/mailboxes/${mailbox}/consents`), ui.api.request<Poll>(`/api/mailboxes/${mailbox}/reply-status`)]);
            if (!ui.api.alive(epoch))
                return;
            [consent, poll] = data;
            const box = boxes.find(b => b.id === mailbox), current = consent.some(c => c.scope === 'campaign' && c.campaign_id === id && !c.revoked_at && c.scope_version === campaign.content_version && c.recipient_fingerprint === campaign.recipient_fingerprint);
            const fresh = poll.scanComplete && poll.lastComplete !== null && Date.now() - Date.parse(poll.lastComplete) >= 0 && Date.now() - Date.parse(poll.lastComplete) < 60000;
            const blockers = [!current ? 'нужно отдельное согласие на эту версию' : '', box?.state !== 'verified_test' ? 'нужна локальная TEST-проверка ящика' : '', !fresh ? 'нет полного опроса младше 60 секунд: оператор должен выполнить TEST-опрос' : ''].filter(Boolean);
            readiness.replaceChildren(note(blockers.length ? 'Запуск заблокирован: ' + blockers.join('; ') : 'Условия по последнему чтению выполнены. Сервер проверяет согласие, квоту и стоп-лист снова.'));
            start.disabled = !!blockers.length;
        };
        boxSelect.addEventListener('change', () => { (control.elements.namedItem('affirmative') as HTMLInputElement).checked = false; void ui.run(refresh); });
        control.append(grant, button('Обновить готовность', () => void ui.run(refresh)), start);
        area.append(card(campaign.steps[0]?.subject ?? 'Цепочка', note(`Состояние: ${campaign.state} · версия ${campaign.content_version}`), button('Получить предпросмотр', () => void ui.run(async () => { const data = await ui.api.request<{
            address: string;
            steps: {
                subject: string;
                body: string;
            }[];
        }[]>(`/api/campaigns/${id}/preview`); if (!ui.api.alive(epoch))
            return; preview.replaceChildren(...data.map(r => details(r.address, ...r.steps.map(s => card(s.subject, node('pre', s.body)))))); })), preview, button('Изменить цепочку', () => edit(campaign))), card('Запуск и остановка', control, button('Приостановить кампанию', () => void ui.run(async () => { await ui.api.request(`/api/campaigns/${id}/pause`, 'POST', {}); await inspect(id); })), note('Пауза отменяет будущие задания. Возможна максимум одна уже начатая отправка после submitting; отозвать её нельзя.')));
    };
    chooser.addEventListener('change', () => { const id = value(chooser, 'campaign'); if (id)
        void ui.run(() => inspect(id));
    else
        area.replaceChildren(); });
    if (!campaigns.length)
        edit();
}
