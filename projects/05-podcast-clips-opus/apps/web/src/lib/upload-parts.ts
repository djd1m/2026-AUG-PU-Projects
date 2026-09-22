// Прямая отправка из браузера. Никакие байты файла не проходят через Next.
// INS-004/007/009/024: ошибка видима вызывающему, подписанный URL/заголовки не меняются.
export async function uploadParts(file: Blob, upload: {
  part_size: number; parts: { part_number: number; url: string; expires_at: string }[];
}, signal?: AbortSignal): Promise<{ part_number: number; etag: string }[]> {
  const completed = [];
  for (const part of upload.parts) {
    if (Date.parse(part.expires_at) <= Date.now()) throw new Error('Срок ссылки истёк. Возобновите загрузку');
    const start = (part.part_number - 1) * upload.part_size;
    const body = file.slice(start, Math.min(file.size, start + upload.part_size));
    let response: Response;
    try { response = await fetch(part.url, { method: 'PUT', body, signal }); }
    catch (error) {
      if (signal?.aborted) throw error;
      throw new Error('Не удалось связаться с хранилищем. Повторите загрузку; если ошибка повторяется, обратитесь в поддержку');
    }
    if (!response.ok) throw new Error('Хранилище не приняло часть файла. Возобновите загрузку');
    const etag = response.headers.get('etag');
    if (!etag) throw new Error('Хранилище не подтвердило загрузку. Обратитесь в поддержку');
    completed.push({ part_number: part.part_number, etag });
  }
  return completed;
}
