# R3 — Аудит переиспользования январского клона для N5a

Источник: `.reference/jan-clone` (git `cc6ac599`, "1st commit", монорепо `clipmaker` / бренд "КлипМейкер").
Метод: статический анализ (чтение исходников с `file:line`). **npm install/build/тесты НЕ запускались** —
диск VPS почти полон (правило владельца), поэтому все выводы о собираемости — предсказание по коду, не
подтверждённый факт. Где это важно, это явно помечено.

---

## 1. Структура, стек, версии

**Монорепо:** npm workspaces (`apps/*`, `packages/*`) + Turborepo `^2.3.0`. `package.json:1-30`.

| Приложение/пакет | Роль | Ключевые зависимости |
|---|---|---|
| `apps/web` | Next.js 15.1 (React 19) SaaS-дэшборд, tRPC 11, NextAuth+jose JWT, Tailwind, Zustand | `apps/web/package.json` |
| `apps/worker` | 7 отдельных BullMQ-воркеров (stt/llm/video/publish/stats/billing-cron/download) | `apps/worker/package.json` |
| `packages/db` | Prisma 6.3, Postgres | `packages/db/prisma/schema.prisma` |
| `packages/queue` | BullMQ 5.25 + Redis | `packages/queue/src/*` |
| `packages/s3` | AWS SDK v3 S3-клиент (S3-совместимый, Cloud.ru Evolution) | `packages/s3/src/*` |
| `packages/crypto` | AES-256-GCM для BYOK-токенов | `packages/crypto/src/token.ts` |
| `packages/config` | zod-валидация env + таблица LLM-провайдеров | `packages/config/src/*` |
| `packages/types` | общие типы (не читал целиком — не потребовалось) | — |

Общий объём: **~21 268 строк** TS/TSX (`find apps packages -name "*.ts" -o -name "*.tsx" | xargs wc -l`).
Только **1 TODO** во всём коде (`apps/web/components/upload/video-uploader.tsx:386`) — кодовая база НЕ
скелет, реализована почти полностью, включая фичи вне нашего MVP (см. §5).

**Docker Compose (`docker-compose.yml`):** 4 воркер-контейнера + web + postgres + redis + minio + minio-init,
все из одного `Dockerfile` (`node:20-alpine` + `apk add ffmpeg`). ffmpeg зашит в общий образ — это
удовлетворяет постановке («ffmpeg в контейнере-воркере»), хотя ставится он и в web-образ, и в stt/llm-воркеры,
которым не нужен (минорный балласт, не дефект).

### Публикация портов — **нарушение Правила №0 (`docker-ports.md`)**

`docker-compose.yml:109-135`:
```yaml
postgres:
  ports: ["5432:5432"]      # без host_ip — публикация на 0.0.0.0
redis:
  ports: ["6379:6379"]      # то же самое
minio:
  ports: ["9000:9000", "9001:9001"]   # то же самое
```
Все три — хранилища, публикация без `127.0.0.1:`/`[::1]:` запрещена правилом №0 этого же репозитория.
Усугубляет: пароли-дефолты `POSTGRES_PASSWORD=clipmaker` (`docker-compose.yml:114`) и
`MINIO_ROOT_PASSWORD=minioadmin` (`docker-compose.yml:83-84`) — **ровно та комбинация**
(«необычный порт + дефолтный пароль»), которая по `CLAUDE.md` этой машины привела к компрометации
28.08.2026 тестового Postgres за час. **Переносить compose нельзя без починки** — убрать `ports:` у
postgres/redis/minio или ограничить `127.0.0.1:`, сменить пароли на случайные при разворачивании.

### Другие находки compose-hygiene.md

- `image: minio/minio:latest` и `image: minio/mc:latest` (`docker-compose.yml:80,97`) — без явного тега
  (правило №2 compose-hygiene.md). `postgres:16-alpine` и `redis:7-alpine` тегированы корректно.
- Нет `name:` на верхнем уровне compose-файла (правило №1) — низкий риск здесь (единственный compose-файл
  в проекте, не тестовый оверлей), но стоит добавить при переносе.
- `depends_on: condition: service_healthy` везде, `restart: unless-stopped` везде — правила №3 и №4
  compose-hygiene.md **соблюдены**.

### Dockerfile — вероятный npm-ci grubber (НЕ подтверждено сборкой)

