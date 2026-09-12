# Задание независимому валидатору (Phase 2, cross-model, только чтение)

Проект «Тарелка» (N4, клон Cal AI: фото → распознавание → числа из открытой базы USDA с видимым источником; PWA + Telegram Mini App; Docker Compose на VPS). Текущий каталог — корень проекта. Ничего не менять.

Прочитай: docs/Specification.md, docs/PRD.md, docs/Pseudocode.md, docs/Architecture.md, docs/ADR.md, docs/C4_Diagrams.md, docs/Refinement.md, docs/Completion.md, docs/Solution_Strategy.md, docs/Research_Findings.md, docs/Final_Summary.md, docs/canon.md, docs/model-cost-contract.md, docs/long-job-contract.md; постановку — ../../start/REPLICATE-PROMPTS-PROJECTS.md (раздел «## 04») и ../../start/REPLICATE-PROMPTS.md (блок GROWTH MECHANICS); методику оценки — ../../.claude/skills/requirements-validator/SKILL.md (INVEST 50% / SMART 30%, blocking floor: Testable=0, Completeness=0, Traceability=0 → BLOCKED; security-бонус; growth traceability).

Шесть линз, по каждой — вывод и находки:
1. stories — каждая US-nnn по INVEST, оценка 0–100; истории < 50 — BLOCKED с переписанной формулировкой.
2. acceptance — SC-US-nnn-k по SMART; расплывчатые термины («быстро», «удобно») назвать.
3. architecture — соответствие рамке (Distributed Monolith, Docker Compose, VPS, PostgreSQL в контейнере, хранилища без публикации портов, Caddy единственная дверь), полнота; противоречия с Pseudocode/Specification.
4. pseudocode — реализуемость 17 алгоритмов, покрытие 26 SC, порядок операций безопасности (лимит ДО валидации? квота ДО вызова модели? согласие ДО записи?), гонки (двойная аренда, атомарность квоты), пропущенные ветки.
5. coherence — противоречия между документами: числа (10/3000, 0,6, 15%, 30 дней, 60 с), статусы, имена сущностей/маршрутов, что входит/не входит (штрихкоды, подписка, выплаты).
6. dependencies — таблица `## External Dependencies` в Architecture.md: каждая ли способность, на которую опираются требования, есть в таблице; цитаты правдоподобны и называют именно эту способность; нет ли требований, опирающихся на неназванные внешние возможности (например, распознавание штрихкодов, Telegram-бот, платежи).

Формат отчёта (русский, ≤ 160 строк): заголовок; «Requested model: gpt-5.6-sol high»; «Actual model/effort: <что знаешь о себе или unknown>»; «Spec revision: sha256:<первые 12 символов>» (посчитай `sha256sum docs/Specification.md`); «## Verdict» — 🟢 READY / 🟡 CAVEATS / 🔴 NEEDS WORK по правилам SKILL.md одной фразой; «## Scores» — таблица US-nnn | оценка | INVEST x/6 | SMART x/5 | статус; «## Findings» — каждая: id V2-Rnn, severity blocker/high/medium/low, линза, файл:строка, что не так, чем исправить; «## Проверено без замечаний» — линзы 1–6 со статусом. Не выдумывай находки ради числа; нулевой результат по линзе допустим с доказательством.
