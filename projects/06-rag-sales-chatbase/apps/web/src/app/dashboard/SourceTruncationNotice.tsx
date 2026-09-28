// Пометка усечённого источника в ленте кабинета (budget-truncation A-N6-052 + crawl-coverage A-N6-070). Только разметка
// по пропсам. Дефект стенда 28.09: обход упёрся в предел free 50, а владелец видел «50 из 50» — как будто сайт прочитан
// целиком. Для предела страниц и потолка обхода пометка называет ЧИСЛО известных адресов и примеры непрочитанных.
import { PAGES_BY_PLAN } from '@n6/rag/constants';
import { pagesWord, type RibbonJob } from '../../lib/source-ribbon';

// Какой предел остановил обход: pages_done при остановке пределом страниц равно самому пределу (обход считает ровно до него).
function pageLimitText(pagesDone: number): string {
  if (pagesDone === PAGES_BY_PLAN.free) return `предел тарифа «Бесплатный» — ${PAGES_BY_PLAN.free} страниц (платные тарифы — до ${PAGES_BY_PLAN.nobadge})`;
  if (pagesDone === PAGES_BY_PLAN.nobadge) return `предел тарифа — ${PAGES_BY_PLAN.nobadge} страниц`;
  return `предел страниц этого чтения — ${pagesDone}. «Обновить» дочитает сайт в пределах страниц тарифа`;
}

export function SourceTruncationNotice({ job, kind }: { job: RibbonJob; kind: 'site' | 'pdf' }) {
  const done = job.pages_done;
  if (job.truncated === 'page_budget' || job.truncated === 'crawl_limit') {
    const known = job.pages_total !== null && job.pages_total > done ? ` из ≥ ${job.pages_total} известных` : '';
    const why = job.truncated === 'page_budget' ? pageLimitText(done)
      : 'обход остановлен потолком времени или запросов к сайту (бережём ваш сайт от нагрузки)';
    const unread = job.unread?.length ? job.unread : [];
    return <p role="status" className="notice truncation-notice coverage-notice">
      Прочитано {done} {pagesWord(done)}{known} — {why}. Бот не знает того, что есть только на непрочитанных страницах.
      {unread.length > 0 && <> Не прочитаны, например: {unread.map((path, i) => <span key={path}>{i ? ', ' : ''}<code className="unread-path">{path}</code></span>)}
        {job.pages_total !== null && job.pages_total - done > unread.length ? ' и другие' : ''}.</>}
    </p>;
  }
  return <p role="status" className="notice truncation-notice">Прочитано {done} {kind === 'pdf' ? 'стр. PDF' : pagesWord(done)}: закончился бюджет обработки текста для этого источника. Бот отвечает по прочитанному.{kind === 'site' ? ' «Обновить» продолжит чтение в пределах страниц тарифа — прочитанные страницы заново не оплачиваются.' : ''}</p>;
}
