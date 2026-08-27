// BASE_URL определяет КАЖДУЮ выдаваемую наружу ссылку. До этого файла у функции,
// стоявшей в центре худшего дефекта конфигурации проекта, не было ни одного теста:
// переменная не была объявлена в compose, дефолт сработал, приложение стартовало,
// 408 тестов были зелёными — и все выданные ссылки вели на localhost.
//
// Правило, из которого вырос этот файл: .claude/rules/silent-fallbacks.md

import { afterEach, describe, expect, it, vi } from 'vitest';
import { baseUrl, buildProjectUrls, DEFAULT_BASE_URL } from '../src/lib/urls';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('baseUrl — валидация, а не подчистка', () => {
  it('берёт корректное значение из BASE_URL', () => {
    vi.stubEnv('BASE_URL', 'https://proofwall.example.com');
    expect(baseUrl()).toBe('https://proofwall.example.com');
  });

  it('срезает хвостовые слеши', () => {
    vi.stubEnv('BASE_URL', 'https://proofwall.example.com///');
    expect(baseUrl()).toBe('https://proofwall.example.com');
  });

  it('BASE_URL="/" не превращается в пустую строку, а трактуется как отсутствующий', () => {
    // Именно этот вход ронял каждый new URL(path, base) с «Invalid URL».
    vi.stubEnv('BASE_URL', '/');
    vi.stubEnv('NODE_ENV', 'development');
    expect(baseUrl()).toBe(DEFAULT_BASE_URL);
  });

  it.each(['javascript:alert(1)', 'file:///etc/passwd', 'ftp://example.com', 'не адрес', ''])(
    'непригодное значение %j отвергается — ссылки уходят в письма и на чужие сайты',
    (bad) => {
      vi.stubEnv('BASE_URL', bad);
      vi.stubEnv('NODE_ENV', 'development');
      expect(baseUrl()).toBe(DEFAULT_BASE_URL);
    },
  );
});

// Сердце файла. Дефолт у переменной, определяющей выдаваемое наружу, — это
// превращение «неправильно настроено» в «молча неверно».
describe('в проде дефолта НЕТ — отсутствие BASE_URL роняет, а не подставляет localhost', () => {
  it('прод + переменная не задана → исключение', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('BASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', '');
    expect(() => baseUrl()).toThrow(/BASE_URL не задан/);
  });

  it('прод + непригодное значение → исключение, а не тихий localhost', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('BASE_URL', '/');
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', '');
    expect(() => baseUrl()).toThrow(/BASE_URL не задан/);
  });

  it('прод + корректное значение → работает молча', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('BASE_URL', 'https://proofwall.example.com');
    expect(baseUrl()).toBe('https://proofwall.example.com');
  });

  it('СБОРКА Next не роняется: внешний адрес ей не нужен и не передаётся', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PHASE', 'phase-production-build');
    vi.stubEnv('BASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', '');
    expect(baseUrl()).toBe(DEFAULT_BASE_URL);
  });

  it('в dev и test дефолт законен — иначе локальная разработка требует настройки', () => {
    for (const env of ['development', 'test']) {
      vi.stubEnv('NODE_ENV', env);
      vi.stubEnv('BASE_URL', '');
      vi.stubEnv('NEXT_PUBLIC_BASE_URL', '');
      expect(baseUrl(), env).toBe(DEFAULT_BASE_URL);
    }
  });
});

describe('выданные наружу адреса строятся ОТ базового', () => {
  it('все три ссылки ведут на настроенный адрес, а не на localhost', () => {
    vi.stubEnv('BASE_URL', 'https://proofwall.example.com');
    const urls = buildProjectUrls('acme');
    expect(urls.submission_form).toBe('https://proofwall.example.com/f/acme');
    expect(urls.wall_of_love).toBe('https://proofwall.example.com/w/acme');
    expect(urls.dashboard).toBe('https://proofwall.example.com/dashboard/acme');
    for (const [name, value] of Object.entries(urls)) {
      expect(String(value), `${name} содержит localhost`).not.toContain('localhost');
    }
  });
});
