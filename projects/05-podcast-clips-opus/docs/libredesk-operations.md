# Отдельный Libredesk pilot N5

Рецепт использует официальный OSS Libredesk v2.9.0 и существующий N5 widget adapter.
Это подготовка конфигурации: runtime, TLS/DNS, ёмкость, настоящий ticket/reply,
перезапуск и restore ещё требуют приёмки. Только синтетические данные до решения
по контактам, срокам хранения, удалению, вложениям, индексам и backup.

Исходники донора: [tagged compose](https://github.com/abhinavxd/libredesk/blob/v2.9.0/docker-compose.yml),
[tagged config](https://github.com/abhinavxd/libredesk/blob/v2.9.0/config.sample.toml),
[CLI startup](https://github.com/abhinavxd/libredesk/blob/v2.9.0/cmd/main.go),
[installation/proxy](https://support.libredesk.io/en/articles/installation).
Не исполнять upstream compose: он публикует DB/Redis и устанавливает схему при старте.

## Граница запуска

`ops/libredesk/docker-compose.yml` — отдельный project `n5-helpdesk`. Его DB,
Redis, credentials и volumes не связаны с N5. DB/Redis не имеют host ports;
app доступен только через Caddy, Caddy публикует `127.0.0.1:${N5_HELPDESK_PORT:-4191}`.
Outer TLS proxy обслуживает отдельный root-origin, предпочтительно
`https://help.clipmkr.ru/`; поддержка subpath не доказана.

Перед любым запуском integration owner проверяет архитектуру amd64, конфликты
портов (`bash scripts/check-port-conflicts.sh <project>` из корня репозитория),
свежие available RAM/SSD, существующие контейнеры и резерв для S3 render.
После image unpack/PG init/WAL/uploads/logs/backup должно оставаться >=2 GiB SSD.
Memory limits: app768MiB, PG256MiB, Redis128MiB, proxy64MiB; это pilot budget,
а не доказанный capacityPASS. Не запускать bootstrap вместе с большим render.

Libredesk закреплён v2.9.0 и linux/amd64 platform digest. Для Caddy обязательно
указать проверенный локальный immutable image ID. PG16.4/Redis7.4 defaults —
версии, а не immutable receipt: перед поставкой заменить их точными уже локальными
image IDs через `N5_HELPDESK_PG_IMAGE` / `N5_HELPDESK_REDIS_IMAGE`.
Никакой implicit pull: все команды поставки используют `--pull never`.
Не reuse N5 data volumes, instances, credentials или DB network.

Outer proxy направляет запросы только на loopback4191, сохраняет Host,
поддерживает WebSocket Upgrade/Connection и **перезаписывает X-Real-IP реальным
client IP**, удаляя входное значение клиента. Sidecar передаёт его как X-Client-IP.
Host/outer proxy — доверенная граница; прямой доступ с недоверенного host процесса
не является защищённым клиентом. Не открывать4191 во внешний интерфейс и не
подключать недоверенные контейнеры к `n5-helpdesk-edge`.
При изменении proxy chain заново проверить spoofed headers и фактический client IP.

## Приватные файлы (выполняет root после preflight)

Из корня N5 создать отдельный root-owned private directory вне git. Пример ниже
генерирует только локальные секреты; его выполнение не запускает контейнеры.
`N5_HELPDESK_PRIVATE_DIR` задать абсолютным путём в защищённом каталоге.
Никогда не печатать `.env`, config или нормализованный compose с секретами в логи.

```sh
export N5_HELPDESK_RECIPE_DIR="$PWD/ops/libredesk"
export N5_HELPDESK_PRIVATE_DIR=/root/n5-helpdesk-private
python3 - <<'PYGEN'
import os, pathlib, secrets
assert os.geteuid() == 0, "root only"
os.umask(0o077)
d = pathlib.Path(os.environ["N5_HELPDESK_PRIVATE_DIR"])
assert d.is_absolute()
d.mkdir(mode=0o700, parents=True, exist_ok=True)
assert d.stat().st_uid == 0 and d.stat().st_mode & 0o077 == 0
recipe = pathlib.Path(os.environ["N5_HELPDESK_RECIPE_DIR"])
db, redis, key = (secrets.token_hex(n) for n in (24, 24, 16))
system = "Aa1_" + secrets.token_hex(24)
config = (recipe / "config.toml.example").read_text()
for token, value in (("REPLACE_WITH_PRIVATE_DB_PASSWORD", db),
                     ("REPLACE_WITH_PRIVATE_REDIS_PASSWORD", redis),
                     ("REPLACE_WITH_PRIVATE_32_HEX_CHARS", key)):
    assert config.count(token) == 1
    config = config.replace(token, value)
env = (recipe / ".env.example").read_text()
for name, value in (("N5_HELPDESK_DB_PASSWORD", db),
                    ("N5_HELPDESK_REDIS_PASSWORD", redis),
                    ("LIBREDESK_SYSTEM_USER_PASSWORD", system),
                    ("N5_HELPDESK_CONFIG_PATH", str(d / "config.toml"))):
    env = env.replace(name + "=\n", name + "=" + value + "\n")
for name, text in (("config.toml", config), (".env", env)):
    with (d / name).open("x") as out:
        out.write(text)
    (d / name).chmod(0o600)
PYGEN
```

Заполнить только проверенные local image IDs в private `.env` и проверить0600.
Сгенерированный config хранит постоянный32-hex encryption key. Не генерировать
его повторно при restart/upgrade. Backup включает protected config/key, DB и uploads.
`.env` не заменяет config: DB/Redis пароли в обоих должны совпадать.
Скрипт отказывается перезаписывать существующие файлы; при частичном сбое сверить
состояние и восстановить из защищённой копии, не регенерировать работающие ключи.

## Ручной bootstrap и обычный старт

Ниже команды **для отдельного проверенного пустого helpdeskDB**, не N5.
Вызов `--install --yes` разрушителен; никогда не включать его в startup/restart.
Все команды выполнять из N5 project root, private env содержит только доверенные
сгенерированные значения и проверенные image IDs. Не включать shell tracing.

```sh
set -a
. "$N5_HELPDESK_PRIVATE_DIR/.env"
set +a
hd() { docker compose --env-file "$N5_HELPDESK_PRIVATE_DIR/.env" \
  -f "$N5_HELPDESK_RECIPE_DIR/docker-compose.yml" "$@"; }
hd config --quiet
hd up -d --pull never db redis
hd exec -T db psql -U n5_helpdesk -d n5_helpdesk -v ON_ERROR_STOP=1 \
  -c "SELECT current_database(), current_user;" \
  -c "SELECT count(*) FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema');"
```

Продолжать только после проверки имени `n5_helpdesk`, dedicated volume, empty DB
(count0), здоровых DB/Redis и сохранённого секретного System password.

```sh
hd run --rm --no-deps --pull never -e LIBREDESK_SYSTEM_USER_PASSWORD app \
  ./libredesk --install --yes --config /libredesk/config.toml
hd up -d --pull never app proxy
unset LIBREDESK_SYSTEM_USER_PASSWORD
```

При повторном старте — только `hd up -d --pull never`, без install.
При обновлении: отдельные release review, проверенный backup и restore drill,
остановить app, затем **один раз вручную** выполнить `hd run --rm --no-deps
--pull never app ./libredesk --upgrade --yes --config /libredesk/config.toml`
и запустить app. Ни install, ни upgrade не являются normal startup.
Первоначальный PG user — владелец только этого изолированного PG cluster;
он privileged внутри своего cluster. Изоляция от N5 обеспечена отдельным cluster,
а не заявлением о SQL sandbox. Runtime least-privilege role — отдельная проверка
прав схемы; не выдавать N5 credentials этому приложению.

## Настройка и приёмка

В helpdesk настроить General Root URL на фактический HTTPS origin. System —
setup-only; отдельный человек создаёт helpdesk Agent с минимальными правами
чтения/ответа/статуса назначенного inbox, без users:manage/roles:manage/admin.
Не называть этого Agent оператором N5: N5 membership выдаётся отдельно только
реальному active verified account доверенной guarded ops-командой. Нельзя
ручным UPDATE подменять email proof или принимать test capture за доставку.

Создать Live Chat inbox, отключить обязательный email pre-chat, получить реальный
inbox UUID. SMTP/email inbox, OIDC, AI providers, external webhooks, WhatsApp и
аналитические интеграции не настраивать. Anonymous chat не требует SMTP.
Конфиг уменьшает pools/workers, ограничивает request body5MiB и включает SSRF guard;
отсутствие настроенных providers проверяется при setup в UI.

В существующем N5 adapter после qualified helpdesk и разрешённого N5 rollout:

```dotenv
N5_SUPPORT_MODE=libredesk
N5_SUPPORT_BASE_URL=https://help.clipmkr.ru
N5_SUPPORT_INBOX_ID=<actual-inbox-uuid>
N5_SUPPORT_IDENTIFIED=false
```

Не добавлять второй widget script. Реальный email/JWT N5 не отправляется.
Проверить widget.js200, WSS101, anonymous visitor→synthetic ticket→Agent reply→
visitor receipt, reload того же browser и изоляцию чистого profile. Проверить
360px/desktop, helpdesk unavailable, service restart и сохранность ticket/uploads.
Зафиксировать source/build/env/image digests, ID synthetic conversation, timings,
RSS/limits и disk low-water без текста сообщений, cookies, паролей и PII.

Backup/restore проверить в другой пустой dedicated helpdeskDB; успешное сообщение
не доказывает restore, remote revoke или удаление attachments/indexes/backups.
Verified/identified acceptance, настоящая mailbox delivery и N5 staff grant имеют
собственные gates и остаются выключенными до их прохождения.
Откат: N5_SUPPORT_MODE=disabled, остановить только app/proxy этого project,
сохранить DB/Redis/uploads и ключи. Не выполнять `down -v`, не prune shared assets.
