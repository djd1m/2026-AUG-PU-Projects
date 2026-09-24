---
name: coding-standards
description: >
  Образцы реализации N5 «КлипМейкер» под стек Next.js 15 + tRPC, Prisma + PostgreSQL 16, BullMQ на
  Redis, ffmpeg 8.1, S3. Использовать при написании и правке кода: квота, идемпотентность, фенс
  попыток, адаптеры поставщиков, цепочка фильтров рендера.
version: "1.0"
maturity: beta
---

# Образцы реализации N5

Код ниже — **формы**, обязанные сохраниться, а не готовые модули. Пути файлов и имена скриптов
пакета фиксирует фича `foundation`; до неё не считать их существующими. Правила, которые эти формы
исполняют, — [`coding-style.md`](../../rules/coding-style.md) и
[`security.md`](../../rules/security.md).

## 1. Списание квоты — единственная законная форма

Два оператора в одной транзакции. Пустой результат `UPDATE` И ЕСТЬ отказ.

```ts
// packages/db/src/quota.ts
export type QuotaReason = 'upload' | 'upload_refund' | 'minutes' | 'llm';

const KEYS: Record<QuotaReason, (a: string) => Array<{ scope: QuotaScope; key: string; env: string }>> = {
  upload:        (a) => [{ scope: 'user_uploads',         key: a,     env: 'N5_LIMIT_USER_UPLOADS' }],
  upload_refund: (a) => [{ scope: 'user_upload_refunds',  key: a,     env: 'N5_LIMIT_USER_UPLOAD_REFUNDS' }],
  minutes:       (a) => [{ scope: 'user_minutes',         key: a,     env: 'N5_LIMIT_USER_MINUTES' },
                         { scope: 'global_minutes',       key: 'all', env: 'N5_LIMIT_GLOBAL_MINUTES' }],
  llm:           (a) => [{ scope: 'user_llm',             key: a,     env: 'N5_LIMIT_USER_LLM' },
                         { scope: 'global_llm',           key: 'all', env: 'N5_LIMIT_GLOBAL_LLM' }],
};

export async function checkAndConsumeQuota(
  tx: Tx, accountId: string, reason: QuotaReason, n: number, day: string,
): Promise<{ granted: true } | { granted: false; scope: QuotaScope }> {
  for (const { scope, key, env } of KEYS[reason](accountId)) {
    const limit = limits[env];                       // из окружения, проверено на старте процесса
    await tx.$executeRaw`
      INSERT INTO quota_counter (scope, scope_key, day, used) VALUES (${scope}, ${key}, ${day}::date, 0)
      ON CONFLICT (scope, scope_key, day) DO NOTHING`;
    const rows = await tx.$queryRaw<Array<{ used: number }>>`
      UPDATE quota_counter SET used = used + ${n}
      WHERE scope = ${scope} AND scope_key = ${key} AND day = ${day}::date
        AND used + ${n} <= ${limit}
      RETURNING used`;
    if (rows.length === 0) throw new QuotaRefused(scope);   // откат ТРАНЗАКЦИИ, не встречный декремент
  }
  return { granted: true };
}
```

Запрещено и должно быть замечено на ревью:

```ts
// ✗ WHERE принадлежит ветке DO UPDATE и на вставку НЕ действует: первый за сутки
//   запрос с n > limit вставит строку без единой проверки и вернёт granted (V2-R01)
INSERT INTO quota_counter (...) VALUES (...) ON CONFLICT (...) DO UPDATE
  SET used = quota_counter.used + $n WHERE quota_counter.used + $n <= quota_counter.limit

// ✗ «прочитать, потом записать»: две одновременные загрузки обе прочитают старое и обе пройдут
const c = await tx.quotaCounter.findFirst(...); if (c.used + n <= limit) await tx.quotaCounter.update(...)

// ✗ колонка limit не существует; предел живёт ТОЛЬКО в параметре (V2-R03)
```

**Возврат слота** — отдельный атомарный декремент, и только при отказе по СВОЙСТВАМ файла:

