# Квитанция кода — фича 27a `clip-cta` (призыв к действию: выбор, хранение, кнопка на `/c/`)

Исполнитель: Opus 5.5 (Claude Code, 25.09.2026). OpenAI/Codex не вызывались. Миграция на стенд НЕ применена,
ничего не выкачено и не закоммичено, `.env`/секреты не трогались. Проверку кода делает другой агент (OWN-017).
Телеметрия p-replicator этим исполнителем не велась: `null` — запись прогона принадлежит координатору.

## Что сделано (27a)

| Часть | Где |
|---|---|
| Закрытый набор `CTA_KIND = none \| watch_full \| subscribe \| open_link`, `readCtaKind` (fail-closed → `none`), `SQL_ENUMS['video.cta_kind']` | `packages/shared/src/enums.ts` |
| Словарь надписей, разбор адреса `parseCtaUrl`/`parseCtaTarget`, чтение из базы `readStoredCta`, видимый домен `ctaDisplayHost` | `packages/shared/src/cta.ts` (новый) |
| Миграция: `cta_kind` (CHECK по набору, NOT NULL DEFAULT 'none'), `cta_url` (NULL либо `https://…` длиной 9–2048), CHECK пары `(cta_kind='none') = (cta_url IS NULL)`; `source_url` не тронут | `packages/db/migrations/020_clip_cta.sql` (новый) |
| `video.create`: необязательные `cta_kind`/`cta_url` (старый клиент → `none`), смысловой разбор ДО заявки `Idempotency-Key` и квоты с `422` и причиной, INSERT `$11/$12`, конфликт ключа при другом призыве → `409` | `apps/web/src/server/upload-contract.ts`, `video.ts` |
| `video.setCta` — 17-я процедура: ТОЛЬКО сохраняет вид и адрес одним `UPDATE` по владельцу; без пересборки, без квоты, `updated_at` не трогается; чужая/несуществующая/удалённая запись → один `404` | `apps/web/src/server/video-cta.ts` (новый), `trpc.ts`, `upload-runtime.ts`, `app/api/trpc/[trpc]/route.ts`, `lib/rpc.ts` |
| Экран записи получает текущий призыв (`video.get` → `cta_kind`, `cta_url`, fail-closed) | `server/screen.ts`, `lib/screen-contract.ts` |
| Форма загрузки: «Что сделать зрителю в конце» (`select` из 4) + поле ссылки для видов кроме `none`; проверка до заявки ключа; хранится для возобновления тем же ключом | `app/upload/Uploader.tsx`, `app/videos/CtaFields.tsx` (новый) |
| Экран записи: панель «Призыв в конце» с сохранением через `video.setCta` (после клипов — «запись и клипы первыми») | `app/videos/[videoId]/VideoDetail.tsx`, `CtaFields.tsx`, `globals.css` (только токены, mobile-first) |
| `/c/{code}`: главная кнопка — внешняя ссылка автора (`rel="noopener noreferrer nofollow"`, `target="_blank"`), под ней «Ссылка автора клипа · youtube.com»; «Сделать свои клипы» — `.secondary-link`; без призыва — прежняя страница | `server/short-link.ts` (SELECT `v.cta_kind,v.cta_url`), `server/short-link-handler.ts` |

### Решения, принятые исполнителем (сверить координатору)

1. **`.cta` = основное действие `/c/`** (правка 9): при заданном призыве класс несёт кнопка автора, иначе
   «Сделать свои клипы»; второе действие — `.secondary-link` (≥ 44×44). `FIRST_SCREEN_ACTIONS` не меняется
   (`/c/` → `.cta`), но смысл теперь проверяется: ровно один `.cta` в обоих вариантах (юнит) и R9 на
   НАСТОЯЩЕЙ странице `/c/` в WebKit и Chromium на 390×844/375×667/360×740 с проверкой ТЕКСТА найденного
   `.cta` (браузерный набор). `tests/responsive-check.test.ts:170` оставлен как есть — селектор тот же;
   кейсы «задан/не задан» добавлены в `tests/clip-cta.test.ts` и `tests/browser/responsive-check.test.ts`.
2. **`search`/`hash` в `cta_url` разрешены** (правка 11): ссылка на выпуск YouTube несёт `?v=`. Защита вывода —
   `escapeHtml` адреса и домена, закреплена тестом с `"><script>` в query и `'onmouseover=` в hash.
