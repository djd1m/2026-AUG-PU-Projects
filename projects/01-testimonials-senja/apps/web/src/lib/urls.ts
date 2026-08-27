// Три адреса, которые FR-001 обязан выдать сразу после создания проекта:
// форма /f/<slug>, стена /w/<slug>, сниппет виджета (Pseudocode §9, AC FR-001).

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const DEFAULT_BASE_URL = 'http://localhost:3000';

/**
 * Переменные, у которых НЕТ ПРАВА НА ДЕФОЛТ в проде.
 *
 * Общее у них одно: они определяют то, что продукт отдаёт НАРУЖУ. Разумный дефолт у
 * такой переменной превращает «неправильно настроено» в «молча неверно»: он снимает
 * единственный дешёвый сигнал — падение при старте — и переносит обнаружение на
 * человека, который откроет ссылку в проде.
 *
 * Так и произошло: BASE_URL не был объявлен в docker-compose.yml, дефолт сработал,
 * приложение стартовало, 408 тестов были зелёными, все страницы открывались — и КАЖДАЯ
 * выданная владельцу ссылка вела на http://localhost:3000, то есть на машину посетителя.
 * Нашёл владелец продукта, а не проверка.
 *
 * Отсюда общее наблюдение прогона: тихие отказы кучкуются там, где есть graceful
 * fallback. У каждого P0 был запасной путь, оставлявший систему «здоровой».
 * Правило: .claude/rules/silent-fallbacks.md
 */
function assertConfiguredInProduction(value: string | undefined): void {
  if (process.env.NODE_ENV !== 'production') return;
  // Сборка Next выполняется с NODE_ENV=production, но внешний адрес ей не нужен и
  // не передаётся. Отличаем сборку от рантайма: на этапе сборки его знать неоткуда.
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  if (value) return;
  throw new Error(
    'BASE_URL не задан. Он определяет КАЖДУЮ выдаваемую наружу ссылку (форма, витрина, ' +
      'сниппет виджета, badge). Дефолта у него нет намеренно: с дефолтом все ссылки молча ' +
      'повели бы на localhost. Объявить в environment сервиса web в docker-compose.yml.',
  );
}

/**
 * BASE_URL для абсолютных ссылок. За Caddy web не знает свой внешний адрес сам.
 *
 * Значение ВАЛИДИРУЕТСЯ, а не просто подчищается. Причина конкретная: в окружении
 * встречается `BASE_URL="/"` — после срезания хвостового слеша от него остаётся пустая
 * строка, и каждый последующий `new URL(path, base)` падает с «Invalid URL». Поймано
 * тестом badge-ссылки, а не чтением. Непригодное значение = как будто его нет.
 */
export function baseUrl(): string {
  const configured = [process.env.BASE_URL, process.env.NEXT_PUBLIC_BASE_URL].find((c) => {
    if (!c) return false;
    const t = c.trim().replace(/\/+$/, '');
    if (t === '') return false;
    try {
      const u = new URL(t);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      return false;
    }
  });
  // Падаем ДО того, как отдадим наружу неверную ссылку. В dev/test дефолт законен.
  assertConfiguredInProduction(configured);

  for (const candidate of [process.env.BASE_URL, process.env.NEXT_PUBLIC_BASE_URL, DEFAULT_BASE_URL]) {
    if (!candidate) continue;
    const trimmed = candidate.trim().replace(/\/+$/, '');
    if (trimmed === '') continue;
    try {
      const url = new URL(trimmed);
      // Только http(s): ссылки уходят наружу, в письма и на чужие сайты.
      if (url.protocol === 'http:' || url.protocol === 'https:') return trimmed;
    } catch {
      // Относительный или битый адрес — не абсолютная база, пробуем следующий вариант.
    }
  }
  return DEFAULT_BASE_URL;
}

/**
 * Имя бандла виджета версионировано content-hash'ем (ADR-007) — именно это позволяет отдавать
 * его с `Cache-Control: immutable` (Caddyfile) и не бояться раздать устаревшую версию.
 * Единственный источник знания об актуальном имени — манифест, который кладёт в public
 * scripts/copy-widget-to-public.mjs на шаге `npm run build:widget`.
 *
 * Читается один раз за процесс: файл меняется только при пересборке образа, а на каждую
 * выдачу дашборда лезть в fs незачем.
 */
let cachedWidgetFile: string | null = null;

export function widgetScriptPath(): string {
  if (cachedWidgetFile) return cachedWidgetFile;
  const manifest = path.resolve(process.cwd(), 'public/widget-manifest.json');
  try {
    if (existsSync(manifest)) {
      const parsed = JSON.parse(readFileSync(manifest, 'utf8')) as { file?: string };
      if (parsed.file) {
        cachedWidgetFile = `/${parsed.file}`;
        return cachedWidgetFile;
      }
    }
  } catch {
    // Манифест битый — не повод валить регистрацию. Падаём на стабильное имя.
  }
  // Виджет ещё не собран (напр. dev без build:widget). Сниппет остаётся синтаксически
  // корректным и не содержит выдуманного хеша.
  return '/widget.js';
}

/** Только для тестов: сбросить кеш имени бандла. */
export function resetWidgetPathCache(): void {
  cachedWidgetFile = null;
}

export function widgetSnippet(slug: string): string {
  // async обязателен по контракту FR-006 AC — виджет не блокирует onload хоста.
  return `<script src="${baseUrl()}${widgetScriptPath()}" data-slug="${slug}" async></script>`;
}

export interface ProjectUrls {
  submission_form: string;
  wall_of_love: string;
  dashboard: string;
  widget_snippet: string;
}

export function buildProjectUrls(slug: string): ProjectUrls {
  const base = baseUrl();
  return {
    submission_form: `${base}/f/${slug}`,
    wall_of_love: `${base}/w/${slug}`,
    dashboard: `${base}/dashboard/${slug}`,
    widget_snippet: widgetSnippet(slug),
  };
}