`Dockerfile:8-17`:
```dockerfile
COPY package*.json ./
COPY turbo.json ./
COPY apps/web/package*.json ./apps/web/
COPY apps/worker/package*.json ./apps/worker/
COPY packages/db/package*.json ./packages/db/
COPY packages/queue/package*.json ./packages/queue/
COPY packages/types/package*.json ./packages/types/
COPY packages/config/package*.json ./packages/config/
RUN npm ci
```
Отсутствуют `COPY packages/s3/package*.json` и `COPY packages/crypto/package*.json`, при этом
`apps/worker/package.json` и `apps/web/package.json` оба зависят от `@clipmaker/s3` и `@clipmaker/crypto`
(`apps/worker/package.json` deps-блок). Это ровно грабля #2 из `compose-hygiene.md` («npm ci нужны
манифесты ВСЕХ workspace»): `npm ci` в монорепо сверяет весь lock-tree по всем workspace из корневого
`package.json` (`workspaces: ["apps/*","packages/*"]`), и отсутствующий манифест обычно даёт
`npm error Missing: @clipmaker/s3@... from lock file` или похожий отказ. **Статически это дефект; сборкой
не проверено** (по указанию координатора — диск почти полон). При переносе — либо чинить (добавить два
`COPY`), либо это первое, что проверяется `check-compose-buildable.sh` из `compose-hygiene.md`.

---

## 2. Схема БД (Prisma)

`packages/db/prisma/schema.prisma` — 12 enum + 11 моделей: `User, Video, Transcript, Clip, Publication,
Subscription, UsageRecord, PlatformConnection, Payment, Team, TeamMember, TeamInvite`.

**Прямое совпадение с нашим MVP:** `User` (план/минуты/квота), `Video` (статус-машина
`uploading→downloading→transcribing→analyzing→generating_clips→completed/failed`), `Transcript`
(язык, сегменты JSON, модель STT), `Clip` (таймкоды, `viralityScore` JSON, `subtitleSegments` JSON, `cta`,
`format`), `UsageRecord` (минуты + стоимость STT/LLM/GPU в копейках).

**Вне нашего MVP (постановка явно исключает автопостинг/команды):** `Publication`,
`PlatformConnection`, `Team`, `TeamMember`, `TeamInvite`. `Subscription`/`Payment` — платежи не в
недельном MVP-скоупе (только watermark-логика тарифа `free`, без реальной оплаты).

---

## 3. Модули конвейера — что реализовано, насколько, тесты

### 3.1 Загрузка (upload + URL ingestion)

- **Файловая загрузка:** `apps/web/app/api/upload/route.ts:1-88` — серверный proxy к S3
  (простой PUT + multipart part), проверка владения ключом по префиксу `videos/{userId}/`
  (`route.ts:29-31`). Реализовано полностью, магических байт на этом шаге НЕ проверяет (проверка вынесена
  в `@clipmaker/s3.validateMagicBytes`, вызывается в `download.ts`, но не найдена вызванной для файлового
  аплоада — риск: file-upload путь может не проверять magic bytes вовсе, нужна ре-проверка при переносе).
- **URL-загрузка:** `apps/worker/workers/download.ts` (1-150+) + `apps/worker/lib/ssrf-validator.ts`
  (1-236) — **сильная SSRF-защита**: блокировка приватных/reserved IPv4/IPv6 диапазонов включая
  cloud-metadata `169.254.169.254` (`ssrf-validator.ts:33-34`), ручная обработка редиректов с
  ре-валидацией каждого хопа (`ssrf-validator.ts:150-200`), ограничение размера (4GB), allowlist
  content-type, streaming multipart upload с ограниченной памятью (`download.ts:74-152`). Единственный
  остаточный риск — классический DNS-rebinding TOCTOU (резолвится один раз, `fetch` может резолвить
  повторно) — не фатально для внутреннего SaaS, но стоит знать.
- **Тесты:** 0 (не считая невовлечённых схем).

### 3.2 Транскрипция (Whisper) — **критическая находка**

`apps/worker/workers/stt.ts` (1-287) + `apps/worker/lib/stt-client.ts` (1-63) + `apps/worker/lib/audio-chunker.ts`.

Реализовано полностью: скачивание из S3, `ffprobe` длительности, экстракция WAV 16kHz mono, чанкинг по
`CHUNK_DURATION=180` сек (`audio-chunker.ts:4`), параллельная транскрипция чанков (`p-map`, concurrency 2),
квота по минутам с `user.minutesLimit`/`minutesUsed` (`stt.ts:64-74`), retry с backoff, транзакционная
запись Transcript+Video+UsageRecord (`stt.ts:185-219`), постановка следующей LLM-задачи в очередь.

