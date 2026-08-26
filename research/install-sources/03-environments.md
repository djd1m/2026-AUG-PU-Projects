# Среды установки: Claude Code Web, Codespaces, VPS, локальная машина

Честный разбор различий сред для установки `p-replicator` и `harness-cli` (+ `ruflo`,
`skills-feature-adr`). Все выводы команд ниже — реальные, сняты из этой самой сессии
Claude Code Web 2026-08-26, если не помечено иначе.

## TL;DR — таблица сравнения

| Среда | Глобальный `npm i -g` переживает пересоздание | Нужен `sudo` | Рекомендация |
|---|---|---|---|
| **Claude Code Web** (эта среда) | **Нет** (см. доказательства ниже) | Нет, уже `root` | `npx <pkg>@latest init` в проекте; глобальную установку делать заново каждую сессию, если нужна CLI-эргономика |
| **GitHub Codespaces** | Нет для голого контейнера; **да**, если прописать в `devcontainer.json` (`postCreateCommand`/`features`) — *не проверено вживую* | Обычно есть, но лучше без него | `postCreateCommand: npm i -g ...` в `devcontainer.json`, коммитится в репо |
| **VPS (Ubuntu/Debian)** | Да — постоянный диск | Нужен для `npm i -g` в системный `prefix`, **не нужен** при `~/.npm-global` | NodeSource или nvm, `~/.npm-global` без sudo |
| **Локальный Mac/ПК** | Да — постоянный диск | Нет (brew/nvm ставят в `$HOME`) | brew/nvm, PATH через shell rc |

## Главный вопрос: переживает ли глобальный npm-пакет перезапуск сессии в Claude Code Web

**Короткий ответ: нет, устойчивого хранения глобальных npm-пакетов между пересозданиями
контейнера в этой среде обнаружить не удалось — и есть прямые косвенные улики, что их
нет.** Полноценно доказать это можно только реальным пересозданием контейнера, а я не
могу его инициировать из сессии — поэтому ниже все доказательства **косвенные, но
воспроизводимые**, и это явно помечено.

### Улика 1 — где физически лежат глобальные пакеты

```
$ node -v && npm -v
v22.22.2
10.9.7
$ which node npm
/opt/node22/bin/node
/opt/node22/bin/npm
$ npm config get prefix
/opt/node22
$ npm root -g
/opt/node22/lib/node_modules
```

`npm root -g` — внутри `/opt`, вне рабочей директории `/home/user/2026-AUG-PU-Projects`
(репозитория). Это отдельная от проекта область — то есть глобальная установка в принципе
не относится к тому, что "переезжает" вместе с git-репо.

### Улика 2 — раздел диска

```
$ df -h
Filesystem      Size  Used Avail Use% Mounted on
/dev/vda        252G   11G   27G  28% /
...
$ mount | grep -E "on / "
/dev/vda on / type ext4 (rw,relatime,resv_strict,...)
```

`/opt/node22` лежит на корневом `/dev/vda` (rw, обычный ext4) — **не** отдельный volume,
не tmpfs. То есть технически он самый обычный файл на диске контейнера — вопрос не в
типе ФС, а в том, живёт ли сам диск контейнера дольше одной сессии.

### Улика 3 — возраст файлов относительно старта контейнера

```
$ uptime -s
2026-08-26 10:11:09     # старт этого контейнера
$ stat /home/user | grep Birth
Birth: 2026-08-26 10:30:27
$ stat /opt/node22/lib/node_modules/@dzhechkov
Access: 2026-08-26 10:31:37
$ stat /opt/node22/lib/node_modules/ruflo
Access: 2026-08-26 10:32:16
$ git log --format="%h %ad %s" --date=iso -- README.md | tail -1
80e742a 2026-08-26 10:34:24 +0000 Add README with installed toolchain
```

