# TR-010 — допуск порядка слов

RUN_ID: 20260923T163221Z-tr010-word-order
Начало измерения: 2026-09-23T16:32:21Z (предварительное чтение до этой отметки не измерено).
Baseline: 272e610ea47f3e49f804784a255bd62025e0e0ef, дерево содержало чужие изменения selection/render.
Профиль: compact-quality-first-v2. Исполнитель: GPT-6 (точный serving ID и effort не предоставлены).
Телеметрия размещена в этом отчёте по ограничению постановки на docs/; токены, стоимость: null (счётчики недоступны).

ROUTE: механический S (exit 0); содержательный L — общий парсер плюс текст web, без новых вызовов, схемы или разделяемых ресурсов.
PLAN: сохранить порядок слов; откат <0,5 с поджимать, end >= start; считать каждое поджатие и писать JSON в stderr; >1% слов одного разбираемого ответа — отказ. Повторный разбор нормализованного результата идемпотентен. Границы времени остаются строгими. Сообщения различают отсутствие, границы и порядок.
VALIDATE: постановка TR-010 прочитана вместе с Architecture (STT/ADR-003) и фактическими client → parse → merge → persistence. Допуск 0,5 с составляет четверть перекрытия 2 с; равенство допуску отвергается. 1% допускает максимум одно исправление на 100 слов, без округления вверх для коротких ответов.
ROUTE перед IMPLEMENT: тот же scope L; реализация разрешена прямым запросом выполнить постановку. E2E preflight: not_applicable — развёртывание запрещено, текущие проверки локальные.

16:33 VALIDATE: Anthropic CLI (requested sonnet) не ответил за 45 с, exit 124, stdout/stderr пусты; actual_model=null. Cross-family проверка недоступна, не объявляется пройденной.
16:33:53 baseline: 4 failed / 4 passed — новые проверки обнаружили исходный дефект.
IMPLEMENT: нормализация, счётчик, журнал, диагностика, текст UI и канон обновлены; дальнейшие проверки ожидаются.

2026-09-23T16:37:27.389853+00:00 REVIEW: делегирован один read-only проход gpt-5.6-sol/high (requested и фактический запуск через collaboration); бюджет 5 мин, правки запрещены. Anthropic fallback явно ограничен независимым ревью того же поставщика.
Промежуточные проверки: 8/8 TR-010, пять мутаций red/green; первая попытка теста адаптера была ошибочной (неверный env key), исправлена. Первый typecheck обнаружил optional-доступ в тесте, исправлен. lint exit 0.

2026-09-23T16:39:29.544170+00:00 REVIEW finding: точное десятичное 0.7−0.2 давало 0.49999999999999994. Исправлено сравнением с погрешностью IEEE-754 Number.EPSILON×max(1, previous, start), добавлен тест 0.7→0.2 / 0.200001 и шестая мутация. После конкретной находки перезапущены относящиеся проверки и обязательный полный набор; промежуточный прогон помечен superseded.
Первый полный набор: exit 1, 439 passed / 1 failed (ошибка config фикстуры) / 140 skipped.


## Результат и доказательства

Именованные константы: `STT_WORD_ORDER_TOLERANCE_SECONDS=0.5`, `STT_MAX_CORRECTED_WORD_RATIO=0.01`. Вызовы поставщика, квота и закрытый набор failure_reason не изменены. Поджатие пишет `stt_word_order_clamped` с исходными/новыми временами, индексом и накопленным числом исправлений; текст речи не журналируется. Границы времени проверяются до нормализации, повторный разбор не исправляет и не журналирует слово второй раз.

Порог 1% применяется к каждому разбираемому ответу (в том числе чанку), без накопления скрытого бюджета между чанками. Ровно 1% принимается; выше — отказ с corrected_words/total_words в timingIssue. Это выбранная консервативная граница редкого дрожания, а не эмпирически измеренная частота ошибок поставщика.

