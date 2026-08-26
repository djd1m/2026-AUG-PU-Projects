// Три адреса, которые FR-001 обязан выдать сразу после создания проекта:
// форма /f/<slug>, стена /w/<slug>, сниппет виджета (Pseudocode §9, AC FR-001).

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** BASE_URL для абсолютных ссылок. За Caddy web не знает свой внешний адрес сам. */
export function baseUrl(): string {
  const raw = process.env.BASE_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';
  return raw.replace(/\/+$/, '');
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
