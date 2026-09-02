// Выключатель приёма видео. БЕЗ базы данных намеренно: это чистая функция от окружения,
// и она обязана проверяться там же, где живёт — в самом дешёвом слое.

import { afterEach, describe, expect, it } from 'vitest';
import { videoIntakeEnabled } from '../src/lib/video';

describe('выключатель приёма видео — fail-closed', () => {
  const saved = process.env.VIDEO_INTAKE_ENABLED;
  afterEach(() => {
    if (saved === undefined) delete process.env.VIDEO_INTAKE_ENABLED;
    else process.env.VIDEO_INTAKE_ENABLED = saved;
  });

  it('переменная не задана — приём ВЫКЛЮЧЕН', () => {
    delete process.env.VIDEO_INTAKE_ENABLED;
    expect(videoIntakeEnabled()).toBe(false);
  });

  it('ровно "true" включает; всё остальное — выключено', () => {
    process.env.VIDEO_INTAKE_ENABLED = 'true';
    expect(videoIntakeEnabled()).toBe(true);
    // Закрытый список написаний: «почти правильное» значение не должно открывать
    // платный путь. Каждое из них кто-нибудь однажды напишет.
    for (const bad of ['', 'True', 'TRUE', '1', 'yes', 'on', 'да', ' true', 'true ', 'false']) {
      process.env.VIDEO_INTAKE_ENABLED = bad;
      expect(videoIntakeEnabled(), JSON.stringify(bad)).toBe(false);
    }
  });

  it('страж по исходнику: маршрут отказывает ДО чтения файла в память', async () => {
    // Порядок несущий: чтение 100 МБ в буфер до проверки выключателя означало бы, что
    // закрытый путь всё равно позволяет занять память сервера.
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(
      new URL('../src/app/api/testimonials/video/route.ts', import.meta.url), 'utf8');
    const guard = src.indexOf('videoIntakeEnabled()');
    const read = src.indexOf('await file.arrayBuffer()');
    expect(guard).toBeGreaterThan(-1);
    expect(read).toBeGreaterThan(guard);
  });
});
