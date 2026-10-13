# Solution Strategy

## SCQA / First principles

Situation: несколько ящиков требуют координации. Complication: рост объёма
повышает риск нежелательных сообщений, а маленький pool не даёт обещанного
сетевого эффекта. Question: как дать минимальный полезный pilot без скрытой
отправки и ложных метрик? Answer: seeded opt-in cohort, один прозрачный dispatcher,
доказательства разрешения и остановки на границе каждого сообщения.

5 Whys: chain не остановилась → reply не обработан → poll отстал → UI считал
connection достаточным → dispatch не проверял свежесть ingestion. Root cause:
право отправки должно проверяться в worker непосредственно перед попыткой.

## Stakeholders / second order

Владелец хочет начать переписку, получатель — контролировать inbox, provider —
не принимать abuse, организатор — запустить cohort. Не заявляем измеренный
Nash equilibrium. Растущий pool может увеличивать и негативные внешние эффекты;
quarantine и opt-out важнее красивого growth counter.

| Противоречие | Принцип | Решение |
|---|---|---|
| Автономность и явный контроль | Разделение по условию | Отдельное согласие + dispatch guard + operator live gate |
| Маленькая база и сетевой эффект | Предварительное действие | Seed cohort до live warmup |
| Достоверность и быстрый Aha | Обратная связь | Unknown пока evidence отсутствует; не synthetic score |
| Повтор после timeout и дубли | Разделение состояния | ambiguous outcome terminal pending operator review |

## Recommended approach

Node/TypeScript web/API + worker, один PostgreSQL, Docker Compose. Typed domain
services вызываются из API и worker; no production in-memory persistence.
Архитектурные решения ADR-001..005 в плане и ADR.md. Сначала bounded auth/mailbox
kernel, затем dispatch, затем UI/evidence, без CRM/LLM расширений.

| Риск | Вероятность / impact (экспертно) | Мера |
|---|---|---|
| SSRF через provider host | Средняя / высокий | Явный allowlist, DNS/IP validation, TLS, no redirects |
| Credential leakage | Средняя / высокий | AEAD, runtime key, scrubbed errors, canary tests |
| Provider forbids warmup | Не измерено / высокий | Live activation blocked до policy/provider review |
| Ошибочная атрибуция | Средняя / средний | Signed cookie + explicit code, immutable snapshot, dedup |
| Cost/time overrun | Средняя / средний | 20-minute tasks, source-bound handoffs, one review cycle |
