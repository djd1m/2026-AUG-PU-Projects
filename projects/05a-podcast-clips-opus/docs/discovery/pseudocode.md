# Квитанция единицы pseudocode

**RUN_ID:** 20260923T173212Z-replicate-05a-475b · **WORK_UNIT_ID:** pseudocode · Claude Opus 5.5 · 2026-09-23
**Файл:** docs/Pseudocode.md (1079 строк, sha256 2a4c2526bfd841f9…)
**Опора:** Specification.md (приведена к канону), canon.md sha256 db7d3a7e25e46daa…, ADR-001…017.

## Итог

- Алгоритмов (`### Algorithm:`): 42; у каждого ≥ 1 строка `REQUIREMENT:` (проверено awk).
- Машинных ключей Specification (заголовки `###` FR/NFR/AC/FR-GROWTH): 52; покрыто строками REQUIREMENT: 49; лишних ключей (нет в Specification): 0.
- Покрыты: FR-clips-1…15, FR-GROWTH-001…005, NFR-clips-1, 2, 3, 5, 6, 8, AC-clips-1…14, 16…24.
- Не алгоритмические (раздел «Не алгоритмические требования», с причиной): NFR-clips-4 (config-only, compose), NFR-clips-7 (ui-only), AC-clips-15 (config-only, check-ports), FR-LOOK-001/002/007/008/009/010/011/013 (ui-only; объявлены таблицей, не `###`).
- Сценарии: в Specification 48 SC, заявлено алгоритмами 46; не заявлены SC-US-006-2 (ui-only), SC-US-012-3 (config-only); висячих заявок нет.
- Ворота: `node .claude/hooks/check-docs-complete.cjs projects/05a-podcast-clips-opus` → exit 0 (предупреждение «[k]» у Pseudocode — индексы массивов, не шаблон).

## Вопросы к Specification / канону (чужие файлы не правились)

- В-1 `transcript_chunk.attempt_count` нет в каноне — нужен для «первая попытка оплачена допуском, повторы резервируют сами».
- В-2 `video.s3_upload_id`, `video.rights_confirmed_at` нет в каноне.
- В-3 `created_at` у email_token, refresh_token, video, job, transcript_chunk, clip, publication, partner — навык требует; job.created_at задаёт день job-счётчиков.
- В-4 значения `quota_counter.kind` (stt_sec, uploads, llm_kop, llm_attempts) и scope_id для global (нулевой UUID) не названы каноном.
- В-5 повторная отправка письма (FR-clips-1 п. 1) — маршрута в каноне нет.
- В-7 ссылки на части TTL 15 мин против загрузки 2 ГБ ~27 мин — маршрута перевыдачи нет (риск).
- В-9 имя cookie сессии посетителя (`sid`) для дедупликации /c/ не в каноне.
- В-10 резерв LLM для 120-мин выпуска ≈ 950–1100 коп. у границы LIMIT_LLM_KOP_JOB=1000.
- В-11 «2 попытки LLM на задачу» без суток делает повтор после selection_failed невозможным; принято «на задачу в сутки».
- В-12 FR-GROWTH-002 «запись хранит оба источника» — в attribution одна строка на стадию; второй источник в props события promo_code_entered.
- В-14 где magic bytes: канон §3/FR-clips-2 п. 3 — подготовка воркера; AC-clips-2 требует «задача не создаётся» → проверка в web до создания задачи + перепроверка в подготовке.
- В-15 FR-clips-2 п. 5 ставит лимит 3 загрузок до проверки размера; NFR-clips-2 и security-operation-order — квота после валидации; принят второй порядок.
- В-19 канон §10 перечисляет 14 FR / 20 AC, в Specification 15 FR / 24 AC — канон §10 устарел.
- В-20 судьба publication при удалении клипа не названа; принято удаление вместе с клипом.
- В-22 сброс пароля одноразовой ссылкой: у `email_token` нет `purpose`, маршрута установки пароля в каноне нет (сверка после правки канона 2026-09-23; `/admin/users` → письмо через Resend).
- В-21 подкоманда `ops stt-probe` не в каноне.
- Закрыты правкой Specification/канона во время работы: срок pref 60 дней, `{job_id}:stt:prepare`, 7 критериев пробы, один вызов LLM, хосты канона, selection_failed вместо provider_unavailable, минимум клипа 20 с.

Status: completed