Пакеты `@dzhechkov/*` и `ruflo`, которых нет в базовом наборе `/opt` (там же лежат
`node20/21/22`, `ruby-3.x`, `gradle`, `maven` — датированы **31 марта**, то есть это
часть образа, собранного задолго до этой сессии), появились в `/opt/node22/lib/node_modules`
**через ~1–2 минуты после рождения `/home/user`**, то есть после `git clone` этого
репозитория в текущем контейнере. Коммит README, документирующий этот `npm install -g`,
сделан этой же сессией через 4 минуты после старта. Другими словами: **в момент старта
именно этого контейнера этих пакетов не было** — их пришлось ставить заново, хотя
`README.md` в git уже содержит инструкцию по их установке из **прошлой** сессии. Если бы
образ контейнера или сам диск переживал сессии как есть, эти пакеты были бы на месте с
рождения контейнера — их не было.

### Улика 4 — курсовая среда не кастомный образ

```json
list_environments → [
  {"name":"Github","kind":"anthropic_cloud"},
  {"name":"Default","kind":"anthropic_cloud"}
]
```

Обе доступные среды — стандартные `anthropic_cloud`, не курсовой кастомный образ с
предустановленными `@dzhechkov/*`. Значит, надежды на "эти пакеты специально вшиты в
образ курса" нет — они реально ставятся заново.

### Улика 5 (контрпример, честно) — `/tmp` хранит мусор чужих проектов

```
$ find / -maxdepth 2 -iname "*README*" ... 
/tmp/readme_2026-APR-PU-LESSON-06-appolo-io-02.md
/tmp/readme_hermes-agent.md
/tmp/readme_buzz.md
... (40+ файлов из совершенно других, не связанных проектов курса)
```

Это показывает, что базовая VM/пул контейнеров **переиспользуется** между сессиями
разных пользователей/проектов (иначе откуда в `/tmp` остатки чужих `README`), а не
поднимается каждый раз с абсолютно чистого диска. Это могло бы намекать, что и
`/opt/node22` тоже иногда что-то "наследует" от предыдущего съёмщика слота. Но для
конкретно `@dzhechkov/*` и `ruflo` этого не произошло (Улика 3) — то есть даже если пул
переиспользуется, какой конкретно "мусор" долетит до следующей сессии — не предсказуемо
и не управляемо с нашей стороны. Полагаться на это нельзя.

**Вывод:** глобальный `npm i -g` в Claude Code Web — это состояние конкретного
контейнера, а не проекта. Проект гарантированно переживает пересоздание (файлы в git),
глобальные пакеты — нет, что подтверждено тем, что в этой самой сессии их пришлось
ставить заново несмотря на README из прошлой сессии. **Рекомендация: не полагаться на
глобальную установку в Claude Code Web вообще — использовать `npx <pkg>@latest ...`,
которая ставит бинарь ad hoc на каждый вызов, либо переустанавливать явно в начале
каждой сессии** (см. чек-лист ниже). Ни в `.claude/settings.json` (SessionStart-хук
только печатает инсайты, `session-insights.cjs`), ни в `.devcontainer/`, ни в `setup.sh`,
ни в `.github/` этого репозитория **нет** механизма, который переустанавливал бы npm-пакеты
при старте сессии — я явно искал и не нашёл:

```
$ find . -iname "*.devcontainer*" -o -iname "devcontainer.json" -o -iname "setup.sh"
(пусто)
$ find .github -type f
(пусто / каталога нет)
$ cat .claude/settings.json | grep -A3 SessionStart
"command": "node .claude/hooks/session-insights.cjs"   # только чтение инсайтов, не npm install
```

Если нужна переустановка при каждом старте — единственный надёжный способ это
получить именно в Claude Code Web — добавить `npm install -g ...` в свой собственный
`SessionStart`-хук (`.claude/settings.json`) или просто держать команду под рукой
(она уже есть в `README.md` этого проекта, раздел «Переустановка»).

## Рецепт по средам

### 1. Claude Code Web (эта среда)