**Находка A — таймкоды у RU-стратегии (Cloud.ru) фактически отсутствуют.** Постановка (`00-postanovka.md`)
называет таймкоды ЕДИНСТВЕННЫМ критерием выбора модели и требует `whisper-1 verbose_json` или
`gpt-4o-transcribe-diarize`. Код же явно обходит `verbose_json` для RU-стратегии:
```
// stt.ts:112-113
// Cloud.ru doesn't support verbose_json — use json directly for ru strategy
const responseFormat = strategy === 'ru' ? 'json' as const : 'verbose_json' as const;
```
Когда `responseFormat==='json'`, Cloud.ru возвращает только `{text}` без `segments`, и код синтезирует
**один сегмент на весь 3-минутный чанк** (`stt.ts:144-153`): `start=chunk.offsetSeconds`,
`end=chunk.offsetSeconds+chunkDuration`. Это означает: при RU-стратегии (a она — дефолт схемы,
`User.llmProviderPreference @default(ru)`, `schema.prisma`) нарезка клипов и субтитров ограничена
разрешением **3 минуты**, а не словом/фразой — прямое противоречие требованию постановки. Global-стратегия
(OpenAI `whisper-1`) действительно запрашивает `verbose_json` и получает `segments` (`stt.ts:113,129-133`),
но это **сегментный**, не пословный уровень — API не запрашивает `timestamp_granularities: ["word"]`.
Для целей проекта (субтитры/нарезка) сегментного уровня, вероятно, достаточно, но нужно явно решить на
этапе Requirements: RU-путь как есть не годится, Global-путь даёт сегменты, не слова.

**Находка B — отключена проверка TLS-сертификата для Cloud.ru.**
```ts
// stt-client.ts:8-14
// Cloud.ru certs are not always trusted in non-Russian environments (Codespace).
const cloudruHttpsAgent = new https.Agent({
  rejectUnauthorized: false,   // ← отключает проверку сертификата целиком
  ...
});
```
Это открывает MITM для ЛЮБОГО трафика к Cloud.ru (включая аудио и транскрипты пользователей), а не только
в Codespace — агент используется безусловно (`cloudruOptions`, `stt-client.ts:16-24`). **Не переносить
как есть**; чинить условно на среду или заменить корректным CA-бандлом.

- **Тесты:** 0.

### 3.3 Выделение фрагментов LLM (moment selection)

`apps/worker/workers/llm-analyze.ts` (1-511) + `apps/worker/lib/llm-router.ts` (1-314) +
`apps/worker/lib/prompts/moment-selection.ts`.

Полностью реализовано: валидация входа Zod (`llm-analyze.ts:71-75`), укорот длинного транскрипта
(`truncateTranscript`, `MAX_TRANSCRIPT_TOKENS=200_000`), fallback на короткий транскрипт (<100 слов) без
LLM (`llm-analyze.ts:134-145`), запрос к LLM с prompt-injection guard (`<transcript>` данные помечены явно
как ДАННЫЕ, не инструкции — `moment-selection.ts:17-18`), retry на невалидный JSON, финальный fallback
`generateFallbackMoments` при повторном провале парсинга (`llm-analyze.ts:184-188`), дедупликация по
перекрытию >50% (`deduplicateMoments`), лимит клипов по тарифу (`getMaxClipsForPlan`), cost-cap
`LLM_COST_CAP_KOPECKS=1000` (10₽) проверяется ДО retry и ДО каждого enrichment-момента
(`llm-analyze.ts:166-169, 227-230, 237-239`; константа — `llm-analyze-utils.ts:75`).

**Отличие от постановки:** постановка называет модель явно — «Claude» — для выделения фрагментов; текущий
роутер маршрутизирует RU→GigaChat/T-Pro/Qwen/GLM, Global→Gemini (tier0/1/3) и **Claude только как
tier2** (business-план или повторный низкий скор) (`packages/config/src/llm-providers.ts:23-31`,
`llm-router.ts:52-66`). Сам роутер/абстракция — сильный кандидат на переиспользование как есть;
конфигурацию провайдеров придётся перенастроить под явное решение постановки.

