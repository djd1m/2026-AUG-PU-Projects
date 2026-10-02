import { type Pool, type PublicationBot, publishBot } from '@n6b/db';
import { readJson, readSessionCookie } from './auth-handler';
import { normalizeContact } from './contact';
import { normalizeOrigins } from './origin';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export interface PublishDeps {
  readonly authenticate: (token: string) => Promise<string | null>;
  readonly tenantPool: Pool;
  readonly publicBaseUrl: string;
  readonly log?: (line: string) => void;
}
export interface PublicationData extends PublicationBot { readonly embed_code: string | null }

function attribute(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function publicationEmbedCode(bot: PublicationBot, publicBaseUrl: string): string | null {
  if (!bot.published || !normalizeContact(bot.contact)) return null;
  return `<script src="${attribute(new URL('/w.js', publicBaseUrl).href)}" data-bot="${attribute(bot.public_id)}" async></script>`;
}

const fail = (status: number, code: string, message: string) => Response.json({ error: { code, message } },
  { status, headers: { 'Cache-Control': 'no-store' } });

export function createPublishHandler(deps: PublishDeps) {
  const ownOrigin = new URL(deps.publicBaseUrl).origin;
  return async (request: Request, botId: string): Promise<Response> => {
    try {
      if (request.headers.get('origin') !== ownOrigin) return fail(403, 'forbidden_origin', 'Источник запроса не разрешён');
      const token = readSessionCookie(request);
      const accountId = token ? await deps.authenticate(token) : null;
      if (!accountId) return fail(401, 'unauthorized', 'Войдите в кабинет');
      if (!UUID_RE.test(botId)) return fail(404, 'not_found', 'Не найдено');
      const raw = await readJson(request, { objectOnly: true });
      if (raw === 'too-large') return fail(413, 'body_too_large', 'Тело запроса слишком велико');
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail(422, 'invalid_publication', 'Укажите контакт и домены');
      const body = raw as { contact?: unknown; allowed_origins?: unknown; demo_enabled?: unknown };
      const contact = normalizeContact(body.contact);
      if (!contact) return fail(422, 'invalid_contact', 'Укажите контакт: e-mail, телефон E.164 или https-ссылку (до 512 символов)');
      const origins = normalizeOrigins(body.allowed_origins);
      if (!origins || (body.demo_enabled !== undefined && typeof body.demo_enabled !== 'boolean')) {
        return fail(422, 'invalid_publication', 'Укажите до 20 адресов http(s):// (до 2048 символов каждый) и корректный флаг демо');
      }
      // Reading the client body and validation finish before borrowing a tenant connection.
      const bot = await publishBot(deps.tenantPool, accountId, botId, { contact, allowed_origins: origins,
        ...(body.demo_enabled === undefined ? {} : { demo_enabled: body.demo_enabled as boolean }) });
      if (!bot) return fail(404, 'not_found', 'Не найдено');
      const data: PublicationData = { ...bot, embed_code: publicationEmbedCode(bot, deps.publicBaseUrl) };
      return Response.json({ data }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      (deps.log ?? console.error)(`publish: ${(error as Error).name}`);
      return fail(503, 'publish_unavailable', 'Публикация временно недоступна. Повторите позже');
    }
  };
}
