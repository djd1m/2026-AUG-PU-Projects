# Обзор репозиториев: защита VPS, сетевой доступ, провижининг (djd1m)

Разобраны три публичных репозитория пользователя djd1m — все успешно клонированы
(`GIT_LFS_SKIP_SMUDGE=1 git clone --depth 1`, последовательно, без ошибок).

---

## djd1m/vps-security
**Ссылка:** https://github.com/djd1m/vps-security
**Доступ:** получен
**Тип:** bash-скрипты + markdown-инструкции (частично промпт для Claude Code)
**Свежесть:** последний коммит 2026-06-20 («Add tmux install script with config and autostart»)

**Что даёт:** Набор скриптов и инструкций базового security-хардинга свежего Ubuntu VPS
(22.04/24.04). Создан по мотивам реального инцидента: сервер был скомпрометирован через
SSH-брутфорс (`PermitRootLogin yes` + парольный вход), атакующий поставил C2-агентов,
криптомайнер, прокси-ноду и бэкдор sudo-аккаунт. Плюс отдельные утилитарные скрипты:
установка Chromium + chrome-devtools-mcp (headless-браузер для MCP) и установка/настройка tmux.

**Какую задачу VPS решает:**
- Отключение парольного SSH-входа и root-по-паролю (`PermitRootLogin prohibit-password`,
  `PasswordAuthentication no`)
- Установка и настройка fail2ban (бан IP после 3-5 неудачных попыток SSH на 1-24 часа,
  в зависимости от скрипта)
- Установка iptables-persistent (сохранение правил фаервола после ребута)
- Аудит: подозрительные systemd-сервисы (nezha, xray, tunnel, argo), подозрительные cron-записи
  (miner, watchdog, rpow), состав группы sudo, открытые порты, объём/количество записей в btmp
  (лог неудачных логинов)
- Отдельно: headless Chromium для браузерной автоматизации через MCP; tmux — чтобы сессии
  (включая Claude Code) не рвались при обрыве SSH

**Как использовать:** 4 сценария на выбор, все требуют root:
1. Ручной путь: `cat 01-hardening-guide-human.md` — читать и выполнять команды самому
2. Через готового Claude Code: `claude "$(cat 02-hardening-prompt-claude-code.md)"` — Claude сам
   проведёт аудит, покажет таблицу проблем, применит исправления с подтверждением
3. Новый сервер + установка Claude Code по API-ключу:
   `chmod +x 03-install-claude-and-harden.sh && ./03-install-claude-and-harden.sh`
   (спросит `ANTHROPIC_API_KEY` интерактивно через `read -s`, не хардкодит)
4. То же, но через подписку Max/Pro: `./03a-install-claude-subscription-and-harden.sh`
   (делает `claude login` с браузерной авторизацией)
5. Без Claude Code вообще, автономно: `chmod +x 04-harden-standalone.sh && ./04-harden-standalone.sh`
   — трёхфазный скрипт (аудит → исправления → отчёт-таблица), лог пишется в
   `/var/log/vps-hardening-<дата>.log`

Дополнительно: `install-tmux.sh`, `install-chromium-devtools.sh` /
`install-chromium-devtools-claude.sh` (второй вариант дополнительно регистрирует MCP-сервер
через `claude mcp add`).

**Требования:** Ubuntu 22.04/24.04, root-доступ, **SSH-ключ ОБЯЗАТЕЛЬНО должен уже лежать**
в `/root/.ssh/authorized_keys` до запуска (иначе скрипты откажутся отключать парольный вход
и потенциально заблокируют доступ). Для сценариев 2-3 — Claude Code CLI, Node.js 20,
API-ключ Anthropic или подписка Max/Pro. Для Chromium-скриптов — Node.js ≥ 18, npm, npx.

**Осторожно:**
- Прямая модификация `/etc/ssh/sshd_config` (`PermitRootLogin`, `PasswordAuthentication`) и
  рестарт SSH-демона — при отсутствии ключа в `authorized_keys` можно потерять доступ к серверу;
  README и все скрипты явно предупреждают об этом и требуют сначала проверить вход по ключу
  в НОВОЙ сессии, не закрывая текущую
- Установка и конфигурация fail2ban (создаёт `/etc/fail2ban/jail.local`, банит IP через iptables)
- Правит iptables (`iptables-persistent`, `netfilter-persistent save`) — сохраняет текущие
  правила фаервола перманентно
- README прямо перечисляет, чего скрипты **не делают**: не включают UFW (может отрезать нужные
  порты без подтверждения), не удаляют сервисы (только предупреждают), не закрывают конкретные
  порты, не настраивают VPN/Tailscale, не настраивают централизованный сбор логов — это остаётся
  на пользователе после базового хардинга
- Секретов/реальных IP/доменов в файлах не найдено (запрос API-ключа делается интерактивно
  через `read -s`, ничего не закоммичено)