**Находка C — cost cap только "на видео", не "на пользователя/сутки".** `LLM_COST_CAP_KOPECKS` защищает
один запуск конвейера от неограниченного расхода LLM, но нет отдельного суточного/пользовательского
потолка на LLM-вызовы как таковые (в отличие от STT, которая ограничена `minutesLimit`). Это неполное
покрытие относительно локального правила `model-call-cost.md` («предел ОБЯЗАН быть назван числом» — здесь
число есть, но только по одной оси: 10₽/видео, а не 10₽/пользователь/сутки). Не блокер для переноса, но
пункт для явного решения на этапе Requirements/ADR N5a.

- **Тесты:** `apps/worker/__tests__/llm-analyze-utils.test.ts` (468 строк) — покрывает ЧИСТЫЕ функции:
  `getMaxClipsForPlan`, `safeJsonParse`, `validateMoments` (клэмпинг границ, минимум/максимум длины),
  `deduplicateMoments`, `deduplicateTitles`, `generateFallbackMoments`, `truncateTranscript`, Zod-схемы
  ответов. Хорошее покрытие ЛОГИКИ, но **не покрывает** сам воркер, `llm-router.ts`, работу с БД/очередью.

### 3.4 Оценка потенциала с объяснением (virality scoring)

`apps/worker/lib/prompts/virality-scoring.ts` (1-47) + `scoreVirality()` в `llm-analyze.ts:368-407`.

**Прямое совпадение с требованием постановки** («показывать пользователю, ПОЧЕМУ клип получил свою
оценку — хук, завершённость мысли, длина»): промпт запрашивает 4 именованных измерения (`hook`,
`engagement`, `flow`, `trend`, каждое 0-25 с текстовыми критериями по диапазонам —
`virality-scoring.ts:6-24`) плюс 1-3 конкретных совета по-русски (`tips`). При ошибке парсинга — честный
fallback на равномерный скор из `hookStrength` момента, не выдумывается произвольное число
(`llm-analyze.ts:388-401`). Prompt-injection guard такой же, как в moment-selection.
UI-компонент для показа breakdown уже есть: `apps/web/components/clips/virality-breakdown.tsx`
(не читал построчно — не требовалось для этого аудита, но факт существования подтверждён деревом файлов).

- **Тесты:** только Zod-схема ответа (`ViralityResponseSchema`) в `llm-analyze-utils.test.ts:356-380`;
  сама функция `scoreVirality` не протестирована.

### 3.5 Нарезка / вертикальный кроп / вшитые субтитры (ffmpeg)

`apps/worker/lib/ffmpeg.ts` (1-534) + `apps/worker/workers/video-render.ts` (1-378).

**Самый сильный модуль всего клона.** Полностью реализовано и качественно:
- `escapeDrawtext`/`escapeFFmpegPath`/`escapeAssText` — экранирование против инъекции в фильтры ffmpeg
  (`ffmpeg.ts:55-80`); все вызовы ffmpeg идут через `execFile`/`spawn` без shell (`ffmpeg.ts:1,408-417,502`)
  — **нет shell-инъекции**.
- Кроп/паддинг под 3 формата (`portrait 1080x1920`, `square`, `landscape`) через `scale+pad`
  (`ffmpeg.ts:15-19, 90-96`).
- Субтитры — генерация ASS-файла с переносом строк по границам слов (`wrapSubtitleText`,
  `ffmpeg.ts:293-312`), бёрн-ин через фильтр `ass=` (`ffmpeg.ts:116-119`), стиль/шрифт/контур заданы явно.
- Watermark — `buildWatermarkDrawtext` (`ffmpeg.ts:253-271`): полупрозрачный текст «КлипМейкер.ру»
  (2.2% ширины кадра, нижний правый угол) — читаемость на мобильном заложена размером шрифта относительно
  ширины, что прямо отвечает требованию постановки («watermark должен быть читаемым в вертикальном
  формате на мобильном экране»).
- CTA-оверлей и CTA-конкард с конкатенацией через `concat`-демуксер (`ffmpeg.ts:143-242`).
- В воркере (`video-render.ts`): Zod-валидация job-данных с явным потолком длительности клипа (180 сек,
  `video-render.ts:59-62`), идемпотентность («если клип уже rendering/ready — скип», `video-render.ts:155-158`),
  таймаут 5 минут с `SIGKILL` (`ffmpeg.ts:21,504-507`), non-fatal thumbnail (`video-render.ts:246-260`),
  очистка временных файлов в `finally` (`video-render.ts:304-316`).