3. **`updated_at` не трогается** в `video.setCta`: по нему экран отличает «выполняется» от «нет ответа»
   (300 с) — смена призыва замаскировала бы зависшую обработку. Закреплено интеграционным тестом.
4. **Чтение из базы fail-closed:** неизвестный вид или непригодный адрес (обход CHECK) → кнопки призыва нет.
5. **Надпись на экране записи честная:** «В видео надпись пока не добавляется» — до 27b.
6. **Новый страж (правка 1, «страж без цели»):** `tests/enums.test.ts` — каждый `CHECK … IN (…)` миграций
   обязан быть объявлен в `SQL_ENUMS`; пять существовавших до фичи перечислений вне shared названы явным
   списком исключений (`attribution.reject_reason`, `clip.music_skip_reason`, `job_attempt.unit`,
   `job_attempt.wait_reason`, `partner_code.blocked_reason`) — кандидаты на перенос в shared, не в этой фиче.

## Правки 01_validate: что выполнено в 27a, что отнесено к 27b

| № | Правка | Где |
|---|---|---|
| 1 | `SQL_ENUMS['video.cta_kind']` + проверка, что забытая запись ловится | **27a, выполнено** (мутация `sql-enums-entry`) |
| 2 | Геометрия надписи числом, fail-closed при непомещении | 27b |
| 3 | Окно показа надписи числом | 27b |
| 4 | Запрос активных `job_attempt(render)` по всем клипам записи до лизинга, `409` целиком | 27b (в 27a нет пересборки) |
| 5 | Квота `user_rerenders` одним вызовом на N | 27b |
| 6 | Частичный отказ пересборки не откатывается — в ADR-017 | 27b (в ADR-017 записано планом) |
| 7 | Нейтральный текст `quotaMessages.user_rerenders` | 27b — по постановке `limits-contract.ts` в 27a не трогать |
| 8 | Конфликт `cta_kind`/`cta_url` по ключу `video.create` | **27a, выполнено** (мутация `idempotency`) |
| 9 | Распределение `.cta` между двумя кнопками + тест «задан/не задан» | **27a, выполнено** (мутация `primary-class`, R9 в браузере) |
| 10 | `cta_kind`/`cta_url` в `RenderInput`/`getRenderInput` | 27b — воркер в 27a надпись не рисует |
| 11 | `escapeHtml` адреса и домена, тест на `search`/`hash` | **27a, выполнено** (мутация `escape`) |
| 12 | Заявление «сервер не запрашивает `cta_url`» | **27a, выполнено** — строка ниже и ADR-017 п. 7 |

Также из §6 «Проб. 4» (Zod `.strict()` — поля `.optional()`, дефолт `none` отдельно протестирован) — 27a, выполнено.

## Злоупотребление и как закрыто

Наш домен показывает ссылку на произвольный адрес автора — поверхность фишинга. Закрыто: только `https`
(`http:`, `javascript:`, `data:` — отказ; второй рубеж — CHECK в базе и `readStoredCta` при чтении); без
логина/пароля в адресе (`https://user:pass@…` — классический обман доменом); видимый домен назначения
после `new URL` (IDN — в punycode, двойник не маскируется); пометка «Ссылка автора клипа»; `nofollow`;
обычный `<a href>` без редиректа через наш домен (открытого редиректа нет — тест `href` = адрес автора, в
странице нет `redirect`/`?to=`); надписи из закрытого словаря. CSP `/c/` не изменена (тест дословно).
Остаток: модерации адресов нет — автор может сослаться на вредный `https`-сайт; зритель видит домен.

**Сервер не выполняет исходящих запросов по `cta_url` ни на одном шаге** (`video.create`, `video.setCta`,
`/c/`): только разбор строки `new URL` в памяти — SSRF-поверхности нет (ADR-017 п. 7).

## Проверки

| Проверка | Итог |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run lint` | «Статические правила: ошибок нет» |
| build | `npm run build` внутри образа `test` (`#17 [build 2/2] RUN npm run build`, Next «✓ Compiled successfully»; предупреждение bullmq `@valkey/valkey-glide` — прежнее) |
| Набор в образе `docker compose --project-directory . --env-file /tmp/n5-test.env --profile test run --rm --build test` | **`Test Files 103 passed (103)`, `Tests 904 passed (904)`**, exit 0 (было 857: +42 `clip-cta.test.ts`, +4 `clip-cta.integration.test.ts`, +1 `enums.test.ts`) |
| `bash scripts/check-responsive.sh --test` | **`Tests 74 passed (74)`**, exit 0 (было 50: +24 — R9 `/c/` с призывом тёмная/светлая и без призыва × 3 экрана × 2 движка, R1/R2/R5+axe по трём страницам; палитра `.cta-panel` в обеих темах) |
| Фикстуры `tests/fixtures/responsive/c-*.html` | сверяются с настоящим обработчиком `/c/` тестом; устаревшая фикстура — красное |

