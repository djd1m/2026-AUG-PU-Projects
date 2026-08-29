// Чтение тела запроса с ПРЕДЕЛОМ по фактически прочитанным байтам.
//
// ЕДИНСТВЕННАЯ реализация на все неаутентифицированные маршруты. Копия в каждом роуте
// была бы не дублированием, а миной: предел разъехался бы, и закрытой осталась бы
// одна дверь из двух — ровно то, что ревью нашло у регистрации (L-2), пока вход был
// уже закрыт.
//
// Content-Length ДОВЕРЯТЬ НЕЛЬЗЯ: его присылает клиент, а при `Transfer-Encoding: chunked`
// его нет вовсе — сравнение с undefined дало бы false, и тело любого размера ушло бы в
// память. Своего предела у App Router нет (`bodyParser.sizeLimit` — это Pages Router),
// у Caddy директивы `request_body` тоже нет: других слоёв не существует.

/** Тело формы входа или регистрации — это небольшой JSON. 4096 байт с большим запасом. */
export const MAX_JSON_BODY = 4096;

/** null, если тело превысило предел: поток обрывается, а не дочитывается до конца. */
export async function readBodyAtMost(request: Request, max: number): Promise<string | null> {
  const body = request.body;
  if (!body) return '';
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > max) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString('utf8');
}