**Идемпотентность:** да, `04-harden-standalone.sh` проверяет текущее состояние перед каждым
изменением (`dpkg -l fail2ban`, grep текущих значений в sshd_config) и пропускает шаг, если
уже настроено («fail2ban уже установлен, пропускаю», «SSH уже настроен правильно»). Повторный
запуск безопасен.

**Пригодность для курса:** высокая. Прямое попадание в сценарий курса «переключение со
Claude Code Web/Codespaces на VPS» — можно взять сценарий 3/3a как готовый скрипт первичной
настройки нового VPS с параллельной установкой Claude Code, либо 04 как чистый security-baseline
независимо от Claude Code. Единственное ограничение — заточено под Ubuntu 22.04/24.04, для других
дистрибутивов потребуется адаптация.

---

## djd1m/claude-code-vless-proxy
**Ссылка:** https://github.com/djd1m/claude-code-vless-proxy
**Доступ:** получен
**Тип:** документация (два markdown-файла, кода/скриптов нет — только команды в инструкции)
**Свежесть:** последний коммит 2026-07-16 («Make NVIDIA forum source a clickable inline link»)

**Что даёт:** Клиентская инструкция, как направить трафик **только Claude Code** (не всей
машины) через собственный VLESS+XHTTP прокси-сервер, спрятанный за Cloudflare, — чтобы
работать из региона, где Anthropic недоступен напрямую (актуально для РФ). Плюс отдельный
документ — как восстановить доступ к NVIDIA DGX (DGX OS) через GRUB при забытом пароле
(на случай физического доступа к железу без второго sudo-аккаунта).

**Какую задачу VPS решает:** обход региональной блокировки доступа к Claude/Anthropic API
только для трафика Claude Code, при этом весь остальной трафик машины идёт напрямую (не
полный VPN на всю систему). Требует **уже существующий** сервер с VLESS+XHTTP инбаундом за
Cloudflare — сама настройка серверной части в этом репозитории НЕ описана, только клиент.

**Как использовать (пошагово, дословно из README):**
1. Установить xray: `bash -c "$(curl -L https://github.com/XTLS/Xray-install/raw/main/install-release.sh)" @ install`
2. Прописать клиентский конфиг `/usr/local/etc/xray/config.json`: два inbound'а
   (`http-in` на `127.0.0.1:10809`, `socks-in` на `127.0.0.1:10808`) и один `outbound` типа
   `vless` со `streamSettings.network: "xhttp"`, `security: "tls"`, `xhttpSettings.mode:
   "packet-up"`. Три плейсхолдера подставляются вручную: `YOUR_DOMAIN` (домен за Cloudflare),
   `YOUR_UUID` (UUID клиента с сервера), `YOUR_PATH` (XHTTP-путь)
3. `sudo systemctl restart xray && sudo systemctl enable xray`, проверка через сравнение
   `curl -s https://api.ipify.org` (обычный IP) и `curl -s -x http://127.0.0.1:10809
   https://api.ipify.org` (должен показать IP сервера)
4. Направить именно Claude Code через прокси: `export HTTPS_PROXY=http://127.0.0.1:10809`
   (+ HTTP_PROXY), разово или навсегда через `~/.bashrc`, затем `claude`
5. Логин Claude Code проходит через тот же прокси автоматически, если браузерная страница
   авторизации не открывается — открыть её через любой другой VPN/прокси разово

**Требования:** Linux (Ubuntu, явно протестировано на NVIDIA DGX), root/sudo для установки
xray и правки конфига, **уже готовый и работающий** сервер с VLESS+XHTTP инбаундом за
Cloudflare (проксирование включено, SSL-режим Flexible/Full) — сам сервер настраивается
отдельно, вне этого гайда.

**Осторожно:**
- Правка systemd-конфигурации (`systemctl restart/enable xray`)
- В конфиге фигурируют UUID клиента и домен — но в самом README везде плейсхолдеры
  (`YOUR_DOMAIN`, `YOUR_UUID`, `YOUR_PATH`, пример UUID — все нули), реальных значений
  сервера в репозитории не закоммичено
- Второй файл (`reset-password-dgx.md`) описывает вход в root-shell через GRUB single-user
  mode на физической машине — потенциально опасная операция при ошибке в UUID/именах ядра
  (можно не загрузиться), плюс требует `mount -o remount,rw /` и смену пароля — в файле тоже
  только плейсхолдеры (`(hd0,gpt2)`, нулевой UUID, `USERNAME`, `NewStrongPass123`), реальных
  данных нет
- Секретов/реальных IP/доменов не обнаружено

**Пригодность для курса:** высокая — это ключевой репозиторий для боли курса «доступ к Claude
из РФ». Инструкция самодостаточна для клиентской стороны, но **не закрывает серверную часть**
(поднятие самого VLESS+XHTTP+Cloudflare инбаунда на VPS) — этот шаг придётся либо найти в
другом репозитории пользователя, либо описать отдельно в путеводителе курса.

---

