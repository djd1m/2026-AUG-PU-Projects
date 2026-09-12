// Манифест PWA по HTTP (AC-foundation-12, находка RV-foundation-03).
//
// Прежний тест ВЫЗЫВАЛ функцию `manifest()` и потому оставался зелёным при неверном HTTP-пути:
// функция возвращала правильный объект, а по адресу из критерия приёмки (`/manifest.json`)
// не отдавалось НИЧЕГО. Проверять надо то, что увидит браузер, — ответ собранного приложения
// по названному адресу, а не значение, которое вернул наш же код.

import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const PORT = 3987;
const BASE = `http://127.0.0.1:${PORT}`;
const WEB_DIR = fileURLToPath(new URL('../../apps/web', import.meta.url));

let server: ChildProcess;

async function waitForServer(deadlineMs = 60_000): Promise<void> {
  const deadline = Date.now() + deadlineMs;
  for (;;) {
    try {
      const response = await fetch(`${BASE}/`, { signal: AbortSignal.timeout(2_000) });
      if (response.status > 0) return;
    } catch {
      // сервер ещё не слушает — пробуем снова
    }
    if (Date.now() > deadline) throw new Error('next start не поднялся за отведённое время');
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

beforeAll(async () => {
  // Собранное приложение, а не dev-режим: проверяется то, что поедет в образ.
  server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
    cwd: WEB_DIR,
    stdio: 'ignore',
    env: { ...process.env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1' },
  });
  await waitForServer();
}, 120_000);

afterAll(() => {
  server?.kill('SIGTERM');
});

describe('манифест PWA по HTTP', () => {
  it('манифест PWA валиден и не содержит секретов', async () => {
    const response = await fetch(`${BASE}/manifest.json`);

    // Адрес ИЗ КРИТЕРИЯ, а не тот, который удобен фреймворку.
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type') ?? '').toContain('application/manifest+json');

    const body = await response.text();
    const manifest = JSON.parse(body);
    expect(manifest.name).toBeTruthy();
    expect(manifest.display).toBe('standalone');
    expect(manifest.start_url).toBe('/');
    expect(Array.isArray(manifest.icons) && manifest.icons.length > 0).toBe(true);

    expect(body).not.toContain('ANTHROPIC');
    expect(body).not.toContain('TELEGRAM');
  }, 60_000);

  it('иконки манифеста действительно отдаются', async () => {
    // Манифест, ссылающийся на несуществующие иконки, валиден по схеме и бесполезен на
    // устройстве: установка PWA молча остаётся без значка.
    const manifest = await (await fetch(`${BASE}/manifest.json`)).json();
    for (const icon of manifest.icons as { src: string }[]) {
      const response = await fetch(`${BASE}${icon.src}`);
      expect(response.status, icon.src).toBe(200);
      expect(response.headers.get('content-type') ?? '', icon.src).toContain('image/png');
    }
  }, 60_000);

  it('корневой экран отдаётся с политикой безопасности и без inline-скриптов в script-src', async () => {
    const response = await fetch(`${BASE}/`);
    expect(response.status).toBe(200);

    // Политика ставится РОВНО ОДНИМ местом: второй такой заголовок браузер пересекает с
    // первым, и страница ломается молча.
    const policy = response.headers.get('content-security-policy') ?? '';
    expect(policy).toContain("script-src 'self' 'nonce-");
    expect(policy).not.toContain("script-src 'self' 'unsafe-inline'");

    const html = await response.text();
    expect(html).toContain('aria-label="видоискатель"');
    expect(html).toContain('съёмка');
    expect(html).toContain('галерея');
  }, 60_000);
});
