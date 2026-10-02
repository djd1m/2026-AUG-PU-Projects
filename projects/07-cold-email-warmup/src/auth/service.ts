import { randomBytes } from 'node:crypto';
import { HttpError } from '../errors.js';
import { PasswordService } from './password.js';
import { newSession, tokenDigest } from './session.js';
import type { AuthStore } from './store.js';
export class AuthService {
  private dummyHash = '';
  constructor(private readonly store: AuthStore, private readonly key: Buffer, readonly passwords = new PasswordService()) {}
  async initialize() { this.dummyHash = await this.passwords.hash(randomBytes(32).toString('base64url')); }
  async register(email: string, password: string) {
    const hash = await this.passwords.hash(password); const session = newSession(this.key);
    await this.store.register(email, hash, session); return session.token;
  }
  async login(email: string, password: string) {
    const account = await this.store.findAccount(email);
    const matched = await this.passwords.verify(account?.password_hash ?? this.dummyHash, password);
    if (!account || !matched || account.state !== 'active') throw new HttpError(401, 'invalid_credentials');
    const session = newSession(this.key);
    if (!await this.store.createSession(account, session)) throw new HttpError(401, 'invalid_credentials');
    return session.token;
  }
  authenticate(token: string) { return this.store.authenticate(tokenDigest(token, this.key)); }
  logout(token: string) { return this.store.revoke(tokenDigest(token, this.key)); }
}
