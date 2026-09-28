// Очередь обхода с справедливым порядком (crawl-coverage, A-N6-070). Дефект стенда 28.09: FIFO по sitemap.xml при
// пределе free 50 отдал 42 места страницам курсов, и ни одна запись блога не была прочитана. Порядок теперь — по кругу
// между РАЗДЕЛАМИ (первый сегмент пути: /courses/…, /blog/…, /about/ …): каждый раздел получает очередь по разу,
// пока в нём есть адреса. Внутри раздела — адреса из sitemap с lastmod по убыванию (свежие раньше), затем прочие
// в порядке обнаружения. Очередь только упорядочивает: лимиты, паузы и проверки адресов — в crawl-site (ADR-010).

// Раздел адреса — первый сегмент пути в нижнем регистре. Корень и файлы верхнего уровня («/index.html»,
// «/price.php») — раздел '' вместе с главной; «/about» и «/about/» — раздел 'about'.
export function sectionOf(href: string): string {
  const path = new URL(href).pathname;
  const segments = path.split('/').filter(Boolean);
  const first = (segments[0] ?? '').toLowerCase();
  return segments.length === 1 && !path.endsWith('/') && /\.[a-z0-9]+$/.test(first) ? '' : first;
}

interface Entry { href: string; lastmod: number | null }

export class Frontier {
  private readonly sections = new Map<string, Entry[]>();
  private readonly order: string[] = [];
  private cursor = 0;
  private count = 0;

  get length(): number { return this.count; }

  // lastmod — время из sitemap (мс) либо null. Свежие раньше; без даты — после датированных, в порядке прихода.
  push(href: string, lastmod: number | null = null): void {
    const key = sectionOf(href);
    let list = this.sections.get(key);
    if (!list) { list = []; this.sections.set(key, list); this.order.push(key); }
    const entry = { href, lastmod: Number.isFinite(lastmod) ? lastmod : null };
    if (entry.lastmod === null) list.push(entry);
    else {
      const at = list.findIndex((e) => e.lastmod === null || e.lastmod < entry.lastmod!);
      if (at === -1) list.push(entry); else list.splice(at, 0, entry);
    }
    this.count++;
  }

  // Следующий адрес: первый непустой раздел, начиная с курсора; курсор уходит на следующий раздел.
  shift(): string | undefined {
    if (!this.count) return undefined;
    for (let step = 0; step < this.order.length; step++) {
      const index = (this.cursor + step) % this.order.length;
      const list = this.sections.get(this.order[index]!)!;
      if (!list.length) continue;
      this.cursor = (index + 1) % this.order.length;
      this.count--;
      return list.shift()!.href;
    }
    return undefined;
  }

  // До n НЕпрочитанных адресов — по кругу между разделами (разные разделы видны первыми), в порядке очереди.
  sample(n: number): string[] {
    const out: string[] = [];
    const lists = this.order.map((key) => this.sections.get(key)!).filter((l) => l.length);
    for (let depth = 0; out.length < n && lists.some((l) => l.length > depth); depth++) {
      for (const list of lists) { if (out.length >= n) break; if (list[depth]) out.push(list[depth]!.href); }
    }
    return out;
  }
}

// Адрес для показа владельцу: только путь, без параметров запроса (в них бывают метки и идентификаторы — не храним),
// декодированный для кириллицы, не длиннее 200 символов.
export const UNREAD_SAMPLE_MAX = 5;
export const UNREAD_PATH_MAX_CHARS = 200;
export function displayPath(href: string): string {
  const path = new URL(href).pathname;
  let shown = path;
  try { shown = decodeURIComponent(path); } catch { /* непригодная кодировка — как есть */ }
  return shown.length > UNREAD_PATH_MAX_CHARS ? `${shown.slice(0, UNREAD_PATH_MAX_CHARS - 1)}…` : shown;
}
