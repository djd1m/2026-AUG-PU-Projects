// из N5: projects/05-podcast-clips-opus/apps/web/src/server/auth.ts — перечисления из @n6/rag
import bcrypt from 'bcrypt';
import { createHmac, randomBytes } from 'node:crypto';
import { readAccountStatus, SESSION_TTL_DAYS } from '@n6/rag';

export const BCRYPT_COST = 10;
// Фиктивный bcrypt-хэш не является секретом или паролем аккаунта; стоимость совпадает с регистрацией.
// Экспортирован для проверки пароля при удалении аккаунта (account-erasure): то же равное время.
export const DUMMY_HASH = '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
export const SESSION_TTL_SECONDS = SESSION_TTL_DAYS * 24 * 60 * 60;
export const LOGIN_FAILURE = { error: { code: 'invalid', message: 'Неверная почта или пароль' } } as const;
export interface AccountCredentials { id: string; password_hash: string; status: unknown }
export interface SessionInput { hash: string; ipPrefix: string; expiresAt: Date }
// Код партнёра при регистрации (partner-and-studio): explicit — из поля формы, cookie — из подписанной cookie /r/{code}.
export interface PartnerInput { explicit: string | null; cookie: string | null }
export interface AuthStore {
  findAccount(email: string): Promise<AccountCredentials | null>;
  // 'invalid_code' — явный код неверен или заморожен: аккаунт НЕ создан (FR-PARTNER-001); иначе — успех.
  register(email: string, passwordHash: string, session: SessionInput, partner?: PartnerInput): Promise<void | 'ok' | 'invalid_code'>;
  createSession(account: AccountCredentials, session: SessionInput): Promise<boolean>;
  revoke(hash: string): Promise<void>;
  findSession(hash: string): Promise<{ account_id: string } | null>;
}
export class AuthService {
  constructor(private readonly store: AuthStore, private readonly secret: string) {}
  tokenHash(token: string): string { return createHmac('sha256', this.secret).update(token).digest('hex'); }
  private session(ipPrefix: string) {
    const token = randomBytes(32).toString('base64url');
    return { token, record: { hash: this.tokenHash(token), ipPrefix,
      expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000) } };
  }
  async register(email: string, password: string, ipPrefix: string): Promise<string> {
    const token = await this.registerWithCode(email, password, ipPrefix);
    if (token === null) throw new Error('Регистрация без кода партнёра не может отклонить код');
    return token;
  }
  // Регистрация с кодом партнёра (partner-and-studio): null — явный код неверен или заморожен (ошибка поля, аккаунт не создан).
  async registerWithCode(email: string, password: string, ipPrefix: string, partner?: PartnerInput): Promise<string | null> {
    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    const session = this.session(ipPrefix);
    // Хэш готов ДО короткой атомарной записи. Для занятого адреса cookie — случайная пустышка.
    const result = await this.store.register(email, passwordHash, session.record, partner);
    return result === 'invalid_code' ? null : session.token;
  }
  async login(email: string, password: string, ipPrefix: string): Promise<string | null> {
    const account = await this.store.findAccount(email); // pool.query отпускает соединение до bcrypt.
    const matches = await bcrypt.compare(password, account?.password_hash ?? DUMMY_HASH);
    if (!account || !matches || readAccountStatus(account.status) !== 'active') return null;
    const session = this.session(ipPrefix);
    return await this.store.createSession(account, session.record) ? session.token : null;
  }
  async logout(token: string): Promise<void> { await this.store.revoke(this.tokenHash(token)); }
  async authenticate(token: string) { return this.store.findSession(this.tokenHash(token)); }
}
