import { button, card, check, checked, copy, details, field, node, note, options, rows, select, stableKey, submit, Ui, value } from './dom.js';
import { ApiError } from './client.js';
import type { Comparison, Event, Observation, Report } from './models.js';
const reasons: Record<string, string> = { unknown: 'Недостаточно наблюдений', stale: 'Последнее наблюдение старше семи дней', incomparable: 'Различаются источник, показатель, направление или равные непересекающиеся периоды', noimprovement: 'По выбранному направлению улучшения нет', improved: 'Наблюдается улучшение выбранного показателя' };
export async function evidencePage(ui: Ui) {
    const epoch = ui.api.current();
    const [history, reports, events] = await Promise.all([ui.api.request<{
            observations: Observation[];
            reputation: string;
        }>('/api/evidence?limit=100'), ui.api.request<Report[]>('/api/reports?limit=100'), ui.api.request<Event[]>('/api/growth/events?limit=100')]);
    if (!ui.api.alive(epoch))
        return;
    ui.content.replaceChildren();
    const form = node('form');
    form.append(note('Ручные данные, подтверждённые вами. Ни число участников, ни принятие SMTP не доказывают доставку во входящие. Репутация: ' + history.reputation), field('URL источника · приватный', 'sourceUrl', '', 'url'), field('Ссылка / обозначение документа · приватное', 'reference'), field('Наблюдение · UTC, YYYY-MM-DDTHH:mm:ss.sssZ', 'observedAt'), details('Период и показатель', field('Начало периода · UTC', 'windowStart'), field('Конец периода · UTC', 'windowEnd'), select('Показатель', 'metric', [{ value: 'inbox_placement', label: 'Попадание во входящие' }, { value: 'spam_placement', label: 'Попадание в спам' }, { value: 'delivered', label: 'Доставлено' }]), select('Улучшение означает', 'direction', [{ value: 'higher', label: 'Больше' }, { value: 'lower', label: 'Меньше' }]), field('Числитель', 'numerator', '', 'number'), field('Знаменатель', 'denominator', '', 'number')), check('Я вручную проверил источник, период и значения', 'manualVerified'));
    for (const k of ['numerator', 'denominator']) {
        const input = form.elements.namedItem(k) as HTMLInputElement;
        input.min = '0';
        input.max = '1000000000';
        input.step = '1';
    }
    submit(form, 'Сохранить наблюдение', async () => {
        if (!checked(form, 'manualVerified'))
            throw new ApiError('invalid_input');
        const payload = Object.fromEntries(['sourceUrl', 'reference', 'observedAt', 'windowStart', 'windowEnd', 'metric', 'direction'].map(k => [k, value(form, k)]));
        await ui.api.request('/api/evidence', 'POST', { ...payload, unit: 'count', numerator: Number(value(form, 'numerator')), denominator: Number(value(form, 'denominator')), manualVerified: true });
        await evidencePage(ui);
    }, ui);
    ui.content.append(card('Наблюдения', form), details('История · последние 100', rows(history.observations.map(o => `${o.evidence.observedAt} · ${o.evidence.metric} · ${o.evidence.numerator}/${o.evidence.denominator} · ${o.evidence.sourceUrl} · ${o.evidence.reference}`))));
    const pair = node('form'), result = node('div');
    const items = options(history.observations.map(o => ({ id: o.id, label: `${o.evidence.observedAt} · ${o.evidence.metric} · ${o.evidence.numerator}/${o.evidence.denominator}` })));
    pair.append(select('Исходное наблюдение', 'baseline', items), select('Последнее наблюдение', 'latest', items), note('Последнее ≤7 дней; исходное ≤28 дней до него. Источник, показатель, направление и длительность совпадают. Периоды не пересекаются. При n<30 показываем числа, при обоих n≥30 — доли. Причинная связь с прогревом не заявляется.'));
    let comparison: Comparison | null = null;
    const shareKey = stableKey();
    const share = button('Создать публичный отчёт', () => void ui.run(async () => {
        if (!comparison?.shareAllowed)
            throw new ApiError('unknown');
        const payload = { baselineId: value(pair, 'baseline'), latestId: value(pair, 'latest') };
        await ui.api.request('/api/reports', 'POST', { ...payload, idempotencyKey: shareKey(payload) });
        await evidencePage(ui);
    }));
    share.disabled = true;
    pair.addEventListener('change', () => { comparison = null; share.disabled = true; result.replaceChildren(); });
    submit(pair, 'Сравнить выбранную пару', async () => {
        const data = await ui.api.request<Comparison>('/api/evidence/compare', 'POST', { baselineId: value(pair, 'baseline'), latestId: value(pair, 'latest') });
        if (!ui.api.alive(epoch))
            return;
        comparison = data;
        result.replaceChildren(note(`${reasons[data.reason] ?? data.reason}. Формат: ${data.display === 'ratios' ? 'доли' : 'исходные числа'}. Ручное подтверждение; независимой проверки провайдером нет.`), rows([`До: ${data.baseline.numerator}/${data.baseline.denominator}`, `После: ${data.latest.numerator}/${data.latest.denominator}`]));
        share.disabled = !data.shareAllowed;
    }, ui, false);
    ui.content.append(card('Сравнение и публикация', pair, result, note('В публичном отчёте будут даты, числа и только origin источника. Приватный путь URL и обозначение документа не публикуются. Создание ссылки — отдельное явное действие.'), share));
    const reportList = node('div');
    for (const report of reports) {
        const url = location.origin + '/reports/' + report.token, entry = node('div', undefined, 'report-row');
        const key = stableKey();
        entry.append(node('p', `${report.created_at} · ${report.revoked_at ? 'отозван' : 'доступен'}`));
        if (!report.revoked_at) {
            const link = node('a', 'Открыть публичный отчёт');
            link.href = url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.addEventListener('click', () => { void ui.run(async () => { await ui.api.request(`/api/reports/${report.id}/events`, 'POST', { kind: 'link', idempotencyKey: key({ kind: 'link' }) }); }); });
            entry.append(link, button('Скопировать ссылку', () => void ui.run(async () => { const success = await copy(url, () => ui.api.alive(epoch)); if (!ui.api.alive(epoch))
                return; if (!success)
                throw new ApiError('clipboard_failed'); await ui.api.request(`/api/reports/${report.id}/events`, 'POST', { kind: 'copy', idempotencyKey: key({ kind: 'copy' }) }); })), button('Отозвать ссылку', () => void ui.run(async () => { await ui.api.request(`/api/reports/${report.id}/revoke`, 'POST', {}); await evidencePage(ui); })));
        }
        reportList.append(entry);
    }
    if (!reports.length)
        reportList.append(note('Публичных отчётов пока нет.'));
    ui.content.append(card('Мои ссылки · последние 100', reportList), details('История явных действий · последние 100', rows(events.map(e => `${e.created_at} · ${e.kind}`))));
}
