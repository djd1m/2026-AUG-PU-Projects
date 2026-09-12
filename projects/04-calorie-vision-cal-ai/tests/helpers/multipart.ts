// Строит тело `multipart/form-data` вручную для `app.inject` (Fastify не поднимает
// настоящий сокет в тестах — `FormData`/`fetch` браузера здесь недоступны).

export interface MultipartFilePart {
  readonly fieldName: string;
  readonly filename: string;
  readonly contentType: string;
  readonly data: Buffer;
}

export function buildMultipartBody(parts: readonly MultipartFilePart[]): { body: Buffer; contentType: string } {
  const boundary = `----n4TestBoundary${Math.random().toString(16).slice(2)}`;
  const chunks: Buffer[] = [];
  for (const part of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    chunks.push(Buffer.from(`Content-Disposition: form-data; name="${part.fieldName}"; filename="${part.filename}"\r\n`));
    chunks.push(Buffer.from(`Content-Type: ${part.contentType}\r\n\r\n`));
    chunks.push(part.data);
    chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}
