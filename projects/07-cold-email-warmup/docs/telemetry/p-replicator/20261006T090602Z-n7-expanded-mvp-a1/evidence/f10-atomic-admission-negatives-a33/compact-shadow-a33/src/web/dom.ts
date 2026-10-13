import { ApiError, errorMessages, SessionClient } from './client.js';
export function node<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string) {
    const result = document.createElement(tag);
    if (text !== undefined)
        result.textContent = text;
    if (className)
        result.className = className;
    return result;
}
export function field(label: string, name: string, value = '', type = 'text', required = true) {
    const wrap = node('label', label, 'field'), input = type === 'textarea' ? node('textarea') : node('input');
    input.name = name;
    input.value = value;
    input.required = required;
    if (input instanceof HTMLInputElement)
        input.type = type;
    wrap.append(input);
    return wrap;
}
export function select(label: string, name: string, items: {
    value: string;
    label: string;
}[], selected = '') {
    const wrap = node('label', label, 'field'), input = node('select');
    input.name = name;
    for (const item of items) {
        const option = node('option', item.label);
        option.value = item.value;
        option.selected = item.value === selected;
        input.append(option);
    }
    wrap.append(input);
    return wrap;
}
export function check(label: string, name: string) { const wrap = node('label', undefined, 'check'), input = node('input'); input.type = 'checkbox'; input.name = name; wrap.append(input, node('span', label)); return wrap; }
export function value(form: HTMLFormElement, name: string) { return (form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement).value; }
export function checked(form: HTMLFormElement, name: string) { return (form.elements.namedItem(name) as HTMLInputElement).checked; }
export function button(label: string, action: () => void, primary = false) { const b = node('button', label, primary ? 'primary' : undefined); b.type = 'button'; b.addEventListener('click', action); return b; }
export function details(title: string, ...children: Node[]) { const d = node('details'); d.append(node('summary', title), ...children); return d; }
export function card(title: string, ...children: Node[]) { const c = node('section', undefined, 'card'); c.append(node('h2', title), ...children); return c; }
export function note(text: string) { return node('p', text, 'note'); }
export function rows(items: string[], empty = 'Пока нет записей.') { const list = node('ul', undefined, 'history'); for (const item of items)
    list.append(node('li', item)); if (!items.length)
    list.append(node('li', empty)); return list; }
export function options(items: {
    id: string;
    label?: string;
}[]) { return [{ value: '', label: 'Выберите запись' }, ...items.map(x => ({ value: x.id, label: x.label ?? x.id }))]; }
export function submit(form: HTMLFormElement, label: string, action: () => Promise<void>, ui: Ui, primary = true) {
    const b = node('button', label, primary ? 'primary' : undefined);
    b.type = 'submit';
    form.append(b);
    form.addEventListener('invalid', e => {const detail=(e.target as HTMLElement).closest('details');if(detail)detail.open=true;},true);
    form.addEventListener('submit', e => { e.preventDefault(); for(const detail of form.querySelectorAll('details')) {if([...detail.querySelectorAll('input,textarea,select')].some(input=>!(input as HTMLInputElement).validity.valid))detail.open=true;} if (form.reportValidity())
        void ui.run(action); });
    return b;
}
export class Ui {
    readonly api: SessionClient;
    private pending = false;
    private cleanups: (() => void)[] = [];
    constructor(readonly content: HTMLElement, readonly feedback: HTMLElement) {
        this.api = new SessionClient(() => { this.pending = false; this.content.inert = false; this.content.removeAttribute('aria-busy'); this.content.replaceChildren(); this.feedback.textContent = ''; for (const cleanup of this.cleanups)
            cleanup(); }, () => location.replace('/signin'));
    }
    onClear(fn: () => void) { this.cleanups.push(fn); }
    tell(text: string, error = false) { this.feedback.textContent = text; this.feedback.setAttribute('role', error ? 'alert' : 'status'); if (error)
        this.feedback.focus(); }
    async run(action: () => Promise<void>) {
        if (this.pending)
            return;
        this.pending = true;
        const epoch = this.api.current();
        this.content.inert = true;
        this.content.setAttribute('aria-busy', 'true');
        this.tell('Подождите…');
        try {
            await action();
            if (this.api.alive(epoch))
                this.tell('Данные обновлены.');
        }
        catch (error) {
            if (this.api.alive(epoch))
                this.tell(error instanceof ApiError ? (errorMessages[error.code] ?? 'Действие отклонено: ' + error.code) : 'Проверьте поля и повторите действие.', true);
        }
        finally {
            if (this.api.alive(epoch)) {
                this.pending = false;
                this.content.removeAttribute('aria-busy');
                this.content.inert = false;
            }
        }
    }
}
export async function copy(text: string, alive: () => boolean = () => true) {
    try {
        await navigator.clipboard.writeText(text);
        return alive();
    }
    catch {
        if (!alive())
            return false;
        const input = node('textarea');
        input.value = text;
        input.dataset.copyFallback = 'true';
        input.setAttribute('aria-label', 'Ссылка для копирования');
        document.body.append(input);
        input.focus();
        input.select();
        const success = document.execCommand('copy');
        input.remove();
        if (!success)
            window.prompt('Скопируйте ссылку вручную', text);
        return success;
    }
}
export function stableKey() { let previous = '', key = ''; return (payload: unknown) => { const encoded = JSON.stringify(payload); if (previous !== encoded) {
    previous = encoded;
    key = crypto.randomUUID();
} return key; }; }