- Node: `v22.22.2`, npm `10.9.7`, установлены заранее в `/opt/node22` (образ).
- Пользователь — `root` (`id` → `uid=0`), `sudo` не нужен вообще, он и так root.
- Сеть до `registry.npmjs.org` прямая, без прокси:
  ```
  $ env | grep -i proxy | grep -i npmjs
  no_proxy=...,registry.npmjs.org,...        # npm-реестр в списке ИСКЛЮЧЕНИЙ прокси
  $ curl -sS -o /dev/null -w "HTTP %{http_code} %{time_total}s\n" https://registry.npmjs.org/@dzhechkov/p-replicator
  HTTP 200 0.14s
  ```
  Прокси (`HTTPS_PROXY=http://127.0.0.1:44465`) в этой среде — политика egress для
  Claude/остального трафика (`/root/.ccr/README.md`), но `npm` до реестра ходит
  напрямую, в обход него (домен в `no_proxy`).
- Практический рецепт:
  ```bash
  npx @dzhechkov/p-replicator@latest init
  npx @dzhechkov/harness-cli@latest init --target claude
  # либо, если нужен именно бинарь в PATH на сессию:
  npm install -g @dzhechkov/harness-cli @dzhechkov/p-replicator @dzhechkov/skills-feature-adr ruflo
  ```
  Второй вариант придётся повторять при каждой новой сессии/контейнере — см. вывод выше.

### 2. GitHub Codespaces — *не проверено вживую, только по документации/аналогии*

По документации Codespaces: контейнер пересоздаётся из образа при "Rebuild container"
и при удалении/новом Codespace, а `postCreateCommand`/`features` в `devcontainer.json`
выполняются заново на каждом пересоздании — то есть верный способ получить глобальные
пакеты — прописать установку туда, а не полагаться на живой `npm i -g`, введённый руками
в терминале (он живёт, пока жив конкретный Codespace, и теряется при rebuild/новом
Codespace — по аналогии с Claude Code Web, но не проверял на реальном Codespaces).

Готовый фрагмент `.devcontainer/devcontainer.json`:

```jsonc
{
  "name": "pu-projects",
  "image": "mcr.microsoft.com/devcontainers/javascript-node:22",
  "postCreateCommand": "npm install -g @dzhechkov/harness-cli @dzhechkov/p-replicator @dzhechkov/skills-feature-adr ruflo",
  "remoteUser": "node"
}
```

Замечания:
- `postCreateCommand` гарантированно перезапускается при пересоздании (по документации
  GitHub) — это и есть аналог "SessionStart hook" для Codespaces.
- Образ `javascript-node:22` уже даёт Node ≥20, чего достаточно для всех четырёх пакетов
  (см. `engines` ниже).
- Альтернатива без глобальной установки — тот же `npx <pkg>@latest init` в
  `postCreateCommand` или прямо в первой команде сессии; надёжнее, потому что не зависит
  от того, попал ли `postCreateCommand` в конкретный ребилд.

### 3. VPS (Ubuntu/Debian)

`engines` пакетов (снято `npm view <pkg> engines`):

```
@dzhechkov/p-replicator   { node: '>=16.0.0' }
@dzhechkov/harness-cli    { node: '>=20' }
ruflo                     { node: '>=20.0.0' }
```

Итог: берите **Node 20 LTS или новее** (22 LTS тоже ок) — это покрывает все три пакета
разом; на голом Node 16 `harness-cli` и `ruflo` откажутся ставиться/работать корректно.

Установка Node — рекомендация: **NodeSource** для системного пакета или **nvm** для
пользовательского, без root:

```bash
# NodeSource (системно, нужен sudo один раз):
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# или nvm (без sudo вообще, в $HOME):
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
nvm install 22
```

Чтобы `npm install -g` не требовал `sudo` (когда Node ставили системно через apt/NodeSource,
а не через nvm — nvm и так пишет в `$HOME`):

```bash
mkdir -p ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc && source ~/.bashrc
npm install -g @dzhechkov/harness-cli @dzhechkov/p-replicator @dzhechkov/skills-feature-adr ruflo
```

На VPS диск постоянный (обычный SSD/NVMe тома провайдера) — установленное **переживает**
перезагрузки и переподключения по SSH; единственный риск — пересоздание самой VM
(снос и новый образ), что не относится к обычной эксплуатации VPS.

### 4. Локальный Mac/ПК

Кратко (не тестировалось в этой сессии — общий факт, не специфичный для этого проекта):

