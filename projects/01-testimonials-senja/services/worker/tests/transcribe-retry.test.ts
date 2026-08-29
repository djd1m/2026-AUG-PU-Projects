// FR-012 — повтор транскрипции при сбое STT.
//
// Разделение с transcribe-job.test.ts: там путь completed/failed без повторов, здесь
// политика повторов целиком. Числа порогов прибиты в тесте НЕЗАВИСИМО от кода: порог,
// следующий за константой продакшена, не является порогом (урок FR-009, где подмена
// предела тела прошла зелёной, потому что тест брал его из кода).

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import type pg from "pg";
import {
  claimAndProcessOneTestimonial, retryDelayMs, MAX_ATTEMPTS, RETRY_BASE_MS,
} from "../src/transcribe-job.js";
import { SttApiError, type TranscribeClient } from "../src/transcribe-client.js";
import { createTestPool, dropSchema, setupSchema, testDatabaseUrl, truncateAll } from "./helpers/test-db.js";

const hasTestDb = !!testDatabaseUrl();

/** Ожидаемые значения. Совпадение с кодом проверяется ОТДЕЛЬНЫМ тестом ниже. */
const EXPECTED_MAX_ATTEMPTS = 3;
const EXPECTED_BASE_MS = 60_000;

const presign = async (key: string) => `https://example.test/${key}`;
const silent = () => {};

const failing = (err: Error): TranscribeClient => ({
  transcribeVideo: async () => { throw err; },
});
const succeeding = (text: string): TranscribeClient => ({
  transcribeVideo: async () => text,
});
/** Держит паузу, затем бросает — нужен для AC-012.11. */
const slowFailing = (pauseMs: number): TranscribeClient => ({
  transcribeVideo: async () => {
    await new Promise((r) => setTimeout(r, pauseMs));
    throw new SttApiError("медленный провайдер");
  },
});

