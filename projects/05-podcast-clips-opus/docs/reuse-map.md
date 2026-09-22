# Карта переиспользования январского клона

**Дата:** 2026-09-22 · **Источник:** `.reference/jan-clone` (копия `djd1m/2026-jan-pu-opus-clone`,
в git не коммитится) · **Владелец карты:** координатор.

Переиспользование этой базы — **смысл проекта**, а не оптимизация. Клон реализует ТОТ ЖЕ продукт,
его конвейер прошёл семь фич с ревью и 27 записанных граблей. Писать заново то, что там работает,
означает оплатить те же грабли второй раз.

## Как эта карта применяется (иначе она украшение)

1. Постановка КАЖДОЙ фичи обязана содержать раздел «Переиспользование» со строками этой карты,
   относящимися к фиче: путь-источник, путь-цель, вердикт, что менять.
2. Отчёт исполнителя обязан ответить по КАЖДОЙ строке своей фичи: `перенесено` · `адаптировано (что
   изменено)` · `написано заново (почему)`. Молчание о строке — незакрытая строка, а не «не
   потребовалось».
3. Вердикт `написано заново` законен, но требует причины из закрытого списка: `противоречит канону` ·
   `нет в клоне` · `клон делает другое` · `зависит от стека, которого у нас нет`.

## Что произошло на фиче `foundation` (записано, а не замолчано)

Постановка первой фичи **не упоминала клон ни разу** — ошибка координатора. Фундамент написан с
нуля. Ущерб ограничен: набор сущностей (15 против 12), модель квот, вход по паролю и фенс попыток у
нас свои по канону, и клон их не содержит. Но `packages/s3` остался пустым каркасом там, где в
клоне лежит рабочий адаптер, — это закрывается фичей `upload-and-quota` переносом, а не написанием.

Отдельное расхождение, требующее решения: **клон работает через Prisma, наш код — через `pg`
напрямую**. `Architecture.md` называет Prisma источником типов. Решение DEC-A-017 ниже.

## Карта по фичам

### `upload-and-quota` (фича 2)

| Источник в клоне | Строк | Цель | Вердикт | Что менять |
|---|---|---|---|---|
| `packages/s3/src/client.ts` | 42 | `packages/s3/src/client.ts` | **перенести** | endpoint из `S3_ENDPOINT` без дефолта; `forcePathStyle` из переменной (MinIO требует, Cloud.ru нет) |
| `packages/s3/src/presign.ts` | 39 | `packages/s3/src/presign.ts` | **перенести** | срок ≤ 900 с жёстко (NFR-SEC-001), не параметром вызова |
| `packages/s3/src/multipart.ts` | 115 | `packages/s3/src/multipart.ts` | **перенести** | `completeMultipartUpload` — на сервере, с проверкой суммы частей ≤ 2 000 000 000 (ADR-002 п.2) |
| `packages/s3/src/operations.ts` | 111 | `packages/s3/src/operations.ts` | **перенести** | `getObjectBytes(range)` нужен для магических байт; `deleteObject` — для возврата слота |
| `apps/web/app/api/upload/route.ts` | — | — | адаптировать частично | у клона прокси-режим через Next; у нас браузер грузит прямо в S3 — прокси не переносить |
| `myinsights/INS-004` (CORS upload hang), `INS-007` (signature mismatch), `INS-009` (body size limit), `INS-024` (медленная загрузка) | — | `docs/features/upload-and-quota/` | **прочитать до кода** | это уже оплаченные грабли ровно этого шага |

Квота, идемпотентность, шесть ключей, возврат слота — **в клоне отсутствуют**, пишутся по
`Pseudocode.md`.

### `queue-and-probe` (фича 3)

