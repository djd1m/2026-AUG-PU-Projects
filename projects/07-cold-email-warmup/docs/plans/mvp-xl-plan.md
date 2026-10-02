# N7 «Когорта»: план MVP v1 для утверждения

Дата: 2026-10-02. Baseline: `3b84e9ef`. Ветка: `feature/07-cold-email-warmup`.
Статус: план подготовлен, реализация продукта ожидает XL-checkpoint владельца.

Постановка: `start/REPLICATE-PROMPTS-PROJECTS.md`, секция 07, имеет приоритет
над исходным README. Выбор CJM A выполнен по явному поручению владельца.

## Результат

Работающий самостоятельный distributed monolith: web/API, worker, PostgreSQL,
Docker Compose на VPS. Русский кабинет позволяет подключить SMTP/IMAP ящик,
отдельно согласиться на общий прогревочный пул, составить персонализированную
цепочку, проверить её и явно разрешить отправку. Worker ротирует ящики,
соблюдает совокупный лимит, останавливается при ответе, отписке или жалобе.
Без внешнего разрешения система работает с локальным тестовым транспортом.

Репутация изначально «нет подтверждённых данных». Aha — только датированное
улучшение сопоставимого показателя из указанного источника. Размер пула,
отправленные сообщения и SMTP accepted не подменяют репутацию или inbox placement.

## Границы

- В MVP: регистрация/вход; ящики и защищённые credentials; seed cohort;
  pooled warmup; ротация и лимиты; контакты с полями; цепочки; ответы;
  suppression и complaints; FR-GROWTH-001..004; тарифный экран и безопасный
  payment adapter с проверяемым sandbox, без реального списания.
- Вне MVP: покупка доменов/ящиков, AI-ответы, CRM, проверка существования адреса,
  обещание улучшить доставляемость, имитация открытий/удаление из spam,
  мультиуровневые партнёрские выплаты.
- Production deployment — отдельный checkpoint. Реальные SMTP/IMAP соединения,
  рассылки, live charge и изменения общего reverse proxy не разрешены этим планом.
- LLM в продукте не требуется: поля подставляются детерминированно.

## Последовательность /next → /go

| Фича | Тир | Выход и проверяемая граница |
|---|---|---|
| F01 identity-foundation | L | PostgreSQL schema, tenant auth, sessions, encrypted credentials, 401/403 и cross-tenant tests |
| F02 mailbox-pool | XL | отдельное версионированное согласие, отзыв согласия, pool eligibility, safe SMTP/IMAP adapter, SSRF/TLS guards |
| F03 sequences-dispatch | XL | поля и preview, отдельное согласие запуска, transaction claim/quota, retry ambiguity и stoplist |
| F04 replies-complaints | XL | IMAP cursor/UIDVALIDITY, match by Message-ID, остановка enrollment, one-click unsubscribe, complaint quarantine |
| F05 growth-billing-ui | XL | честные метрики, share после verified improvement, partner code+cookie, free badge, sandbox payment adapter |
| F06 acceptance | L | независимое ревью, targeted fixes, полный regression, реальный browser E2E в общем Docker Playwright, PR |

Для каждой фичи отдельная telemetry run, ROUTE до PLAN и IMPLEMENT, исходная
ревизия и уникальные receipts. Работа не выдаётся за принятую до обязательных ворот.

## Решения для явного утверждения

1. **ADR-001:** сервер хранит SMTP/IMAP credentials только AES-256-GCM ciphertext;
   отдельный runtime key вне БД и git; AAD привязывает tenant+mailbox; raw credentials
   доступны только bounded worker operation. Это намеренное отклонение от общего
   browser-only IndexedDB шаблона `/replicate`: автономный scheduler не может
   работать с закрытым браузером иначе. В логах нет password, body, auth headers.
