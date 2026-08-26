# Среды установки: Claude Code Web, Codespaces, VPS, локальная машина

Честный разбор различий сред для установки `p-replicator` и `harness-cli` (+ `ruflo`,
`skills-feature-adr`). Все выводы команд ниже — реальные, сняты из этой самой сессии
Claude Code Web 2026-08-26, если не помечено иначе.

## TL;DR — таблица сравнения

| Среда | Глобальный `npm i -g` переживает пересоздание | Нужен `sudo` | Рекомендация |
|---|---|---|---|
| **Claude Code Web** (эта среда) | **Нет** (доказательства ниже) | Нет, уже `root` | `npx <pkg>@latest init`; глобальную ставить заново каждую сессию |
| **GitHub Codespaces** | Нет для голого контейнера; **да**, если через `devcontainer.json` — *не проверено вживую* | Обычно есть, лучше без него | `postCreateCommand: npm i -g ...`, коммитится в репо |
| **VPS (Ubuntu/Debian)** | Да — постоянный диск | Нужен для системного `prefix`, не нужен при `~/.npm-global` | NodeSource/nvm, `~/.npm-global` без sudo |
| **Локальный Mac/ПК** | Да — постоянный диск | Нет (brew/nvm в `$HOME`) | brew/nvm, PATH через shell rc |

## Главный вопрос: переживает ли глобальный npm-пакет перезапуск сессии в Claude Code Web

**Короткий ответ: нет, устойчивого хранения глобальных npm-пакетов между пересозданиями
контейнера обнаружить не удалось — есть прямые улики против.** Доказать это на 100%
можно только реальным пересозданием контейнера, а я не могу его инициировать из
сессии — поэтому доказательства ниже **косвенные, но воспроизводимые**, это явно
помечено.

### Улики

**1. Где физически лежат пакеты — вне рабочей директории проекта:**
```
$ which node npm            → /opt/node22/bin/{node,npm}
$ npm config get prefix     → /opt/node22
$ npm root -g                → /opt/node22/lib/node_modules
```
`/opt` — не `/home/user/2026-AUG-PU-Projects` (репозиторий). Глобальная установка в
принципе не относится к тому, что "переезжает" вместе с git.

**2. Раздел диска — обычный rw ext4, не отдельный volume и не tmpfs:**
```
$ df -h → /dev/vda   252G   11G   27G  28%   /
$ mount | grep "on / " → /dev/vda on / type ext4 (rw,relatime,...)
```
Вопрос не в типе ФС, а в том, живёт ли сам диск контейнера дольше одной сессии.

**3. Возраст файлов относительно старта контейнера — решающая улика:**
```
$ uptime -s                                            → 2026-08-26 10:11:09 (старт контейнера)
$ stat /home/user            | grep Birth              → Birth: 2026-08-26 10:30:27 (git clone)
$ stat .../node_modules/@dzhechkov                      → Access: 2026-08-26 10:31:37
$ stat .../node_modules/ruflo                           → Access: 2026-08-26 10:32:16
$ git log --format="%h %ad %s" -- README.md | tail -1  → 10:34:24 "Add README with installed toolchain"
```
Базовые тулы в `/opt` (`node20/21/22`, `ruby-3.x`, `gradle`, `maven`) датированы
**31 марта** — часть образа, собранного задолго до сессии. А `@dzhechkov/*` и `ruflo`
появились через ~1–2 минуты **после** `git clone` этого репозитория в текущем
контейнере, и это же README (уже лежащее в git с прошлой сессии с инструкцией по
установке) пришлось закоммитить заново в эту сессию. То есть **в момент старта именно
этого контейнера пакетов не было** — их поставили заново, хотя инструкция по установке
уже была в репозитории от прошлой сессии. Будь диск/образ общим между сессиями —
пакеты стояли бы с рождения контейнера.

**4. Среда — не кастомный образ курса:**
```
list_environments → [{"name":"Github","kind":"anthropic_cloud"},
                      {"name":"Default","kind":"anthropic_cloud"}]
```
Обе — стандартные `anthropic_cloud`, не образ с вшитыми `@dzhechkov/*`.

