# foundation — adversarial checks

Read ../../Refinement.md requirement/scenario matrix and validation amendments; all relevant cases mandatory. Exact source criteria below, including negative/concurrency/state transitions, not coverage-by-title alone. Independent anti-drift after implementation+checks; fix code/spec by logged judgment. One review then concrete fixes/targeted closure, no optional polish.

- SC-US-001-1: Given новый адрес; When зарегистрировался, вышел и вошёл; Then кабинет доступен только новой действующей сессии.
- SC-US-001-2: Given неверный пароль/истёкшая или отозванная сессия; When вход/чтение; Then общий 401, приватные данные отсутствуют.
- SC-US-001-3: Given 72/73 UTF-8 bytes и multibyte пароль; When register/login; Then 72 допустим при ≥12 символах,73 отклоняется явно до bcrypt, suffix не становится эквивалентным паролем.
- SC-US-002-1: Given два проекта; When изменён и перезагружен один; Then второй не изменён, состояние первого восстановлено.
- SC-US-002-2: Given другой аккаунт/архив; When чужой ID либо мутация архива; Then 404 либо 409 PROJECT_ARCHIVED соответственно, данные не изменены.
- SC-US-016-1: Given cross-origin/request без CSRF либо чужой ID; When mutation/read; Then 403/404, side effect отсутствует.
- SC-US-016-2: Given 59 mutation attempts в минуте; When 20 одновременных requests одного actor; Then ровно1 проходит и19 получают429/Retry-After; счёт включает отклонённые/невалидные попытки.
- SC-US-016-3: Given valid owned bounded mutation и точный Origin; When active session обращается ниже лимита; Then одна успешная mutation с сохранённым результатом.
- SC-US-019-1: Given A и B; When A использует B ID в URL/scalar/array/JSON relation; Then 404 без private bytes/side effect, разрешённое owned чтение успешно.
- SC-US-020-1: Given malformed/oversized/slow body; When повтор обращений; Then rate counted до parse, typed400/413/timeout до decode, DB connection не удерживается на body read.
- SC-US-020-2: Given SQL/HTML/script/URL-userinfo input; When accepted text or rejected URL обрабатывается; Then SQL параметризован, markup escaped, shell/network execution отсутствует.
- SC-US-021-1: Given secret-bearing failure; When exception обработан; Then журнал содержит только code/requestId/latency/hashed IDs, без password/token/plan/payload.
- SC-US-017-1: Given fresh isolated env; When migrate/build/start; Then health ready, DB не имеет published ports, project data переживают restart.
- SC-US-017-2: Given incompatible config/schema/storage; When ready/start; Then non-ready/отказ startup с redacted причиной, live inference/payment не вызываются.