```ts
export async function refundUploadSlot(tx: Tx, accountId: string, day: string): Promise<'refunded' | 'not_refunded'> {
  try { await checkAndConsumeQuota(tx, accountId, 'upload_refund', 1, day); }
  catch (e) { if (e instanceof QuotaRefused) return 'not_refunded'; throw e; }  // молча: пользователь уже знает причину отказа файла
  await tx.$executeRaw`
    UPDATE quota_counter SET used = used - 1
    WHERE scope = 'user_uploads' AND scope_key = ${accountId} AND day = ${day}::date AND used > 0`;
  return 'refunded';
}
```

Вызывается ТОЛЬКО из `CompleteUpload` и `ProbeSource`, ТОЛЬКО в той же транзакции, что пишет
`failed`. При `refused_*` не вызывается никогда.

## 2. Идемпотентность создания записи

Заявка ключа — один атомарный оператор. Валидация ПЕРЕД ним: мусорный запрос не должен занять ключ.

```ts
// apps/web/src/server/routers/video.ts
const rows = await tx.$queryRaw<Array<{ id: string }>>`
  INSERT INTO video (account_id, idempotency_key, status, source, declared_bytes)
  VALUES (${accountId}, ${key}::uuid, 'uploading', 'upload', ${declaredBytes})
  ON CONFLICT (account_id, idempotency_key) DO NOTHING
  RETURNING id`;
if (rows.length === 0) {
  const existing = await tx.video.findFirstOrThrow({ where: { accountId, idempotencyKey: key } });
  return reissueUnfinishedPartUrls(existing);   // ТОТ ЖЕ video_id, второго списания нет
}
```

## 3. Фенс попыток: заявить актуальность, потом работать, потом принять результат

```ts
// заявка (worker-video, перед единственным скачиванием)
const claimed = await db.$executeRaw`
  UPDATE clip SET status = 'rendering', render_fence = ${fence}
  WHERE id = ${clipId} AND render_fence < ${fence}`;
if (claimed === 0) { await audit('stale_attempt_result', { clipId, fence }); return; }  // ни байта трафика

// принятие результата (после ffmpeg и выгрузки)
const accepted = await db.$executeRaw`
  UPDATE clip SET status = 'done', object_key = ${objectKey}, thumbnail_key = ${thumbKey}, bytes = ${bytes}
  WHERE id = ${clipId} AND render_fence = ${fence}`;
if (accepted === 0) { await s3.deleteObjects([objectKey, thumbKey]); await audit('stale_attempt_result', …); return; }
```

Для стадий `stt` и `select` условие — `WHERE fence = :mine` у строки `video`. Оператор без условия
актуальности — блокирующая находка ревью.

## 4. Отказ старта при ненастроенной конфигурации

```ts
// packages/shared/src/config.ts — выполняется при импорте, до поднятия сервера и воркеров
const LIMIT_VARS = [
  'N5_LIMIT_USER_MINUTES', 'N5_LIMIT_USER_UPLOADS', 'N5_LIMIT_USER_UPLOAD_REFUNDS',
  'N5_LIMIT_USER_LLM', 'N5_LIMIT_GLOBAL_MINUTES', 'N5_LIMIT_GLOBAL_LLM',
] as const;                                    // ШЕСТЬ, не пять

export const limits = Object.fromEntries(LIMIT_VARS.map((name) => {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') {
    throw new Error(`${name} не задана. Ненастроенный потолок означает неограниченный платный вызов, а не отсутствие ограничений.`);
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${name}=${JSON.stringify(raw)} — не положительное целое.`);
  return [name, n];
})) as Record<(typeof LIMIT_VARS)[number], number>;

export const PUBLIC_ORIGIN = requireEnv('N5_PUBLIC_ORIGIN',
  'Он вшивается в ПИКСЕЛИ метки каждого клипа и определяет каждую выдаваемую наружу ссылку. ' +
  'Клип с адресом по умолчанию уезжает в чужую ленту навсегда и правится только повторным рендером.');
