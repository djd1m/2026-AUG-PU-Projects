// extractClientIP (Pseudocode §1) — ключ rate limit'а строится по IP, поэтому цена ошибки
// здесь конкретна: подделываемый IP означает обходимый лимит 5/час.
//
// Разворачивание за Caddy (Caddyfile: reverse_proxy web:3000). Caddy ДОПИСЫВАЕТ адрес
// непосредственного пира в конец X-Forwarded-For, сохраняя то, что прислал клиент. Значит:
//
//   клиент шлёт "1.2.3.4"  →  web видит "1.2.3.4, <настоящий адрес>"
//
// Доверять можно ТОЛЬКО последнему элементу — его записал наш прокси. Взять первый (частая
// реализация «настоящий клиентский IP») здесь означало бы принять значение от атакующего
// и обнулить лимит одним заголовком.
//
// ⚠️ ЭТО РАССУЖДЕНИЕ ДЕРЖИТСЯ НА ОДНОМ УСЛОВИИ: web НЕ доступен снаружи напрямую.
// Если порт web опубликован на хосте, атакующий обходит Caddy, шлёт СВОЙ единственный
// X-Forwarded-For — и «последний элемент» становится его значением. Лимит обнуляется
// сменой заголовка. Найдено вторым мнением (Codex gpt-5.6-sol) и воспроизведено:
// с ротацией XFF семь запросов подряд прошли при пороге пять.
//
// Поэтому docker-compose.yml объявляет web через `expose:`, а не `ports:`, и это
// не косметика, а несущее условие данного файла. Проверка — в
// scripts/check-port-conflicts.sh, раздел «за reverse-proxy».

const IPV4 = /^(\d{1,3}\.){3}\d{1,3}$/;

function looksLikeIp(value: string): boolean {
  if (IPV4.test(value)) return value.split('.').every((o) => Number(o) <= 255);
  return value.includes(':') && /^[0-9a-f:.\[\]]+$/i.test(value); // IPv6, в т.ч. в скобках
}

/**
 * Та же логика, но от заголовков напрямую — для серверных компонентов, где нет Request,
 * а есть `headers()` из next/headers.
 *
 * Существует потому, что вторая реализация уже была написана и уже разошлась: страница
 * партнёрского кабинета разбирала X-Forwarded-For сама, и ключ счётчика у двух дверей
 * совпадал не всегда. Тот же класс, ради которого в проекте стерегутся единственность
 * `readBodyAtMost` и `normalizeEmail`.
 */
export function extractClientIPFromHeaders(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const parts = forwarded
      .split(',')
      .map((p) => p.trim().replace(/^\[|\]$/g, ''))
      .filter((p) => p.length > 0);
    const last = parts[parts.length - 1];
    if (last && looksLikeIp(last)) return last;
  }
  // Caddy также умеет X-Real-IP; он однозначен (один адрес), подделка перезаписывается прокси.
  const real = headers.get('x-real-ip');
  if (real && looksLikeIp(real.trim())) return real.trim();

  // Прямое обращение без прокси (локальная разработка). Единый литерал, а не пустая строка:
  // пустой ключ склеил бы всех анонимов в одно ведро молча.
  return 'unknown';
}

export function extractClientIP(request: Request): string {
  return extractClientIPFromHeaders(request.headers);
}