### Мутации (`node tests/run-clip-cta-mutations.mjs`; квитанции `tests/artifacts/clip-cta/`)

Строки дословно из `mutations.json` (vitest `--reporter=json`). Последние три — в образе `test` на
настоящем PostgreSQL 16 (журнал `tests/artifacts/clip-cta/integration-mutations-docker.log`).

| Мутация | Красное | Зелёное | Итог |
|---|---|---|---|
| protocol — пропуск проверки `https:` | red exit=1 1 failed / 19 passed | green exit=0 20 passed | killed |
| credentials — пропуск логина/пароля | red exit=1 2 failed / 18 passed | green exit=0 20 passed | killed |
| escape — `href` без `escapeHtml` на `/c/` | red exit=1 2 failed / 7 passed | green exit=0 9 passed | killed |
| stored-fail-closed — чтение из базы без `readStoredCta` | red exit=1 2 failed / 7 passed | green exit=0 9 passed | killed |
| primary-class — обе кнопки `.cta` | red exit=1 1 failed / 0 passed | green exit=0 1 passed | killed |
| idempotency — без конфликта призыва по ключу | red exit=1 1 failed / 0 passed | green exit=0 1 passed | killed |
| enum-check — CHECK миграции расходится с `CTA_KIND` | red exit=1 1 failed / 0 passed | green exit=0 1 passed | killed |
| parse-before-claim — разбор адреса пропущен до заявки | red exit=1 1 failed / 1 passed | green exit=0 2 passed | killed |
| sql-enums-entry — забыта запись `SQL_ENUMS` | red exit=1 1 failed / 0 passed | green exit=0 1 passed | killed |
| check-pair — снят CHECK пары вид↔адрес (миграция) | red exit=1 1 failed / 0 passed | green exit=0 1 passed | killed |
| check-url — снят `LIKE 'https://%'` (миграция) | red exit=1 1 failed / 0 passed | green exit=0 1 passed | killed |
| owner — `video.setCta` без условия владельца | red exit=1 1 failed / 0 passed | green exit=0 1 passed | killed |

Замечание к `protocol`: красным стал только случай `http:` — `javascript:`/`data:` дополнительно режет
проверка «в адресе нет домена». Это второй рубеж, а не слабость стража.

## Документы (черновики, координатор сверяет)

- `docs/ADR.md` — ADR-017 (27a решено, 27b — план), строка в сводке.
- `docs/Specification-addendum.md` — FR-RESULT-006 (27a выполнено, 27b — нет).
- `docs/canon.md` — §5 «ровно 17», `video.setCta` 17-й; §4 `video.cta_kind` — ровно 4, миграция 020.
- «16 процедур» → 17: `CLAUDE.md` (стр. 81, 205; также «семнадцать решений ADR-001…017»),
  `.claude/agents/architect.md` (стр. 4, 25, 27; заодно устаревшее «`quota_counter.scope` — **6**» → 7).
  В корневых `CLAUDE.md` и `.claude/rules/*` «16 процедур» не найдено. Исторические записи (ADR-016 «16-я
  процедура», `decisions-owner.md`, `feature-roadmap.json` для `clip-music-choice`, `REPRODUCE.md` строка
  «15 → 16») оставлены — они описывают своё время.
- `docs/REPRODUCE.md` — строка в §10. **Не обновлено** (дело координатора при закрытии фичи): «857 тестов»
  в `CLAUDE.md`/`REPRODUCE.md` §4 → теперь 904/103 файла; `.claude/feature-roadmap.json`, `docs/features/README.md`.

## Что 27a НЕ доказывает

- Миграция 020 на стенде не применялась; `/c/` на `https://clipmkr.ru` с призывом не открывалась — R9 и
  контраст проверены на настоящей разметке страницы в эмуляции (фикстура), не на стенде.
- Встроенные браузеры VK/Telegram (`target="_blank"` там может открыть ссылку во внутреннем окне) не проверены.
- Надписи в пикселях нет, уже отрендеренные клипы призыва в кадре не несут (27b).
- Модерации адресов нет: вредный `https`-сайт автора будет показан с его доменом.

Status: completed