```

`undefined` и `''` различаются и оба отказывают. Сообщение называет ЦЕНУ, а не факт.

## 5. Адаптеры поставщиков — живой клиент и детерминированный фейк за одним интерфейсом

```ts
// packages/shared/src/providers/transcriber.ts
export interface Transcriber {
  transcribe(chunk: AudioChunk): Promise<{ words: Array<{ text: string; start: number; end: number; speaker?: string }> }>;
}
```

Поле `speaker?` необязательное и в неделе не используется: диаризации нет, но интерфейс её не
закрывает (ADR-003). Контракт проверяется НАШИМ кодом до постановки следующей стадии:

```ts
if (!res.words?.length || res.words.some((w) => typeof w.start !== 'number' || typeof w.end !== 'number')) {
  throw new TranscriptContractError('результат без таймкодов слов: границы фрагментов и субтитры невозможны');
}
```

Для выделения фрагментов structured outputs гарантируют СХЕМУ, но **не числовые диапазоны и не
длину строк** — это подтверждённая строка инвентаря зависимостей. Диапазоны проверяет наш код:

```ts
const ok = cands.filter((c) =>
  c.end - c.start >= 20.0 && c.end - c.start <= 75.0 &&
  [c.hook, c.completeness, c.length_fit].every((v) => Number.isInteger(v) && v >= 0 && v <= 33) &&
  c.explanations.hook.trim() !== '' && c.explanations.completeness.trim() !== '' && c.explanations.length.trim() !== '');
// меньше трёх — показываем СТОЛЬКО, сколько нашлось, а не добиваем до трёх
```

Выбор поставщика — переменной `N5_MODEL_PROVIDER` (`live` | `fake`), и профиль `test` ставит
`fake`. Тесты не ходят в интернет.

## 6. Цепочка фильтров рендера

Порядок строгий; метка ставится ПОСЛЕДНЕЙ, иначе субтитр ляжет поверх неё.

```
scale → crop 9:16 по центру → subtitles (ASS, libass) → drawtext (метка с N5_PUBLIC_ORIGIN)
```

`ffmpeg` запускается ДОЧЕРНИМ процессом с таймаутом 15 мин и принудительным завершением по его
истечении, а не ожиданием: иначе BullMQ объявит задание зависшим через 30 с непрерывной занятости
цикла событий, и та же работа начнётся во второй раз. Временный каталог чистится в `finally` — и
после успеха, И после отказа.

```ts
const tmp = await mkdtemp(join(WORK_DIR, 'render-'));
try {
  if (await freeBytes(WORK_DIR) < 3n * BigInt(video.actualBytes)) {
    await deferNoDisk(clipId, videoId);     // updated_at ДВИГАЕТСЯ, сторож не убивает (V2-R15)
    return;                                  // объект НЕ скачан: обращений к S3 ровно ноль
  }
  …
} finally { await rm(tmp, { recursive: true, force: true }); }
```

## 7. Конкурентность воркера

```ts
new Worker('render', handler, { connection, concurrency: 1 });   // ЛИТЕРАЛ, не process.env
```

Это условие ADR-006 и оно проверяется стражем по исходнику: `concurrency` из переменной окружения —
внедряемый дефект, на котором страж обязан покраснеть.

## 8. Единицы и границы в одном месте

```ts
export const LIMITS = {
  FILE_BYTES_MAX: 2_000_000_000,
  DURATION_SEC_MIN: 120,   DURATION_SEC_MAX: 5400,
  CLIP_SEC_MIN: 20.0,      CLIP_SEC_MAX: 75.0,
  SIGNED_URL_SEC_MAX: 900,
  FFMPEG_TIMEOUT_MS: 15 * 60_000,
  JOB_TIMEOUT_MS: 30 * 60_000,
  STALE_AFTER_MS: 5 * 60_000,
  DEFER_DELAY_MS: 5 * 60_000,              // DEC-A-016: число выбрано рассуждением, не измерено
} as const;

export const minutesToCharge = (durationSec: number): number => Math.ceil(durationSec / 60);
```

Числа берутся отсюда, а не переписываются в модулях: цитата числа, отставшая от владельца, — ровно
тот механизм, который породил 38 расхождений Phase 2 и не устранён.
