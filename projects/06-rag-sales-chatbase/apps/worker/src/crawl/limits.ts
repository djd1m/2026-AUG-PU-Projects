// Числа краулера — канон §7 «Краулер» и «Планы», FR-SOURCE-001/002. Константы кода, не окружение:
// вежливость и защита не настраиваются переменной, которая однажды приедет пустой (fail-closed-defaults п.3).
import type { AccountPlan } from '@n6/rag';

export const CRAWL_PAUSE_MS = 1000;                 // пауза между ЛЮБЫМИ запросами к сайту (≤ 1 запрос/с, NFR-SEC-004)
export const CRAWL_PAGE_TIMEOUT_MS = 15_000;        // таймаут запроса целиком: соединение + заголовки + тело
export const CRAWL_MAX_PAGE_BYTES = 2 * 1024 * 1024; // потолок тела страницы, чтение обрывается на превышении
export const CRAWL_MAX_REDIRECTS = 5;               // CheckAddress п.3
export const CRAWL_MIN_TEXT_CHARS = 200;            // CrawlSite п.4: меньше — страница пустая
export const ROBOTS_MAX_BYTES = 500 * 1024;         // RFC 9309 §2.5: разбирать не меньше 500 КиБ
export const SITEMAP_MAX_BYTES = CRAWL_MAX_PAGE_BYTES;
export const CRAWL_QUEUE_MAX = 5000;                // потолок очереди адресов (память воркера)
export const CRAWL_MAX_URL_LENGTH = 2048;
// Бюджет страниц источника по плану (канон §7: 50 / 300); предпросмотр — index_job.page_budget (20).
export const PAGES_BY_PLAN: Readonly<Record<AccountPlan, number>> = Object.freeze({ free: 50, nobadge: 300, studio: 300 });
// Запросов на обход — не больше чем 2 × бюджет + 10: пропущенные страницы тоже нагружают чужой сайт.
export const requestCap = (pageBudget: number) => pageBudget * 2 + 10;
// Бюджет ВРЕМЕНИ обхода: сторож закрывает серию через 15 мин (JOB_DEADLINE_MS); обход останавливается
// раньше, чтобы задача закрылась успехом с прочитанным, а не stalled.
export const CRAWL_TIME_BUDGET_MS = 12 * 60_000;
// Токен продукта в User-Agent — по нему же ищется группа robots.txt.
export const CRAWLER_TOKEN = 'SuflerBot';
export const userAgentFor = (publicOrigin: string) => `${CRAWLER_TOKEN}/0.1 (+${new URL('/bot', publicOrigin).href})`;