## djd1m/cloudru-vm-cli
**Ссылка:** https://github.com/djd1m/cloudru-vm-cli
**Доступ:** получен
**Тип:** CLI (Go, Cobra), плюс `docker-compose.yml`-пример, `Makefile`, `.goreleaser.yml`,
`.golangci.yml` — полноценный собираемый проект с внутренними пакетами и тестами
**Свежесть:** последний коммит 2026-07-02 («first commit» — репозиторий выглядит как
единственный/первый коммит, то есть моложе остальных двух)

**Что даёт:** CLI `cloudru-vm` для провижининга VM в Cloud.ru и деплоя на неё
docker-compose-проекта одной командой (`cloudru-vm deploy`). Модуль в go.mod и Makefile
называется `github.com/dzhechko/cloudru-vm-cli` (upstream-путь), а origin репозитория —
`github.com/djd1m/cloudru-vm-cli`: похоже на форк/переименованную копию собственного проекта
автора под другим GitHub-логином, без правки module path.

**Какую задачу VPS решает:** провижининг новой VM у облачного провайдера Cloud.ru «под
проект» — включая генерацию SSH-ключа, назначение публичного (floating) IP, перенос
docker-compose файлов по SFTP и запуск `docker compose up -d`, с последующими healthcheck'ами
портов. Поддерживает список зон/образов, автоподбор размера VM под нагрузку из compose,
идемпотентные повторные деплои (по хешу compose-файла), статус/логи/уничтожение окружения.

**Как использовать:**
```bash
# Сборка
git clone https://github.com/djd1m/cloudru-vm-cli && cd cloudru-vm-cli
make build && sudo mv cloudru-vm /usr/local/bin/
# или: go install github.com/dzhechko/cloudru-vm-cli/cmd/cloudru-vm@latest

# Аутентификация — IAM-ключи Cloud.ru
export CLOUDRU_KEY_ID="..."
export CLOUDRU_SECRET="..."
# либо export CLOUDRU_API_KEY="key-id:secret"

# Обязательные параметры проекта
export CLOUDRU_PROJECT_ID="<project-uuid>"
export CLOUDRU_REGION="<availability-zone-uuid>"   # cloudru-vm list-zones
export CLOUDRU_IMAGE_ID="<image-uuid>"             # cloudru-vm list-images

cloudru-vm init      # генерирует .cloudru-vm.yaml (опционально)
cloudru-vm deploy    # провижининг VM + деплой compose-проекта
cloudru-vm status
cloudru-vm logs [--service web --follow]
cloudru-vm verify    # health-check портов
cloudru-vm destroy
```
Внутренний механизм: обмен IAM-ключа на bearer-токен через
`https://iam.api.cloud.ru/api/v1/auth/token` → хеширование compose-файла → авто-подбор
flavor (с запасом 30%) → провижининг VM → ожидание `running` (до 5 мин) → floating IP
(поллинг состояния интерфейса, ретраи на 422) → SSH/SFTP-деплой → health-check → сохранение
состояния деплоя в `.cloudru-vm/state.json`.

**Требования:** Go ≥ 1.24 (для сборки из исходников), учётные данные Cloud.ru IAM
(`CLOUDRU_KEY_ID`+`CLOUDRU_SECRET` либо `CLOUDRU_API_KEY`), project UUID и availability-zone
UUID из личного кабинета Cloud.ru. Готовых бинарных релизов на момент чтения README ещё нет
(«Pre-built binaries will be available… once the first release is published») — то есть
установка возможна пока только сборкой из исходников или `go install`.

**Осторожно:**
- CLI сам генерирует Ed25519 SSH-ключ (`.cloudru-vm/id_ed25519`, OpenSSH-формат) и вписывает
  публичный ключ в `image_metadata` новой VM — то есть управляет ключами доступа к серверу
  автоматически
- Работает напрямую с Cloud.ru Compute/IAM API, требует реальные IAM service-key credentials
- `destroy` необратимо удаляет VM (флаг `--force` пропускает подтверждение)
- В коде есть встроенная санитизация логов от credentials (`internal/log/sanitize.go`,
  regex на `CLOUDRU_API_KEY=...`) — признак того, что об утечке секретов в логи думали заранее
- В README таблицей приведены реальные публичные UUID зон/образов Cloud.ru (`ru.AZ-1/2/3`,
  `ubuntu-22.04` и т.д.) — это справочные общедоступные идентификаторы платформы, не
  приватные данные пользователя; секретов/личных ключей/IP в репозитории не найдено
  (в тестах `logger_test.go` встречаются строки вида `CLOUDRU_API_KEY=abc123def456ghi789jkl0` —
  это фикстуры для теста санитайзера, не реальный секрет)

**Пригодность для курса:** средняя. Мощный инструмент «одна команда — VM с проектом», но
специфичен под Cloud.ru (актуально для курса в РФ-контексте) и требует, чтобы у студента уже
был аккаунт и IAM-ключи Cloud.ru; плюс отсутствие готовых бинарников повышает порог входа
(нужен Go-тулчейн для сборки). Хорошо подходит как опциональный «быстрый старт VM» модуль,
но не как обязательный шаг курса.