**Правка канона требуется и выполнена:** только `docs/canon.md` §7, добавлена строка с допуском, долей и связью с перекрытием 2 с.

Фикстура `tests/fixtures/transcription/word-order-response.json`: 200 слов, segments и метаданные формы verbose_json; реальная пара 51.22→50.96 на index=98 взята из постановки. Остальное реконструировано: исходный ответ и аудио не предоставлены. Тест вызывает настоящий createTranscriber с подменой HTTP-ответа, без внешнего платного запроса.

### Мутации: обе строки каждого испытания

`node scripts/test-transcription-word-order-mutations.mjs` — exit 0. Мутации выполняются в временной копии, рабочие исходники не подменяются. Полные квитанции: `tests/artifacts/transcription-word-order/mutations/`.

| Дефект | Состояние | Exit | Failed | Passed |
|---|---|---:|---:|---:|
| zero-tolerance | внедрён | 1 | 1 | 0 |
| zero-tolerance | восстановлен | 0 | 0 | 1 |
| above-overlap | внедрён | 1 | 2 | 1 |
| above-overlap | восстановлен | 0 | 0 | 3 |
| no-rounding-guard | внедрён | 1 | 1 | 0 |
| no-rounding-guard | восстановлен | 0 | 0 | 1 |
| no-ratio-guard | внедрён | 1 | 1 | 0 |
| no-ratio-guard | восстановлен | 0 | 0 | 1 |
| generic-message | внедрён | 1 | 1 | 0 |
| generic-message | восстановлен | 0 | 0 | 1 |
| no-clamp-journal | внедрён | 1 | 1 | 0 |
| no-clamp-journal | восстановлен | 0 | 0 | 1 |

Первое испытание zero-tolerance не имело зелёного восстановления из-за неверного env key в новом тесте; оно не засчитано. Повтор после исправления и окончательный прогон сохранены отдельно (`mutations-attempt-1`, `mutations-attempt-2`, `mutations`).

### Ревью

Отдельный gpt-5.6-sol/high обнаружил один дефект сравнения на границе IEEE-754. Исправление проверено тем же независимым ревьюером отдельным ограниченным проходом: замечание устранено, 9/9, оставшихся находок в scope нет. Это fallback одного поставщика; обязательное cross-family ревью Anthropic **не пройдено** (CLI sonnet, таймаут 45 с, exit 124, фактическая модель не подтверждена).

### Привязка к исходникам

HEAD остаётся исходным; изменения не закоммичены. SHA-256 финальных файлов:

| Файл | SHA-256 |
|---|---|
| `packages/shared/src/transcript.ts` | `f6701eceb63d3e0849b133f6903c4dc545a79b90157b0f469cd9420c9f0ac0c7` |
| `apps/web/src/lib/screen-contract.ts` | `40cf0dde03ed458f759d7c0c8ef5700e558b8d2f98d1239bb18ca089fe609f99` |
| `tests/transcription-word-order.test.ts` | `48ad4de24a0ab4b466c84b7fa38a9b729f1dedcaa93622e2c696fbec435e3197` |
| `tests/fixtures/transcription/word-order-response.json` | `baede9c6d9f612b857d3cbf944235fdf1b39dd7761d2c782b39e295b7a9e291e` |
| `scripts/test-transcription-word-order-mutations.mjs` | `4e4a225e1e5fb894e69b24692f63cd76c652ed841825f9dd4c6d29f0e10d6025` |
| `docs/canon.md` | `704f17c5cfd5cc4bcd35ff1c7cc173c20c8ada52b7c4db9f9f9cc5bde9188c61` |


### Финальные проверки

Все пути квитанций ниже относительно `tests/artifacts/transcription-word-order/`.

