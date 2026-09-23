#!/usr/bin/env bash
# Переключение продукта на короткий домен clipmkr.ru (OWN-007).
#
# Скрипт ОТКАЗЫВАЕТСЯ работать, пока предусловия не выполнены, и это его главное свойство:
# половина переключения хуже отсутствия переключения. Три кода возврата:
#   0 — переключено и проверено
#   1 — предусловие не выполнено либо шаг отказал (названо, какой именно)
#   2 — проверка НЕ ВЫПОЛНЕНА: нет доступа к нужному инструменту. НИКОГДА не значит «в порядке»
set -uo pipefail

IP_OURS=212.192.0.33
DOMAIN=clipmkr.ru
CADDYFILE=/home/dz-projects-2026/dz-harness-hub/.dz/deploy/ai-hub/Caddyfile
BLOCK=/tmp/n5-clipmkr-block.txt
PROXY=ai-hub-tls-proxy
PROJ="$(cd "$(dirname "$0")/.." && pwd)"

die()  { echo "❌ $1" >&2; exit 1; }
skip() { echo "⚠️  проверка НЕ ВЫПОЛНЕНА: $1" >&2; exit 2; }
ok()   { echo "✅ $1"; }

# ── 1. DNS. Без него Caddy уйдёт в бесконечные попытки выпуска сертификата ──────────────
command -v dig >/dev/null || skip "нет dig — DNS проверить нечем"
A=$(timeout 10 dig +short A "$DOMAIN" @8.8.8.8 | head -1)
[ -n "$A" ] || die "$DOMAIN не разрешается вовсе. Зона в Yandex Cloud DNS ещё не создана"
[ "$A" = "$IP_OURS" ] || die "$DOMAIN указывает на $A, а не на наш $IP_OURS.
   Пока это чужой адрес, проверка владения при выпуске сертификата пойдёт не к нам.
   Нужно: зона clipmkr.ru. в Yandex Cloud DNS, запись A @ → $IP_OURS, затем смена NS у reg.ru."
ok "DNS: $DOMAIN → $A"

# ── 2. Предусловия окружения ────────────────────────────────────────────────────────────
command -v docker >/dev/null || skip "нет docker"
docker ps >/dev/null 2>&1   || skip "docker недоступен (сокет, права)"
[ -f "$BLOCK" ]     || die "нет заготовки блока $BLOCK"
[ -f "$CADDYFILE" ] || die "нет $CADDYFILE"
grep -q "BEGIN N5 SHORT DOMAIN" "$CADDYFILE" && { ok "блок уже применён, шаг пропущен"; APPLIED=1; } || APPLIED=0

# ── 3. Блок в прокси. ТОЛЬКО дозаписью в тот же inode ───────────────────────────────────
# Грабля 22.09.2026: bind-mount ОДНОГО файла привязан к inode, а не к пути. Редактор,
# пишущий через временный файл и переименование, создаёт НОВЫЙ inode — контейнер продолжает
# видеть старое содержимое, а `caddy reload` отвечает «config is unchanged» с кодом 0.
if [ "$APPLIED" = 0 ]; then
  INODE_BEFORE=$(stat -c %i "$CADDYFILE")
  cp -p "$CADDYFILE" "/tmp/Caddyfile.before-clipmkr.$(date +%s)" || die "не удалось сохранить копию"
  cat "$BLOCK" >> "$CADDYFILE" || die "дозапись блока не удалась"
  INODE_AFTER=$(stat -c %i "$CADDYFILE")
  [ "$INODE_BEFORE" = "$INODE_AFTER" ] || die "inode изменился ($INODE_BEFORE → $INODE_AFTER): контейнер правку НЕ увидит"
  ok "блок дописан, inode сохранён ($INODE_AFTER)"

  # Доказательство, что контейнер видит то же самое, а не «config is unchanged» на старом файле
  MD5_HOST=$(md5sum "$CADDYFILE" | cut -d' ' -f1)
  MD5_CONT=$(docker exec "$PROXY" md5sum /etc/caddy/Caddyfile 2>/dev/null | cut -d' ' -f1) || skip "нет доступа в $PROXY"
  [ "$MD5_HOST" = "$MD5_CONT" ] || die "контейнер видит ДРУГОЙ файл (host $MD5_HOST ≠ container $MD5_CONT).
   Это та самая ловушка inode. Перезапустить прокси и повторить."
  ok "контейнер видит тот же файл ($MD5_HOST)"

  docker exec "$PROXY" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile \
    || die "caddy reload отказал — блок дописан, но НЕ применён. Конфигурация цела, откат: убрать блок и повторить reload"
  ok "caddy reload выполнен"
