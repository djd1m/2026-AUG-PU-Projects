# Установка тулкита: p-replicator и harness-cli

Инструкция по установке в четырёх средах. Всё проверено запуском команд —
детальные разборы с реальным выводом: [`/research/install-sources/`](../research/install-sources/).

| Пакет | Бинарь | Зачем |
|---|---|---|
| [`@dzhechkov/p-replicator`](https://www.npmjs.com/package/@dzhechkov/p-replicator) | `p-replicator` | Команда `/replicate` — основной пайплайн курса |
| [`@dzhechkov/harness-cli`](https://www.npmjs.com/package/@dzhechkov/harness-cli) | `dz` | Мета-харнесс: компиляция скиллов под 10 платформ |

Требования: **Node ≥ 20** (p-replicator формально ≥16, но `dz` требует 20).

---

## 🔴 Главное, что нужно понять до установки

**В Claude Code Web глобально установленный пакет не переживает пересоздание контейнера.**

Проверено в этой сессии: базовые инструменты в `/opt` (node, ruby, gradle) датированы образом,
а `@dzhechkov/*` появились в `/opt/node22/lib/node_modules` через 1–2 минуты **после** `git clone`
репозитория — то есть их ставили заново, хотя инструкция уже лежала в git с прошлой сессии.
Механизма авто-восстановления в репозитории нет.

Отсюда главный вывод, к которому пришли два независимых исследования:

> **Значение имеет не установленный бинарь, а закоммиченные `.claude/` и `.p-replicator.json`.**
> Пока они в git, проект восстанавливается в любой новой сессии, даже если пакет пропал.

Поэтому в эфемерных средах ставим через `npx` без установки, а не `npm i -g`.

---

## Рецепт по средам

| Среда | Переживает пересоздание | sudo | Способ |
|---|---|---|---|
| **Claude Code Web** | ❌ нет | не нужен (root) | `npx <pkg>@latest` каждую сессию |
| **GitHub Codespaces** | ❌ голый контейнер / ✅ через devcontainer | обычно есть | `postCreateCommand` |
| **VPS** | ✅ да | не нужен при своём префиксе | NodeSource или nvm |
| **Локальный Mac/ПК** | ✅ да | нет | brew или nvm |

### Claude Code Web

Ничего не ставим глобально — вызываем напрямую:

```bash
npx @dzhechkov/p-replicator@latest init
npx @dzhechkov/harness-cli@latest doctor
```

Затем **обязательно коммитим** — это и есть способ не потерять настройку:

```bash
git add .claude .p-replicator.json && git commit -m "chore: toolkit" && git push
```

### GitHub Codespaces

Чтобы пакеты переживали пересоздание — в `.devcontainer/devcontainer.json`:

```json
{
  "image": "mcr.microsoft.com/devcontainers/javascript-node:20",
  "postCreateCommand": "npm i -g @dzhechkov/p-replicator @dzhechkov/harness-cli"
}
```

> ⚠️ Поведение Codespaces при Stop/Resume вживую не проверялось — рецепт по документации.

### VPS (Ubuntu/Debian)

Node из NodeSource, глобальные пакеты **без sudo** через собственный префикс:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

mkdir -p ~/.npm-global
npm config set prefix ~/.npm-global
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc && source ~/.bashrc

npm i -g @dzhechkov/p-replicator @dzhechkov/harness-cli
```

Префикс в домашней директории избавляет от `sudo npm i -g` — а это одна из типовых причин
поломанных прав в `node_modules`.

### Локальный Mac/ПК

```bash
brew install node          # либо nvm install 22
npm i -g @dzhechkov/p-replicator @dzhechkov/harness-cli
```

---

## Новый проект с нуля — проверенная последовательность

```bash
mkdir my-new-project && cd my-new-project
git init

npx @dzhechkov/p-replicator@latest init   # или p-replicator init при глобальной установке

p-replicator doctor    # целостность установки
p-replicator verify    # + статус артефактов /replicate

git add . && git commit -m "chore: p-replicator toolkit"
```

Дальше в Claude Code: `/replicate "<постановка>"` — берите готовую из
[`REPLICATE-PROMPTS-PROJECTS.md`](REPLICATE-PROMPTS-PROJECTS.md).

**Что ставит `init`: ровно 134 файла** — 10 скиллов, 11 команд, 4 агента, 5 правил,
`settings.json` и 6 хук-скриптов.

> Не пугайтесь расхождения: `p-replicator list` в проекте, где стоят ещё `skills-feature-adr`
> и `ruflo`, покажет 42 скилла и 15 команд. Разница — от других пакетов, не от p-replicator.

---

## Проверка, что всё встало

```bash
node -v                        # ≥ 20
p-replicator doctor            # exit 0
p-replicator verify            # exit 0
dz doctor                      # скиллы валидны, подписи проверены
dz list                        # список установленных скиллов
dz skills-verify --static      # скиллы разложены правильно
```

Норма для свежего проекта: `doctor` — exit 0, возможен 1 warning про необязательный `keysarium`.
`verify` покажет артефакты `/replicate` как `not found` — это **не ошибка**, пайплайн просто ещё
не запускался.

---

## ⚠️ Грабли, проверенные экспериментом

### `p-replicator update` молча перезаписывает файлы

Merge с сохранением ваших правок работает **только для `.claude/settings.json`**. Любой другой
pre-shipped файл при расхождении **затирается без предупреждения и без `--force`**.

Если допилили под себя скилл или правило — вынесите правку в отдельный файл, а не в чужой.

`--reset-settings` и `--force` стирают и `settings.json` тоже, включая `env` и `permissions`,
дописанные ruflo.

### Порядок установки: p-replicator первым

Проверено по истории коммитов: p-replicator встал первым, ruflo затем только **добавил** ключи,
не тронув чужие хуки. Обратный порядок вживую не проверялся — не рискуйте.

### `--skills-dir` вместе с `--preset` ломает автопоиск

Воспроизведено дважды: указание `--skills-dir` отключает поиск встроенных паков.
Используйте что-то одно.

### `dz sync` / `dz update` — не про обновление ваших скиллов

Это обслуживание монорепы харнесса. В обычном проекте вернёт exit 3. Для обновления
skill-паков — переустановка через `npx <pkg>@latest init`.

---

## Адаптация под Codex, Cursor и другие платформы

`dz` компилирует один и тот же корпус SKILL.md под **10 платформ**: `claude-code`, `codex`,
`opencode`, `hermes`, `openclaude`, `copilot`, `agents-md`, `cursor`, `gemini`, `windsurf`.

```bash
dz init --target cursor        # → .cursor/rules/*.mdc
dz init --target copilot       # → .github/instructions/*.instructions.md
dz init --target codex         # + глобальные veto/recall-хуки с live-проверкой
```

### Честная картина: что переносится, а что нет

Вывод `dz parity` — официальная матрица авторов, не интерпретация:

| Возможность | claude-code | остальные 9 |
|---|---|---|
| Сама CLI и компиляция скиллов | ✓ | ✓ |
| Самообучение: `teach` / `recall` | ✓ | ✓ |
| Детерминированные guards | ✓ | ✓ |
| **Пайплайн feature-adr** | ✓ | **◐ вручную** |
| **Delivery Gate, challenge-panel, claim-check** | ✓ | **◐ вручную** |
| Живая строка статуса гейтов | ✓ | **— недоступно** |

**Что это значит на практике.** Тезис «p-replicator адаптируется под любую платформу через
harness-cli» — **верен частично**. Скиллы действительно переносятся и работают: это проверено.
Но перенос даёт **скиллы-инструкции, которые надо дёргать руками**, а не самовыполняющийся
пайплайн.

Причина конкретная: автозапуск фаз держится на хуках и MCP, а они есть только у Claude Code
и частично у Codex. У остальных восьми — только shell и скиллы.

Для Codex вдобавок нужен отдельный шаг: установка **глобальных** veto/recall-хуков
(`$CODEX_HOME/hooks.json`) с live-проверкой. Это не «скопировать файлы».

**Вывод для курса:** основная работа — в Claude Code. Cursor и остальные годятся, чтобы
пользоваться теми же скиллами, но пайплайн там придётся вести вручную.

---

## Доступ из РФ: не путать две разные проблемы

| Проблема | Решение |
|---|---|
| **Не ставятся npm-пакеты** | Обычно `registry.npmjs.org` доступен напрямую. Прокси не нужен |
| **Не работает Claude** | Нужен прокси — см. [`VPS-SETUP-REPOS.md`](VPS-SETUP-REPOS.md), `claude-code-vless-proxy` |

Это разные вещи. Человек, у которого не встал пакет, часто идёт чинить прокси — и теряет время,
потому что причина в другом.

---

## Что не проверялось вживую

Честный список — эти рецепты по документации, не по факту выполнения:

- Поведение Codespaces при Stop/Resume
- Установка на VPS и Mac (не было под рукой)
- Живые Codex и Cursor — проверялось только то, куда `dz` пишет файлы
- `dz upgrade` и `dz skills-verify` без `--static`
