// Маршрут `/diary` реально существует и отдаётся собранным приложением — тот же приём и та же
// причина, что и `web-result-route.test.ts` (RV-source-and-correct-01): вызов функции остался бы
// зелёным даже без маршрута вовсе; проверяется СОБРАННЫЙ (`next start`) сервер по HTTP.
// Задача N4 добавила `/diary` как новый экран — до этого файла маршрута не существовало.

import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const PORT = 3989;
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

describe('маршрут /diary по HTTP', () => {
  it('отдаёт 200, а не 404 — экран дня СУЩЕСТВУЕТ в собранном приложении', async () => {
    const response = await fetch(`${BASE}/diary`);
    expect(response.status).toBe(200);
    const html = await response.text();
    // Первый серверный рендер клиентского компонента — заголовок и разметка нав-панели даты,
    // отрисованные НАШИМ компонентом, а не общий шаблон 404 Next.
    expect(html).toContain('Дневник');
    expect(html).toContain('экран дня');
    expect(html).not.toContain('<h1 class="next-error-h1"');
  }, 30_000);

  it('несёт ссылку возврата к камере', async () => {
    const response = await fetch(`${BASE}/diary`);
    const html = await response.text();
    expect(html).toContain('к камере');
  }, 30_000);
});
