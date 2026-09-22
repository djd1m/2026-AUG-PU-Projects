// Прямая отправка из браузера. INS-007: подписанный URL и заголовки не меняются.
interface CompletedPart { part_number: number; etag: string }
export interface BrowserUpload {
  part_size: number; parts: { part_number: number; url: string; expires_at: string }[];
  completed_parts?: CompletedPart[];
}
// refresh повторяет video.create с исходным Idempotency-Key и тем же файлом.
// Сервер возвращает только отсутствующие части и ETag уже сохранённых.
export async function uploadParts(file: Blob, upload: BrowserUpload, signal?: AbortSignal,
  refresh?: () => Promise<BrowserUpload>): Promise<CompletedPart[]> {
  const completed = new Map((upload.completed_parts ?? []).map((part) => [part.part_number, part]));
  const partSize = upload.part_size;
  const attempts = new Map<number, number>();
  let pending = upload.parts.filter((p) => !completed.has(p.part_number));
  while (pending.length) {
    signal?.throwIfAborted();
    const batch = pending.slice(0, 3); // Ограничиваем память и число одновременных PUT.
    const results = await Promise.allSettled(batch.map(async (part) => {
      if (Date.parse(part.expires_at) <= Date.now()) return false;
      const start = (part.part_number - 1) * partSize;
      const body = file.slice(start, Math.min(file.size, start + partSize));
      let response: Response;
      try { response = await fetch(part.url, { method: 'PUT', body, signal }); }
      catch (error) {
        if (signal?.aborted) throw error;
        throw new Error('Не удалось связаться с хранилищем. Возобновите загрузку; если ошибка повторяется, обратитесь в поддержку');
      }
      if (response.status === 403) return false; // Ссылка могла истечь уже во время PUT.
      if (!response.ok) throw new Error('Хранилище не приняло часть файла. Возобновите загрузку');
      const etag = response.headers.get('etag');
      if (!etag) throw new Error('Хранилище не подтвердило загрузку. Обратитесь в поддержку');
      completed.set(part.part_number, { part_number: part.part_number, etag });
      return true;
    }));
    // Дожидаемся соседних PUT, прежде чем выдавать ошибку/переподписывать.
    for (const result of results) if (result.status === 'rejected') throw result.reason;
    const expired = batch.filter((part) => !completed.has(part.part_number));
    if (expired.length) {
      if (!refresh) throw new Error('Срок ссылки истёк. Возобновите загрузку');
      for (const part of expired) {
        const n = (attempts.get(part.part_number) ?? 0) + 1; attempts.set(part.part_number, n);
        if (n > 2) throw new Error('Не удалось обновить ссылку. Возобновите загрузку позже');
      }
      signal?.throwIfAborted();
      upload = await refresh();
      if (upload.part_size !== partSize) throw new Error('Изменился размер частей. Выберите исходный файл');
      for (const part of upload.completed_parts ?? []) completed.set(part.part_number, part);
      pending = upload.parts.filter((part) => !completed.has(part.part_number));
    } else pending = pending.filter((part) => !completed.has(part.part_number));
  }
  return [...completed.values()].sort((a, b) => a.part_number - b.part_number);
}
