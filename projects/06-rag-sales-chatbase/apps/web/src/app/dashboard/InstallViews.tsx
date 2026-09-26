// Экран «Установка» (фича bot-cabinet; FR-BOT-002, FR-WIDGET-003; SC-US-005-1/2/3; Pseudocode InstallSnippet).
// Только разметка по пропсам (её рендерит браузерный набор прибора); состояние и запросы — InstallScreen.
// Три состояния кода установки различимы: нужен контакт (кода НЕТ — SC-US-005-3), виджет ещё не собран (кода НЕТ —
// тег на несуществующий файл владелец вставил бы на сайт, и на сайте не появилось бы ничего), код готов.
import type { InstallSnippet } from '@n6/rag/bot-settings';
import { Field, type FieldErrors } from './CabinetViews';

export interface InstallViewProps {
  botId: string; companyName: string; snippet: InstallSnippet; origins: string[];
  contact: string; domain: string; errors: FieldErrors; busy: boolean; copied: boolean;
  onContact: (value: string) => void; onSaveContact: () => void; onDomain: (value: string) => void; onAddDomain: () => void; onCopy: () => void;
}

function Domains(p: InstallViewProps) {
  return <section className="card stack" aria-labelledby="domains-title">
    <h2 id="domains-title">Домены, где бот будет отвечать</h2>
    <p className="muted">Виджет отвечает только на страницах этих сайтов. Без хотя бы одного домена он не отвечает нигде.</p>
    {p.origins.length
      ? <ul className="origin-list" aria-label="Разрешённые домены">{p.origins.map((o) => <li key={o}><code>{o}</code></li>)}</ul>
      : <p role="status" className="notice">Доменов пока нет — добавьте адрес сайта, на который ставите бота.</p>}
    <form className="stack" noValidate onSubmit={(e) => { e.preventDefault(); p.onAddDomain(); }}>
      <Field id="origin-domain" label="Домен сайта" hint="Например shop.example — сохраним как https://shop.example. Для проверки на своём стенде можно http://" error={p.errors.domain}>
        <input id="origin-domain" name="domain" type="text" inputMode="url" autoComplete="off" placeholder="shop.example" value={p.domain}
          aria-invalid={Boolean(p.errors.domain)} aria-describedby={p.errors.domain ? 'origin-domain-hint origin-domain-error' : 'origin-domain-hint'}
          onChange={(e) => p.onDomain(e.target.value)} />
      </Field>
      <p><button type="submit" className="secondary" disabled={p.busy}>{p.busy ? 'Добавляем…' : 'Добавить домен'}</button></p>
    </form>
  </section>;
}

function Directives({ directives }: { directives: string[] }) {
  return <section className="card stack" aria-labelledby="csp-title">
    <h2 id="csp-title">Если на сайте настроена политика безопасности (CSP)</h2>
    <p className="muted">Разрешите ровно эти директивы — без <code>unsafe-inline</code>:</p>
    <ul className="csp-list" aria-label="Директивы CSP">{directives.map((d) => <li key={d}><code>{d}</code></li>)}</ul>
  </section>;
}

export function InstallView(p: InstallViewProps) {
  const head = <div className="cabinet-head"><h1>Установка на сайт</h1>
    <p className="muted plan-line"><a href={`/dashboard/bots/${p.botId}`}>← {p.companyName}</a></p></div>;
  if (p.snippet.kind === 'contact_required') {
    return <>{head}
      <section className="card stack" aria-labelledby="contact-title">
        <h2 id="contact-title">Сначала — контакт для «не знаю»</h2>
        <p>Когда ответа нет в материалах, бот говорит «не знаю» и показывает этот контакт. Без него код установки не выдаётся.</p>
        <form className="stack" noValidate onSubmit={(e) => { e.preventDefault(); p.onSaveContact(); }}>
          <Field id="install-contact" label="Контакт компании" hint="Почта, телефон или ссылка https://… (например, на мессенджер)" error={p.errors.contact}>
            <input id="install-contact" name="contact" type="text" autoComplete="off" maxLength={300} placeholder="+7 900 000-00-00" value={p.contact}
              aria-invalid={Boolean(p.errors.contact)} aria-describedby={p.errors.contact ? 'install-contact-hint install-contact-error' : 'install-contact-hint'}
              onChange={(e) => p.onContact(e.target.value)} />
          </Field>
          <p><button type="submit" disabled={p.busy}>{p.busy ? 'Сохраняем…' : 'Сохранить и показать код'}</button></p>
        </form>
      </section>
      <Domains {...p} /></>;
  }
  if (p.snippet.kind === 'bundle_missing') {
    return <>{head}
      <section className="card stack" aria-labelledby="code-title">
        <h2 id="code-title">Код установки</h2>
        <p role="status" className="notice">Виджет ещё не собран на этом сервере — код появится здесь после сборки. Настройте домены заранее: они понадобятся сразу.</p>
      </section>
      <Domains {...p} />
      <Directives directives={p.snippet.directives} /></>;
  }
  return <>{head}
    <section className="card stack" aria-labelledby="code-title">
      <h2 id="code-title">Код установки</h2>
      <p>Вставьте эту строку перед закрывающим тегом <code>&lt;/body&gt;</code> на каждой странице сайта:</p>
      <pre className="snippet" tabIndex={0} aria-label="Код установки"><code>{p.snippet.tag}</code></pre>
      <p className="cluster"><button type="button" onClick={p.onCopy}>Скопировать код</button>
        <span role="status" className="muted">{p.copied ? 'Скопировано' : ''}</span></p>
      <details className="howto"><summary>Tilda</summary><p>Настройки сайта → Ещё → «HTML-код для вставки внутрь body» → вставьте строку и опубликуйте все страницы.</p></details>
      <details className="howto"><summary>WordPress</summary><p>Внешний вид → Редактор тем → footer.php, перед <code>&lt;/body&gt;</code>; или плагин вставки кода в подвал.</p></details>
      <details className="howto"><summary>Обычный HTML</summary><p>Добавьте строку в шаблон перед <code>&lt;/body&gt;</code>. Атрибут <code>async</code> не задерживает загрузку страницы.</p></details>
    </section>
    <Domains {...p} />
    <Directives directives={p.snippet.directives} /></>;
}
