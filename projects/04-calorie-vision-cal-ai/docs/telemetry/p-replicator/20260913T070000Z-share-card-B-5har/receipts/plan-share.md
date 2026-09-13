# Квитанция — plan-share (Phase 1 PLAN, режим скорости DEC-A-032)

RUN_ID: 20260913T070000Z-share-card-B-5har
WORK_UNIT_ID: planner-share
requested: не сообщено координатором (модель исполнения подтверждается метаданными запуска, не
текстом задания)

## Что сделано

Прочитаны (без правки чужих файлов): `docs/canon.md`, `docs/Specification.md` (FR-SHARE-001,
FR-GROWTH-001/003/006/007, FR-LOOK-007, критерии безопасности US-005/US-008, SC-US-007-1/2),
`docs/Pseudocode.md` (`BuildShareCard`, `ApplyPartnerCode`, `AntiFraudOnCode`, Data Structures,
API Contracts маршрутов 5–6), `docs/ADR.md` (ADR-001, ADR-009, ADR-010), `docs/decisions-autonomous.md`
(DEC-A-006, DEC-A-016, DEC-A-032 — до DEC-A-033 включительно на момент записи),
`.claude/rules/{security,testing,coding-style,secrets-management}.md` (проектные, N4),
`docs/features/foundation/{01_specification,05_completion}.md` целиком (образец формата),
`docs/features/source-and-correct/05_completion.md` (образец «плановой» таблицы Criterion coverage),
`docs/features/consent-and-telegram-auth/{01_specification,02_pseudocode,03_architecture}.md`
целиком (граница согласия, которую эта фича ПОТРЕБЛЯЕТ), `.claude/feature-roadmap.json` (запись
`share-card-and-growth-events`), фактический код `packages/db/migrations/001_init.sql` (схема
`share_card`/`growth_event`/`account`/`device_session` уже существует),
`apps/api/src/routes/scans.ts` (запись `growth_event(install)`, конвенция `owner_key`/сессии),
`packages/shared/src/domain/enums.ts` (закрытые перечисления), `Caddyfile` (строки 63–64:
`Cache-Control: no-store` на `/c/*` УЖЕ поставлен).

Написаны пять документов `docs/features/share-card-and-growth-events/{01_specification,
02_pseudocode,03_architecture,04_refinement,05_completion}.md`. Ни один файл вне этого каталога и
этой квитанции не создан и не изменён; файлы `consent-and-telegram-auth`, `source-and-correct`,
`scan-pipeline`, `foundation` не тронуты.

### Находки, требующие подтверждения координатора (см. `01_specification.md`, «Стыки»)

1. **DEC-A-016 п.3 vs FR-GROWTH-001.** Требование согласия для СОЗДАНИЯ карточки (не только
   дневника) противоречит буквальному «карточка готова заранее» для первого-в-жизни анонимного скана
   (согласие по ADR-009 спрашивается перед дневником, не раньше). Решение плана: сборка — попытка,
   не гарантия; при отказе согласия карточка откладывается до `grant`. Формализовано как
   `FR-share-card-and-growth-events-2`.
2. **Гонка «отзыв согласия ↔ создание карточки» не закрыта дословно планом `consent-and-telegram-auth`**
   (`RevokeConsentOrErase` не берёт блокировку строки владельца ПЕРВЫМ оператором своей транзакции;
   `EnforceConsentBeforeDiaryWrite` читает `consent_at` без блокировки). Без правки СВОЕЙ стороны эта
   фича унаследовала бы окно, в котором карточка, созданная сразу после коммита отзыва, никогда не
   будет сметена. Фикс внесён на стороне ЭТОЙ фичи (`FR-share-card-and-growth-events-9`,
   `CreateShareCard`: `SELECT … FOR UPDATE` первым оператором, `revoked_at` вычисляется В ТОЙ ЖЕ
   вставке). Рекомендация (не мандат) для `consent-and-telegram-auth` — симметричная блокировка в
   `RevokeConsentOrErase`.
3. **`device_session.consent_at` не существует в плане `consent-and-telegram-auth`** (её
   `03_architecture.md` не добавляет эту колонку, хотя её `FR-consent-and-telegram-auth-5` текстом
   обещает хранить согласие анонима «на саму `device_session`»). Названо как риск для анонимного пути
   FR-GROWTH-001; эта фича не может исправить чужую схему и трактует границу как чёрный ящик.

Кроме того: миграция этой фичи (`ALTER TABLE share_card ADD CONSTRAINT … UNIQUE (recognition_id)`)
нужна для идемпотентности маршрута 5 — в `001_init.sql` такого ограничения нет; номер файла НЕ
назначен (на 2026-09-13 в каталоге уже два конфликтующих файла `002_*` от параллельных worktree —
нумерация решается координатором при слиянии, как и в прецеденте DEC-A-026).

## FR/AC/алгоритмы

- FR: `FR-share-card-and-growth-events-1`…`-11` (11), `NFR-share-card-and-growth-events-1`…`-3` (3).
- AC: `AC-share-card-and-growth-events-1`…`-18` (**18**, в границе 14–20 из задания).
- Алгоритмы `02_pseudocode.md`: `CreateShareCard`, `BuildCardPayload`, `SanitizeForCardText`,
  `RenderCardImage`, `GuardShareCardFieldSet`, `RenderPublicCardPage`, `RecordCardView` /
  `RecordShareClick` (7); все REQUIREMENT-ключи (FR+NFR+AC) закрыты хотя бы одним алгоритмом.
- Схема: НОЛЬ новых таблиц; одно добавление — `UNIQUE (recognition_id)` на `share_card`.
- Явно названы: граница персональных данных на карточке (что попадает/не попадает, FR-1), причина
  `no-store` (FR-5 — прокси-кэш до отзыва сделал бы 60-секундный срок недостижимым), экранирование
  названия/источника от модели и пользователя на ДВУХ поверхностях этой фичи — SSR и SVG-растр
  (FR-10, AC-13), страж по исходнику против веса/цели/итога дня/стрика на уровне ТИПА и на уровне
  РАНТАЙМА, оба испытаны внедряемым дефектом (FR-11, AC-14/15), конкурентный сценарий «отзыв согласия
  одновременно с созданием карточки» в ОБЕИХ раскладках интерливинга (FR-9, AC-12).

## Ворота

`bash …/check-pipeline-gaps.sh . --role-map-source ../../.claude/commands/feature.md
--project-role-map-source ../../.claude/skills/sparc-prd-mini/SKILL.md` (пакет
`@dzhechkov/p-replicator` 1.13.2, путь кэша npx по DEC-A-010):
`TRACE contour=share-card-and-growth-events … COUNT requirements=32 algorithms=32
missing-algorithm=0 orphan-algorithm=0` → `PASS`. Общий прогон по всем восьми контурам:
`VERDICT traceability=PASS features=8 gaps=0 inconclusive=0` — на момент записи ни один из семи
соседних планов не в разрыве. Первый прогон (до правки) дал 4 `DUPLICATE` (FR-1/7/10/11 были
привязаны как REQUIREMENT сразу к двум алгоритмам — нарушение «один ключ — ровно один алгоритм») и
21 `GAP` (все 18 AC и 3 NFR спецификации отсутствовали как REQUIREMENT-теги в псевдокоде, хотя были
перечислены в REALISES) — исправлено переразметкой владения ключами по алгоритмам и добавлением
короткого алгоритма `ApplyShareCardMigration` для AC-16.

Status: completed
