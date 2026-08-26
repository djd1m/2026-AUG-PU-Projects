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
 * Имя файла бандла виджета версионируется content-hash'ем (ADR-007), его пишет
 * apps/widget/dist/manifest.json на сборке. Раскладка бандла в public/ — задача FR-006;
 * пока манифеста нет, отдаём неверсионированный /widget.js, чтобы сниппет из AC FR-001
 * был синтаксически корректен и не содержал выдуманного хеша.
 */
export function widgetScriptPath(): string {
  const manifest = path.resolve(process.cwd(), '../widget/dist/manifest.json');
  try {
    if (existsSync(manifest)) {
      const parsed = JSON.parse(readFileSync(manifest, 'utf8')) as { file?: string };
      if (parsed.file) return `/${parsed.file}`;
    }
  } catch {
    // Манифест битый — не повод валить регистрацию. Падаём на стабильное имя.
  }
  return '/widget.js';
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
