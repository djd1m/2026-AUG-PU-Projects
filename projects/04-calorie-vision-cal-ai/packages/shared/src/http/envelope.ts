// Конверт ответа API: ровно две формы, третьей нет.
//   успех — { data, meta? }
//   отказ — { error: { code, message } }
// Смешанная форма («и data, и error») запрещена типом: клиент, который обязан проверять
// оба поля, однажды проверит одно.

export interface SuccessEnvelope<T> {
  readonly data: T;
  readonly meta?: Record<string, unknown>;
}

export interface ErrorEnvelope {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details?: Record<string, unknown>;
  };
}

export type Envelope<T> = SuccessEnvelope<T> | ErrorEnvelope;

export function ok<T>(data: T, meta?: Record<string, unknown>): SuccessEnvelope<T> {
  return meta === undefined ? { data } : { data, meta };
}

export function fail(code: string, message: string, details?: Record<string, unknown>): ErrorEnvelope {
  return details === undefined ? { error: { code, message } } : { error: { code, message, details } };
}

export function isError<T>(envelope: Envelope<T>): envelope is ErrorEnvelope {
  return Object.prototype.hasOwnProperty.call(envelope, 'error');
}
