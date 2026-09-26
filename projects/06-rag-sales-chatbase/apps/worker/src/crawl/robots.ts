// robots.txt (FR-SOURCE-002, CrawlSite п.1, RFC 9309) — свой разбор, без зависимостей (ADR-010, ADR-016).
// Группа выбирается по токену продукта (SuflerBot), иначе «*»; правило — самое длинное совпадение,
// при равной длине побеждает Allow; поддержаны «*» и «$». Недоступен 4xx — «всё разрешено»;
// 5xx, таймаут, сеть — unreachable (читать сайт, не зная его запретов, нельзя: fail-closed).
import { AddressRefused } from './check-address';
import { CRAWL_MAX_REDIRECTS, CRAWL_MAX_URL_LENGTH, CRAWLER_TOKEN, ROBOTS_MAX_BYTES } from './limits';
import { FetchFailed, safeGet, type GetOptions } from './safe-get';

interface Rule { allow: boolean; path: string; segments: string[]; anchored: boolean }
interface Group { agents: string[]; rules: Rule[] }
export interface Robots { groups: Group[] }
export const ALLOW_ALL: Robots = Object.freeze({ groups: [] }) as Robots;

// Сопоставление правила без регэкспа (ревью crawler, BLOCKER-1): «*» из правила, превращённая в «.*»,
// давала экспоненциальный бэктрекинг — 30 звёзд и строка в 42 символа вешали воркер на 10 с. Здесь
// правило — литеральные сегменты между «*»; каждый ищется indexOf ЛЕВЕЕ всего (жадно, без возврата):
// для шаблона из одних «*» и литералов самое левое вхождение каждого сегмента не хуже любого другого.
// Время — O(длина пути × длина правила), без экспоненты. Подряд идущие «*» схлопываются.
function compile(path: string): Pick<Rule, 'segments' | 'anchored'> {
  const anchored = path.endsWith('$');
  const segments = (anchored ? path.slice(0, -1) : path).split('*');
  return { segments: segments.filter((part, i) => i === 0 || i === segments.length - 1 || part !== ''), anchored };
}
// Правило, чьи литералы длиннее любого адреса, который краулер запросит, совпасть не может — его можно
// не хранить (это не ослабление запрета: такой путь не будет запрошен никогда).
const MAX_LITERAL = CRAWL_MAX_URL_LENGTH;

export function matchRule(rule: Pick<Rule, 'segments' | 'anchored'>, text: string): boolean {
  const { segments, anchored } = rule;
  const first = segments[0]!;
  if (!text.startsWith(first)) return false;
  if (segments.length === 1) return anchored ? text.length === first.length : true;
  let position = first.length;
  const last = segments.length - 1;
  for (let i = 1; i < last; i++) {
    const found = text.indexOf(segments[i]!, position);
    if (found < 0) return false;
    position = found + segments[i]!.length;
  }
  const tail = segments[last]!;
  if (!anchored) return text.indexOf(tail, position) >= 0;
  return text.length - tail.length >= position && text.endsWith(tail);
}

export function parseRobots(text: string): Robots {
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r\n|\r|\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (key === 'user-agent') {
      // Подряд идущие user-agent — одна группа; user-agent после правил открывает новую.
      if (!current || !lastWasAgent) { current = { agents: [], rules: [] }; groups.push(current); }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((key === 'allow' || key === 'disallow') && current) {
      lastWasAgent = false;
      if (!value) continue; // пустой Disallow = ничего не запрещено
      if (value.replace(/[*$]/g, '').length > MAX_LITERAL) continue;
      current.rules.push({ allow: key === 'allow', path: value, ...compile(value) });
    } else {
      lastWasAgent = false;
    }
  }
  return { groups };
}

// Разрешён ли путь (pathname + search) для нашего токена.
export function isAllowed(robots: Robots, pathWithQuery: string, token = CRAWLER_TOKEN): boolean {
  if (pathWithQuery === '/robots.txt') return true;
  const own = robots.groups.filter((g) => g.agents.includes(token.toLowerCase()));
  const chosen = own.length ? own : robots.groups.filter((g) => g.agents.includes('*'));
  let best: Rule | null = null;
  for (const rule of chosen.flatMap((g) => g.rules)) {
    if (!matchRule(rule, pathWithQuery)) continue;
    if (!best || rule.path.length > best.path.length || (rule.path.length === best.path.length && rule.allow && !best.allow)) best = rule;
  }
  return best ? best.allow : true;
}

export type RobotsOutcome = { kind: 'ok'; robots: Robots } | { kind: 'refused'; reason: 'unreachable' | 'blocked_address' };

// Получить robots.txt origin'а через safeGet (CheckAddress на каждом шаге). Перенаправления — в пределах сайта.
export async function fetchRobots(origin: string, options: Omit<GetOptions, 'wantBody' | 'maxBytes' | 'accept' | 'maxRedirects'>): Promise<RobotsOutcome> {
  try {
    const result = await safeGet(new URL('/robots.txt', origin), {
      ...options, accept: 'text/plain,*/*;q=0.1', maxBytes: ROBOTS_MAX_BYTES, maxRedirects: CRAWL_MAX_REDIRECTS,
      wantBody: (status) => status >= 200 && status < 300,
    });
    if (result.status >= 500 || result.status < 200) return { kind: 'refused', reason: 'unreachable' };
    if (result.status >= 400) return { kind: 'ok', robots: ALLOW_ALL };
    if (result.status >= 300) return { kind: 'refused', reason: 'unreachable' }; // 3xx без Location
    if (result.encoded || !result.body) return { kind: 'refused', reason: 'unreachable' };
    // Превышение — разобрать первые ROBOTS_MAX_BYTES (RFC 9309 §2.5); здесь тело не читалось — отказ честнее.
    if (result.tooLarge) return { kind: 'refused', reason: 'unreachable' };
    return { kind: 'ok', robots: parseRobots(result.body.toString('utf8')) };
  } catch (error) {
    if (error instanceof AddressRefused) return { kind: 'refused', reason: error.reason };
    if (error instanceof FetchFailed) return { kind: 'refused', reason: 'unreachable' };
    throw error;
  }
}