- **brew**: `brew install node@22` — ставит в `/opt/homebrew` (Apple Silicon) или
  `/usr/local` (Intel), глобальные npm-пакеты — в подкаталог того же префикса, без
  `sudo`, переживают перезагрузки как обычные файлы на диске.
- **nvm**: то же самое, но в `~/.nvm`, удобно при нескольких версиях Node.
- Отличие от VPS/Codespaces — PATH настраивается не системным профилем, а
  `~/.zshrc`/`~/.bash_profile`, которые нужно **явно** проверить, если `npm install -g`
  ставит бинарь, а `command not found` всё равно происходит (типичная причина —
  несколько Node в PATH одновременно, brew vs system Node).

## Доступ из РФ — не путать реестр npm и API Claude

В `start/VPS-SETUP-REPOS.md` (раздел про `djd1m/claude-code-vless-proxy`) описана схема:

```
Claude Code → 127.0.0.1:10809 (локальный xray) → Cloudflare → сервер → Anthropic
```

Через `HTTPS_PROXY`/`HTTP_PROXY` идёт **только трафик самого Claude Code** (обращения к
API Anthropic). Это отдельная проблема от установки npm-пакетов: `registry.npmjs.org`
в РФ, как правило, доступен напрямую (это подтверждено и в этой сессии — прямой `curl`
без прокси отработал за 0.14с, реестр даже явно в списке `no_proxy`). Поэтому:
`npm install -g ...` / `npx ...` обычно **не требуют** VLESS-прокси и должны отрабатывать
и без него; прокси нужен исключительно чтобы сам `claude` смог достучаться до
`api.anthropic.com`. Не переносите настройку прокси с одной проблемы на другую — если
`npm install` не работает, а `claude` работает (или наоборот), это два разных отказа с
разными причинами.

## Единый чек-лист проверки после установки (любая среда)

```bash
node -v                                   # >= 20 для harness-cli/ruflo, >=16 для p-replicator
npm -v
which p-replicator harness-cli dz ruflo 2>/dev/null   # бинарь виден в PATH?
npm ls -g --depth=0 | grep -E "dzhechkov|ruflo"       # пакет реально в глобальном дереве?
p-replicator --version && p-replicator doctor         # doctor должен закончиться "all passed"
harness-cli --version 2>/dev/null || dz --version     # бинарь harness-cli — команда `dz`
skills-feature-adr doctor 2>/dev/null
ruflo doctor
```

Однозначный ответ "всё встало" = все четыре `--version`/`doctor` отработали без
`command not found` и без ошибок в самом `doctor`, а `npm ls -g` показывает нужные пакеты
с ожидаемой версией (при желании — сверить с `npm view <pkg> version`, актуальная версия
в реестре).

## Не проверено / не смог установить точно

- **GitHub Codespaces** — весь раздел выше основан на документации GitHub Codespaces и
  на общем поведении devcontainer-жизненного цикла, не на реальном запуске. Не проверял
  вживую, останется ли `npm i -g`, сделанный вручную в уже открытом Codespace, после
  простого "Stop"/"Resume" (без Rebuild) — по документации Codespaces такой сценарий
  обычно **сохраняет** контейнер (это не то же самое, что "Rebuild container" или новый
  Codespace), но я не тестировал это на реальном аккаунте.
- **Поведение Claude Code Web при следующей "новой" сессии в том же проекте** — я
  наблюдал только один цикл (эта сессия унаследовала пустой `/opt/node22/lib/node_modules`
  от предыдущей сессии, судя по README). Я не могу гарантировать, что *каждая* новая
  сессия всегда получает чистый `/opt` — только что *эта* его получила таким, и что
  общая инфраструктура (см. мусор в `/tmp`) явно не даёт per-project гарантий сохранности
  вне git.
- **VPS**: не проверял реальный `apt`/`nodesource`-инсталл в этой сессии (нет VPS под
  рукой) — рецепт даётся по общеизвестной практике, не по факту выполненной команды в
  этой среде.
- **Локальный Mac/ПК**: аналогично, не тестировалось из этой сессии — общие факты про
  brew/nvm, не специфическая проверка.