| Источник | Строк | Цель | Вердикт | Что менять |
|---|---|---|---|---|
| `packages/queue/src/index.ts` + конфигурация BullMQ | 3 + | `packages/queue` | **перенести и дополнить** | `maxRetriesPerRequest: null`, `removeOnComplete/Fail` числом, пароль Redis (ADR-001) |
| `apps/worker/workers/index.ts` | — | `apps/worker/src/runtime.ts` | адаптировать | каркас потребителя: подключение, graceful shutdown |
| `apps/worker/lib/retry.ts` | 33 | `apps/worker/src/retry.ts` | **перенести** | потолок 2 автоматических попытки ВНУТРИ серии (ADR-001 п.7) |
| `apps/worker/lib/s3-download.ts` | 16 | `apps/worker/src/s3-download.ts` | **перенести** | добавить резерв диска ≥ 3× ДО скачивания (ADR-006) |
| `apps/worker/lib/ffmpeg.ts` → `ffprobeGetDuration` | 25 | `apps/worker/src/probe.ts` | **перенести** | таймаут и `probe_timeout`; проверка звуковой дорожки |
| `myinsights/INS-010` (ffprobe not installed), `INS-022` (worker import paths), `INS-026` (зомби на 3000) | — | — | **прочитать до кода** | |

Фенс попыток, `series_no`, сторож — **в клоне отсутствуют**.

### `transcription` (фича 4)

| Источник | Строк | Цель | Вердикт | Что менять |
|---|---|---|---|---|
| `apps/worker/lib/stt-client.ts` | 63 | `apps/worker/src/stt/client.ts` | адаптировать | убрать BYOK и Cloud.ru-стратегии; ровно `whisper-1` + `verbose_json` + `timestamp_granularities: ['word','segment']` (ADR-003) |
| `apps/worker/lib/audio-chunker.ts` | 45 | `apps/worker/src/stt/chunker.ts` | **перенести** | режет на 180 с; добавить резку ПО ПАУЗАМ и потолок 25 МБ на чанк |
| `apps/worker/lib/ffmpeg.ts` → `extractAudio` | 22 | `apps/worker/src/stt/extract.ts` | **перенести** | потоково, без промежуточного видео |
| `apps/worker/workers/stt.ts` | ~300 | `apps/worker/workers/stt.ts` | адаптировать | склейка слов со смещением чанка; списание минут ДО вызова; повтор чанка списывает заново |
| `myinsights/INS-027` (cloud STT chunking) | — | — | **прочитать до кода** | |

### `selection-and-score` (фича 5)

| Источник | Строк | Цель | Вердикт | Что менять |
|---|---|---|---|---|
| `apps/worker/workers/llm-analyze.ts` + `llm-analyze-utils.ts` | ~400 | `apps/worker/workers/select.ts` | адаптировать | границы по СЛОВАМ транскрипта; 3–8 фрагментов 20–75 с; оценка = три компонента 0–33 с объяснением каждого |
| `apps/worker/lib/llm-router.ts` | 314 | `apps/worker/src/llm/provider.ts` | адаптировать сильно | у клона три провайдера и BYOK; у нас один Sonnet 5 со structured outputs, диапазоны проверяет НАШ код |
| `apps/worker/lib/prompts/` | — | `apps/worker/src/llm/prompts/` | адаптировать | русский, критерий самодостаточности, требование объяснений |
| `myinsights/INS-011` (openrouter model ids), `INS-012` (anthropic response format) | — | — | **прочитать до кода** | |

### `render-and-watermark` (фича 6) — самый ценный перенос

| Источник | Строк | Цель | Вердикт | Что менять |
|---|---|---|---|---|
| `apps/worker/lib/ffmpeg.ts` целиком | 534 | `apps/worker/src/render/ffmpeg.ts` | **перенести, это ядро** | цепочка `scale → ASS → drawtext(метка)`; CTA-оверлей и `concatClipAndCta` НЕ переносить (не входит в неделю) |
| → `buildFilterChain`, `getScaleFilter`, `FORMAT_DIMENSIONS` | 60 | там же | **перенести** | оставить только 9:16 |
| → `generateSubtitleFile`, `formatASSTimecode`, `wrapSubtitleText`, `escapeAssText` | 130 | `apps/worker/src/render/subtitles.ts` | **перенести** | подсветка текущего слова по таймкодам слов |
| → `buildWatermarkDrawtext` | 27 | `apps/worker/src/render/watermark.ts` | адаптировать | текст с `N5_PUBLIC_ORIGIN` и `/c/<code>`; ≥ 3,5 % высоты; safe zone; контраст ≥ 4,5:1 (ADR-004) |
| → `execFFmpeg`, `generateThumbnail`, `escapeDrawtext`, `escapeFFmpegPath` | 80 | `apps/worker/src/render/exec.ts` | **перенести** | таймаут 15 мин и `SIGKILL` |
| `apps/worker/workers/video-render.ts` | ~500 | `apps/worker/workers/render.ts` | адаптировать | `concurrency` литералом 1; резерв диска; `render_fence`; очистка в `finally` |

