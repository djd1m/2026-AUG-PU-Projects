// Отправка снятого/выбранного кадра — `POST /api/v1/scans` (FR-CAPTURE-001/002,
// `docs/features/scan-pipeline/01_specification.md`). Вынесено из `page.tsx` в чистую функцию
// по тому же приёму, что и `result/correct-request.ts`: решение «что отправить и как разобрать
// ответ» проверяемо без DOM и без настоящей камеры (jsdom в этом проекте не настроен —
// `.claude/rules/testing.md`).
//
// Путь ТОЛЬКО относительный: CSP `connect-src 'self'` (`middleware.ts`) не пропустит чужой
// origin, и у второго адреса здесь просто нет причины быть — страж по исходнику
// (`tests/unit/capture-upload-guard.test.ts`) проверяет это чтением файла, испытан мутацией.

const SCANS_URL = '/api/v1/scans';
const AUTH_DEVICE_URL = '/api/v1/auth/device';

export type UploadOutcome =
  | { readonly kind: 'queued'; readonly scanId: string }
  | { readonly kind: 'limit'; readonly scope: string | undefined; readonly resetAt: string | undefined }
  | { readonly kind: 'rejected'; readonly message: string }
  | { readonly kind: 'error'; readonly message: string };

interface ErrorBody {
  readonly error?: {
    readonly code?: string;
    readonly message?: string;
    readonly details?: Record<string, unknown>;
  };
}

// Причина отвергнутого файла — НАЗВАННОЕ сообщение (`fail-closed-defaults`: неопознанный код
// не читается как «что-то пошло не так», а как самый общий из известных случаев).
const REJECTION_MESSAGES: Record<string, string> = {
  invalid_image: 'Файл не похож на фото — попробуйте другое.',
  decompression_bomb: 'Слишком высокое разрешение фото — сфотографируйте ещё раз.',
  file_too_large: 'Фото слишком большое (максимум 12 МБ) — сожмите или сделайте новое.',
  image_too_small: 'Фото слишком маленькое — сфотографируйте крупнее.',
  idempotency_key_required: 'Не удалось подготовить отправку — попробуйте ещё раз.',
};

function rejectionMessage(code: string | undefined): string {
  if (code !== undefined && code in REJECTION_MESSAGES) return REJECTION_MESSAGES[code] as string;
  return 'Фото не принято сервером — попробуйте другое.';
}

async function parseErrorBody(response: Response): Promise<ErrorBody> {
  try {
    return (await response.json()) as ErrorBody;
  } catch {
    return {};
  }
}

function postScan(blob: Blob, idempotencyKey: string): Promise<Response> {
  const form = new FormData();
  form.append('photo', blob, 'capture.jpg');
  return fetch(SCANS_URL, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: form,
  });
}

function ensureDeviceSession(): Promise<Response> {
  return fetch(AUTH_DEVICE_URL, { method: 'POST', credentials: 'same-origin' });
}

/**
 * Один снимок — один ключ повторности: генерируется РОВНО ОДИН РАЗ за вызов и переживает
 * единственный допустимый повтор после `401` — иначе повтор создал бы ВТОРОЙ скан вместо
 * продолжения той же попытки (задача N4, пункт 4 и 6: «больше одного повтора не делать»).
 */
export async function uploadCapture(blob: Blob): Promise<UploadOutcome> {
  const idempotencyKey = crypto.randomUUID();

  let response: Response;
  try {
    response = await postScan(blob, idempotencyKey);
  } catch {
    return { kind: 'error', message: 'Нет соединения — проверьте сеть и попробуйте ещё раз.' };
  }

  if (response.status === 401) {
    try {
      await ensureDeviceSession();
      response = await postScan(blob, idempotencyKey); // РОВНО один повтор, тот же ключ
    } catch {
      return { kind: 'error', message: 'Нет соединения — проверьте сеть и попробуйте ещё раз.' };
    }
  }

  if (response.status === 202) {
    const body = (await response.json().catch(() => null)) as { data?: { scan_id?: string } } | null;
    const scanId = body?.data?.scan_id;
    if (typeof scanId !== 'string' || scanId === '') {
      return { kind: 'error', message: 'Сервер принял фото, но не вернул номер скана — попробуйте ещё раз.' };
    }
    return { kind: 'queued', scanId };
  }

  if (response.status === 429) {
    const body = await parseErrorBody(response);
    const details = body.error?.details;
    // Сырые `scope`/`reset_at` из тела — эта функция их не форматирует (`limit/screen.tsx`
    // уже форматирует, и делает это единственный раз, задача N4 пункт 5).
    const scope = typeof details?.scope === 'string' ? details.scope : undefined;
    const resetAt = typeof details?.reset_at === 'string' ? details.reset_at : undefined;
    return { kind: 'limit', scope, resetAt };
  }

  if (response.status === 413 || response.status === 422 || response.status === 400) {
    const body = await parseErrorBody(response);
    return { kind: 'rejected', message: rejectionMessage(body.error?.code) };
  }

  return { kind: 'error', message: `Сервер ответил неожиданно (${response.status}) — попробуйте ещё раз.` };
}