describe.skipIf(!hasTestDb)("FR-012 — политика повторов", () => {
  let pool: pg.Pool;

  beforeAll(async () => { pool = await createTestPool(); await setupSchema(pool); });
  afterEach(async () => { await truncateAll(pool); });
  afterAll(async () => { await dropSchema(pool); await pool.end(); });

  async function insert(key: string | null, over: Record<string, unknown> = {}): Promise<string> {
    const cols = ["video_object_key", ...Object.keys(over)];
    const vals = [key, ...Object.values(over)];
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO testimonials (${cols.join(",")}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(",")}) RETURNING id`,
      vals,
    );
    return rows[0]!.id;
  }
  const state = async (id: string) => (await pool.query<{
    transcript_status: string; transcript_attempts: number;
    transcript: string | null; next_ms: number | null;
  }>(
    `SELECT transcript_status, transcript_attempts, transcript,
            (extract(epoch from (transcript_next_attempt_at - clock_timestamp())) * 1000)::float8 AS next_ms
       FROM testimonials WHERE id = $1`, [id],
  )).rows[0]!;

  // ── числа ────────────────────────────────────────────────────────────────
  it("пороги совпадают с ожидаемыми — константа не может уехать незаметно", () => {
    expect(MAX_ATTEMPTS).toBe(EXPECTED_MAX_ATTEMPTS);
    expect(RETRY_BASE_MS).toBe(EXPECTED_BASE_MS);
  });

  it("AC-012.3 — задержка РАСТЁТ", () => {
    expect(retryDelayMs(1)).toBe(EXPECTED_BASE_MS);
    expect(retryDelayMs(2)).toBe(EXPECTED_BASE_MS * 2);
    expect(retryDelayMs(2)).toBeGreaterThan(retryDelayMs(1));
  });

  // ── путь SttApiError ─────────────────────────────────────────────────────
  it("AC-012.1 — первый сбой оставляет pending и планирует повтор", async () => {
    const id = await insert("k/a.webm");
    const r = await claimAndProcessOneTestimonial({
      pool, transcribeClient: failing(new SttApiError("нет связи")), presignVideoUrl: presign, logError: silent,
    });
    expect(r).toEqual({ status: "retry_scheduled", testimonialId: id, attempts: 1 });
    const s = await state(id);
    expect(s.transcript_status, "строка обязана остаться в очереди").toBe("pending");
    expect(s.transcript_attempts).toBe(1);
    expect(s.next_ms!, "срок обязан быть в будущем").toBeGreaterThan(0);
  });

  it("AC-012.2 — исчерпание попыток даёт failed, отзыв остаётся модерируемым", async () => {
    const id = await insert("k/b.webm", { transcript_attempts: EXPECTED_MAX_ATTEMPTS - 1 });
    const r = await claimAndProcessOneTestimonial({
      pool, transcribeClient: failing(new SttApiError("снова")), presignVideoUrl: presign, logError: silent,
    });
    expect(r).toEqual({ status: "failed", testimonialId: id });
    const s = await state(id);
    expect(s.transcript_status).toBe("failed");
    expect(s.transcript_attempts).toBe(EXPECTED_MAX_ATTEMPTS);
    const { rows } = await pool.query(`SELECT status FROM testimonials WHERE id = $1`, [id]);
    expect(rows[0], "отзыв обязан остаться в таблице и быть модерируемым").toBeTruthy();
  });

  it("AC-012.11 — медленный провайдер: срок отсчитан по СТЕННЫМ часам, а не от начала транзакции", async () => {
    const id = await insert("k/slow.webm");
    // Различает две формулы РАЗНИЦА В ДЛИТЕЛЬНОСТЬ ВЫЗОВА, а не сам факт «больше базы»:
    //   сломанная now():        срок = начало_транзакции + BASE
    //   верная clock_timestamp(): срок = момент_ПОСЛЕ_вызова + BASE = начало + пауза + BASE
    // Транзакция открывается ПОСЛЕ T_begin, поэтому «срок > T_begin + BASE» истинно и
    // для сломанной версии — на этом первая редакция критерия и провалилась, пропустив
    // мутацию. Порог берём с запасом ниже паузы, но заведомо выше шума планировщика.
    const PAUSE_MS = 500;
    const MIN_EXCESS_MS = 250;
    const before = Date.now();
    await claimAndProcessOneTestimonial({
      pool, transcribeClient: slowFailing(PAUSE_MS), presignVideoUrl: presign, logError: silent,
    });
    const { rows } = await pool.query<{ ms: number }>(
      `SELECT (extract(epoch from (transcript_next_attempt_at - to_timestamp($2 / 1000.0))) * 1000)::float8 AS ms
         FROM testimonials WHERE id = $1`, [id, before],
    );
    expect(
      rows[0]!.ms,
      `срок отстоит от T_begin на ${Math.round(rows[0]!.ms)} мс — это BASE без паузы, ` +
        "то есть отсчёт пошёл от начала транзакции (вернулся now()?)",
    ).toBeGreaterThan(EXPECTED_BASE_MS + MIN_EXCESS_MS);
  });

  // ── очередь ──────────────────────────────────────────────────────────────
  it("AC-012.4 — строка со сроком в будущем НЕ выбирается", async () => {
    await insert("k/c.webm", { transcript_next_attempt_at: new Date(Date.now() + 3_600_000) });
    const r = await claimAndProcessOneTestimonial({
      pool, transcribeClient: succeeding("не должно случиться"), presignVideoUrl: presign, logError: silent,
    });
    expect(r).toEqual({ status: "empty" });
  });

  it("AC-012.5 — наступивший срок делает строку снова доступной", async () => {
    const id = await insert("k/d.webm", { transcript_next_attempt_at: new Date(Date.now() - 1000) });
    const r = await claimAndProcessOneTestimonial({
      pool, transcribeClient: succeeding("готово"), presignVideoUrl: presign, logError: silent,
    });
    expect(r).toEqual({ status: "completed", testimonialId: id });
  });

  it("AC-012.6 — ожидающая строка не мешает выбрать готовую", async () => {
    await insert("k/wait.webm", {
      created_at: new Date(Date.now() - 60_000),                     // старше — выбралась бы первой
      transcript_next_attempt_at: new Date(Date.now() + 3_600_000),
    });
    const ready = await insert("k/ready.webm");
    const r = await claimAndProcessOneTestimonial({
      pool, transcribeClient: succeeding("текст"), presignVideoUrl: presign, logError: silent,
    });
    expect(r).toEqual({ status: "completed", testimonialId: ready });
  });

  it("AC-012.7 — успех после неудач: один транскрипт, счётчик СОХРАНЁН", async () => {
    const id = await insert("k/e.webm", { transcript_attempts: 2 });
    await claimAndProcessOneTestimonial({
      pool, transcribeClient: succeeding("итоговый текст"), presignVideoUrl: presign, logError: silent,
    });
    const s = await state(id);
    expect(s.transcript_status).toBe("completed");
    expect(s.transcript).toBe("итоговый текст");
    expect(s.transcript_attempts, "«расшифровалось с третьей попытки» — полезный факт").toBe(2);
  });

  // ── путь не-SttApiError ──────────────────────────────────────────────────
  it("AC-012.8 — не-STT: попытка учтена, статус pending, исключение проброшено", async () => {
    const id = await insert("k/f.webm");
    const boom = new TypeError("ошибка кода, не провайдера");
    await expect(claimAndProcessOneTestimonial({
      pool, transcribeClient: failing(boom), presignVideoUrl: presign, logError: silent,
    })).rejects.toThrow("ошибка кода, не провайдера");
    const s = await state(id);
    expect(s.transcript_status, "не помечаем failed по причине, не связанной с провайдером").toBe("pending");
    expect(s.transcript_attempts, "без учёта строка блокировала бы очередь навсегда").toBe(1);
    expect(s.next_ms!).toBeGreaterThan(0);
  });

  it("AC-012.10 — не-STT при исчерпании попыток даёт failed", async () => {
    const id = await insert("k/g.webm", { transcript_attempts: EXPECTED_MAX_ATTEMPTS - 1 });
    await expect(claimAndProcessOneTestimonial({
      pool, transcribeClient: failing(new TypeError("опять")), presignVideoUrl: presign, logError: silent,
    })).rejects.toThrow();
    expect((await state(id)).transcript_status).toBe("failed");
  });

  it("AC-012.12 — ядовитая строка не мешает выбрать следующую", async () => {
    await insert("k/poison.webm", { created_at: new Date(Date.now() - 60_000) });
    const next = await insert("k/next.webm");
    await expect(claimAndProcessOneTestimonial({
      pool, transcribeClient: failing(new TypeError("яд")), presignVideoUrl: presign, logError: silent,
    })).rejects.toThrow();
    const r = await claimAndProcessOneTestimonial({
      pool, transcribeClient: succeeding("ок"), presignVideoUrl: presign, logError: silent,
    });
    expect(r, "после планирования срока очередь обязана двинуться").toEqual({
      status: "completed", testimonialId: next,
    });
  });
});

// AC-012.14 — отдельный пул РОВНО НА ОДНО соединение. При пуле в 10 второй прогон
// взял бы другое соединение и прошёл при живом дефекте: критерий был бы неразборчив.
describe.skipIf(!hasTestDb)("FR-012 — соединение возвращается в пул пригодным", () => {
  let pool: pg.Pool;
  beforeAll(async () => { pool = await createTestPool(1); await setupSchema(pool); });
  afterAll(async () => { await dropSchema(pool); await pool.end(); });

  it("AC-012.14 — после не-STT ошибки следующий прогон работает на том же соединении", async () => {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO testimonials (video_object_key) VALUES ('k/h.webm') RETURNING id`,
    );
    await expect(claimAndProcessOneTestimonial({
      pool, transcribeClient: failing(new TypeError("сбой")), presignVideoUrl: presign, logError: silent,
    })).rejects.toThrow();

    // То же самое соединение. Отравленное упало бы уже на BEGIN.
    const again = await claimAndProcessOneTestimonial({
      pool, transcribeClient: succeeding("ок"), presignVideoUrl: presign, logError: silent,
    });
    expect(again.status, "соединение вернулось в пул непригодным?").not.toBe(undefined);
    await pool.query(`DELETE FROM testimonials WHERE id = $1`, [rows[0]!.id]);
  });
});