- **Вердикт по этому модулю:** прямое совпадение с требованиями «нарезка/вертикальный кроп/вшитые
  субтитры/watermark» — переносить практически без изменений.

- **Тесты:** 0 (несмотря на то, что это самый сложный и самый ценный модуль по объёму бизнес-логики).
  Прямое нарушение `guard-must-be-able-to-fail.md`: ни одна из функций (`buildFilterChain`,
  `generateSubtitleFile`, `wrapSubtitleText`, экранирование) не демонстрировала падение на плохом входе —
  формально ничего не доказано автоматизированной проверкой, только чтением кода.

### 3.6 Тарифы / watermark на free / оплата

- **Watermark-гейт:** `llm-analyze.ts:334` — `watermark: planId === 'free'` при постановке render-задачи.
  Простое и корректное булево правило.
- **Оплата (ЮKassa):** `apps/web/app/api/webhooks/yookassa/route.ts` (1-286) — размер тела ограничен
  64KB (`route.ts:56,70-72`), проверка source IP через allowlist (`isYookassaIp`, не подпись HMAC — это
  слабее подписи, но проверяемо), идемпотентность через терминальные статусы локальной записи Payment
  (`route.ts:97-101`), сверка суммы и валюты (`route.ts:104-121`), 500 на транзиентные ошибки для ретрая
  провайдером (`route.ts:136-139`). **Вне MVP-скоупа этой недели** (постановка не включает оплату — только
  watermark-логику тарифа `free`). Отмечаю как задел на будущее, не как часть текущего переноса; идемпотентность
  здесь по «терминальному статусу локальной записи», а не по классическому dedupe-ключу `event.id` — при
  реальном включении оплаты в скоуп сверить с `incoming-webhooks.md` этого репозитория.
- **Тесты:** 0.

### 3.7 Auth / UI-экраны

`apps/web/middleware.ts` (1-304): JWT access (15 мин) + refresh cookie через `jose`, Edge-совместимо,
`HttpOnly`/`secure`/`sameSite=lax`, чистка client-injected `x-user-*` заголовков на публичных путях
(`middleware.ts:186-192`) — грамотная защита от подмены заголовков. VK OAuth, email-регистрация,
восстановление пароля — реализованы полностью (`apps/web/lib/auth/*`, `apps/web/app/(auth)/*`).
**Постановка N5a не формулирует требование к auth** для недельного MVP — модуль избыточен по охвату
(VK OAuth не нужен), но базовый email+JWT+refresh паттерн — готовый, качественный кандидат, если auth
всё же понадобится в Requirements-фазе.

UI: полный дэшборд (upload, video list, processing-progress, clip-editor, analytics, billing, team,
settings/platforms) — далеко за пределами недельного MVP-скоупа (analytics/team/publish-dialog/billing
явно исключены постановкой).

---

## 4. Документы `docs/` январского клона — актуальность к 09.2026

Полный SPARC-комплект по 11 фичам (`docs/features/{auth,auto-posting,billing,byok-keys,clip-editor,
dashboard-analytics,dashboard,download-clips,moments-virality,s3-upload,stt-subtitles,url-ingestion,
video-render}/sparc/*`) плюс корневые `PRD.md`, `Specification.md`, `Architecture.md`, `LLM_Strategy.md`.

- **`docs/PRD.md`** описывает продукт «КлипМейкер» для российского инфобизнеса (авторы курсов на
  GetCourse) с полным фичесетом F01-F12+ (включая авто-постинг VK/Rutube/Dzen/Telegram, freemium
  ЮKassa/СБП, команды) — **шире нашего MVP**, но полезен как референс архитектурных решений.
- **`docs/LLM_Strategy.md`** — детальное обоснование выбора Cloud.ru/T-Pro/Qwen для русского языка
  (актуально к дате клона, сентябрь 2026) — хорошая исследовательская база, НО не решает найденную здесь
  находку A (таймкоды у RU-стратегии) — стратегия документа сфокусирована на качестве текста, а не на
  таймкодах, что и есть источник конфликта с нашей постановкой.
- Устаревшее относительно наших решений: документы клона не знают о нашем OWN-003 (BullMQ/Redis —
  впрочем уже реализовано именно так, совпадение) и OWN-004 (S3 Cloud.ru прод + MinIO тест — тоже уже
  реализовано именно так). То есть **январские архитектурные решения по очереди и хранилищу совпадают
  с нашими решениями почти буквально** — это снижает риск переноса пакетов `queue` и `s3` почти до нуля.

