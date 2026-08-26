# 2026-AUG-PU-Projects

## Проекты курса

8 недель — 8 продуктов. Полный список, ссылки на оригиналы и статус:
**[`projects/README.md`](projects/README.md)**

| # | Проект | Оригинал |
|---|---|---|
| 01 | Сбор видео-отзывов и «Стена любви» | [Senja.io](https://senja.io/) |
| 02 | Умный QR для отзывов о компании | [NiceJob](https://nicejob.com/) · [Birdeye](https://www.birdeye.com/) · [Podium](https://www.podium.com/) |
| 03 | Партнёрская программа за 15 минут | [Rewardful](https://rewardful.com/) |
| 04 | ИИ-трекер калорий по фото | [Cal AI](https://www.calai.app/) |
| 05 | Нарезка вирусных клипов из подкаста | [OpusClip](https://www.opus.pro/) |
| 06 | ИИ-продавец на данных клиента | [Chatbase](https://www.chatbase.co/) |
| 07 | Cold email с прогревом доменов | [Instantly](https://instantly.ai/) · [Smartlead](https://www.smartlead.ai/) |
| 08 | Редизайн комнаты по фото | [Interior AI](https://interiorai.com/) |

Главный продукт курса — **рост**, а не прототип. Обязательный блок требований по механикам
роста и виральности: [`research/GROWTH-MECHANICS-REQUIREMENTS.md`](research/GROWTH-MECHANICS-REQUIREMENTS.md).
Готовые постановки для `/replicate`: [`start/REPLICATE-PROMPTS.md`](start/REPLICATE-PROMPTS.md).

## Установленный тулчейн

Глобально установлены (npm, Node 22):

| Пакет | Версия | Бинарь | Назначение |
|---|---|---|---|
| `@dzhechkov/harness-cli` | 0.7.8 | `dz` | Кросс-платформенный harness: установка AI-скиллов для Claude Code / Codex / OpenCode и др. |
| `@dzhechkov/p-replicator` | 1.5.18 | `p-replicator` | Пайплайн `/replicate`, 10 модульных скиллов, `/harvest`, swarm-агенты, quality gates |
| `@dzhechkov/skills-feature-adr` | 1.5.4 | `skills-feature-adr` | Adaptive Feature Development: 11-шаговый пайплайн, Complexity Router (S/M/L/XL), ADR |
| `ruflo` | 3.38.20 | `ruflo` | Оркестрация AI-агентов (claude-flow): 60+ агентов, swarm, MCP, векторная память |

Переустановка:

```bash
npm install -g @dzhechkov/harness-cli @dzhechkov/p-replicator @dzhechkov/skills-feature-adr ruflo
```

## Установлено в проект

Все три skill-пака и ruflo проинициализированы в этом репозитории:

- **feature-adr** (`skills-feature-adr init`) — 46 файлов: скилл `feature-adr` (11 модулей),
  `explore`, `problem-solver-enhanced`, `frontend-design`, команда `/feature-adr`, правила, шард.
- **p-replicator** (`p-replicator init`) — 134 файла: 10 skill-паков, команды `/replicate` и `/harvest`,
  4 агента-оркестратора, правила пайплайна, хуки (`.claude/hooks/`, `settings.json`).
- **ruflo** (`ruflo init --no-global --no-signup --no-skills-sh --no-codex-detect`) —
  30 скиллов, 16 команд, 17 агентов, `.claude/helpers/`, MCP-сервер `claude-flow` в `.mcp.json`,
  V3-рантайм в `.claude-flow/`, корневой `CLAUDE.md`.

`.claude/settings.json` смёржен: хуки p-replicator сохранены, ruflo добавил `env` и `permissions`.

Рантайм-состояние (`ruvector.db`, `.swarm/`, `.claude-flow/{data,logs,sessions}`) — в `.gitignore`.

### Проверка здоровья

```bash
skills-feature-adr doctor   # 6/6 checks passed
p-replicator doctor         # all passed (1 optional warning)
ruflo doctor                # 20 passed, 8 warnings (все опциональные)
```

### Что ещё не сделано

`dz init --target claude` (harness-cli) не запускался — он поставит ещё ~14 skill-паков
поверх текущих и может пересечься с уже установленным. Скажи, если нужно.