### `progress-and-clips-screen` (фича 7)

| Источник | Цель | Вердикт | Что менять |
|---|---|---|---|
| `apps/web/app/(dashboard)/dashboard/videos/[videoId]/page.tsx` и компоненты `components/video/*`, `components/upload/*` | экраны прогресса и клипов | адаптировать | три состояния явно; оценка с объяснением; русский |
| `apps/web/lib/hooks/use-clip-download.ts`, `app/api/clips/[clipId]/file/route.ts` | скачивание клипа | **перенести** | авторизованный redirect на подписанный GET; `404` для чужого и незавершённого |
| `myinsights/INS-013` (s3 proxy), `INS-015` (youtube url), `INS-021` (record index undefined) | — | **прочитать до кода** | |

### Что в клоне ЕСТЬ, но переносить НЕЛЬЗЯ

| Фрагмент клона | Почему не переносим |
|---|---|
| `apps/worker/workers/publish.ts`, OAuth VK/Дзен, модель `Publication` | автопостинг не входит в неделю (канон §1) |
| `lib/yookassa.ts`, вебхук, `Subscription`, `Payment` | приём денег не входит (OWN-005, ADR-005); маршрут вебхука обязан отсутствовать, это проверяется стражем |
| `Team`, `TeamInvite`, `/invite` | командная работа не входит |
| BYOK, выбор провайдера, Cloud.ru-модели | у нас один STT и один LLM по ADR-003; BYOK — чужая поверхность ключей |
| `billing-cron.ts`, `stats-collector.ts` | нет тарификации и нет этой аналитики |
| NextAuth | вход по паролю с bcrypt вне транзакции уже реализован по канону |

### `guest-pack`, `partner-codes-and-dashboard`, `limits-ui-and-pro-interest`, `retention-and-erasure`

В клоне **нет ничего** по этим фичам: механик роста он не содержит вовсе (реферал остался в
бэклоге). Доноры другие — соседние проекты репозитория: `01-testimonials-senja` (`referral.ts`,
`partner.ts`, `badge.ts`, `wall.ts`), `04-calorie-vision-cal-ai` (кабинет партнёра, события роста,
исследование бейджа). Их карта составляется в постановке соответствующей фичи.

## DEC-A-017 · Prisma против `pg`

Клон работает через Prisma; наш код — через `pg` напрямую, схема задана SQL-миграцией.
**Решение: остаёмся на `pg`.** Причины: `coding-style.md` требует, чтобы целостность обеспечивала
база явным SQL, а атомарные операторы (списание квоты, фенс) писались параметризованным сырым SQL —
ORM здесь не помогает, а прячет; переносимые куски клона (ffmpeg, s3, stt, чанкер, retry) от Prisma
**не зависят вовсе**, зависят только воркеры в местах обновления статуса, и это десятки строк на
файл. Цена решения: `Architecture.md` называет Prisma источником типов — строка будет исправлена в
следующем раунде правки архитектуры, а не оставлена расходиться молча.

## Что эта карта НЕ утверждает

Она утверждает, что фрагмент СУЩЕСТВУЕТ и подходит по назначению. Она не утверждает, что он
корректен: клон прошёл ревью своих фич, но его собственные грабли (`myinsights/INS-*`) — список
того, что в нём уже ломалось. Перенесённый код проходит те же ворота, что написанный: тесты,
стражи с внедрённым дефектом, ревью другого семейства.
