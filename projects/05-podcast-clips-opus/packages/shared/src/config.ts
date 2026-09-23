import { assertWatermarkFits } from './watermark.js';
export const LIMIT_NAMES = [
  'N5_LIMIT_USER_MINUTES', 'N5_LIMIT_USER_UPLOADS', 'N5_LIMIT_USER_UPLOAD_REFUNDS',
  'N5_LIMIT_USER_LLM', 'N5_LIMIT_GLOBAL_MINUTES', 'N5_LIMIT_GLOBAL_LLM',
] as const;
export type LimitName = typeof LIMIT_NAMES[number];
export type Limits = Readonly<Record<LimitName, number>>;
export type Environment = Readonly<Record<string, string | undefined>>;
export type ServiceRole = 'web' | 'worker-stt' | 'worker-llm' | 'worker-video';
const consequences: Record<LimitName, string> = {
  N5_LIMIT_USER_MINUTES: 'вызов Whisper на аккаунт останется без потолка платных минут',
  N5_LIMIT_USER_UPLOADS: 'выдача загрузки и последующая обработка останутся без суточного потолка',
  N5_LIMIT_USER_UPLOAD_REFUNDS: 'возврат слота позволит безгранично вызывать скачивание и ffprobe',
  N5_LIMIT_USER_LLM: 'вызов LLM одного аккаунта сможет израсходовать общий бюджет',
  N5_LIMIT_GLOBAL_MINUTES: 'платный вызов Whisper останется без общего потолка минут',
  N5_LIMIT_GLOBAL_LLM: 'платный вызов LLM останется без общего потолка попыток',
};
export function required(env: Environment, name: string, consequence: string): string {
  const value = env[name];
  if (value === undefined) throw new Error(`${name} отсутствует: ${consequence}`);
  if (value.trim() === '') throw new Error(`${name} пустая строка: ${consequence}`);
  return value;
}
export function loadLimits(env: Environment): Limits {
  const entries = LIMIT_NAMES.map((name) => {
    const raw = required(env, name, consequences[name]);
    const n = Number(raw);
    if (!/^[1-9][0-9]*$/.test(raw) || !Number.isSafeInteger(n) || n > 2147483647) {
      throw new Error(`${name} непригодно: ${consequences[name]}; нужно положительное целое в диапазоне PostgreSQL int`);
    }
    return [name, n];
  });
  return Object.freeze(Object.fromEntries(entries)) as Limits;
}
function url(env: Environment, name: string, protocols: string[], consequence: string): string {
  const value = required(env, name, consequence);
  try {
    const parsed = new URL(value);
    if (value !== value.trim() || /[\r\n\t]/.test(value) || !protocols.includes(parsed.protocol) || !parsed.hostname) throw new Error();
    if (name === 'N5_PUBLIC_ORIGIN' && (parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash)) throw new Error();
    return value;
  } catch {
    throw new Error(`${name} непригодно: ${consequence}; нужен URL с протоколом ${protocols.join(' или ')}`);
  }
}
export function loadConnectionConfig(env: Environment) {
  return Object.freeze({
    databaseUrl: url(env, 'DATABASE_URL', ['postgres:', 'postgresql:'], 'сессии и атомарные ограничения базы будут недоступны'),
    redisUrl: url(env, 'REDIS_URL', ['redis:', 'rediss:'], 'ограничитель частоты и транспорт заданий будут недоступны'),
  });
}
export function loadPublicOrigin(env: Environment): string {
  return url(env, 'N5_PUBLIC_ORIGIN', env.NODE_ENV === 'development' || env.NODE_ENV === 'test' ? ['https:', 'http:'] : ['https:'],
    'он вшивается в метку каждого клипа и определяет каждую выдаваемую наружу ссылку; с дефолтом они вели бы в никуда');
}
// Два доверенных адреса справа: внешний прокси машины и внутренний edge.
export const DEFAULT_TRUSTED_PROXY_HOPS = 2;
function loadTrustedProxyHops(env: Environment): number {
  const raw = env.N5_TRUSTED_PROXY_HOPS ?? String(DEFAULT_TRUSTED_PROXY_HOPS);
  const hops = Number(raw);
  if (!/^[1-9][0-9]*$/.test(raw) || !Number.isSafeInteger(hops)) {
    throw new Error('N5_TRUSTED_PROXY_HOPS непригодно: ограничитель и anti-fraud потеряют адрес клиента; нужно целое >= 1');
  }
  return hops;
}
function loadRenderOrigin(env: Environment): string {
  const origin = loadPublicOrigin(env);
  assertWatermarkFits(origin, env.N5_SHORT_CODE_LENGTH);
  return origin;
}
export function loadWebConfig(env: Environment) {
  const limits = loadLimits(env);
  const publicOrigin = loadRenderOrigin(env);
  const connections = loadConnectionConfig(env);
  const sessionSecret = required(env, 'SESSION_SECRET', 'без секрета нельзя защитить хэши сессий и отозвать их ротацией');
  if (Buffer.byteLength(sessionSecret) < 32 || sessionSecret !== sessionSecret.trim()) {
    throw new Error('SESSION_SECRET непригодно: короткий секрет ослабляет защиту сессий; нужно не менее 32 байт без краевых пробелов');
  }
  return Object.freeze({ ...connections, limits, publicOrigin, sessionSecret,
    s3: Object.freeze({ ...loadS3Config(env), publicEndpoint: loadS3PublicEndpoint(env) }),
    trustedProxyHops: loadTrustedProxyHops(env) });
}
export type WebConfig = ReturnType<typeof loadWebConfig>;
// Разделение соответствует compose: воркерам не передаётся SESSION_SECRET.
export function loadWorkerConfig(role: Exclude<ServiceRole, 'web'>, env: Environment) {
  const connections = loadConnectionConfig(env);
  return role === 'worker-video'
    ? Object.freeze({ ...connections, publicOrigin: loadRenderOrigin(env), role })
    : Object.freeze({ ...connections, limits: loadLimits(env), role });
}

