// ГРУБЫЙ БАРЬЕР ПОТОКА — целиком в памяти процесса.
//
// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ ПАРА, КОТОРУЮ НЕЛЬЗЯ РАЗНИМАТЬ. Роль app_intake имеет SELECT на rate_limit_events —
// единственное намеренное чтение ролью собственных записей во всей матрице. Оно безопасно
// ТОЛЬКО потому, что этот барьер отбрасывает поток ДО обращения к БД.
//
// Убрать барьер из памяти нельзя, не пересмотрев тот грант: иначе каждый запрос атакующего
// снова оплачивается запросом к базе, общей с гостевой страницей, приёмом и оплатой.
// Барьер ВЫГЛЯДИТ оптимизацией — он ею не является. Стережёт T3c.
//
// НИ ОДНОГО обращения к БД — ни на отказе, ни на пропуске. Барьер, считающий в той самой
// базе, которую он защищает, есть усилитель атаки: поток становится бесплатным для
// атакующего и платным для нас.
// ─────────────────────────────────────────────────────────────────────────────

/** Верхняя граница словаря ОБЯЗАТЕЛЬНА: ключ — адрес, то есть значение, которое выбирает
 *  КЛИЕНТ. Без предела это исчерпание памяти — та же болезнь, от которой защищает сам
 *  барьер, только ресурс другой. */
export const MAX_KEYS = 50_000;
export const WINDOW_MS = 3_600_000;
export const LIMIT = 200;

interface Bucket { count: number; resetAt: number; }

export class CoarseBarrier {
  private readonly buckets = new Map<string, Bucket>();
  /** Счётчик отказов — В ПАМЯТИ. Строка на каждый отказ превратила бы защиту в усилитель
   *  атаки; наружу уходит периодический АГРЕГАТ, одной записью за интервал. */
  public rejected = 0;
  public evicted = 0;

  constructor(
    private readonly limit = LIMIT,
    private readonly windowMs = WINDOW_MS,
    private readonly maxKeys = MAX_KEYS,
    private readonly now: () => number = Date.now,
  ) {}

  allow(key: string): boolean {
    const t = this.now();
    const b = this.buckets.get(key);

    if (!b || t >= b.resetAt) {
      if (this.buckets.size >= this.maxKeys) this.evictOldest();
      // Map в JS сохраняет порядок вставки: перезапись ключа его НЕ обновляет, поэтому
      // при вытеснении «самый давний» означает именно давний, а не случайный.
      this.buckets.delete(key);
      this.buckets.set(key, { count: 1, resetAt: t + this.windowMs });
      return true;
    }

    if (b.count >= this.limit) { this.rejected += 1; return false; }
    b.count += 1;
    return true;
  }

  /** ДЕГРАДАЦИЯ В ПРОПУСК, а не в падение. Барьер — ограничитель ПОТОКА, а не квота;
   *  его переполнение не должно ронять приём. Точные пороги стоят ступенью ниже и
   *  обещают число — они и удержат, если сюда просочилось лишнее. */
  private evictOldest(): void {
    const oldest = this.buckets.keys().next();
    if (!oldest.done) { this.buckets.delete(oldest.value); this.evicted += 1; }
  }

  /** Снять агрегат и обнулить. Вызывается по интервалу, результат уходит ОДНОЙ записью. */
  drain(): { rejected: number; evicted: number; keys: number } {
    const snap = { rejected: this.rejected, evicted: this.evicted, keys: this.buckets.size };
    this.rejected = 0;
    this.evicted = 0;
    return snap;
  }

  get size(): number { return this.buckets.size; }
}