// ── стражи по исходнику ────────────────────────────────────────────────────
describe("FR-012 — стражи по исходнику", () => {
  const SRC = path.resolve(__dirname, "../src/transcribe-job.ts");
  const code = readFileSync(SRC, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("AC-012.9 — срок проверяется в УСЛОВИИ ВЫБОРКИ, а не после", () => {
    const select = code.slice(code.indexOf("SELECT id"), code.indexOf("LIMIT 1"));
    expect(select, "без этого воркер берёт строку, отпускает и берёт снова — цикл вхолостую")
      .toContain("transcript_next_attempt_at");
  });

  it("AC-012.13 — в UPDATE, планирующем срок, НЕТ now()", () => {
    const upd = code.slice(code.indexOf("SCHEDULE_SQL"), code.indexOf("GIVE_UP_SQL"));
    expect(upd).toContain("clock_timestamp()");
    expect(upd, "now() — это время НАЧАЛА транзакции; срок оказался бы в прошлом")
      .not.toMatch(/[^_]now\(\)/);
  });

  it("NFR-012.8 — соединение возвращается через release с ошибкой при сомнении", () => {
    expect(code, "release() без аргумента отката НЕ делает — отравленное уйдёт в пул")
      .toMatch(/client\.release\(poisoned\)/);
  });
});
