// Маршрут `/result/[id]` реально существует и отдаётся собранным приложением
// (RV-source-and-correct-01, слепое ревью 2026-09-13: «компонент нигде в приложении не
// используется; маршрута результата нет»). Тот же приём, что и `web-manifest.test.ts`:
// проверяется СОБРАННЫЙ (`next start`) сервер по реальному HTTP-адресу, а не вызов
// функции — вызов остался бы зелёным, даже если маршрута не существует вовсе.

import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const PORT = 3988;
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

describe('маршрут /result/[id] по HTTP', () => {
  it('отдаёт 200, а не 404 — маршрут результата СУЩЕСТВУЕТ в собранном приложении', async () => {
    const response = await fetch(`${BASE}/result/00000000-0000-0000-0000-000000000000`);
    expect(response.status).toBe(200);
    const html = await response.text();
    // Начальный серверный рендер клиентского компонента — состояние ДО эффекта загрузки
    // (`useEffect` с сетевым запросом выполняется только после гидратации в браузере):
    // страница обязана нести текст ЗАГРУЗКИ, отрисованный НАШИМ компонентом
    // (`result__status`), а не общий шаблон 404-страницы Next (та тоже присутствует в
    // RSC-полезной нагрузке КАЖДОГО маршрута как заготовка на случай notFound() — сама по
    // себе не признак ошибки).
    expect(html).toContain('result__status');
    expect(html).toContain('загрузка');
    expect(html).not.toContain('<h1 class="next-error-h1"');
  }, 30_000);

  it('произвольный второй id тоже отдаёт 200 — маршрут ДИНАМИЧЕСКИЙ, а не единственная захардкоженная страница', async () => {
    const response = await fetch(`${BASE}/result/another-id`);
    expect(response.status).toBe(200);
  }, 30_000);
});
