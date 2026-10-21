# foundation — source-derived feature specification

Source Specification sha256:7e6d118d36a4459927c244c90372e7c66ef7daa282b22e85186496332dc825dd
Parent validation: ../../validation-report.md (six independent lenses and concrete closures). Owner A/full implementation approved; no renewed checkpoint.

### FR-foundation-1
Decision: ADR-001 — границы этой способности и обязательные guards.
Регистрация email/password, вход, выход и серверные отзываемые сессии; адаптировать N6 AuthService без `@n6/rag` и партнёрских зависимостей. Пароль 12–72 символа и не более72 UTF-8 байт (bcrypt иначе обрезает хвост); одинаковая явная валидация при register/login, email ≤254; bcrypt cost 10 минимум, токен ≥32 случайных байт, в БД только HMAC/hash. Cookie HttpOnly/SameSite=Lax, Secure при HTTPS; TTL 7 суток (проектное решение). Ошибки входа не раскрывают существование email; session lookup проверяет expiry/revoked/account active.
US-001: Как владелец, хочу возвращаться к своим проектам с защищённой сессией.
- [SC-US-001-1] Given новый адрес; When зарегистрировался, вышел и вошёл; Then кабинет доступен только новой действующей сессии.
- [SC-US-001-2] Given неверный пароль/истёкшая или отозванная сессия; When вход/чтение; Then общий 401, приватные данные отсутствуют.

- [SC-US-001-3] Given 72/73 UTF-8 bytes и multibyte пароль; When register/login; Then 72 допустим при ≥12 символах,73 отклоняется явно до bcrypt, suffix не становится эквивалентным паролем.


### FR-foundation-2
Создать/переименовать/архивировать проект, выбрать регион, открыть список и продолжить текущий шаг. Во всех проектах/дочерних сущностях проверяется owner account. Архивация делает проект read-only, отключает sharing и новые jobs; физическое удаление/аккаунт-erasure отдельно от MVP. Список курсорный ≤50.
US-002: Как владелец, хочу отдельные сохраняемые проекты и историю.
- [SC-US-002-1] Given два проекта; When изменён и перезагружен один; Then второй не изменён, состояние первого восстановлено.
- [SC-US-002-2] Given другой аккаунт/архив; When чужой ID либо мутация архива; Then 404 либо 409 PROJECT_ARCHIVED соответственно, данные не изменены.


### NFR-foundation-1
Parent source requirement: NFR-security-1.
Owner check в каждом repository-read/write и file route; неизвестный и чужой ID одинаковы 404. Same-origin + CSRF на cookie mutations, включая auth; webhook исключён из CSRF и имеет собственную verification. JSON≤256 KiB, upload bounded до decode, URLs не fetch; secrets только env server-side, redact logs. Rate limit атомарный Postgres: auth 10/min/IP, mutation 60/min/account, share-read 60/min/IP (проектные начальные лимиты). Security headers/CSP запрещают inline executable user content. IP заголовкам доверять только настроенному внутреннему proxy.
US-016: Как владелец, хочу безопасную cookie mutation через единый session/Origin guard.
- [SC-US-016-1] Given cross-origin/request без CSRF либо чужой ID; When mutation/read; Then 403/404, side effect отсутствует.
- [SC-US-016-2] Given 59 mutation attempts в минуте; When 20 одновременных requests одного actor; Then ровно1 проходит и19 получают429/Retry-After; счёт включает отклонённые/невалидные попытки.
- [SC-US-016-3] Given valid owned bounded mutation и точный Origin; When active session обращается ниже лимита; Then одна успешная mutation с сохранённым результатом.
US-019: Как владелец, хочу изоляцию project/file/relation чтения и записи.
- [SC-US-019-1] Given A и B; When A использует B ID в URL/scalar/array/JSON relation; Then 404 без private bytes/side effect, разрешённое owned чтение успешно.
US-020: Как оператор, хочу bounded transport/input gate отдельно от бизнес-логики.
- [SC-US-020-1] Given malformed/oversized/slow body; When повтор обращений; Then rate counted до parse, typed400/413/timeout до decode, DB connection не удерживается на body read.
- [SC-US-020-2] Given SQL/HTML/script/URL-userinfo input; When accepted text or rejected URL обрабатывается; Then SQL параметризован, markup escaped, shell/network execution отсутствует.
US-021: Как оператор, хочу redacted журнал отказов по requestId.
- [SC-US-021-1] Given secret-bearing failure; When exception обработан; Then журнал содержит только code/requestId/latency/hashed IDs, без password/token/plan/payload.


### AC-foundation-1
Source criterion SC-US-001-1: Given новый адрес; When зарегистрировался, вышел и вошёл; Then кабинет доступен только новой действующей сессии.

### AC-foundation-2
Source criterion SC-US-001-2: Given неверный пароль/истёкшая или отозванная сессия; When вход/чтение; Then общий 401, приватные данные отсутствуют.

### AC-foundation-3
Source criterion SC-US-001-3: Given 72/73 UTF-8 bytes и multibyte пароль; When register/login; Then 72 допустим при ≥12 символах,73 отклоняется явно до bcrypt, suffix не становится эквивалентным паролем.

### AC-foundation-4
Source criterion SC-US-002-1: Given два проекта; When изменён и перезагружен один; Then второй не изменён, состояние первого восстановлено.

### AC-foundation-5
Source criterion SC-US-002-2: Given другой аккаунт/архив; When чужой ID либо мутация архива; Then 404 либо 409 PROJECT_ARCHIVED соответственно, данные не изменены.

### AC-foundation-6
Source criterion SC-US-016-1: Given cross-origin/request без CSRF либо чужой ID; When mutation/read; Then 403/404, side effect отсутствует.

### AC-foundation-7
Source criterion SC-US-016-2: Given 59 mutation attempts в минуте; When 20 одновременных requests одного actor; Then ровно1 проходит и19 получают429/Retry-After; счёт включает отклонённые/невалидные попытки.

### AC-foundation-8
Source criterion SC-US-016-3: Given valid owned bounded mutation и точный Origin; When active session обращается ниже лимита; Then одна успешная mutation с сохранённым результатом.

### AC-foundation-9
Source criterion SC-US-019-1: Given A и B; When A использует B ID в URL/scalar/array/JSON relation; Then 404 без private bytes/side effect, разрешённое owned чтение успешно.

### AC-foundation-10
Source criterion SC-US-020-1: Given malformed/oversized/slow body; When повтор обращений; Then rate counted до parse, typed400/413/timeout до decode, DB connection не удерживается на body read.

### AC-foundation-11
Source criterion SC-US-020-2: Given SQL/HTML/script/URL-userinfo input; When accepted text or rejected URL обрабатывается; Then SQL параметризован, markup escaped, shell/network execution отсутствует.

### AC-foundation-12
Source criterion SC-US-021-1: Given secret-bearing failure; When exception обработан; Then журнал содержит только code/requestId/latency/hashed IDs, без password/token/plan/payload.

