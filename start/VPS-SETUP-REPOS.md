# VPS в облаке — путеводитель по собственным наработкам

Проект удобно начинать в **Claude Code Web** или **GitHub Codespaces**, но в какой-то момент
приходится переключаться на локальный Mac/ПК или на **VPS в облаке**. Этот файл — карта того,
что уже написано в ваших репозиториях и закрывает этот переход.

Полные разборы с командами, требованиями и предупреждениями:
[`/research/vps-sources/`](../research/vps-sources/) — 3 файла, 732 строки.

Проверено **54 из 63** репозиториев аккаунта. Не открыто 9 приватных (низкий приоритет по
названию) — перечислены в `03-sweep.md`.

---

## Быстрый маршрут: «взял VPS → работаю на нём»

| Шаг | Что делаем | Чем |
|---|---|---|
| 1 | Поднять VM в облаке | [`cloudru-vm-cli`](https://github.com/djd1m/cloudru-vm-cli) (если Cloud.ru) |
| 2 | Разведка хоста без изменений | [`corp-infra-bootstrap`](https://github.com/djd1m/corp-infra-bootstrap) → `recon.sh` |
| 3 | Хардининг: SSH, firewall, fail2ban | [`corp-infra-security`](https://github.com/djd1m/corp-infra-security) ⚠️ см. предупреждение |
| 4 | Доступ к серверу: WireGuard, SSH | [`dgx-remote-access`](https://github.com/djd1m/dgx-remote-access) |
| 5 | Доступ к Claude из РФ | [`claude-code-vless-proxy`](https://github.com/djd1m/claude-code-vless-proxy) |
| 6 | Claude Code + LiteLLM на сервере | [`dgx-setup`](https://github.com/djd1m/dgx-setup) |
| 7 | Перенести сессию с ноутбука на VPS | [`dz-harness-hub`](https://github.com/djd1m/dz-harness-hub) → `HANDOFF-laptop-to-vps.md` |
| 8 | **Проверить docker-compose до деплоя** | [`crypto-miner-monitor`](https://github.com/djd1m/crypto-miner-monitor) → `06-fix-plan.md` |
| 9 | Reverse-proxy + автоTLS | [`corp-infra-vpn-proxy`](https://github.com/djd1m/corp-infra-vpn-proxy) |
| 10 | Бэкапы и учения по восстановлению | [`corp-infra-backup`](https://github.com/djd1m/corp-infra-backup) |

**Шаг 8 не пропускать.** Он существует потому, что инцидент уже случился — см. ниже.

---

## 🔴 Прочитать до первого деплоя: реальный инцидент

### [djd1m/crypto-miner-monitor](https://github.com/djd1m/crypto-miner-monitor) · приватный

**Что произошло.** На общем VPS с курсовыми проектами два контейнера PostgreSQL были подняты
в `docker-compose.yml` с портом `0.0.0.0:PORT:5432` и паролем `postgres`. Их взломали через
`COPY ... TO PROGRAM`, залили XMRig-майнер под видом `/tmp/mysql`. Он съел ~780% CPU из 800%.

Это не гипотетический риск из чек-листа — это разбор того, что произошло с проектами
предыдущего потока на общем сервере.

**Что внутри:** сводка диагностики, реестр всех 26 контейнеров на сервере, разбор бинарника
майнера, пошаговый план устранения и systemd-watchdog.

**Как использовать:**
- `06-fix-plan.md` — чек-лист «что проверить в своём `docker-compose.yml` перед деплоем»:
  не биндить БД на `0.0.0.0`, сложные пароли, `ALTER USER` при смене пароля в существующем volume
- `monitor/crypto-miner-watchdog.sh` + `.service` из `07-watchdog-setup.md` — ставится на любой
  VPS с Docker

⚠️ В файлах есть реальный домен и факт скомпрометированного API-ключа. **Репозиторий приватный
и должен таким остаться.** Для занятия пересказывать инцидент, а не показывать файлы.

---

## Кластер corp-infra — пять этапов по порядку

Шесть репозиториев, единый набор, все от 2026-07-29. Реальных секретов нет, только плейсхолдеры.
Задуманы как последовательность: bootstrap → security → vpn-proxy → backup → ent-infra → pop-agents.

### [corp-infra-bootstrap](https://github.com/djd1m/corp-infra-bootstrap) · приватный
Умбрелла-оркестратор: разведка хоста, профили, конфиги провайдеров, state-машина из 5 этапов.
**Безопасная точка входа** — начинать отсюда.

```bash
git clone https://github.com/djd1m/corp-infra-bootstrap.git /opt/corp-infra/bootstrap
/opt/corp-infra/bootstrap/scripts/recon.sh --json | python3 -m json.tool
```

`recon.sh` ничего не меняет — только смотрит. Пригодность для курса: **высокая**.

### [corp-infra-security](https://github.com/djd1m/corp-infra-security) · приватный
Хардининг хоста: `sshd`, `ufw`, `fail2ban`, `auditd`. Плюс escrow секретов через sops + age.

```bash
sudo ./scripts/harden.sh --check    # диагностика без изменений
sudo ./scripts/harden.sh --yes      # ⚠️ применение
```

> ⚠️ **`harden.sh --yes` необратим без запасного доступа.** Скрипт закрывает SSH.
> Если параллельная сессия не открыта и ключ не проверен — вы теряете доступ к серверу.
> На занятии: сначала `--check`, вторая SSH-сессия открыта, только потом `--yes`.

Пригодность: **высокая**, но требует явного предупреждения студентам.

### [corp-infra-vpn-proxy](https://github.com/djd1m/corp-infra-vpn-proxy) · приватный
WireGuard-хаб + два Caddy (public и internal). Универсальный паттерн VPN + reverse-proxy с автоTLS.

```bash
sudo ./scripts/install-wireguard.sh --check
sudo ./scripts/install-wireguard.sh --profile core-16 --yes
```

Пригодность: **высокая** — закрывает и доступ, и публикацию сервисов наружу.

### [corp-infra-backup](https://github.com/djd1m/corp-infra-backup) · приватный
restic по схеме 3-2-1: локально + Backblaze B2 / Yandex KZ / Hetzner. systemd-таймеры и
**обязательные учения по восстановлению**.

```bash
sudo ./scripts/install-backup.sh --check
sudo ./scripts/install-backup.sh --yes --offsite b2
```

Пригодность: **высокая**. Дисциплина проверки восстановления, а не только создания бэкапа, —
редкость; для курса это сильный содержательный блок.

### [corp-infra-ent-infra](https://github.com/djd1m/corp-infra-ent-infra) · приватный
GitLab CE, observability-стек, OpenProject/BookStack/Hugo.

Пригодность: **средняя** — тяжело для учебного VPS, но полезно как референс паттернов.

### [corp-infra-pop-agents](https://github.com/djd1m/corp-infra-pop-agents) · приватный
AI-оператор `opsagent` с моделью привилегий через sudoers: уровни R1/R2/R3.

```bash
sudo ./scripts/install-agent.sh --check   # на чистом хосте вернёт exit 1 — это ожидаемо
sudo ./scripts/install-agent.sh --yes
```

Пригодность: **высокая** для продвинутого модуля про безопасность привилегий AI-агента на сервере.
В `scripts/scrub-log.sh` есть тестовые строки-образцы секретов — это фикстуры для проверки
лог-скраббера, не настоящие данные.

---

## Защита, сеть и доступ

### [djd1m/vps-security](https://github.com/djd1m/vps-security) · публичный
Bash-скрипты + документация, последний коммит 2026-06-20. **Идемпотентный** хардининг Ubuntu VPS:
SSH hardening, fail2ban, iptables-persistent. Плюс утилиты tmux и Chromium-MCP.

Четыре сценария запуска: вручную / через промпт Claude Code / автоустановка Claude Code вместе
с хардинингом / полностью автономно. Секретов нет.

Пригодность: **высокая**. Идемпотентность означает, что повторный запуск безопасен — в отличие от
`corp-infra-security`, это более щадящий вход для студента.

### [djd1m/claude-code-vless-proxy](https://github.com/djd1m/claude-code-vless-proxy) · публичный
Только документация, коммит 2026-07-16. **Ключевой репозиторий для курса**, если студенты в РФ.

Схема: `Claude Code → 127.0.0.1:10809 (локальный xray) → Cloudflare → ваш сервер → Anthropic`.
Через прокси идёт **только трафик Claude Code** (через `HTTPS_PROXY`/`HTTP_PROXY`), остальной
трафик машины — напрямую.

Протокол — VLESS с транспортом **XHTTP** (сознательно вместо WebSocket: устойчивее на
фильтрующих сетях, обоснование есть в README), поверх TLS с fingerprint chrome, за Cloudflare —
обходит DPI, режущий голые IP.

Что внутри: установка xray одной командой, полный JSON-конфиг клиента с тремя плейсхолдерами,
автозапуск через systemd, верификация сравнением `curl` с прокси и без, проброс переменных
окружения именно в сессию Claude Code (разово и через `~/.bashrc`), нюанс `claude login`.
Секретов и реальных доменов нет — везде плейсхолдеры.

> ⚠️ **Главный пробел:** репозиторий закрывает **только клиентскую** сторону. Серверная настройка
> VLESS+XHTTP инбаунда за Cloudflare в нём не описана и предполагается готовой заранее.
> Для курса эту часть придётся описать отдельно — сейчас её нет ни в одном репозитории.

### [djd1m/dgx-remote-access](https://github.com/djd1m/dgx-remote-access) · публичный
Один интерактивный HTML-runbook, коммит 2026-06-12. Три уровня (минимальный/оптимальный/
максимальный): WireGuard на роутере, SSH-хардининг (`PasswordAuthentication no`, смена порта,
`AllowUsers`), xrdp по VPN с фиксом чёрного экрана на GNOME/Wayland, **WireGuard-exit на облачном
VPS** с реальными командами (`wg genkey`, `iptables MASQUERADE`, `sysctl net.ipv4.ip_forward=1`,
systemd-юнит), UFW.

Готовый чек-лист «получил VPS → защитил его». Пригодность: **высокая**.

---

## Провижининг и деплой

### [djd1m/cloudru-vm-cli](https://github.com/djd1m/cloudru-vm-cli) · публичный
Полноценный CLI на Go/Cobra, единственный коммит 2026-07-02. Провижининг VM в Cloud.ru **и**
деплой docker-compose одной командой:

```bash
cloudru-vm deploy
```

IAM-аутентификация, автоматический floating IP, авто-сайзинг VM, идемпотентные повторные деплои.
Собирается из исходников — готовых релизов пока нет.

Пригодность: **средняя** — специфично под Cloud.ru и требует Go-тулчейна.

### [djd1m/dgx-setup](https://github.com/djd1m/dgx-setup) · публичный
Самодиагностирующиеся install-скрипты (Claude Code, LiteLLM, bootstrap прокси) +
`docker-compose.litellm.yml`. Несмотря на название — **платформенно-независимы**, применимы к
любому VPS, не только к DGX.

### [djd1m/aicoding-space-site](https://github.com/djd1m/aicoding-space-site) · приватный
Реальные ADR для **не-Docker** паттерна деплоя: Timeweb Cloud RU VPS + GitHub Actions + rsync +
PM2 + nginx, с явным обоснованием выбора вокруг доступности из РФ.

Полезен как альтернатива основному паттерну курса, когда Docker избыточен.
⚠️ Содержит реальный домен — в отчёте не воспроизведён.

### [djd1m/2026-PU-APR-LESSON-01](https://github.com/djd1m/2026-PU-APR-LESSON-01) · публичный
Рабочий `docker-compose.prod.yml` + Watchtower + Caddy. Плюс конкретные грабли Docker/Prisma:
Alpine + OpenSSL, `.dockerignore`, отсутствующий `DATABASE_URL`.

Пригодность: **высокая** как готовый рабочий пример того самого паттерна, что задан
Architecture Constraints курса.

---

## Переключение сессии Claude Code на VPS

### [djd1m/dz-harness-hub](https://github.com/djd1m/dz-harness-hub) · приватный
Исходник тулкита `p-replicator` и `harness-cli`. Из относящегося к переходу на VPS:

- **`HANDOFF-laptop-to-vps.md`** — реальный пример передачи сессии Claude Code с ноутбука
  (Windows) на VPS (Linux) **посреди фичи**. Причина переключения — риск OOM при мутационном
  тестировании на 16 ГБ. Есть команды продолжения (`git pull`, `pnpm install`, `pnpm -r test`)
  и синхронизация состояния Claude через `scripts/roam-claude-state.sh --apply`
  (симлинк `~/.claude/projects/...` → `roam/claude-state/`).
- `templates/.claude/commands/deploy.md` — тот самый `/deploy`, что стоит в текущем проекте.
- `cc-toolkit-generator-enhanced/modules/05-generate-p2p3.md` — генератор проверяет наличие
  Coolify в `Architecture.md` при построении тулкита.

Пригодность: **средняя** — это не про настройку сервера, а про **процесс переключения**, то есть
ровно про тот момент курса, который вы описали. ⚠️ Монорепозиторий на 8209+ файлов, большая часть
к VPS отношения не имеет.

---

## Чего в репозиториях нет

Честные пробелы — их придётся закрывать отдельно:

| Пробел | Комментарий |
|---|---|
| **Серверная часть VLESS+XHTTP за Cloudflare** | Клиент описан, сервер — нет. Самый заметный пробел для курса |
| Провижининг у AdminVPS / HOSTKEY | `cloudru-vm-cli` — только Cloud.ru, а Architecture Constraints называют AdminVPS/HOSTKEY |
| Единый сквозной сценарий «с нуля до задеплоенного проекта» | Есть куски у разных репозиториев, единого прохода нет |

Курсовые проекты предыдущих потоков (Odoo, Substack, WHOOP, Apollo, Instantly и др.) проверены
и признаны нерелевантными: они используют тот же типовой шаблон «Docker Compose + nginx на VPS»,
что уже описан в правилах пайплайна, и нового знания о настройке сервера не добавляют.