**5. Контрпример, честно — `/tmp` хранит мусор чужих проектов:**
```
$ find / -maxdepth 2 -iname "*README*"
/tmp/readme_2026-APR-PU-LESSON-06-appolo-io-02.md
/tmp/readme_hermes-agent.md
/tmp/readme_buzz.md   ... (40+ файлов из совсем других проектов курса)
```
Пул контейнеров явно **переиспользуется** между сессиями/пользователями (иначе откуда
чужие README в `/tmp`), а не поднимается каждый раз с абсолютно чистого диска. Но для
конкретно `@dzhechkov/*`/`ruflo` это не сработало (улика 3) — то, какой именно "мусор"
долетит до следующей сессии, непредсказуемо и не управляемо. Полагаться на это нельзя.

**Вывод:** глобальный `npm i -g` в Claude Code Web — состояние конкретного контейнера,
не проекта. Проект гарантированно переживает пересоздание (файлы в git), глобальные
пакеты — нет: подтверждено тем, что в этой сессии их пришлось ставить заново несмотря
на README из прошлой сессии. **Рекомендация: не полагаться на глобальную установку —
использовать `npx <pkg>@latest ...` (ставит ad hoc на каждый вызов) либо
переустанавливать явно в начале каждой сессии.** Механизма авто-восстановления в
репозитории нет — искал явно:
```
$ find . -iname "*.devcontainer*" -o -iname "devcontainer.json" -o -iname "setup.sh"  → пусто
$ find .github -type f                                                                 → пусто/нет каталога
$ grep -A3 SessionStart .claude/settings.json
"command": "node .claude/hooks/session-insights.cjs"   # только печатает инсайты, не npm install
```
Если нужна переустановка автоматически — добавить `npm install -g ...` в свой
`SessionStart`-хук в `.claude/settings.json` (команда уже есть в `README.md`, раздел
«Переустановка»).

## Рецепт по средам

### 1. Claude Code Web (эта среда)

- Node `v22.22.2`, npm `10.9.7`, лежат в `/opt/node22` (образ).
- Пользователь `root` (`id` → `uid=0`) — `sudo` не нужен, он и так root.
- `registry.npmjs.org` доступен напрямую, без прокси:
  ```
  $ env | grep npmjs   → no_proxy=...,registry.npmjs.org,...   (реестр в списке исключений)
  $ curl -sS -o /dev/null -w "%{http_code} %{time_total}s\n" https://registry.npmjs.org/@dzhechkov/p-replicator
  200 0.14s
  ```
  Прокси `HTTPS_PROXY=http://127.0.0.1:44465` — egress-политика для Claude/остального
  трафика (`/root/.ccr/README.md`), но npm до реестра ходит в обход неё.
- Рецепт:
  ```bash
  npx @dzhechkov/p-replicator@latest init
  npx @dzhechkov/harness-cli@latest init --target claude
  # или явный бинарь на сессию (придётся повторять на следующей сессии):
  npm install -g @dzhechkov/harness-cli @dzhechkov/p-replicator @dzhechkov/skills-feature-adr ruflo
  ```

### 2. GitHub Codespaces — *не проверено вживую, только по документации*

По документации Codespaces `postCreateCommand`/`features` из `devcontainer.json`
выполняются заново при каждом пересоздании контейнера (Rebuild/новый Codespace) — верный
способ получить пакеты гарантированно, а не полагаться на ручной `npm i -g` в
терминале (живёт, пока жив конкретный Codespace, теряется при rebuild — по аналогии с
Claude Code Web, но на реальном Codespaces не проверял).

```jsonc
// .devcontainer/devcontainer.json
{
  "name": "pu-projects",
  "image": "mcr.microsoft.com/devcontainers/javascript-node:22",
  "postCreateCommand": "npm install -g @dzhechkov/harness-cli @dzhechkov/p-replicator @dzhechkov/skills-feature-adr ruflo",
  "remoteUser": "node"
}
```

`javascript-node:22` даёt Node ≥20 — хватает всем четырём пакетам (см. `engines` ниже).
Альтернатива без глобальной установки — тот же `npx <pkg>@latest init` в
`postCreateCommand`, надёжнее: не зависит от того, попал ли шаг в конкретный ребилд.

### 3. VPS (Ubuntu/Debian)

