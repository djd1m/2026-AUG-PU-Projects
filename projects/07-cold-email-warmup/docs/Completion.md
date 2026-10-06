# Completion — локальное ПО принято; PR заблокирован доступом GitHub

> **Расширение scope от 2026-10-06:** OWN-N7-004 включает unlimited connected
> mailboxes, реальный автоматический прогрев и AI-ответы ≤5 минут. План:
> [expanded-mvp-plan](plans/expanded-mvp-plan.md). Ниже сохранена документация
> принятого локального MVP; его тесты не доказывают готовность расширения.


## Текущее расширение — 2026-10-06

F07 connected capacity и F08 независимая SMTP/IMAP диагностика приняты локально.
F08 source `521ae2b3`, интегрированный код `e7db9146`: итоговые realPG146/146,
affected20/20, type/lint/build и dependency audit проходят. Независимый отчёт
[F08 ACCEPT](features/f08-live-diagnostics/review-report.md) сохраняет точные привязки
unit54/TLS/mutations/browser20 к неизменённым компонентам; новый финальный browser run не заявлен.
Полные PLAN/VALIDATE проходят для9 контуров; completion остаётся FAIL9
(семь будущих expanded witnesses и две F06-привязки), без пробелов F08.
Следующий этап — F09 live transport; AI, persistent workers и live-пилот пока не приняты.
Внешние отправки/LLM/расходы/deployment требуют соответствующего разрешения.

## Историческая приёмка исходного локального MVP

2026-10-03: F01–F05 и F06 A1–A6/B1–B4 приняты. B5 документы/toolkit завершены.
B6: фактическая попытка GitHub create_pull_request получила403
`Resource not accessible by integration`; PR не создан. AC-N7-012 остаётся PARTIAL,
внешняя поставка не объявляется завершённой. [12 критериев](acceptance-traceability.md).

## Что работает

Регистрация/tenant sessions, шифрованные настройки, отдельные согласия, pooled seed
cohort, цепочки и общая квота, атомарная граница stop/submitting, bounded reply
scanning/dedup, unsubscribe/complaints, ручные наблюдения, приватные share reports,
TEST billing/entitlements/partner attribution и настоящий persistent кабинет.

Почта — local sink/inbox fixture, оплата — canonical local TEST provider.
AI replies, реальные SMTP/IMAP, списания и production deployment отсутствуют.
Репутация без ручных наблюдений unknown. Seed goal30/7days ещё не измеряется.

## Проверки и привязка

Последний продуктовый commit `21e42881`; final acceptance metadata `9413b431`.
[Source/build/image и отзывы](acceptance-traceability.md): unit39, ранее полный
PG115, type/lint/build, guard mutations, privacy/tenant/secret canaries. Actual
shared Docker Playwright Chromium1440/390, Firefox/WebKit390; narrow final mobile
report218checks, eight revocations, keyboard scrolling и читаемые counts/ISO.
Local p95<500ms измерен на CPU2/concurrency10 (109.1/85.2ms); не production SLA.

Браузер проверил реальный API/DB и обнаружил четыре исправленных дефекта.
Все неудачные попытки/таймауты сохранены. Fresh Astra final report ACCEPT;
процесс timeout124 после записи terminal receipt раскрыт в telemetry отдельно.

## Документы, воспроизведение и поставка

[Русское руководство](../README/ru/README.md) · [English](../README/eng/README.md)
· [Walkthrough](pipeline-walkthrough.md) · [Toolkit](toolkit-validation.md)
· [PR draft](pr-draft.md) · [Deployment checkpoint](deployment-checkpoint.md).

Ветка `feature/07-cold-email-warmup`, target `claude/install-npm-packages-n7l3m5`.
Main не создаётся. Текущий локальный URL `http://127.0.0.1:18709` существует только
на host запущенного dev-стека; это не публичный deployment.

Профиль compact-quality-first-v2/XL. Подтверждённые модели: Sol6.1/high — код/тесты,
Astra/high — независимое review. Native coordinator actualmodel/usage и cost неизвестны.
[Run](telemetry/features/20261003T023900Z-f06/run.json) содержит время, попытки и
ссылки на raw usage; cumulative resumed counters не складываются повторно.

## Внешний blocker и готовая передача

Документы и ветка отправлены: `224508e81ddfbc734241ebdb8c7cdaf4e99931c7`. [Создать PR из сравнения](https://github.com/djd1m/2026-AUG-PU-Projects/compare/claude/install-npm-packages-n7l3m5...feature/07-cold-email-warmup?expand=1).
Точный [черновик](pr-draft.md) и [ответ API](telemetry/features/20261003T023900Z-f06/pr-attempt.json) сохранены.
Нужна GitHub-интеграция с правом создания PR; доступ автоматически не расширялся.
Всё независимое локально разрешённое выполнено, новых продуктовых задач не осталось.

## Criterion coverage
| Criterion | Test file | Test title |
| --- | --- | --- |

Canonical Specification.md has no machine AC headings; its16 FR/NFR headings and
SC scenarios are unchanged. This canonical table has zero rows for that reason.
Per-feature AC coverage remains in each active feature completion role.
This format correction is not a fresh runtime acceptance: prior bytes are retained
at validation-history/Completion.pre-contract-table-20261006.md. The prior final
paragraph describes the historical local MVP; F07/F08 are now locally accepted; expanded F09-F15 work remains pending.
