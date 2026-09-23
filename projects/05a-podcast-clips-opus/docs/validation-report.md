# Validation Report — ClipMkr (05a), Phase 2, итерация 1

**Дата:** 2026-09-23 · **Ревизия:** `1c5051e` · **RUN_ID:** 20260923T173212Z-replicate-05a-475b
**Сводил:** координатор (Claude Opus 5.5). Проверяющие — семейство Anthropic, авторы документов не проверяли сами себя.

## Вердикт итерации 1: 🔴 NEEDS WORK — возврат в Phase 1 (итерация 1 из 3)

Основание: 1 blocker (VA-01). По порогам `feature-lifecycle`/`requirements-validator` любой blocker — 🔴 независимо от среднего.

| Линза | Проверяющий | Модель | Итог | Blocker | High | Medium | Low | Отчёт |
|---|---|---|---|---|---|---|---|---|
| Истории + критерии приёмки (INVEST/SMART, BDD) | val-stories | Sonnet 5 | 🟡 94,4 / 100, BLOCKED 0 | 0 | 1 | 4 | 4 | [val-stories](validation/val-stories.md) |
| Архитектура · псевдокод · согласованность · зависимости | val-trace | Opus 5.5 | 🟡 66 (72 / 66 / 58 / 68) | 0 | 6 | 12 | 7 | [val-trace](validation/val-trace.md) |
| Враждебный разбор (brutal-honesty) | val-adversarial | Opus 5.5 | НЕ ГОТОВО | 1 | 9 | 13 | 3 | [val-adversarial](validation/val-adversarial.md) |

Шаг 2.0 (слой 1) до роя: `check-docs-complete` 0, `check-external-deps` 0, `check-look-origin` 0; шаги 2.1–2.4:
`check-embed-contract` 2 (не встраивается), `check-job-contract` 0, `check-webhook-contract` 2 (вебхуков нет), `check-model-cost` 0.

## Совпадения между независимыми проверяющими (сильные сигналы)

| Тема | Находки | Суть |
|---|---|---|
| Транспорт сессии | VA-06 = VT-04 | access-JWT в `Authorization: Bearer`, а `/admin/*` — серверный HTML: оператор не войдёт |
| CORS бакета | VA-07 = VT-05 | нет `ExposeHeaders: ETag` → браузер не завершит multipart-загрузку |
| Потолок LLM на задачу | VA-03 = VT-03 (= В-10) | выпуск > ~60 мин падает `selection_failed` ПОСЛЕ оплаченной STT; «Повторить» не поможет |
| Advisory lock через пул | VA-17 = VT-18 | сессионная блокировка остаётся на соединении пула |
| Лимит частоты за CGNAT | VA-11 = VT-11 | 30/ч с IP на `/c/`, `/p/` режет мобильных зрителей — ломает петлю роста |
| Перебор паролей | VA-12 = VT-07 = VS-03 | лимит неатомарный и без сценария |

## Реестр к исправлению (итерация 1 → 2)

| Кто правит | Находки |
|---|---|
| координатор (канон) | VT-01 (разделитель jobId без `:` — подтверждено `bullmq@5.81.5 job.js:1075`), VT-04/VA-06 (транспорт сессии — решение ниже), VT-05/VA-07 (CORS `ExposeHeaders: ETag`), VT-12, VT-24 (`/api/health`) |
| pseudocode | **VA-01**, VT-02, VT-06, VT-07, VT-09, VT-10, VT-14, VT-16, VT-18/VA-17, VA-02, VA-04, VA-11/VT-11, VA-12, VA-13, VA-15, VA-16, VA-18, VA-19, VA-25, VA-26 |
| spec-author | VT-08, VT-19, VT-20, VS-01…VS-09, VA-02, VA-10, VA-14, VA-24 |
| adr-architect | VT-04 (ADR-011), VT-05 (ADR-007), VT-13, VT-15, VT-16, VT-21, VT-22, VA-08, VA-21 (tRPC ↔ REST), VA-22, VA-23 |
| refinement-completion | VT-17, VT-23, VA-09 (после решения владельца по объёму) |
| **владелец** | VA-03/VT-03 (деньги: потолок LLM на задачу), VA-05 (watermark на чёрном поле), VA-09 (объём против недели) |

## Решения координатора (технические, без денег и продукта)

- **Транспорт сессии (VT-04/VA-06):** access-JWT и refresh — только в `httpOnly`, `Secure`, `SameSite=Lax` cookie на `Path=/`;
  заголовок `Bearer` не используется; мутирующие запросы защищены проверкой `Origin` (CSRF). Так серверный рендер `/admin/*`
  и API читают сессию одинаково.
- **jobId (VT-01):** разделитель `.` вместо `:` — `{job_id}.stt.prepare`, `{job_id}.stt.{chunk_idx}`, `{job_id}.llm`, `{clip_id}.render`.
- **CORS бакета (VT-05):** `AllowedOrigins = BASE_URL`, `AllowedMethods = PUT`, `ExposeHeaders = ETag`; проверяется браузерным E2E, не `curl`.
- **Проба STT дня 1 (VA-08):** не останавливает продукт. Если ни одна модель OpenRouter не даёт меток спикеров на русском —
  запасной путь из OWN-05A-005 (прямой OpenAI за тем же интерфейсом); если и он не проходит — субтитры без подписи (канон это разрешает).

## Дефект стражей, найденный по ходу (не дефект проекта)

`check-canon.cjs` → `unitRows()` читает КАЖДУЮ таблицу `docs/dispatch-plan.md`, а `check-file-ownership.cjs` требует в
том же файле таблицы «Владение» и «События разреза», где путь нового файла обязан повториться. При любом разрезе
файла документированные формы двух стражей несовместимы: `check-canon` → 2 («строки единиц повторяются»); обход
префиксом `./` ломает `check-file-ownership` → 1. Выбрано: форма владения по документации (`check-file-ownership` = 0),
целостность канона проверяется вручную сравнением sha256 с `dispatch-plan.md` (совпал). Вендорные хуки не правились;
кандидат в заявку апстриму: `unitRows()` должна читать только таблицу под `## Единицы`.
