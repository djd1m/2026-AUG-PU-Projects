// Регистрация, вход, выход, проверка сессии — перенос N5 apps/web/src/server/auth.ts (#24: bcrypt, фиктивный хэш,
// сессия 7 дней) и N1 apps/web/src/lib/session.ts (#6: в БД только HMAC токена на SESSION_SECRET), адаптирован:
//  * bcrypt cost 12 (Architecture → Security), фиктивный хэш той же стоимости — время ответа «нет e-mail» и
//    «неверный пароль» выровнено (SC-US-001-2);
//  * bcrypt ВНЕ транзакции: соединение пула не держится 250 мс хэширования (shared-resource-verification);
//  * тип аккаунта owner|studio (SC-US-001-3), план при регистрации — free (SC-US-001-1).
// Предел попыток — в auth-handler.ts, ДО вызова этих методов.

import { createHmac, randomBytes } from 'node:crypto';
import type { AccountKind } from '@n6b/db';

export const BCRYPT_COST = 12;
// Фиктивный bcrypt-хэш (cost 12) случайного пароля — не секрет и не пароль аккаунта; нужен только для выравнивания
// времени. Стоимость проверяется тестом auth.test.ts: хэш другой стоимости снова раскрыл бы существование e-mail.
export const DUMMY_HASH = '$2b$12$UIqpE6yIwP0W.YIqyzO7OekUpgGnpsnfIU60EPNFd56/y.IOjp896';
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface PasswordHasher {
  hash(password: string, cost: number): Promise<string>;
  compare(password: string, hash: string): Promise<boolean>;
}

export interface AccountCredentials {
  readonly id: string;
  readonly password_hash: string | null;
}

export interface NewSession {
  readonly tokenHash: string;
  readonly expiresAt: Date;
}

export interface AuthStore {
  findAccount(email: string): Promise<AccountCredentials | null>;
  /** Атомарно: аккаунт + сессия. false — e-mail занят (аккаунт и сессия не созданы). */
  register(email: string, passwordHash: string, kind: AccountKind, session: NewSession, referral?: string | null): Promise<boolean>;
  createSession(accountId: string, session: NewSession): Promise<void>;
  deleteSession(tokenHash: string): Promise<void>;
  findSession(tokenHash: string): Promise<{ account_id: string } | null>;
}

export type RegisterResult = { readonly ok: true; readonly token: string } | { readonly ok: false; readonly reason: 'email-taken' };

export class AuthService {
  constructor(private readonly store: AuthStore, private readonly hasher: PasswordHasher,
    private readonly sessionSecret: string) {
    if (!sessionSecret) throw new Error('SESSION_SECRET не задан: сессии не подписать');
  }

  tokenHash(token: string): string {
    return createHmac('sha256', this.sessionSecret).update(token).digest('hex');
  }

  prepareSession(): { token: string; record: NewSession } {
    const token = randomBytes(32).toString('base64url');
    return { token, record: { tokenHash: this.tokenHash(token),
      expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000) } };
  }

  async register(email: string, password: string, kind: AccountKind, referral: string | null = null): Promise<RegisterResult> {
    const passwordHash = await this.hasher.hash(password, BCRYPT_COST); // до короткой атомарной записи
    const session = this.prepareSession();
    const created = await this.store.register(email, passwordHash, kind, session.record, referral);
    return created ? { ok: true, token: session.token } : { ok: false, reason: 'email-taken' };
  }

  /** null — одинаково для «нет такого e-mail», «неверный пароль» и аккаунта без пароля (подаккаунт до передачи). */
  async login(email: string, password: string): Promise<string | null> {
    const account = await this.store.findAccount(email);
    const matches = await this.hasher.compare(password, account?.password_hash ?? DUMMY_HASH);
    if (!account || !account.password_hash || !matches) return null;
    const session = this.prepareSession();
    await this.store.createSession(account.id, session.record);
    return session.token;
  }

  async logout(token: string): Promise<void> {
    await this.store.deleteSession(this.tokenHash(token));
  }

  async authenticate(token: string): Promise<string | null> {
    return (await this.store.findSession(this.tokenHash(token)))?.account_id ?? null;
  }
}