2. **ADR-002:** fail-closed сеть. По умолчанию local test transport. Live mode требует
   отдельного разрешения оператора, разрешённого provider host, валидного TLS,
   согласия пользователя, eligibility и доступной complaint ingestion capability.
3. **ADR-003:** общий opt-in пул начинается с когорты курса. Цель недели — 30
   подключённых, пригодных и отдельно согласившихся ящиков; это целевой эксперимент,
   не гарантия network effect. Отсутствие пула оставляет честный waiting state.
4. **ADR-004:** payment integration сначала sandbox/fake provider. Серверные тарифы,
   immutable order snapshot, idempotency, проверка provider state и независимый
   источник статуса; без live key/charge. При отсутствии нужного sandbox контракт
   остаётся блокирующим для billing, а не незаметным mock production.
5. **ADR-005:** максимум reuse из N1–N6 по inventory; брать минимальные auth,
   session, payment, partner primitives, не копировать чужие продуктовые документы.

## Команда и навыки

Координатор/планировщик: `gpt-6-astra`, high. Автор HTML/продуктового кода/тестов:
`gpt-6.1-sol`, high. Независимый reviewer: новый `gpt-6-astra`, high/medium,
read-only к исходникам, не автор. Только OpenAI; максимум два дочерних агента,
один писатель на isolated worktree. Общие root manifests/toolkit не меняются.
Роли выбираются по compact-quality-first-v2; Sol 6.1 вместо указанного в таблице
5.6 — явное указание владельца. Usage/cost неизвестны до host receipts.

Навыки: reverse-engineering-unicorn QUICK → sparc-prd-mini →
requirements-validator → cc-toolkit-generator-enhanced; project-work-companion
на prepare/E2E/handoff; OpenAI Docs для основания выбора моделей.
Один implementation pass → независимое review → только конкретные исправления.
Попытка автора 20 минут, проверка артефактов к концу бюджета, причина задержки
и следующий ограниченный шаг сообщаются владельцу. Бюджет — не оценка срока MVP.

## Критерии приёмки

| AC | Проверка |
|---|---|
| AC-N7-001 | 3 автономных HTML, выбран A с причинами отклонения B/C; mobile/keyboard |
| AC-N7-002 | Регистрация и logout; изоляция второго tenant; raw secrets отсутствуют в API/БД/логах |
| AC-N7-003 | Без отдельного pool/campaign consent число вызовов transport равно 0 |
| AC-N7-004 | При 20 конкурентных claim и лимите 3 отправок не более 3 резервов; warmup+campaign используют общий бюджет |
| AC-N7-005 | Все generated letters содержат unsubscribe body + List-Unsubscribe и List-Unsubscribe-Post; repeated unsubscribe идемпотентен |
| AC-N7-006 | Reply/complaint/opt-out до dispatch отменяет его; неоднозначный SMTP timeout не приводит к слепому retry |
| AC-N7-007 | Пул из разных tenants не раскрывает адреса/контент участникам; seed waiting и withdrawal проверены |
| AC-N7-008 | Подстановка allowlisted полей, missing field блокирует запуск, preview защищён от XSS/header injection |
| AC-N7-009 | Нет provider evidence → reputation unknown, share disabled; source/date/denominator присутствуют у наблюдения |
| AC-N7-010 | 12 growth BDD: happy с числом, edge, security на каждый FR; self-referral/replay запрещены |
| AC-N7-011 | typecheck/lint/build/full tests, mutation антиспам guard, concurrent DB tests, clean secret scan |
| AC-N7-012 | UI E2E только через подтверждённый общий Docker Playwright; source/build/screenshots receipts; PR в текущую default ветку |

## Checkpoint

Нужно утвердить план v1, ADR-001..005, указанные команду/модели/навыки и границы
реализации. Основание: `.claude/rules/complexity-router.md` — «XL — /feature полным
циклом + остановка на плане у владельца». Разрешение самостоятельно выбрать CJM
использовано; оно не подменяет этот checkpoint.
