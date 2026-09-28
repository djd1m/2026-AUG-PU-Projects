// Баннер ворот A-N6-035 (gate-onboarding, A-N6-066): пока нет отметки «Я проверил ответы бота», посетители видят
// заглушку «Бот ещё настраивается» — владелец обязан узнать это ДО кода установки и на экране бота, а не из жалобы
// клиента (инцидент стенда 28.09: обход готов, виджет стоит, все ответы — заглушка). Только разметка по пропсам — её же
// рендерит браузерный набор (tests/browser/gate-onboarding.test.ts); запрос отметки — у контейнера экрана.

export const GATE_STUB_WARNING = 'Посетители вашего сайта сейчас видят заглушку «Бот ещё настраивается». '
  + 'Проверьте ответы в тестовом чате и нажмите «Я проверил ответы бота».';
export const VERIFY_BUTTON = 'Я проверил ответы бота';

export interface GateBannerView {
  verified: boolean;
  // Есть источник с готовой задачей: без материала проверять нечего — кнопки нет.
  ready: boolean;
  // Отметку сняла база (новые фрагменты): дата ISO; null — не снимала.
  resetAt: string | null;
  // Посетителей с заглушкой за 7 дней (различные сессии).
  stubVisitors: number;
  chatHref: string;
  busy: boolean;
  error: string;
  onVerify: () => void;
}

const day = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'long' });

// 1 посетитель, 2 посетителя, 5 посетителей; 11–14 — «посетителей».
export function visitorsWord(n: number): string {
  const tens = n % 100, ones = n % 10;
  if (tens >= 11 && tens <= 14) return 'посетителей';
  if (ones === 1) return 'посетитель';
  if (ones >= 2 && ones <= 4) return 'посетителя';
  return 'посетителей';
}
export const stubVisitorsLine = (n: number) => `${n} ${visitorsWord(n)} ${n % 10 === 1 && n % 100 !== 11 ? 'получил' : 'получили'} заглушку «Бот ещё настраивается»`;

export function GateBanner(p: GateBannerView) {
  if (p.verified) return null;
  return <section className="notice danger-notice cabinet-notice stack gate-banner" aria-labelledby="gate-title">
    <h2 id="gate-title" className="gate-title">Бот пока не отвечает посетителям</h2>
    {p.resetAt && <p className="gate-reset"><strong>Отметка снята {day(p.resetAt)}: материалы обновились — проверьте ответы заново.</strong></p>}
    <p>{GATE_STUB_WARNING}</p>
    {p.stubVisitors > 0 && <p className="gate-count">За 7 дней {stubVisitorsLine(p.stubVisitors)}.</p>}
    {p.error && <p role="alert" className="field-error">{p.error}</p>}
    {p.ready
      ? <p className="cluster">
        <button type="button" disabled={p.busy} onClick={p.onVerify}>{p.busy ? 'Сохраняем…' : VERIFY_BUTTON}</button>
        <a className="button secondary" href={p.chatHref}>Открыть тестовый чат</a></p>
      : <p className="muted">Материалы ещё не загружены. Дождитесь, пока источник будет готов, задайте боту вопросы в тестовом чате и отметьте проверку.</p>}
  </section>;
}