export function loadS3Config(env: Environment) {
  const endpoint = url(env, 'S3_ENDPOINT', ['http:', 'https:'], 'прямые загрузки недоступны');
  const parsed = new URL(endpoint);
  if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
    throw new Error('S3_ENDPOINT непригодно: нужен origin хранилища без пути и учётных данных');
  }
  const forcePathStyle = required(env, 'S3_FORCE_PATH_STYLE', 'не определён способ адресации бакета');
  if (!['true', 'false'].includes(forcePathStyle)) throw new Error('S3_FORCE_PATH_STYLE непригодно: нужно true или false');
  return Object.freeze({ endpoint,
    region: required(env, 'S3_REGION', 'невозможно подписать загрузку'),
    bucket: required(env, 'S3_BUCKET', 'не определено хранилище файлов'),
    accessKeyId: required(env, 'S3_ACCESS_KEY', 'невозможно подписать загрузку'),
    secretAccessKey: required(env, 'S3_SECRET_KEY', 'невозможно подписать загрузку'),
    forcePathStyle: forcePathStyle === 'true',
  });
}
export type S3Config = ReturnType<typeof loadS3Config>;

// Только web выдаёт браузеру ссылки; воркерам нужен лишь внутренний S3_ENDPOINT.
export function loadS3PublicEndpoint(env: Environment): string {
  const consequence = 'браузер не сможет загрузить части и скачать клипы; внутренний адрес недоступен, HTTP блокируется на HTTPS-странице';
  const endpoint = url(env, 'S3_PUBLIC_ENDPOINT',
    env.NODE_ENV === 'development' || env.NODE_ENV === 'test' ? ['https:', 'http:'] : ['https:'], consequence);
  const parsed = new URL(endpoint);
  if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
    throw new Error(`S3_PUBLIC_ENDPOINT непригодно: ${consequence}; нужен origin без пути и учётных данных`);
  }
  return endpoint;
}

export function loadSttConfig(env: Environment) {
  const mode = required(env, 'N5_MODEL_PROVIDER', 'режим поставщика STT не определён');
  if (mode !== 'live' && mode !== 'fake') throw new Error('N5_MODEL_PROVIDER: нужно live или fake');
  if (mode === 'fake' && env.NODE_ENV !== 'test') throw new Error('Фейк STT разрешён только в тестах');
  return Object.freeze({ mode, baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/whisper-large-v3',
    apiKey: mode === 'live' ? required(env, 'OPENROUTER_API_KEY', 'транскрипция невозможна') : null });
}
export type SttConfig = ReturnType<typeof loadSttConfig>;

export function loadLlmConfig(env: Environment) {
  const mode = required(env, 'N5_MODEL_PROVIDER', 'режим поставщика LLM не определён');
  if (mode !== 'live' && mode !== 'fake') throw new Error('N5_MODEL_PROVIDER: нужно live или fake');
  if (mode === 'fake' && env.NODE_ENV !== 'test') throw new Error('Фейк LLM разрешён только в тестах');
  const model = required(env, 'N5_LLM_MODEL', 'модель выделения не определена');
  if (model !== 'anthropic/claude-sonnet-5' && model !== 'google/gemini-3.8-flash') throw new Error('N5_LLM_MODEL: неподдерживаемая модель');
  return Object.freeze({ mode, model, apiKey: mode === 'live' ? required(env, 'OPENROUTER_API_KEY', 'выделение невозможно') : null });
}
export type LlmConfig = ReturnType<typeof loadLlmConfig>;