`engines` (снято `npm view <pkg> engines`):
```
@dzhechkov/p-replicator   { node: '>=16.0.0' }
@dzhechkov/harness-cli    { node: '>=20' }
ruflo                     { node: '>=20.0.0' }
```
Берите **Node 20 LTS или новее** — покрывает все три пакета; на голом Node 16
`harness-cli`/`ruflo` не встанут корректно.

```bash
# NodeSource (нужен sudo один раз):
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# или nvm (без sudo вообще):
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
nvm install 22
```

Чтобы `npm install -g` не требовал `sudo` (Node ставили системно через apt/NodeSource;
nvm и так пишет в `$HOME`):
```bash
mkdir -p ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc && source ~/.bashrc
npm install -g @dzhechkov/harness-cli @dzhechkov/p-replicator @dzhechkov/skills-feature-adr ruflo
```

Диск на VPS постоянный — установленное переживает перезагрузки/переподключения по SSH;
риск только при пересоздании самой VM, что не относится к обычной эксплуатации.

### 4. Локальный Mac/ПК (не тестировалось в этой сессии — общий факт)

- **brew**: `brew install node@22` → `/opt/homebrew` (Apple Silicon) или `/usr/local`
  (Intel), глобальные пакеты рядом, без `sudo`, переживают перезагрузки.
- **nvm**: то же в `~/.nvm`, удобно при нескольких версиях Node.
- Отличие от VPS/Codespaces — PATH через `~/.zshrc`/`~/.bash_profile`; частая причина
  `command not found` при уже установленном пакете — несколько Node в PATH (brew vs
  system Node).

## Доступ из РФ — не путать реестр npm и API Claude

`start/VPS-SETUP-REPOS.md` (раздел `djd1m/claude-code-vless-proxy`) описывает схему:
`Claude Code → 127.0.0.1:10809 (xray) → Cloudflare → сервер → Anthropic`. Через
`HTTPS_PROXY`/`HTTP_PROXY` идёт **только трафик самого Claude Code** (API Anthropic) —
отдельная от установки npm-пакетов проблема. `registry.npmjs.org` в РФ обычно доступен
напрямую (подтверждено в этой сессии: прямой `curl` без прокси, 200, 0.14с, домен явно
в `no_proxy`). Поэтому `npm install -g`/`npx` обычно **не требуют** VLESS-прокси; он
нужен исключительно чтобы `claude` достучался до `api.anthropic.com`. Не путайте эти два
разных отказа: «не ставится npm-пакет» и «Claude Code не подключается» лечатся по-разному.

## Единый чек-лист проверки после установки (любая среда)

```bash
node -v                                               # >=20 для harness-cli/ruflo, >=16 для p-replicator
npm -v
which p-replicator harness-cli dz ruflo 2>/dev/null   # бинарь виден в PATH?
npm ls -g --depth=0 | grep -E "dzhechkov|ruflo"       # пакет реально в глобальном дереве?
p-replicator --version && p-replicator doctor         # doctor → "all passed"
harness-cli --version 2>/dev/null || dz --version     # бинарь harness-cli — команда `dz`
skills-feature-adr doctor 2>/dev/null
ruflo doctor
```
Однозначное «всё встало» = все четыре `--version`/`doctor` без `command not found` и без
ошибок внутри `doctor`, а `npm ls -g` показывает пакеты с ожидаемой версией.

## Не проверено / не смог установить точно

- **GitHub Codespaces** — раздел выше основан на документации и общем поведении
  devcontainer-жизненного цикла, не на реальном запуске. Не проверял, переживает ли
  ручной `npm i -g` простой Stop/Resume (без Rebuild) — по документации такой сценарий
  обычно сохраняет контейнер, но не тестировал на реальном аккаунте.
- **Claude Code Web между произвольными сессиями** — наблюдал один цикл (эта сессия
  унаследовала пустой `/opt/node22/lib/node_modules` от прошлой). Не могу гарантировать,
  что *каждая* новая сессия получает чистый `/opt` — только что эта его получила таким,
  а общая инфраструктура (мусор в `/tmp`) явно не даёт per-project гарантий вне git.
- **VPS** — рецепт по общеизвестной практике, не по факту выполненной команды: нет VPS
  под рукой в этой сессии.
- **Локальный Mac/ПК** — аналогично, общие факты про brew/nvm, не проверено здесь.
