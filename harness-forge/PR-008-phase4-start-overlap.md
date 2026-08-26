# PR-008: `/replicate` Phase 4 и `/start` Phase 1 генерируют одни и те же файлы

**Класс:** дублирование ответственности · **Приоритет:** P1 · **Найдено:** прогон `/start` на проекте 01

## Проблема

Два разных шага пайплайна создают один и тот же набор корневых файлов, и ни один не знает
о другом. При последовательном выполнении второй молча перезапишет первый.

## Доказательство

`.claude/commands/replicate.md`, **Phase 4: FINALIZE**:

> **Generate scaffold files:**
> 1. `docker-compose.yml` — from Architecture.md services
> 2. `Dockerfile` — from Architecture.md tech stack
> 3. `.gitignore` — if not exists

`.claude/commands/start.md`, **Phase 1: Foundation**:

> 2. **Generate root configs:** `package.json` (monorepo workspaces),
>    `docker-compose.yml`, `.env.example`, `.gitignore`, `tsconfig.base.json`.

Пересечение: `docker-compose.yml` и `.gitignore` создаются **дважды**.

При этом официальная последовательность — именно такая. Сам `/replicate` в отчёте Phase 4 пишет:

> 🚀 Next steps: 1. Run `/start` to bootstrap the project

То есть штатный сценарий гарантированно приводит к повторной генерации.

## Почему это опаснее, чем кажется

`docker-compose.yml` из Phase 4 создаётся **на основе проработанной архитектуры**: там healthcheck'и,
`condition: service_healthy`, тома, переменные окружения с комментариями о том, какой сервис какой
секрет получает и почему.

`/start` Phase 1 генерирует его заново «from Architecture.md» — и результат может отличаться,
потому что это другой проход с другим контекстом. Ручные правки, внесённые между фазами,
теряются молча.

На прогоне проекта 01 в `docker-compose.yml` между фазами была внесена правка безопасности:
`PAYMENT_WEBHOOK_SECRET` убран из сервиса `mcp-claude` (сервису транскрипции секрет платежей
не нужен). Повторная генерация её бы стёрла.

## Исправление

### Вариант А — разделить ответственность (предпочтительно)

`/replicate` Phase 4 генерирует **только** то, что выводится из архитектуры:
`docker-compose.yml`, `Dockerfile`, `Caddyfile`, `.env.example`.

`/start` Phase 1 генерирует **только** то, что относится к сборке кода:
`package.json` (workspaces), `tsconfig.base.json`, `.gitignore`.

Пересечения нет, каждый файл имеет одного владельца.

### Вариант Б — `/start` уважает существующее

Перед генерацией проверять наличие и не перезаписывать:

```
IF exists(docker-compose.yml) AND is_tracked_by_git:
    SKIP with message "уже создан Phase 4 /replicate, пропускаю"
```

Слабее варианта А: сохраняет двусмысленность, кто владелец файла.

### В любом варианте — guard уровня 1

```bash
# перед /start: зафиксировать хэши файлов, которые он не должен трогать
# после /start: сравнить
git diff --stat docker-compose.yml Dockerfile Caddyfile
# непустой вывод после /start = нарушение владения
```

## Проверка исправления

Прогнать `/replicate` до конца, внести ручную правку в `docker-compose.yml`, запустить `/start`
и убедиться, что правка на месте.
