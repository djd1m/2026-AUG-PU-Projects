// Страж целевой базы интеграционных тестов (DEC-A-051).
//
// Слой unit и НЕ integration — намеренно: страж обязан проверяться без подключения к базе,
// иначе его нельзя испытать, не рискуя ровно тем, от чего он защищает.

import { describe, expect, it } from 'vitest';
import { assertTestDatabase } from '../helpers/db.js';

describe('assertTestDatabase', () => {
  it('разрешённая тестовая база проходит', () => {
    expect(() => assertTestDatabase('postgresql://n4_admin:pw@db:5432/n4_test')).not.toThrow();
  });

  it('БОЕВАЯ база стенда отвергается — именно она была стёрта 13.09', () => {
    expect(() => assertTestDatabase('postgresql://n4_admin:pw@db:5432/n4')).toThrow(/n4_test/);
  });

  it('сообщение называет ЦЕНУ ошибки, а не только факт', () => {
    expect(() => assertTestDatabase('postgresql://n4_admin:pw@db:5432/n4')).toThrow(/TRUNCATE|стирает/);
  });

  it('любая другая база тоже отвергается: список разрешённых закрыт, а не «всё кроме n4»', () => {
    for (const name of ['postgres', 'n4_prod', 'n4test', 'n4_test_old', 'template1']) {
      expect(() => assertTestDatabase(`postgresql://u:p@db:5432/${name}`), name).toThrow();
    }
  });

  it('неразбираемый адрес — проверка НЕ ВЫПОЛНЕНА, и это отказ, а не пропуск', () => {
    expect(() => assertTestDatabase('не-адрес')).toThrow(/НЕ ВЫПОЛНЕНА/);
  });
});