fi

# ── 4. Сертификат. Выпуск не мгновенный, поэтому ждём, а не предполагаем ─────────────────
echo "ожидаю сертификат (до 180 с)…"
for i in $(seq 1 36); do
  CODE=$(timeout 10 curl -s -o /dev/null -w '%{http_code}' "https://$DOMAIN/" 2>/dev/null) && [ "$CODE" != "000" ] && break
  sleep 5
done
[ "${CODE:-000}" != "000" ] || die "HTTPS на $DOMAIN не поднялся за 180 с. Смотреть: docker logs --tail 50 $PROXY"
ok "HTTPS отвечает: код $CODE"

# ── 5. Публичный адрес продукта. ТОЛЬКО после рабочего HTTPS ─────────────────────────────
for ENVF in /tmp/n5-demo.env; do
  [ -f "$ENVF" ] || die "нет $ENVF"
  cp -p "$ENVF" "$ENVF.before-clipmkr" || die "не удалось сохранить копию $ENVF"
  sed -i "s|^N5_PUBLIC_ORIGIN=.*|N5_PUBLIC_ORIGIN=https://$DOMAIN|" "$ENVF" || die "правка $ENVF не удалась"
  grep -q "^N5_PUBLIC_ORIGIN=https://$DOMAIN$" "$ENVF" || die "$ENVF: адрес не записался"
done
ok "N5_PUBLIC_ORIGIN = https://$DOMAIN"

# ── 6. Пересборка стенда. --build ОБЯЗАТЕЛЕН ────────────────────────────────────────────
# Грабля 22.09.2026: без --build берётся ранее собранный образ, и прогон молча проверяет
# СТАРЫЙ код. Результат совпал побайтово, включая длительность упавшего теста.
cd "$PROJ" || die "нет каталога проекта"
docker compose --project-directory . --env-file /tmp/n5-demo.env up -d --build \
  || die "стенд не поднялся. Страж старта мог отказать — это НЕ сбой, а защита: смотреть
   docker compose logs web worker-video | grep N5_PUBLIC_ORIGIN"
ok "стенд пересобран и поднят"

# ── 7. Доказательство, а не предположение ───────────────────────────────────────────────
sleep 10
HEALTH=$(timeout 10 curl -s -o /dev/null -w '%{http_code}' "https://$DOMAIN/health")
[ "$HEALTH" = "200" ] || die "/health отвечает $HEALTH вместо 200"
ok "/health = 200"

# Короткая ссылка: несуществующий код обязан дать 404, а не 5xx — это доказывает,
# что маршрут живой и отвечает сам, а не падает по дороге.
C404=$(timeout 10 curl -s -o /dev/null -w '%{http_code}' "https://$DOMAIN/c/ZZZZZZ")
[ "$C404" = "404" ] || die "/c/ZZZZZZ отвечает $C404 вместо 404"
ok "/c/{код} = 404 на несуществующем коде"

# Старый домен ОБЯЗАН продолжать работать: клипы с ним уже могли уехать наружу,
# и их метка правится только повторным рендером, которого нет.
OLD=$(timeout 10 curl -s -o /dev/null -w '%{http_code}' "https://clipmaker.aicoding.space/health")
[ "$OLD" = "200" ] || die "СТАРЫЙ домен отвечает $OLD: опубликованные клипы потеряли петлю"
ok "старый домен жив (код $OLD)"

echo
echo "Переключено. Что осталось человеку:"
echo "  • загрузить видео и убедиться глазами, что метка на клипе несёт $DOMAIN и читается с телефона"
echo "  • обновить docs/decisions-owner.md OWN-007: отметить дату фактического переключения"