---

## 5. Известные дефекты и риски (сводка)

| # | Дефект/риск | Файл:строка | Серьёзность | Правило репозитория |
|---|---|---|---|---|
| 1 | Postgres/Redis/MinIO опубликованы без `host_ip` (0.0.0.0) + дефолтные пароли | `docker-compose.yml:109-135,83-84,114` | **Критично** — не переносить без правки | `docker-ports.md` Правило №0 |
| 2 | `image:` без тега у minio/mc | `docker-compose.yml:80,97` | Низкая | `compose-hygiene.md` #2 |
| 3 | Dockerfile не копирует манифесты `packages/s3`, `packages/crypto` до `npm ci` | `Dockerfile:8-17` | Высокая (вероятный отказ сборки, НЕ подтверждено) | `compose-hygiene.md` #5 |
| 4 | TLS-проверка сертификата отключена для ВСЕХ вызовов Cloud.ru STT | `stt-client.ts:8-14` | **Критично**, MITM | — (общая security-практика) |
| 5 | RU-стратегия STT даёт таймкод только на весь 3-мин чанк, не на сегмент/слово | `stt.ts:112-153`, `audio-chunker.ts:4` | **Критично для этого проекта** — противоречит постановке | постановка N5a, критерий выбора модели |
| 6 | Global-стратегия даёт сегментный, не пословный таймкод (`timestamp_granularities` не запрошен) | `llm-router.ts:290-295`, `stt.ts:113` | Средняя, решить на Requirements | — |
| 7 | Cost cap LLM только «на видео» (10₽), нет суточного/пользовательского потолка | `llm-analyze-utils.ts:75`, `llm-analyze.ts:166-239` | Средняя | `model-call-cost.md` (локальное правило) |
| 8 | Практически нулевое тестовое покрытие (1 файл из ~21K строк, только чистые функции) | вся `apps/worker` кроме `llm-analyze-utils` | Высокая — ничего не доказано на «падение» | `guard-must-be-able-to-fail.md` |
| 9 | Секретов/креденшлов в репозитории клона не найдено; `.env` корректно в `.gitignore` | — | — | ОК, не дефект |
| 10 | Webhook ЮKassa проверяет источник по IP-allowlist, не по HMAC-подписи; идемпотентность через терминальный статус локальной записи, не через dedupe-ключ `event.id` | `yookassa/route.ts:59-66,97-101` | Низкая (вне скоупа этой недели) | `incoming-webhooks.md` (сверить при включении оплаты) |
| 11 | Upload-proxy не вызывает `validateMagicBytes` на пути файлового аплоада (вызывается только в `download.ts` для URL-инжеста) | `upload/route.ts` (весь файл) | Средняя — проверить при переносе | — |

---

## 6. Итоговая таблица переиспользования

