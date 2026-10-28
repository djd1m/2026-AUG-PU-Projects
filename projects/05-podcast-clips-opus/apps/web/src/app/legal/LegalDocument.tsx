import type { LegalDocumentData } from '../../lib/legal-documents';
export function LegalDocument({ document }: { document: LegalDocumentData }) {
  return <main className="legal-document"><nav aria-label="Навигация по документам"><a href="/">На главную</a><a href="/legal/privacy">Политика конфиденциальности</a><a href="/legal/terms">Пользовательское соглашение</a></nav>
    <article aria-label="Текст документа">{document.paragraphs.map((paragraph, index) => paragraph.style === 'Heading1'
      ? <h1 key={index}>{paragraph.text}</h1> : paragraph.style === 'Heading2'
        ? <h2 key={index}>{paragraph.text}</h2> : <p key={index}>{paragraph.text}</p>)}</article>
  </main>;
}