| Команда | Результат | Квитанция |
|---|---|---|
| `npx vitest run tests/transcription-word-order.test.ts tests/transcription-merge.test.ts` | exit 0; 13 passed (9 TR-010 + 4 merge) | `focused-final.txt` |
| `node scripts/test-transcription-word-order-mutations.mjs` | exit 0; 6/6 мутаций доказаны | `mutations/results.json` |
| `npm test` | exit 0; 441 passed, 140 skipped; НЕ полная зелёная приёмка | `full-suite-final.txt` |
| `npm run typecheck` | exit 0 | `typecheck-final.txt` |
| `npm run lint` | exit 0 | `lint-final.txt` |
| `npm run build` | exit 0, все workspace | `build-final.txt` |
| `bash scripts/check-env-wiring.sh` | exit 2; Compose config недоступен | `env-wiring.txt` |
| `bash ../../scripts/check-port-conflicts.sh .` | exit 1; Compose config не прочитан, конфликты не доказаны | `ports.txt` |
| `git diff --check` | exit 0 | `проверено в рабочем дереве` |

Промежуточный полный прогон `full-suite-corrected.txt` (440 passed / 140 skipped) был начат до исправления находки ревью и не является квитанцией финального снимка. Финальный полный прогон начат 16:39:29 UTC после исправления, длительность Vitest 122,47 с.

**Границы доказательства и остаток:** 140 тестов пропущены при отсутствии DATABASE_URL, REDIS_URL, S3_ENDPOINT; интеграция с БД/Redis/S3 не проверена. Конкурентный ресурс этим изменением не затронут. CJM/E2E и повтор обработки настоящей 88,4-минутной записи не выполнялись; постановка исключает развёртывание. Внешние модели не вызывались для транскрипции. Обязательное Anthropic-ревью и стражи окружения не пройдены. Поэтому код и AC TR-010 реализованы, но полная проектная приёмка не объявляется завершённой: итоговый Status — failed.

### Итоговая телеметрия

Путь телеметрии — этот отчёт (явное ограничение постановки на docs/ имеет приоритет). Сохраняется профиль compact-quality-first-v2; новый оркестратор не создан.

```json
{
  "schema_version": "feature-telemetry-v1",
  "policy_version": "compact-quality-first-v2",
  "run_id": "20260923T163221Z-tr010-word-order",
  "tier": "L",
  "status": "blocked",
  "started_at": "2026-09-23T16:32:21+00:00",
  "ended_at": "2026-09-23T16:42:24.264884+00:00",
  "elapsed_seconds_measured": 603.3,
  "models": {
    "coordinator_actual": "GPT-6 (serving ID unavailable)",
    "review_requested": "gpt-5.6-sol",
    "review_actual": "gpt-5.6-sol",
    "review_requested_effort": "high",
    "anthropic_requested": "sonnet",
    "anthropic_actual": null,
    "fallback_reason": "Anthropic CLI timeout exit 124 after 45s"
  },
  "tokens": null,
  "cost": null,
  "required_gates_passed": false,
  "scope_ac_met": true,
  "telemetry_status": "partial",
  "missing_data": [
    "Provider token/cost counters unavailable",
    "Exact coordinator serving ID/effort unavailable",
    "Initial reading before first clock measurement unmeasured; reported duration is a lower bound",
    "Telemetry embedded in authorized report, not separate docs/telemetry directory",
    "Anthropic actual model unavailable; no output before timeout"
  ],
  "followup_status": "pending"
}
```

Status: failed

## Дополнение integration owner (23.09.2026)

Прогон на настоящей инфраструктуре профиля `test`: **581 passed (581)**, 69 файлов. Тем же прогоном
подтверждены RV-5 и RV-6 из соседнего отчёта — у Codex нет PostgreSQL, и оба раза он честно ставил
`failed`.

Находка получена НЕ тестом, а живым файлом владельца: запись 5305,9 с отвергнута из-за отката
0,26 с на слове №98. Это ценно отдельно — синтетические фикстуры такого не давали ни разу, а именно
такие данные и приходят от настоящего распознавания.