| Модуль | Вердикт | Обоснование | Оценка объёма работ |
|---|---|---|---|
| **S3-хранилище** (`packages/s3`) | **ВЗЯТЬ как есть** | Буквально совпадает с OWN-004 (Cloud.ru прод, S3-совместимый для MinIO теста); presign, multipart, retry, magic-bytes, path-safety — всё есть | Копировать пакет, донастроить env |
| **Очередь** (`packages/queue`) | **ВЗЯТЬ как есть** | Буквально совпадает с OWN-003 (BullMQ/Redis); имена очередей — под наш скоуп подмножество (stt/llm/video-render) | Копировать пакет, убрать неиспользуемые queue-имена |
| **ffmpeg-модуль** (нарезка/кроп/субтитры/watermark) | **ВЗЯТЬ как есть** | Самый качественный модуль клона; экранирование, форматы, ASS-субтитры, watermark читаемый на мобильном — прямое совпадение с требованиями | Перенос + написать тесты (их 0) |
| **video-render воркер** | **ВЗЯТЬ как есть** | Валидация job, идемпотентность, таймаут, cleanup, S3-аплоад — образец качества | Перенос + написать тесты |
| **Virality scoring (промпт+логика)** | **ВЗЯТЬ как есть** | Прямое совпадение с требованием «оценка с объяснением» (4 измерения + tips) | Перенос промпта, возможно смена модели-исполнителя |
| **LLM-router (абстракция)** | **ВЗЯТЬ с доработкой** | Архитектура (тиры, BYOK-фоллбек, OpenRouter-ремап, cost tracking) сильная и переносимая; конфигурация провайдеров под RU/Global не совпадает с постановкой («Claude» для выделения фрагментов) | Перенастроить `LLM_PROVIDERS`, добить суточный/user-level cost cap |
| **Moment selection (воркер+промпт)** | **ВЗЯТЬ с доработкой** | Логика (дедуп, fallback, cost-cap, injection-guard) сильная; модель-исполнитель и prisma-схема статусов нужно сверить с нашими решениями | Перенос + смена модели + тесты воркера (сейчас 0) |
| **STT-воркер** | **ВЗЯТЬ с доработкой** | Инфраструктура (чанкинг, квота, транзакция, retry) сильная, но ДВА критичных дефекта (находки A и B выше) требуют правки до продакшена | Правка TLS + правка RU-таймкодов (или отказ от RU-стратегии для этого проекта) |
| **DB-схема (Prisma)** | **ВЗЯТЬ с доработкой** | User/Video/Transcript/Clip/UsageRecord — прямое совпадение; убрать Team/Publication/PlatformConnection (вне скоупа), Subscription/Payment — отложить | Урезать schema.prisma, новая миграция |
| **SSRF-валидатор + download-воркер** | **ВЗЯТЬ как есть** | Сильная защита от SSRF, потоковый multipart-аплоад с ограниченной памятью | Перенос как есть |
| **Upload proxy (файловая загрузка)** | **ВЗЯТЬ с доработкой** | Рабочий код, но magic-bytes-проверка не подключена на этом пути — добавить | Добавить вызов `validateMagicBytes` |
| **Crypto (BYOK AES-256-GCM)** | **НЕ НУЖНО** (в этой фазе) | BYOK не в постановке N5a; сохранить пакет как задел, не подключать | — |
| **Auth (email+JWT+refresh, без VK OAuth)** | **ВЗЯТЬ с доработкой** (если Requirements решит, что auth нужен уже сейчас) | Постановка не требует auth явно; middleware-паттерн качественный, но VK OAuth — избыточен | Урезать до email+JWT, выбросить VK OAuth |
| **Биллинг (ЮKassa) + webhook** | **НЕ НУЖНО** (в этой фазе) | Вне недельного MVP-скоупа (только watermark-гейт нужен, не реальная оплата) | Оставить как референс на будущее |
| **Auto-posting (VK/Rutube/Dzen/Telegram, `lib/providers/*`)** | **НЕ НУЖНО** | Прямо исключено постановкой («НЕ входит: автопостинг в соцсети») | — |
| **Team/collaboration** | **НЕ НУЖНО** | Прямо исключено постановкой («командная работа») | — |
| **Clip-editor UI, dashboard-analytics UI** | **НЕ НУЖНО** (в этой фазе) | Не входит в недельный MVP-список шагов конвейера; полезно для v1+ | — |
| **Download-all (zip архив клипов)** | **ВЗЯТЬ с доработкой** | Соответствует FR-GROWTH-001 («момент ценности» — кнопка скачать/поделиться) | Перенос эндпоинта, проверить `archiver`-зависимость |

---

## 7. Что проверить в первую очередь на этапе Requirements/Architecture N5a

1. **Решить судьбу RU-стратегии STT.** Как написано — она не даёт таймкодов лучше 3-минутного окна.
   Либо чинить (запрашивать текстовые метки иначе, либо переходить на global/OpenAI для таймкодов и
   Cloud.ru оставлять только для текстовых LLM-задач), либо явно принять компромисс и записать его как
   решение с обоснованием (это ровно то, что требует `honest-configuration.md` — не подставлять
   правдоподобный, но неверный дефолт).
2. **Починить `rejectUnauthorized: false`** до переноса `stt-client.ts` в любом виде.
3. **Решить порты compose** до первого `docker compose up` — не копировать `docker-compose.yml` буквально.
4. **Проверить сборку Dockerfile** реальным `docker build` (в этом аудите не делалось) — вероятная правка
   на 2 строки (`COPY packages/s3/package*.json`, `COPY packages/crypto/package*.json`), но не подтверждена.
5. **Написать тесты** для ffmpeg-модуля и video-render-воркера ДО того, как помечать их «ВЗЯТЬ как есть»
   в финальном плане — сейчас это утверждение о качестве кода по чтению, не о поведении, испытанном
   на плохом входе (`guard-must-be-able-to-fail.md`).

Status: completed
