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

export function extractClientIP(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const parts = forwarded
      .split(',')
      .map((p) => p.trim().replace(/^\[|\]$/g, ''))
      .filter((p) => p.length > 0);
    const last = parts[parts.length - 1];
    if (last && looksLikeIp(last)) return last;
  }
  // Caddy также умеет X-Real-IP; он однозначен (один адрес), подделка перезаписывается прокси.
  const real = request.headers.get('x-real-ip');
  if (real && looksLikeIp(real.trim())) return real.trim();

  // Прямое обращение без прокси (локальная разработка). Единый литерал, а не пустая строка:
  // пустой ключ склеил бы всех анонимов в одно ведро молча.
  return 'unknown';
}
