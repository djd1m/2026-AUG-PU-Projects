# Бриф повторного ревью — фичи 25–29 N5, круг 2 (исправления по кругу 1)

Ты — тот же независимый ревьюер другого семейства. Только чтение. Текущий каталог — `projects/05-podcast-clips-opus`.
Твой ответ круга 1 — `docs/reviews/2026-09-28-review-25-29-codex.md` (раздел «Круг 1»). Исправления внёс Claude Opus 5.5.
Диф исправлений: `git diff 494741b8 HEAD -- . ':!docs'` (без документов).

## Что исправлено

1. **Находка 1 (витрина и явный срок):** `apps/web/src/server/showcase-file.ts` — `AND (c.expires_at IS NULL OR c.expires_at > now())`;
   тест `tests/landing-demo.integration.test.ts` «явный expires_at витрины».
2. **Находка 2 (пересборка стёртого клипа):** `apps/web/src/server/retention.ts` — после стирания объектов в транзакции
   (video `FOR UPDATE`, затем clip) обнуляются ключи и закрываются активные попытки пересборки клипа
   (`status='failed', failure_reason='stale_attempt_result'`); затем второй проход стирания префикса клипа. `lockRender`
   требует активную попытку — закрытая даёт `stale`. Тест `tests/clip-cta-rerender.integration.test.ts` «очистка после
   постановки пересборки».
3. **Находка 3 (старые отчёты раннеров):** `tests/run-landing-demo-mutations.mjs`, `tests/run-clip-cta-mutations.mjs`,
   `tests/run-clip-cta-27b-mutations.mjs` удаляют отчёт до запуска.
4. **Хвосты BACKLOG §5а (low):** (а) срок бесплатного клипа — одна функция `clipExpiry({clipId, expiresAt, plan,
   retentionFrom})` в `packages/shared/src/tariff.ts` (с исключением витрины) и её SQL-зеркало `clipAliveSql` в
   `packages/db/src/plan.ts`; все места (`screen`, `short-link`, `clip-file`, `clip-music`, `video-cta`, `guest-pack`,
   `retention`) на них; страж по исходнику в `tests/billing.unit.test.ts` «ровно в одном месте»; (б) тест ветки «+3 сут»
   в `setCta` с обеих сторон границы; (в) страж цвета `tests/theme.test.ts` — `(?<![-\w])(?:white|black)(?![-\w])`,
   `white-space:nowrap` возвращён в `.visually-hidden`; (г) `scripts/test-progress-mutations.mjs` — «убита» только при
   упавшем тесте в свежем JSON-отчёте, падение запуска — `launch_failed`. Мутации правок — `tests/run-review-25-29-mutations.mjs`.

## Вопросы

1. Закрыты ли находки 1–3 круга 1 по существу? Есть ли обход (например, пересборка, поставленная МЕЖДУ выборкой ретенции и
   её транзакцией; порядок блокировок ретенции против `setCta`/`setMusic`/рендера — нет ли взаимоблокировки)?
2. Совпадает ли семантика `clipAliveSql` со старыми условиями во всех местах (ретенция раньше: `GREATEST(finished_at,
   plan_paid_until) <= now-3d`, теперь `NOT clipAliveSql`; запись без `finished_at`)? Не изменилось ли поведение paid/free?
3. Не внесли ли правки новый дефект того же класса (срок, витрина, метка, квота)?
4. Честны ли новые тесты и мутации (не зеленеют ли при обеих реализациях)?

## Формат ответа (строго)

Первая строка: `ОЦЕНКА: <A|B|C|D>` (A — можно сливать; B — есть medium; C — есть high; D — есть blocker), затем строка
`25:X 26:X 27:X 28:X 29:X`. Затем таблица `| # | серьёзность | фича | файл:строка | что не так | последствие | как чинить |`
(только НОВЫЕ или НЕ закрытые находки). Затем «Заявления, не подтверждённые кодом». Не выдумывай находок; если чисто —
перечисли, что проверил. Отвечай по-русски.
