/** One lifecycle for every private request, including catch and finally. */
export class ApiError extends Error {
    constructor(readonly code: string) { super(code); }
}
export class SessionClient {
    private epoch = 0;
    private session: string | null = null;
    private controllers = new Set<AbortController>();
    constructor(private clear: () => void, private signin: () => void, private transport: typeof fetch = fetch) { }
    current() { return this.epoch; }
    alive(epoch: number) { return epoch === this.epoch; }
    invalidate(redirect = true) {
        this.epoch++;
        this.session = null;
        for (const controller of this.controllers)
            controller.abort();
        this.controllers.clear();
        this.clear();
        if (redirect)
            this.signin();
    }
    async request<T>(path: string, method = 'GET', payload?: unknown): Promise<T> {
        const epoch = this.epoch, controller = new AbortController();
        this.controllers.add(controller);
        const timer = setTimeout(() => controller.abort(), 10000);
        try {
            const response = await this.transport(path, { method, credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
                headers: { 'Content-Type': 'application/json' }, body: method === 'GET' ? undefined : JSON.stringify(payload ?? {}) });
            if (!this.alive(epoch))
                throw new ApiError('obsolete');
            if (response.status === 401) {
                this.invalidate();
                throw new ApiError('obsolete');
            }
            const session = response.headers.get('X-N7-Session');
            if (this.session && session !== this.session) {
                this.invalidate();
                throw new ApiError('obsolete');
            }
            if (session)
                this.session = session;
            const result = await response.json() as {
                data: T;
                error?: {
                    code: string;
                };
            };
            if (!this.alive(epoch))
                throw new ApiError('obsolete');
            if (!response.ok)
                throw new ApiError(result.error?.code ?? 'service_unavailable');
            return result.data;
        }
        catch (error) {
            if (!this.alive(epoch))
                throw new ApiError('obsolete');
            if (error instanceof ApiError)
                throw error;
            throw new ApiError('network_error');
        }
        finally {
            clearTimeout(timer);
            this.controllers.delete(controller);
        }
    }
}
export const errorMessages: Record<string, string> = {
    clipboard_failed: 'Автоматическое копирование недоступно. Скопируйте текст из открытого поля вручную; событие копирования не записано.', invalid_input: 'Проверьте обязательные поля и формат значений.', invalid_limit: 'Лимит должен быть целым числом от 1 до 30.',
    tls_required: 'Нужны SMTP 465/587, IMAP 993 и обязательный TLS.', host_forbidden: 'Этот сервер не разрешён оператором. Выберите разрешённый почтовый сервер.',
    invalid_campaign: 'Проверьте адреса, 1–5 шагов и задержку 24–8760 часов. Разрешены только firstName, lastName, company.',
    missing_field: 'Заполните значения персонализации для каждого получателя.', consent_required: 'Подтвердите отдельное согласие на текущую версию кампании для выбранного ящика.',
    consent_snapshot_mismatch: 'Версия изменилась. Обновите данные и подтвердите согласие ещё раз.', mailbox_changed: 'Ящик изменился или приостановлен. Обновите данные.',
    plan_limit_reached: 'Достигнут лимит тарифа. Уменьшите число активных кампаний или выберите Team.', billing_unavailable: 'Оплата отключена оператором. Тариф не изменён.',
    service_unavailable: 'Сервис временно недоступен. Повторите позже.', network_error: 'Соединение прервано или запрос занял более 10 секунд. Обновите состояние перед повтором.',
    invalid_partner_code: 'Партнёрский код недействителен. Исправьте его до оплаты.', inactive_partner_code: 'Код отключён. Укажите другой код.', self_referral: 'Собственный код нельзя использовать для своей оплаты.',
    idempotency_conflict: 'Эта попытка относится к другим данным. Измените данные перед новой попыткой.', rate_limited: 'Слишком много запросов. Подождите перед повтором.',
    future_observation: 'Наблюдение не может быть в будущем.', history_limit: 'Достигнут предел истории.', not_found: 'Запись отсутствует или больше недоступна.',
    stale: 'Наблюдение старше семи дней. Добавьте актуальное.', incomparable: 'Наблюдения несопоставимы. Проверьте источник и равные непересекающиеся периоды.',
    noimprovement: 'Улучшение не наблюдается. Публикация недоступна.', unknown: 'Недостаточно подтверждённых наблюдений.', invalid_mailboxes: 'Выберите собственный ящик.'
};
