import { legalOperator } from '../lib/legal-documents';
export function SupportLauncher() {
  return <footer className="support-launcher site-legal-footer" aria-label="Документы и реквизиты">
    <nav aria-label="Документы и поддержка"><a href="/legal/privacy">Политика конфиденциальности</a><a href="/legal/terms">Пользовательское соглашение</a><a href="/support">Поддержка и доступ к аккаунту</a></nav>
    <details><summary>Реквизиты</summary><div className="legal-footer-requisites">
    <p>{legalOperator.name}</p><p>ИНН {legalOperator.inn} · ОГРНИП {legalOperator.ogrnip}</p>
    <p>{legalOperator.address}</p><p><a href={`mailto:${legalOperator.email}`}>{legalOperator.email}</a></p>
    </div></details>
  </footer>;
}
